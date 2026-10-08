import json
import tempfile
import unittest
from pathlib import Path

from data import compare_reports, dataset_check, safe_path, score_prediction, validate_target
from train import DEFAULT_DATASET, messages_for, default_paths


class DataTests(unittest.TestCase):
    def test_flat_container_paths(self):
        self.assertEqual(default_paths("/app/train.py"), (Path("/work/dataset"), Path("/work/runs")))

    def test_flat_script_starts(self):
        import shutil
        import subprocess
        import sys
        with tempfile.TemporaryDirectory() as directory:
            for name in ["train.py", "data.py"]:
                shutil.copyfile(Path(__file__).parent / name, Path(directory) / name)
            result = subprocess.run([sys.executable, str(Path(directory) / "train.py"), "--help"], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("preflight", result.stdout)

    def test_pilot_integrity(self):
        if not DEFAULT_DATASET.exists():
            self.skipTest("Generate the synthetic pilot locally first")
        train, val, report = dataset_check(DEFAULT_DATASET)
        self.assertEqual((len(train), len(val), report["test"]), (80, 10, 10))
        self.assertEqual(len(report["training_data_sha256"]), 64)

    def test_schema_rejects_missing_keys(self):
        with self.assertRaises(ValueError):
            validate_target({}, {"total": "verbatim-string"})

    def test_schema_rejects_numeric_verbatim(self):
        with self.assertRaises(ValueError):
            validate_target({"total": 42}, {"total": "verbatim-string"})
        validate_target({"total": None}, {"total": "verbatim-string"})

    def test_enum(self):
        with self.assertRaises(ValueError):
            validate_target("invalid", ["invoice", "credit_note"])

    def test_paths_cannot_escape(self):
        for value in ["../data.py", "C:/secret.txt", "/secret.txt", "images\\x.jpg"]:
            with self.assertRaises(ValueError):
                safe_path(Path(__file__).parent, value)

    def test_exact_metric_not_null_inflated(self):
        score = score_prediction({"total": "1,000", "tax_id": None}, {"total": "1.000", "tax_id": None})
        self.assertFalse(score["exact_document"])
        self.assertEqual(score["nonnull_correct"], 0)
        self.assertEqual(score["nonnull_total"], 1)

    def test_extra_rows_and_keys_penalized(self):
        good = {"rows": [{"amount": "2"}]}
        extra = {"rows": [{"amount": "2"}, {"amount": "2"}], "extra": None}
        score = score_prediction(good, extra)
        self.assertLess(score["fields_correct"], score["fields_total"])
        self.assertFalse(score["exact_document"])

    def test_page_order_and_exact_answer(self):
        if not DEFAULT_DATASET.exists():
            self.skipTest("Generate pilot first")
        rows, _, _ = dataset_check(DEFAULT_DATASET)
        row = next(row for row in rows if len(row["images"]) == 2)
        messages = messages_for(row, DEFAULT_DATASET, True)
        self.assertEqual([Path(item["path"]).name for item in messages[0]["content"]], [Path(p).name for p in row["images"]])
        self.assertEqual(json.loads(messages[-1]["content"][0]["text"]), row["output"])

    def test_comparison_rejects_different_limits(self):
        base = {key: 1 for key in ["training_data_sha256", "base_model", "base_revision", "split", "documents", "max_pixels", "max_length", "max_new_tokens", "packages"]}
        changed = dict(base, max_pixels=2)
        with self.assertRaisesRegex(ValueError, "max_pixels"):
            compare_reports(base, changed)


if __name__ == "__main__":
    unittest.main()
