"""Opt-in CPU integration tests: metadata/processor download, never real weights."""
import os
import tempfile
import unittest
from pathlib import Path

from data import BASE_MODEL, BASE_REVISION, dataset_check
from train import DEFAULT_DATASET, encode_row, load_processor, lora_targets


@unittest.skipUnless(os.environ.get("NUEXTRACT_PROCESSOR_TESTS") == "1", "Set NUEXTRACT_PROCESSOR_TESTS=1 for actual processor tests")
class ProcessorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.processor = load_processor(1048576)
        cls.rows, _, _ = dataset_check(DEFAULT_DATASET)

    def test_json_only_labels(self):
        import torch
        batch, stats = encode_row(self.rows[0], DEFAULT_DATASET, self.processor, 16384)
        self.assertTrue(torch.all(batch["labels"][:, :stats["prompt_tokens"]] == -100))
        self.assertGreater(stats["supervised_tokens"], 10)
        self.assertGreater(batch["pixel_values"].numel(), 0)

    def test_multiple_images_are_consumed(self):
        row = next(row for row in self.rows if len(row["images"]) == 2)
        batch, stats = encode_row(row, DEFAULT_DATASET, self.processor, 16384)
        self.assertEqual(len(batch["image_grid_thw"]), 2)
        self.assertEqual(stats["pages"], 2)

    def test_never_truncates_targets(self):
        with self.assertRaisesRegex(ValueError, "exceeds"):
            encode_row(self.rows[0], DEFAULT_DATASET, self.processor, 256)

    def test_saved_release_processor_round_trip(self):
        from transformers import AutoProcessor
        root = Path(__file__).resolve().parents[2] / "tmp"
        with tempfile.TemporaryDirectory(dir=root) as directory:
            self.processor.save_pretrained(directory)
            saved = AutoProcessor.from_pretrained(directory, trust_remote_code=False)
            self.assertEqual(saved.chat_template, self.processor.chat_template)
            self.assertEqual(saved.image_processor.size, self.processor.image_processor.size)
            for name in ["processor_config.json", "tokenizer_config.json", "tokenizer.json", "chat_template.jinja"]:
                self.assertTrue((Path(directory) / name).is_file(), name)

    def test_full_architecture_targets_without_weights(self):
        import torch
        from transformers import AutoConfig, Qwen3_5ForConditionalGeneration
        from peft import LoraConfig, TaskType, get_peft_model
        config = AutoConfig.from_pretrained(BASE_MODEL, revision=BASE_REVISION, trust_remote_code=False)
        with torch.device("meta"):
            model = Qwen3_5ForConditionalGeneration(config)
            targets = lora_targets(model)
            model = get_peft_model(model, LoraConfig(task_type=TaskType.CAUSAL_LM, r=8, lora_alpha=16,
                                                    target_modules=targets, revision=BASE_REVISION))
        self.assertTrue(any("linear_attn" in name for name in targets))
        self.assertTrue(any("self_attn" in name for name in targets))
        trainable = [name for name, p in model.named_parameters() if p.requires_grad]
        self.assertTrue(trainable)
        self.assertTrue(all("lora_" in name and "visual" not in name for name in trainable))

    def test_tiny_qwen_forward_backward_and_checkpoint_resume(self):
        import torch
        from transformers import Qwen3_5Config, Qwen3_5ForConditionalGeneration, Trainer, TrainingArguments, set_seed
        from peft import LoraConfig, TaskType, get_peft_model
        config = Qwen3_5Config(
            text_config={"vocab_size": 256, "hidden_size": 32, "intermediate_size": 64,
                         "num_hidden_layers": 2, "num_attention_heads": 2, "num_key_value_heads": 1,
                         "head_dim": 16, "layer_types": ["linear_attention", "full_attention"], "mtp_num_hidden_layers": 0,
                         "linear_num_key_heads": 1, "linear_num_value_heads": 2, "linear_key_head_dim": 16,
                         "linear_value_head_dim": 16, "linear_conv_kernel_dim": 4, "use_cache": False,
                         "rope_parameters": {"rope_type": "default", "rope_theta": 10000, "partial_rotary_factor": 1.0,
                                             "mrope_section": [2, 3, 3], "mrope_interleaved": True}},
            vision_config={"depth": 1, "hidden_size": 32, "intermediate_size": 64, "num_heads": 2,
                           "out_hidden_size": 32, "patch_size": 4, "temporal_patch_size": 1,
                           "spatial_merge_size": 2, "num_position_embeddings": 16},
            image_token_id=3, video_token_id=6, vision_start_token_id=4, vision_end_token_id=5,
            pad_token_id=0, eos_token_id=2)

        def make_model():
            set_seed(42)
            model = Qwen3_5ForConditionalGeneration(config)
            model.config.use_cache = False
            model.config.text_config.use_cache = False
            model = get_peft_model(model, LoraConfig(task_type=TaskType.CAUSAL_LM, r=2, lora_alpha=4,
                                                    target_modules=lora_targets(model)))
            model.enable_input_require_grads()
            return model

        set_seed(42)
        batch = {"input_ids": torch.tensor([[10, 4, 3, 5, 11, 12, 13, 2]]),
                 "attention_mask": torch.ones((1, 8), dtype=torch.long),
                 "mm_token_type_ids": torch.tensor([[0, 0, 1, 0, 0, 0, 0, 0]]),
                 "pixel_values": torch.randn(4, 48), "image_grid_thw": torch.tensor([[1, 2, 2]]),
                 "labels": torch.tensor([[-100, -100, -100, -100, -100, 12, 13, 2]])}
        model = make_model()
        loss = model(**batch).loss
        self.assertTrue(torch.isfinite(loss))
        loss.backward()
        self.assertTrue(any(p.grad is not None and p.grad.abs().sum() > 0 for p in model.parameters() if p.requires_grad))
        root = Path(__file__).resolve().parents[2] / "tmp"
        root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=root) as directory:
            settings = TrainingArguments(output_dir=directory, use_cpu=True, per_device_train_batch_size=1,
                                         max_steps=2, save_steps=1, logging_steps=1, report_to="none", remove_unused_columns=False,
                                         gradient_checkpointing=True, gradient_checkpointing_kwargs={"use_reentrant": False})
            trainer = Trainer(model=make_model(), args=settings, train_dataset=[{}], data_collator=lambda _: batch)
            trainer.train()
            self.assertTrue((Path(directory) / "checkpoint-1/trainer_state.json").exists())
            resumed = Trainer(model=make_model(), args=settings, train_dataset=[{}], data_collator=lambda _: batch)
            resumed.train(resume_from_checkpoint=str(Path(directory) / "checkpoint-1"))
            self.assertEqual(resumed.state.global_step, 2)
            # Verify the same architecture's LoRA merge, standalone serialization
            # and reload with actual tiny weights, not metadata-only tensors.
            model = resumed.model.eval()
            with torch.inference_mode():
                expected = model(**batch).logits.clone()
            merged = model.merge_and_unload(safe_merge=True)
            merged_dir = Path(directory) / "merged"
            merged.save_pretrained(merged_dir, safe_serialization=True)
            loaded = Qwen3_5ForConditionalGeneration.from_pretrained(merged_dir).eval()
            with torch.inference_mode():
                actual = loaded(**batch).logits
            torch.testing.assert_close(actual, expected, rtol=1e-4, atol=1e-5)


if __name__ == "__main__":
    unittest.main()
