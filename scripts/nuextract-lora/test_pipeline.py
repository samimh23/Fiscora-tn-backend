import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from finish_pipeline import release_job, wait_job
from train import dump


class PipelineTests(unittest.TestCase):
    def test_wait_returns_only_on_success(self):
        with patch("finish_pipeline.gcloud", return_value={"state": "JOB_STATE_SUCCEEDED"}):
            wait_job("123", float("inf"))

    def test_wait_rejects_failed_training(self):
        with patch("finish_pipeline.gcloud", return_value={"state": "JOB_STATE_FAILED", "error": {"code": 1}}):
            with self.assertRaisesRegex(RuntimeError, "FAILED"):
                wait_job("123", float("inf"))

    def test_does_not_submit_duplicate_job_from_ledger(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            config = root / "config.json"
            dump(config, {"workerPoolSpecs": [{"containerSpec": {"imageUri": "image@sha256:" + "a" * 64}}]})
            with patch("finish_pipeline.gcloud") as cloud:
                self.assertEqual(release_job(config, {"release_job": "existing"}, root / "ledger.json"), "existing")
                cloud.assert_not_called()

    def test_rejects_unpinned_image(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            config = root / "config.json"
            dump(config, {"workerPoolSpecs": [{"containerSpec": {"imageUri": "image:latest"}}]})
            with patch("finish_pipeline.gcloud") as cloud:
                with self.assertRaisesRegex(ValueError, "digest"):
                    release_job(config, {}, root / "ledger.json")
                cloud.assert_not_called()


if __name__ == "__main__":
    unittest.main()
