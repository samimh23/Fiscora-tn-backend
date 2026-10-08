"""Private GPU evaluation/merge job. No HF token, publication, or deployment."""
import argparse
import subprocess
import sys
from pathlib import Path

from cloud_entry import extract_dataset
from cloud_io import download_tree, gs_parts, upload_tree


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-gcs", required=True)
    parser.add_argument("--dataset-sha256", required=True)
    parser.add_argument("--run-gcs", required=True)
    parser.add_argument("--release-gcs", required=True)
    args = parser.parse_args()
    if args.run_gcs.rstrip("/") == args.release_gcs.rstrip("/"):
        raise ValueError("Release must not overwrite the training run")
    gs_parts(args.release_gcs)
    from gpu_check import check_gpu
    check_gpu()
    from google.cloud import storage
    bucket, key = gs_parts(args.dataset_gcs)
    work = Path("/work")
    work.mkdir(exist_ok=True)
    archive = work / "dataset.zip"
    storage.Client().bucket(bucket).blob(key).download_to_filename(str(archive))
    extract_dataset(archive, work / "dataset", args.dataset_sha256)
    download_tree(args.run_gcs, work / "run", lambda name: name in {"run.json", "result.json"} or name.startswith("adapter/"))
    output = work / "release"
    try:
        subprocess.run([sys.executable, "/app/release.py", "--dataset", str(work / "dataset"),
                        "--run", str(work / "run"), "--output", str(output)], check=True)
    finally:
        if output.exists():
            upload_tree(output, args.release_gcs)
    print("Private evaluation and merged-model artifacts uploaded. Not published/deployed.", flush=True)


if __name__ == "__main__":
    main()
