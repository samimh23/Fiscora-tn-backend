"""Evaluate and prepare a standalone synthetic-pilot model; never deploy or publish."""
from __future__ import annotations

import argparse
import gc
import hashlib
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

from data import BASE_MODEL, BASE_REVISION, compare_reports, dataset_check
from train import dump, load_processor, model_load

REPO_ID = "samimh23/fiscora-nuextract3-financial-v1"
METRICS = ["json_validity", "document_exact_match", "field_exact_match", "nonnull_field_exact_match"]


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def verify_training(run, info):
    manifest, result = read_json(run / "run.json"), read_json(run / "result.json")
    contract = manifest["contract"]
    for key in ["base_model", "base_revision", "training_data_sha256", "train", "validation", "test"]:
        if contract.get(key) != info[key]:
            raise ValueError(f"Training provenance mismatch: {key}")
    expected_steps = math.ceil(info["train"] / contract["gradient_accumulation"]) * contract["epochs"]
    if contract["max_steps"] != -1 or contract["epochs"] != 3 or result["steps"] != expected_steps:
        raise ValueError("Full three-epoch training is not complete; do not release a smoke/timeout checkpoint")
    if manifest.get("status") != "training_completed_not_deployed" or result.get("deployed") is not False:
        raise ValueError("Unexpected training completion/deployment status")
    config = read_json(run / "adapter/adapter_config.json")
    if config.get("base_model_name_or_path") != BASE_MODEL or config.get("revision") != BASE_REVISION:
        raise ValueError("Adapter base model/revision differs")
    if not (run / "adapter/adapter_model.safetensors").is_file():
        raise ValueError("Missing trained adapter weights")
    return contract, result


def merge(run, destination, max_pixels):
    import torch
    from peft import PeftModel
    from huggingface_hub import hf_hub_download
    if destination.exists() and any(destination.iterdir()):
        raise ValueError("Merged model directory must be empty")
    model = PeftModel.from_pretrained(model_load().cuda(), str(run / "adapter"), is_trainable=False)
    model.eval()
    merged = model.merge_and_unload(safe_merge=True)
    merged.config.use_cache = True
    merged.config.text_config.use_cache = True
    merged.save_pretrained(str(destination), safe_serialization=True, max_shard_size="4GB")
    load_processor(max_pixels).save_pretrained(str(destination))
    for source, target in [("LICENSE", "LICENSE"), ("README.md", "BASE_MODEL_CARD.md"),
                           ("TYPES.md", "TYPES.md"), ("task_instructions_structured.txt", "task_instructions_structured.txt")]:
        cached = hf_hub_download(BASE_MODEL, source, revision=BASE_REVISION)
        shutil.copyfile(cached, destination / target)
    del merged, model
    gc.collect()
    torch.cuda.empty_cache()
    print("Merged standalone weights saved; next check reloads them from disk.", flush=True)


def verify_evaluations(output):
    reports = {name: read_json(output / name / "evaluation.json") for name in ["base", "adapter", "merged"]}
    base, adapter, merged = (reports[name] for name in ["base", "adapter", "merged"])
    for name, report in reports.items():
        if report.get("split") != "test" or report.get("model_variant") != name or report.get("documents") != 10:
            raise ValueError("Expected the fixed ten-document final synthetic test")
        for key in METRICS:
            if not isinstance(report.get(key), (int, float)) or not math.isfinite(report[key]) or not 0 <= report[key] <= 1:
                raise ValueError(f"Invalid evaluation metric {key}")
        predictions = read_json(output / name / "predictions.json")
        if [p["id"] for p in predictions] != report["document_ids"]:
            raise ValueError("Prediction IDs differ from report")
    adapter_comparison = compare_reports(base, adapter)
    merged_comparison = compare_reports(base, merged)
    if any(merged[key] + 1e-12 < adapter[key] for key in METRICS):
        raise ValueError("Merged model scored below adapter; inspect numerical/generation differences before publication")
    adapter_predictions = read_json(output / "adapter/predictions.json")
    merged_predictions = read_json(output / "merged/predictions.json")
    agreement = sum(a["prediction"] == m["prediction"] for a, m in zip(adapter_predictions, merged_predictions))
    verification = {"status": "PASS", "reloaded_from_saved_weights": True,
                    "documents": 10, "identical_generation_count": agreement,
                    "merged_metrics_not_below_adapter": True,
                    "note": "BF16 LoRA merging may change rounding; both actual outputs and scores are retained."}
    return reports, adapter_comparison, merged_comparison, verification


