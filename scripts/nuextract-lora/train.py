"""NuExtract3 LoRA pilot; no cloud provisioning and no automatic deployment."""
from __future__ import annotations

import argparse
import importlib.metadata
import json
import math
import platform
import time
from pathlib import Path

from data import BASE_MODEL, BASE_REVISION, compare_reports, dataset_check, evaluation_fingerprint, load_split, safe_path, score_prediction

def default_paths(script):
    script = Path(script).resolve()
    # Repository layout is optional: the Docker image places this file in /app.
    if script.parent.name == "nuextract-lora" and script.parent.parent.name == "scripts":
        repository = script.parent.parent.parent
        return repository.parent / "output/financial-synthetic-pilot-v1", repository / "output/nuextract-lora"
    return Path("/work/dataset"), Path("/work/runs")


DEFAULT_DATASET, DEFAULT_RUNS = default_paths(__file__)
TARGET_SUFFIXES = {"q_proj", "k_proj", "v_proj", "o_proj", "in_proj_qkv", "in_proj_z", "in_proj_b", "in_proj_a", "out_proj", "gate_proj", "up_proj", "down_proj"}


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def packages():
    return {name: importlib.metadata.version(name) for name in ["torch", "torchvision", "transformers", "peft", "accelerate", "Pillow",
                                                              "huggingface-hub", "tokenizers", "safetensors", "numpy", "Jinja2"]}


def load_processor(max_pixels):
    from transformers import AutoProcessor
    processor = AutoProcessor.from_pretrained(BASE_MODEL, revision=BASE_REVISION, trust_remote_code=False)
    # This pinned checkpoint uses the Qwen2VL image processor inside Qwen3VLProcessor.
    processor.image_processor.size = {"shortest_edge": 65536, "longest_edge": max_pixels}
    processor.tokenizer.padding_side = "right"
    return processor


def messages_for(row, root, include_answer=False):
    messages = [{"role": "user", "content": [{"type": "image", "path": str(safe_path(root, path))} for path in row["images"]]}]
    if include_answer:
        messages.append({"role": "assistant", "content": [{"type": "text", "text": json.dumps(row["output"], ensure_ascii=False, separators=(",", ":"))}]})
    return messages


def encode_row(row, root, processor, max_length):
    import torch
    kwargs = {"template": json.dumps(row["template"], ensure_ascii=False), "instructions": row["instructions"],
              "enable_thinking": False, "tokenize": True, "return_dict": True, "return_tensors": "pt"}
    prompt = processor.apply_chat_template(messages_for(row, root), add_generation_prompt=True, **kwargs)
    full = processor.apply_chat_template(messages_for(row, root, True), add_generation_prompt=False, **kwargs)
    prompt_length = prompt["input_ids"].shape[1]
    if full["input_ids"].shape[1] > max_length:
        raise ValueError(f"{row['id']} exceeds {max_length} tokens; increase limit or reduce image pixels, never truncate labels")
    if not torch.equal(prompt["input_ids"], full["input_ids"][:, :prompt_length]):
        raise ValueError(f"{row['id']}: chat prompt is not a full-answer prefix; masking would be unsafe")
    if "pixel_values" not in full or "image_grid_thw" not in full or "mm_token_type_ids" not in full or len(full["image_grid_thw"]) != len(row["images"]):
        raise ValueError("Processor did not consume all image pages")
    labels = full["input_ids"].clone()
    labels[:, :prompt_length] = -100
    labels[full["attention_mask"] == 0] = -100
    for token in ["<|image_pad|>", "<|video_pad|>", "<|vision_start|>", "<|vision_end|>", processor.tokenizer.pad_token]:
        if token:
            token_id = processor.tokenizer.convert_tokens_to_ids(token)
            if token_id is not None:
                labels[full["input_ids"] == token_id] = -100
    if not (labels != -100).any():
        raise ValueError("No supervised JSON tokens")
    supervised = processor.tokenizer.decode(labels[labels != -100].tolist(), skip_special_tokens=True).strip()
    expected = json.dumps(row["output"], ensure_ascii=False, separators=(",", ":"))
    if supervised != expected:
        raise ValueError(f"{row['id']}: supervised tokens are not exactly the JSON answer")
    full["labels"] = labels
    return dict(full), {"id": row["id"], "tokens": full["input_ids"].shape[1], "prompt_tokens": prompt_length,
                        "supervised_tokens": int((labels != -100).sum()), "pages": len(row["images"])}


