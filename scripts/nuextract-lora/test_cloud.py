import hashlib
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import MagicMock, patch

from cloud_entry import extract_dataset
from cloud_io import gs_parts, save_checkpoint


class CloudTests(unittest.TestCase):
    def test_gcs_uri(self):
        self.assertEqual(gs_parts("gs://private-bucket/runs/pilot"), ("private-bucket", "runs/pilot"))
        for uri in ["https://example.com/a", "gs://bucket", "gs://bucket/a/../b", "gs://bucket/key?token=x"]:
            with self.assertRaises(ValueError):
                gs_parts(uri)

    def archive(self, root, name="images/page.jpg"):
        path = root / "dataset.zip"
        with zipfile.ZipFile(path, "w") as zipped:
            zipped.writestr(name, b"synthetic-test")
        return path, hashlib.sha256(path.read_bytes()).hexdigest()

    def test_extract_local_pilot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive, digest = self.archive(root)
            extract_dataset(archive, root / "data", digest)
            self.assertEqual((root / "data/images/page.jpg").read_bytes(), b"synthetic-test")

    def test_reject_wrong_checksum(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive, _ = self.archive(root)
            with self.assertRaisesRegex(ValueError, "checksum"):
                extract_dataset(archive, root / "data", "0" * 64)

    def test_reject_zip_path_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive, digest = self.archive(root, "../escaped.txt")
            with self.assertRaisesRegex(ValueError, "Unsafe"):
                extract_dataset(archive, root / "data", digest)
            self.assertFalse((root / "escaped.txt").exists())

    def test_checkpoint_completion_is_written_last(self):
        try:
            import google.cloud.storage
        except ImportError:
            self.skipTest("Install cloud-requirements.txt for checkpoint tests")
        with patch("google.cloud.storage.Client") as client, patch("cloud_io.upload_tree") as upload:
            bucket = client.return_value.bucket.return_value
            events = MagicMock()
            events.attach_mock(upload, "files")
            events.attach_mock(bucket, "bucket")
            save_checkpoint(Path("/work/run"), 5, "gs://bucket/run")
            self.assertEqual(events.mock_calls[0].args[0], Path("/work/run/checkpoint-5"))
            self.assertEqual(bucket.blob.call_args_list[-1].args[0], "run/checkpoint-5/_COMPLETE")
            self.assertEqual(events.mock_calls[-1].args, ("complete\n",))

    def test_partial_checkpoint_gets_no_completion_marker(self):
        try:
            import google.cloud.storage
        except ImportError:
            self.skipTest("Install cloud-requirements.txt for checkpoint tests")
        with patch("google.cloud.storage.Client") as client, patch("cloud_io.upload_tree", side_effect=RuntimeError("interrupted")):
            with self.assertRaisesRegex(RuntimeError, "interrupted"):
                save_checkpoint(Path("/work/run"), 5, "gs://bucket/run")
            client.return_value.bucket.return_value.blob.assert_not_called()


if __name__ == "__main__":
    unittest.main()
