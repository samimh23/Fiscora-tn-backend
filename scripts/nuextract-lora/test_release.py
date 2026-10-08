import copy
import json
import tempfile
import unittest
from pathlib import Path

from data import BASE_MODEL, BASE_REVISION, compare_reports, evaluation_fingerprint
from publish import verify_folder
from release import REPO_ID, file_hash, model_card, verify_evaluations, verify_training


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


class ReleaseTests(unittest.TestCase):
    def training_fixture(self, root):
        info = {"base_model": BASE_MODEL, "base_revision": BASE_REVISION, "training_data_sha256": "a" * 64,
                "train": 80, "validation": 10, "test": 10}
        contract = {**info, "gradient_accumulation": 4, "epochs": 3, "max_steps": -1,
                    "rank": 8, "alpha": 16, "learning_rate": 0.0001, "seed": 20261008,
                    "max_pixels": 1048576, "max_length": 16384}
        write(root / "run.json", {"contract": contract, "status": "training_completed_not_deployed"})
        write(root / "result.json", {"steps": 60, "deployed": False, "metrics": {"train_loss": 0.1}})
        write(root / "adapter/adapter_config.json", {"base_model_name_or_path": BASE_MODEL, "revision": BASE_REVISION})
        (root / "adapter/adapter_model.safetensors").write_bytes(b"test-fixture-not-a-model")
        return info

    def evaluation_fixture(self, root):
        report = {"training_data_sha256": "a" * 64, "evaluation_data_sha256": "b" * 64,
                  "base_model": BASE_MODEL, "base_revision": BASE_REVISION, "split": "test", "documents": 10,
                  "document_ids": [str(n) for n in range(10)], "max_pixels": 1048576, "max_length": 16384,
                  "max_new_tokens": 8192, "packages": {"transformers": "5.5.4"}, "mean_seconds": 5,
                  "json_validity": 1, "field_exact_match": 0.8, "nonnull_field_exact_match": 0.7, "document_exact_match": 0.5}
        for name in ["base", "adapter", "merged"]:
            row = dict(report, model_variant=name, adapter=None if name == "base" else f"/work/{name}")
            write(root / name / "evaluation.json", row)
            write(root / name / "predictions.json", [{"id": str(n), "prediction": "{}"} for n in range(10)])
        return report

    def test_accept_complete_training(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            info = self.training_fixture(root)
            self.assertEqual(verify_training(root, info)[1]["steps"], 60)

    def test_reject_time_limited_partial_training(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            info = self.training_fixture(root)
            write(root / "result.json", {"steps": 55, "deployed": False})
            with self.assertRaisesRegex(ValueError, "not complete"):
                verify_training(root, info)

    def test_reject_adapter_from_another_base(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            info = self.training_fixture(root)
            write(root / "adapter/adapter_config.json", {"base_model_name_or_path": BASE_MODEL, "revision": "other"})
            with self.assertRaisesRegex(ValueError, "revision"):
                verify_training(root, info)

    def test_compare_three_real_reports(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.evaluation_fixture(root)
            reports, _, comparison, verification = verify_evaluations(root)
            self.assertEqual(verification["identical_generation_count"], 10)
            self.assertEqual(comparison["comparison"]["field_exact_match"]["change"], 0)
            self.assertEqual(reports["merged"]["model_variant"], "merged")

    def test_reject_changed_test_data(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.evaluation_fixture(root)
            row = json.loads((root / "merged/evaluation.json").read_text())
            row["evaluation_data_sha256"] = "c" * 64
            write(root / "merged/evaluation.json", row)
            with self.assertRaisesRegex(ValueError, "evaluation_data_sha256"):
                verify_evaluations(root)

    def test_reject_merge_metric_regression(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.evaluation_fixture(root)
            row = json.loads((root / "merged/evaluation.json").read_text())
            row["field_exact_match"] = 0.79
            write(root / "merged/evaluation.json", row)
            with self.assertRaisesRegex(ValueError, "below adapter"):
                verify_evaluations(root)

    def test_reject_missing_predictions(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.evaluation_fixture(root)
            write(root / "adapter/predictions.json", [])
            with self.assertRaisesRegex(ValueError, "IDs"):
                verify_evaluations(root)

    def test_fingerprint_includes_image_and_answer(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "page.jpg").write_bytes(b"one")
            rows = [{"images": ["page.jpg"], "output": {"total": "1"}}]
            original = evaluation_fingerprint(root, rows)
            changed = copy.deepcopy(rows)
            changed[0]["output"]["total"] = "2"
            self.assertNotEqual(original, evaluation_fingerprint(root, changed))
            (root / "page.jpg").write_bytes(b"two")
            self.assertNotEqual(original, evaluation_fingerprint(root, rows))

    def publication_fixture(self, root):
        required = ["README.md", "LICENSE", "BASE_MODEL_CARD.md", "config.json", "tokenizer_config.json",
                    "tokenizer.json", "processor_config.json", "chat_template.jinja", "model.safetensors",
                    "evaluation/comparison.json", "evaluation/merged/evaluation.json"]
        for name in required:
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("fixture", encoding="utf-8")
        write(root / "evaluation/merge-verification.json", {"status": "PASS", "reloaded_from_saved_weights": True})
        manifest = {"status": "verified_not_published", "repo_id": REPO_ID, "base_model": BASE_MODEL,
                    "base_revision": BASE_REVISION, "synthetic_only": True, "auto_deploy": False,
                    "files_sha256": {p.relative_to(root).as_posix(): file_hash(p) for p in root.rglob("*") if p.is_file()}}
        write(root / "release-manifest.json", manifest)
        return manifest

    def test_publication_only_allowlists_verified_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.publication_fixture(root)
            (root / "secret.env").write_text("do-not-upload")
            files = verify_folder(root)
            self.assertIn("model.safetensors", files)
            self.assertNotIn("secret.env", files)

    def test_publication_rejects_changed_weights(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.publication_fixture(root)
            (root / "model.safetensors").write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "changed"):
                verify_folder(root)

    def test_publication_rejects_wrong_owner(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            manifest = self.publication_fixture(root)
            manifest["repo_id"] = "someone-else/model"
            write(root / "release-manifest.json", manifest)
            with self.assertRaisesRegex(ValueError, "reviewed"):
                verify_folder(root)

    def test_publication_rejects_path_escape(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            manifest = self.publication_fixture(root)
            manifest["files_sha256"]["../secret.json"] = "a" * 64
            write(root / "release-manifest.json", manifest)
            with self.assertRaisesRegex(ValueError, "Unsafe"):
                verify_folder(root)

    def test_card_reports_merged_scores_and_synthetic_limits(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            info = self.training_fixture(root)
            contract, result = verify_training(root, info)
            reports = {name: {key: 0.5 for key in ["json_validity", "document_exact_match", "field_exact_match", "nonnull_field_exact_match"]}
                       for name in ["base", "merged"]}
            card = model_card(contract, result, reports)
            self.assertIn("50.00%", card)
            self.assertIn("base_model_relation: finetune", card)
            self.assertIn("do not establish", card)
            self.assertIn("60 optimizer steps", card)


if __name__ == "__main__":
    unittest.main()