class ImageCollator:
    def __init__(self, root, processor, max_length):
        self.root, self.processor, self.max_length = root, processor, max_length

    def __call__(self, examples):
        if len(examples) != 1:
            raise ValueError("This pilot supports batch size 1; use gradient accumulation instead")
        batch, _ = encode_row(examples[0], self.root, self.processor, self.max_length)
        return batch


def lora_targets(model):
    import torch
    names = [name for name, module in model.named_modules() if isinstance(module, torch.nn.Linear)
             and ".language_model.layers." in name and name.rsplit(".", 1)[-1] in TARGET_SUFFIXES]
    if not names or any("visual" in name or "lm_head" in name for name in names):
        raise ValueError("Could not safely select language-only LoRA layers")
    return names


def model_load():
    import torch
    from transformers import Qwen3_5ForConditionalGeneration
    if not torch.cuda.is_available() or not torch.cuda.is_bf16_supported():
        raise RuntimeError("Real training/evaluation requires a BF16-capable CUDA GPU; preflight works on CPU")
    return Qwen3_5ForConditionalGeneration.from_pretrained(BASE_MODEL, revision=BASE_REVISION,
                                                          dtype=torch.bfloat16, attn_implementation="sdpa", trust_remote_code=False)


def preflight(args, train, validation, info):
    processor = load_processor(args.max_pixels)
    lengths = []
    for index, row in enumerate(train + validation):
        _, stats = encode_row(row, args.dataset, processor, args.max_length)
        lengths.append(stats)
        if (index + 1) % 10 == 0:
            print(f"Processor checked {index + 1}/{len(train) + len(validation)} documents", flush=True)
    args.output.mkdir(parents=True, exist_ok=True)
    dump(args.output / "preflight.json", {**info, "packages": packages(), "max_pixels": args.max_pixels,
                                          "max_length": args.max_length, "max_tokens_observed": max(r["tokens"] for r in lengths), "documents": lengths,
                                          "weights_downloaded": False, "training_started": False})
    print(f"PASS: {len(lengths)} documents, JSON-only masks, all image pages present. No model weights loaded.")


