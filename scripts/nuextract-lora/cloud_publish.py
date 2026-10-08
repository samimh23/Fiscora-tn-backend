"""CPU-only GCS -> HF publication. HF_TOKEN is injected by Secret Manager."""
import json
import subprocess
import sys
from pathlib import Path

from cloud_io import download_tree
from publish import verify_folder
from release import file_hash
from train import dump

SOURCE = "gs://fiscora-ai-training-472441103512/releases/financial-v1/model"


def disclose_failures(folder):
    base = json.loads((folder / "evaluation/base/evaluation.json").read_text())
    merged = json.loads((folder / "evaluation/merged/evaluation.json").read_text())
    predictions = json.loads((folder / "evaluation/merged/predictions.json").read_text())
    failed = [r["id"] for r in predictions if not r["valid_json_object"]]
    if not failed:
        return
    paragraph = ("**Known regression:** the following synthetic test documents returned invalid JSON: "
                 + ", ".join(f"`{name}`" for name in failed) + ". "
                 "One failed document with many fields can lower aggregate field accuracy even when "
                 "more documents are exact matches. This is not an across-the-board improvement or a "
                 f"production-ready model. Mean merged inference time was {merged['mean_seconds']:.2f} "
                 f"seconds/document versus {base['mean_seconds']:.2f} for the original in this setup.\n\n")
    readme = folder / "README.md"
    text = readme.read_text(encoding="utf-8")
    marker = "Exact fields use strict string equality"
    if marker not in text:
        raise ValueError("Unexpected model card; do not silently edit publication metadata")
    readme.write_text(text.replace(marker, paragraph + marker, 1), encoding="utf-8")
    manifest_path = folder / "release-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["files_sha256"]["README.md"] = file_hash(readme)
    dump(manifest_path, manifest)


def main():
    folder = Path("/workspace/public-model")
    print("Downloading only the verified synthetic merged release from private GCS.", flush=True)
    count = download_tree(SOURCE, folder)
    print(f"Downloaded {count} files; checking original release hashes.", flush=True)
    verify_folder(folder)
    disclose_failures(folder)
    verify_folder(folder)
    subprocess.run([sys.executable, str(Path(__file__).with_name("publish.py")), "--folder", str(folder),
                    "--publish-public"], check=True)


if __name__ == "__main__":
    main()