def model_card(contract, result, reports):
    rows = "\n".join(f"| {key.replace('_', ' ')} | {reports['base'][key]:.2%} | {reports['merged'][key]:.2%} |"
                     for key in METRICS)
    invalid = round(reports["merged"].get("documents", 10) * (1 - reports["merged"]["json_validity"]))
    regression = (f"**Known limitation:** {invalid} held-out document(s) returned invalid JSON. "
                  "Whole-document accuracy and aggregate field accuracy can move in opposite directions: "
                  "one failure on a document with many fields can outweigh several perfectly extracted documents. "
                  "Inspect the individual predictions before drawing conclusions.\n") if invalid else ""
    return f"""---
language:
- fr
license: apache-2.0
library_name: transformers
pipeline_tag: image-text-to-text
base_model: numind/NuExtract3
base_model_relation: finetune
tags:
- nuextract
- lora
- synthetic-data
- document-understanding
- financial-documents
---
# Fiscora NuExtract3 Financial v1 — synthetic pilot

This is a **full merged model**, fine-tuned from `{BASE_MODEL}` using language-only
LoRA. Base revision: `{BASE_REVISION}`. It is an experimental synthetic-data pilot,
not a validated accounting system. No real customer invoices, bank documents, or
personal data were used. All generated document identities are fictional.

## Actual held-out results

Both models used the same 10 unseen synthetic documents (7 invoices and 3 bank
statements), identical images, templates, instructions, and deterministic decoding.
The numbers below are from the saved and reloaded **merged model**, not training loss.

| Metric | Original NuExtract3 | This merged model |
|---|---:|---:|
{rows}

{regression}
Exact fields use strict string equality, including date/amount formatting; extra keys
and list-length differences are penalized. Non-null field accuracy excludes missing
source values so null predictions cannot inflate that score. Detailed predictions,
base/adapter/merged reports, comparison, and merge checks are in `evaluation/`.
Only 10 test documents were evaluated: these scores are noisy and **do not establish
improvement on real documents**, general OCR, or other languages. No improvement is
claimed unless supported by these particular measurements; no real-world improvement
is claimed at all. Do not use the test split for further hyperparameter selection.

## Data and training

- 100 synthetic financial documents, 108 ordered page images, French/ASCII and TND.
- Train: 80; validation: 10; test: 10. Layouts are held out across splits.
- Four training layouts, one validation layout, one test layout.
- Invoices/credit notes and bank statements, with verbatim JSON targets.
- 3 epochs, {result['steps']} optimizer steps; batch 1; accumulation {contract['gradient_accumulation']}.
- LoRA rank {contract['rank']}, alpha {contract['alpha']}, dropout 0.05, language decoder only.
- Learning rate {contract['learning_rate']}; AdamW; warmup 10%; BF16; seed {contract['seed']}.
- Validation-loss checkpoint selection every five steps. The best adapter was merged.
- Maximum page pixels {contract['max_pixels']}; context limit {contract['max_length']}.
- Training-data fingerprint: `{contract['training_data_sha256']}`.
- This is ordinary LoRA, not QLoRA. Vision/base parameters stayed frozen during training.

## Use

Use the same NuExtract3 multimodal chat template, with images, a JSON extraction
template, instructions, and `enable_thinking=False`. This model includes processor,
tokenizer, template, config and standalone Safetensors weights. Load it using
`Qwen3_5ForConditionalGeneration.from_pretrained("{REPO_ID}", dtype=torch.bfloat16)`
and `AutoProcessor.from_pretrained("{REPO_ID}")`. The tested stack is Transformers
5.5.4, PEFT 0.19.0, PyTorch 2.10.0 CUDA 12.8; BF16 GPU inference is recommended.
The full official input-format guidance is in `BASE_MODEL_CARD.md` and `TYPES.md`.
Numeric results in the original model card belong to the original model, not this one.

## Limitations and safety

Training on only 80 synthetic documents can overfit layouts and formatting. Real
scans, handwriting, Arabic, tables and institutions not represented here may fail.
JSON validity is not factual correctness. Have an accountant verify all extracted
values; never automatically post transactions solely from this model's answer.
This release does not replace Fiscora's live model or automatically deploy anything.

## Attribution and license

Derived from NuMind's NuExtract3 (underlying Qwen3.5 architecture). Apache-2.0;
the original `LICENSE` and original model card are preserved. This repository's
weights are modified by Fiscora's synthetic-pilot LoRA fine-tuning and merging.
Training/release scripts: https://github.com/samimh23/Fiscora-tn-backend/tree/main/scripts/nuextract-lora
"""