def training(args, train, validation, info):
    import torch
    from peft import LoraConfig, TaskType, get_peft_model
    from transformers import Trainer, TrainerCallback, TrainingArguments, set_seed

    if not args.run:
        raise ValueError("Training is not automatic: add --run only on an approved GPU machine/job")
    if args.output.exists() and any(args.output.iterdir()) and not args.resume:
        raise ValueError("Nonempty run directory: choose a new output or explicitly resume")
    contract = {**info, "max_pixels": args.max_pixels, "max_length": args.max_length, "rank": args.rank,
                "alpha": args.rank * 2, "seed": args.seed, "learning_rate": args.learning_rate,
                "gradient_accumulation": args.accumulation, "epochs": args.epochs, "max_steps": args.max_steps}
    if args.resume:
        checkpoint = args.resume.resolve()
        if checkpoint.parent != args.output.resolve() or not (checkpoint / "trainer_state.json").is_file():
            raise ValueError("Resume must use a Trainer checkpoint inside this run directory")
        previous = json.loads((args.output / "run.json").read_text(encoding="utf-8"))
        if previous["contract"] != contract or previous["packages"] != packages():
            raise ValueError("Resume data/model/settings/packages differ from original run")
    set_seed(args.seed)
    processor = load_processor(args.max_pixels)
    # Fail before loading the full weights if any example would be silently truncated
    # or the official chat template does not produce safe assistant-only labels.
    for row in train + validation:
        encode_row(row, args.dataset, processor, args.max_length)
    model = model_load()
    model.config.use_cache = False
    model.config.text_config.use_cache = False
    targets = lora_targets(model)
    model = get_peft_model(model, LoraConfig(task_type=TaskType.CAUSAL_LM, r=args.rank, lora_alpha=args.rank * 2,
                                          lora_dropout=0.05, bias="none", target_modules=targets, revision=BASE_REVISION))
    model.enable_input_require_grads()
    trainable = [name for name, parameter in model.named_parameters() if parameter.requires_grad]
    if not trainable or any("lora_" not in name or "visual" in name for name in trainable):
        raise ValueError("Only language LoRA parameters may be trainable")
    model.print_trainable_parameters()
    args.output.mkdir(parents=True, exist_ok=True)
    dump(args.output / "run.json", {"contract": contract, "packages": packages(), "python": platform.python_version(),
                                    "gpu": torch.cuda.get_device_name(), "targets": targets, "trainable_parameters": trainable,
                                    "status": "starting", "auto_deploy": False})

    time_limit = args.max_seconds

    class Deadline(TrainerCallback):
        def on_train_begin(self, args, state, control, **kwargs):
            self.started = time.monotonic()

        def on_step_end(self, args, state, control, **kwargs):
            if time.monotonic() - self.started >= time_limit:
                control.should_training_stop = True
                control.should_save = True
            return control

        def on_log(self, args, state, control, logs=None, **kwargs):
            for key in ["loss", "eval_loss", "grad_norm"]:
                if key in (logs or {}) and not math.isfinite(float(logs[key])):
                    raise RuntimeError(f"Non-finite {key}; do not use this checkpoint")

        def on_save(self, settings, state, control, **kwargs):
            if args.checkpoint_gcs:
                from cloud_io import save_checkpoint
                save_checkpoint(args.output, state.global_step, args.checkpoint_gcs)

    settings = TrainingArguments(output_dir=str(args.output), per_device_train_batch_size=1, per_device_eval_batch_size=1,
                                 gradient_accumulation_steps=args.accumulation, learning_rate=args.learning_rate,
                                 num_train_epochs=args.epochs, max_steps=args.max_steps, bf16=True, fp16=False,
                                 gradient_checkpointing=True, gradient_checkpointing_kwargs={"use_reentrant": False},
                                 eval_strategy="steps", eval_steps=5, save_strategy="steps", save_steps=5,
                                 save_total_limit=3, load_best_model_at_end=True, metric_for_best_model="eval_loss", greater_is_better=False,
                                 logging_steps=1, logging_nan_inf_filter=False, report_to="none", push_to_hub=False, remove_unused_columns=False,
                                 dataloader_num_workers=0, optim="adamw_torch", warmup_ratio=0.1,
                                 seed=args.seed, data_seed=args.seed, prediction_loss_only=True)
    trainer = Trainer(model=model, args=settings, train_dataset=train, eval_dataset=validation,
                      data_collator=ImageCollator(args.dataset, processor, args.max_length), callbacks=[Deadline()])
    torch.cuda.reset_peak_memory_stats()
    started = time.monotonic()
    result = trainer.train(resume_from_checkpoint=str(args.resume) if args.resume else None)
    adapter = args.output / "adapter"
    trainer.save_model(str(adapter))
    processor.save_pretrained(str(adapter))
    trainer.save_state()
    dump(args.output / "result.json", {"metrics": result.metrics, "elapsed_seconds": time.monotonic() - started,
                                       "peak_cuda_gib": torch.cuda.max_memory_allocated() / 1024 ** 3,
                                       "best_checkpoint": trainer.state.best_model_checkpoint, "steps": trainer.state.global_step,
                                       "adapter": str(adapter), "deployed": False})
    manifest = json.loads((args.output / "run.json").read_text(encoding="utf-8"))
    manifest["status"] = "training_completed_not_deployed"
    dump(args.output / "run.json", manifest)
    print(f"Saved adapter to {adapter}. No cloud upload or deployment performed.")


