import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from cloud_publish import disclose_failures
from direct_publish import main
from release import file_hash
from train import dump


class DirectPublishTests(unittest.TestCase):
    def test_failure_disclosure_updates_only_readme_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / "evaluation/base").mkdir(parents=True)
            (folder / "evaluation/merged").mkdir(parents=True)
            dump(folder / "evaluation/base/evaluation.json", {"mean_seconds": 52.1})
            dump(folder / "evaluation/merged/evaluation.json", {"mean_seconds": 77.2})
            dump(folder / "evaluation/merged/predictions.json", [{"id": "synthetic-bank-9", "valid_json_object": False}])
            (folder / "README.md").write_text("Results\nExact fields use strict string equality", encoding="utf-8")
            dump(folder / "release-manifest.json", {"files_sha256": {"README.md": "old", "model.safetensors": "unchanged"}})
            disclose_failures(folder)
            manifest = json.loads((folder / "release-manifest.json").read_text())
            self.assertEqual(manifest["files_sha256"]["README.md"], file_hash(folder / "README.md"))
            self.assertEqual(manifest["files_sha256"]["model.safetensors"], "unchanged")
            self.assertIn("synthetic-bank-9", (folder / "README.md").read_text())
            self.assertIn("not an across-the-board improvement", (folder / "README.md").read_text())

    def run_fake_publication(self, failure=False):
        def fake_cloud(*args, **kwargs):
            if args[:3] == ("secrets", "versions", "add"):
                self.assertEqual(kwargs["input_value"], "test-only-placeholder")
                return {"name": "projects/test/secrets/temporary/versions/1"}
            if args[:2] == ("builds", "submit"):
                return {"id": "test-build"}
            if args[:2] == ("builds", "describe"):
                if failure:
                    return {"status": "FAILURE"}
                return {"status": "SUCCESS"}
            return {}
        output = io.StringIO()
        with patch("huggingface_hub.get_token", return_value="test-only-placeholder"), \
                patch("huggingface_hub.HfApi") as api, patch("direct_publish.cloud", side_effect=fake_cloud) as cloud, \
                patch("direct_publish.dump") as write, redirect_stdout(output):
            api.return_value.whoami.return_value = {"name": "samimh23"}
            if failure:
                with self.assertRaisesRegex(RuntimeError, "FAILURE"):
                    main()
            else:
                main()
            self.assertTrue(any(call.args[:2] == ("secrets", "remove-iam-policy-binding") for call in cloud.call_args_list))
            self.assertTrue(any(call.args[:2] == ("secrets", "delete") for call in cloud.call_args_list))
            self.assertTrue(write.call_args.args[1]["temporary_secret_deleted"])
            self.assertTrue(write.call_args.args[1]["temporary_access_removed"])
            self.assertNotIn("test-only-placeholder", output.getvalue())

    def test_secret_cleanup_after_success(self):
        self.run_fake_publication()

    def test_secret_cleanup_after_failure(self):
        self.run_fake_publication(failure=True)

    def test_wrong_hf_account_creates_no_secret(self):
        with patch("huggingface_hub.get_token", return_value="test-only-placeholder"), \
                patch("huggingface_hub.HfApi") as api, patch("direct_publish.cloud") as cloud:
            api.return_value.whoami.return_value = {"name": "not-authorized"}
            with self.assertRaisesRegex(ValueError, "samimh23"):
                main()
            cloud.assert_not_called()


if __name__ == "__main__":
    unittest.main()
