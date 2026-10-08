"""Continue this approved one-off run, with a durable ledger and no duplicate jobs."""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

from train import dump

PROJECT = "fiscora-ai"
REGION = "us-central1"
DISPLAY = "fiscora-nuextract3-release-20261008-v1"
RELEASE_GCS = "gs://fiscora-ai-training-472441103512/releases/financial-v1/model"
TERMINAL = {"JOB_STATE_SUCCEEDED", "JOB_STATE_FAILED", "JOB_STATE_CANCELLED", "JOB_STATE_EXPIRED"}


def gcloud(*args):
    executable = shutil.which("gcloud")
    if not executable:
        raise RuntimeError("gcloud must be installed and authenticated locally")
    result = subprocess.run([executable, *args, "--project=" + PROJECT, "--format=json"],
                            capture_output=True, text=True, encoding="utf-8", errors="replace", check=True)
    return json.loads(result.stdout) if result.stdout.strip() else None


def wait_job(job, deadline):
    previous = None
    while time.monotonic() < deadline:
        info = gcloud("ai", "custom-jobs", "describe", job, "--region=" + REGION)
        state = info["state"]
        if state != previous:
            print(f"Job {job}: {state}", flush=True)
            previous = state
        if state in TERMINAL:
            if state != "JOB_STATE_SUCCEEDED":
                raise RuntimeError(f"Job {job} ended with {state}: {info.get('error', {})}")
            return
        time.sleep(30)
    raise TimeoutError("Local waiting limit reached; cloud jobs retain their configured timeouts. Inspect before restarting.")


def release_job(config_path, ledger, ledger_path):
    config = json.loads(config_path.read_text(encoding="utf-8"))
    image = config["workerPoolSpecs"][0]["containerSpec"]["imageUri"]
    if "@sha256:" not in image:
        raise ValueError("Pin the verified release image digest before running")
    if ledger.get("release_job"):
        return ledger["release_job"]
    # Recover the small submit->ledger-write crash window without spending on duplicates.
    existing = gcloud("ai", "custom-jobs", "list", "--region=" + REGION, "--filter=displayName=" + DISPLAY)
    if existing:
        if len(existing) != 1:
            raise ValueError("Multiple matching release jobs; inspect manually")
        job = existing[0]["name"]
        details = gcloud("ai", "custom-jobs", "describe", job, "--region=" + REGION)
        if details["jobSpec"]["workerPoolSpecs"][0]["containerSpec"] != config["workerPoolSpecs"][0]["containerSpec"]:
            raise ValueError("Existing release job has different settings")
    else:
        job = gcloud("ai", "custom-jobs", "create", "--region=" + REGION, "--display-name=" + DISPLAY,
                     "--config=" + str(config_path))["name"]
    ledger["release_job"] = job
    dump(ledger_path, ledger)
    return job


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--training-job", default="1746347592477835264")
    parser.add_argument("--ledger", type=Path, default=Path("output/nuextract-lora/pipeline-v1.json"))
    parser.add_argument("--folder", type=Path, default=Path("output/nuextract-lora/public-model-v1"))
    parser.add_argument("--publish-public", action="store_true")
    args = parser.parse_args()
    if not args.training_job.isdigit():
        parser.error("Expected numeric approved training job ID")
    ledger = json.loads(args.ledger.read_text(encoding="utf-8")) if args.ledger.exists() else {"training_job": args.training_job}
    if ledger["training_job"] != args.training_job:
        raise ValueError("Ledger belongs to a different training run")
    args.ledger.parent.mkdir(parents=True, exist_ok=True)
    dump(args.ledger, ledger)
    deadline = time.monotonic() + 3 * 3600
    wait_job(args.training_job, deadline)
    job = release_job(Path(__file__).with_name("vertex-release.json"), ledger, args.ledger)
    wait_job(job, deadline)
    if shutil.disk_usage(args.ledger.parent).free < 12 * 1024 ** 3 and not args.folder.exists():
        raise RuntimeError("Need at least 12 GiB free for standalone weights; artifacts are safe in private GCS")
    executable = shutil.which("gcloud")
    subprocess.run([executable, "storage", "rsync", "--recursive", RELEASE_GCS, str(args.folder)], check=True)
    command = [sys.executable, str(Path(__file__).with_name("publish.py")), "--folder", str(args.folder)]
    subprocess.run(command, check=True)
    ledger["status"] = "verified_ready_for_public_upload"
    dump(args.ledger, ledger)
    if args.publish_public:
        from huggingface_hub import get_token
        if not get_token():
            print("Ready, but HF login is missing. Run hf auth login locally, then publish.py --publish-public. Never share tokens in chat.", flush=True)
            return
        environment = dict(os.environ, HF_XET_CHUNK_CACHE_SIZE_BYTES="0")
        subprocess.run([*command, "--publish-public"], check=True, env=environment)
        ledger["status"] = "published"
        dump(args.ledger, ledger)


if __name__ == "__main__":
    main()