def evaluate(args, info):
    import torch
    from peft import PeftModel
    if args.split == "test" and not args.final_test:
        raise ValueError("Keep test untouched until final evaluation; add --final-test deliberately")
    if args.output.exists() and any(args.output.iterdir()):
        raise ValueError("Choose an empty evaluation output directory")
    rows = load_split(args.dataset, args.split)
    processor = load_processor(args.max_pixels)
    if args.merged:
        from transformers import AutoProcessor, Qwen3_5ForConditionalGeneration
        if not torch.cuda.is_available() or not torch.cuda.is_bf16_supported():
            raise RuntimeError("Merged evaluation requires a BF16-capable CUDA GPU")
        model = Qwen3_5ForConditionalGeneration.from_pretrained(str(args.merged), dtype=torch.bfloat16,
                                                               attn_implementation="sdpa", trust_remote_code=False).cuda()
        processor = AutoProcessor.from_pretrained(str(args.merged), trust_remote_code=False)
        if processor.image_processor.size != {"shortest_edge": 65536, "longest_edge": args.max_pixels}:
            raise ValueError("Saved merged processor has different image limits")
    else:
        model = model_load().cuda()
    if args.adapter:
        config = json.loads((args.adapter / "adapter_config.json").read_text(encoding="utf-8"))
        if config.get("base_model_name_or_path") != BASE_MODEL or config.get("revision") not in [None, BASE_REVISION]:
            raise ValueError("Adapter uses a different base model")
        run = json.loads((args.adapter.parent / "run.json").read_text(encoding="utf-8"))
        if run["contract"]["base_revision"] != BASE_REVISION or run["contract"]["training_data_sha256"] != info["training_data_sha256"]:
            raise ValueError("Adapter manifest differs from dataset/model")
        model = PeftModel.from_pretrained(model, str(args.adapter), is_trainable=False)
    model.eval()
    results = []
    args.output.mkdir(parents=True, exist_ok=True)
    for row in rows:
        kwargs = {"template": json.dumps(row["template"], ensure_ascii=False), "instructions": row["instructions"],
                  "enable_thinking": False, "tokenize": True, "return_dict": True, "return_tensors": "pt"}
        inputs = processor.apply_chat_template(messages_for(row, args.dataset), add_generation_prompt=True, **kwargs)
        if inputs["input_ids"].shape[1] + args.max_new_tokens > args.max_length:
            raise ValueError("Prompt plus generation budget exceeds max-length; adjust limits, do not truncate images")
        inputs = inputs.to(model.device)
        torch.cuda.synchronize()
        started = time.monotonic()
        with torch.inference_mode():
            output = model.generate(**inputs, max_new_tokens=args.max_new_tokens, do_sample=False, use_cache=True)
        torch.cuda.synchronize()
        text = processor.decode(output[0, inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()
        try:
            parsed = json.loads(text)
            valid = isinstance(parsed, dict)
        except (ValueError, TypeError):
            parsed, valid = {}, False
        metrics = score_prediction(row["output"], parsed if valid else {})
        results.append({"id": row["id"], "kind": row["kind"], "valid_json_object": valid,
                        "seconds": time.monotonic() - started, "generated_tokens": output.shape[1] - inputs["input_ids"].shape[1],
                        "prediction": text, **metrics})
        dump(args.output / "predictions.json", results)
        print(f"Evaluated {len(results)}/{len(rows)}: {row['id']} JSON={valid} exact={metrics['exact_document']}", flush=True)
    summary = {**info, "split": args.split, "adapter": str(args.adapter or args.merged) if (args.adapter or args.merged) else None,
               "model_variant": "merged" if args.merged else "adapter" if args.adapter else "base", "documents": len(results),
               "evaluation_data_sha256": evaluation_fingerprint(args.dataset, rows), "document_ids": [r["id"] for r in rows],
               "json_validity": sum(r["valid_json_object"] for r in results) / len(results),
               "document_exact_match": sum(r["exact_document"] for r in results) / len(results),
               "field_exact_match": sum(r["fields_correct"] for r in results) / sum(r["fields_total"] for r in results),
               "nonnull_field_exact_match": sum(r["nonnull_correct"] for r in results) / sum(r["nonnull_total"] for r in results),
               "mean_seconds": sum(r["seconds"] for r in results) / len(results), "max_pixels": args.max_pixels,
               "max_length": args.max_length, "max_new_tokens": args.max_new_tokens, "packages": packages(),
               "production_accuracy_claim": False}
    dump(args.output / "evaluation.json", summary)
    print(json.dumps(summary, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["validate", "preflight", "train", "evaluate", "compare"])
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--max-pixels", type=int, default=1048576)
    parser.add_argument("--max-length", type=int, default=16384)
    parser.add_argument("--rank", type=int, default=8)
    parser.add_argument("--accumulation", type=int, default=4)
    parser.add_argument("--learning-rate", type=float, default=1e-4)
    parser.add_argument("--epochs", type=float, default=3)
    parser.add_argument("--max-steps", type=int, default=10)
    parser.add_argument("--max-seconds", type=int, default=1800)
    parser.add_argument("--seed", type=int, default=20261008)
    parser.add_argument("--resume", type=Path)
    parser.add_argument("--checkpoint-gcs", help="Optional private GCS prefix; sync complete checkpoints after each save")
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--split", choices=["validation", "test"], default="validation")
    parser.add_argument("--final-test", action="store_true")
    parser.add_argument("--adapter", type=Path)
    parser.add_argument("--merged", type=Path, help="Evaluate a local merged standalone model instead of base/adapter")
    parser.add_argument("--max-new-tokens", type=int, default=8192)
    parser.add_argument("--baseline-report", type=Path)
    parser.add_argument("--adapter-report", type=Path)
    args = parser.parse_args()
    if args.adapter and args.merged:
        parser.error("Choose adapter or merged, not both")
    if args.max_pixels < 65536 or args.max_length < 256 or args.rank < 1 or args.accumulation < 1 or args.max_seconds < 1:
        parser.error("Invalid pixel/token/rank/accumulation/time limit")
    if args.max_steps not in [-1] and args.max_steps < 5:
        parser.error("Use at least five smoke steps (for checkpoint/evaluation) or -1 for epochs")
    if not math.isfinite(args.learning_rate) or args.learning_rate <= 0 or not math.isfinite(args.epochs) or args.epochs <= 0:
        parser.error("Learning rate and epochs must be positive finite values")
    args.dataset = args.dataset.resolve()
    args.output = (args.output or DEFAULT_RUNS / {"validate": "checks", "preflight": "preflight", "train": "smoke-001", "evaluate": "baseline-validation", "compare": "comparison"}[args.mode]).resolve()
    train, validation, info = dataset_check(args.dataset)
    if args.mode == "validate":
        print(json.dumps({**info, "status": "PASS", "training_started": False}, indent=2))
    elif args.mode == "preflight":
        preflight(args, train, validation, info)
    elif args.mode == "train":
        training(args, train, validation, info)
    elif args.mode == "evaluate":
        evaluate(args, info)
    else:
        if not args.baseline_report or not args.adapter_report:
            parser.error("compare requires --baseline-report and --adapter-report")
        report = compare_reports(json.loads(args.baseline_report.read_text(encoding="utf-8")),
                                 json.loads(args.adapter_report.read_text(encoding="utf-8")))
        args.output.mkdir(parents=True, exist_ok=True)
        dump(args.output / "comparison.json", report)
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
