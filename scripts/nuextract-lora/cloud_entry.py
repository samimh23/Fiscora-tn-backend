"""Vertex entry point: synthetic ZIP -> private checkpoints; never publish/deploy."""
import argparse
import hashlib
import json
import stat
import subprocess
import sys
import zipfile
from pathlib import Path, PurePosixPath

from cloud_io import gs_parts, restore_checkpoints, upload_tree


def extract_dataset(archive, destination, expected_sha256):
    if hashlib.sha256(archive.read_bytes()).hexdigest() != expected_sha256:
        raise ValueError("Dataset ZIP checksum differs from the reviewed synthetic pilot")
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as zipped:
        if sum(item.file_size for item in zipped.infolist()) > 512 * 1024 * 1024:
            raise ValueError("Dataset exceeds the pilot ZIP size limit")
        for item in zipped.infolist():
            path = PurePosixPath(item.filename)
            if path.is_absolute() or ".." in path.parts or ":" in item.filename or "\\" in item.filename:
                raise ValueError("Unsafe dataset ZIP path")
            if stat.S_ISLNK(item.external_attr >> 16):
                raise ValueError("Dataset ZIP symlinks are not allowed")
        zipped.extractall(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-gcs", required=True)
    parser.add_argument("--dataset-sha256", required=True)
    parser.add_argument("--run-gcs", required=True)
    parser.add_argument("training_args", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    from google.cloud import storage
    name, key = gs_parts(args.dataset_gcs)
    gs_parts(args.run_gcs)
    work = Path("/work")
    work.mkdir(exist_ok=True)
    archive = work / "dataset.zip"
    storage.Client().bucket(name).blob(key).download_to_filename(str(archive))
    dataset, output = work / "dataset", work / "run"
    extract_dataset(archive, dataset, args.dataset_sha256)
    checkpoint = restore_checkpoints(output, args.run_gcs)
    extra = args.training_args[1:] if args.training_args[:1] == ["--"] else args.training_args
    if any(arg in {"--dataset", "--output", "--checkpoint-gcs", "--resume"} or arg.startswith(("--dataset=", "--output=", "--checkpoint-gcs=", "--resume=")) for arg in extra):
        raise ValueError("Cloud paths/resume are controlled by this entry point")
    command = [sys.executable, "/app/train.py", "train", "--run", "--dataset", str(dataset), "--output", str(output),
               "--checkpoint-gcs", args.run_gcs, *extra]
    if checkpoint:
        command += ["--resume", str(checkpoint)]
        print(f"Resuming complete checkpoint {checkpoint.name}", flush=True)
    try:
        subprocess.run(command, check=True)
    except subprocess.CalledProcessError as error:
        output.mkdir(parents=True, exist_ok=True)
        (output / "failure.json").write_text(json.dumps({"exit_code": error.returncode, "deployed": False}) + "\n")
        raise
    finally:
        if output.exists():
            upload_tree(output, args.run_gcs)


if __name__ == "__main__":
    main()