def file_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def prepare_release(run, output, info):
    contract, result = verify_training(run, info)
    reports, adapter_comparison, comparison, verification = verify_evaluations(output)
    destination = output / "model"
    evaluation = destination / "evaluation"
    evaluation.mkdir(exist_ok=True)
    for name in ["base", "adapter", "merged"]:
        shutil.copytree(output / name, evaluation / name, dirs_exist_ok=True)
    dump(evaluation / "adapter-comparison.json", adapter_comparison)
    dump(evaluation / "comparison.json", comparison)
    dump(evaluation / "merge-verification.json", verification)
    dump(evaluation / "training.json", {"contract": contract, "steps": result["steps"], "metrics": result["metrics"]})
    (destination / "README.md").write_text(model_card(contract, result, reports), encoding="utf-8")
    files = {p.relative_to(destination).as_posix(): file_hash(p) for p in sorted(destination.rglob("*")) if p.is_file()}
    if not any(name.endswith(".safetensors") for name in files) or "config.json" not in files or "LICENSE" not in files:
        raise ValueError("Standalone release is incomplete")
    dump(destination / "release-manifest.json", {"status": "verified_not_published", "repo_id": REPO_ID,
         "base_model": BASE_MODEL, "base_revision": BASE_REVISION, "synthetic_only": True,
         "training_data_sha256": info["training_data_sha256"], "files_sha256": files,
         "production_accuracy_claim": False, "auto_deploy": False})
    print("Release verified and saved privately. No Hugging Face upload or live deployment.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    _, _, info = dataset_check(args.dataset)
    contract, _ = verify_training(args.run, info)
    if args.output.exists() and any(args.output.iterdir()):
        raise ValueError("Choose an empty release directory")
    args.output.mkdir(parents=True, exist_ok=True)
    common = [sys.executable, str(Path(__file__).with_name("train.py")), "evaluate", "--dataset", str(args.dataset),
              "--split", "test", "--final-test", "--max-pixels", str(contract["max_pixels"]),
              "--max-length", str(contract["max_length"]), "--max-new-tokens", "8192"]
    for name, extra in [("base", []), ("adapter", ["--adapter", str(args.run / "adapter")])]:
        subprocess.run([*common, "--output", str(args.output / name), *extra], check=True)
    merge(args.run, args.output / "model", contract["max_pixels"])
    subprocess.run([*common, "--output", str(args.output / "merged"), "--merged", str(args.output / "model")], check=True)
    prepare_release(args.run, args.output, info)


if __name__ == "__main__":
    main()
