"""Approved one-off CPU publication with a temporary secret and automatic cleanup."""
import json
import shutil
import subprocess
import time
from pathlib import Path

from train import dump

PROJECT = "fiscora-ai"
SECRET = "fiscora-hf-publish-temp-20261009"
MEMBER = "serviceAccount:472441103512-compute@developer.gserviceaccount.com"
ROLE = "roles/secretmanager.secretAccessor"


def cloud(*args, input_value=None):
    result = subprocess.run([shutil.which("gcloud"), *args, "--project=" + PROJECT, "--format=json", "--quiet"],
                            input=input_value, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode:
        # Never print subprocess input or an HF_TOKEN environment.
        raise RuntimeError(f"gcloud {' '.join(args[:3])} failed: {result.stderr.strip()}")
    return json.loads(result.stdout) if result.stdout.strip() else None


def main():
    from huggingface_hub import HfApi, get_token
    token = get_token()
    if not token or HfApi().whoami()["name"] != "samimh23":
        raise ValueError("Local samimh23 HF login is required")
    ledger_path = Path("output/nuextract-lora/direct-publish-v1.json")
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    ledger = {"secret": SECRET, "public_repo": "samimh23/fiscora-nuextract3-financial-v1", "live_model_changed": False}
    created = granted = False
    build_id = None
    try:
        cloud("secrets", "create", SECRET, "--replication-policy=automatic",
              "--labels=purpose=fiscora-hf-publish,temporary=true")
        created = True
        version = cloud("secrets", "versions", "add", SECRET, "--data-file=-", input_value=token)["name"]
        del token
        cloud("secrets", "add-iam-policy-binding", SECRET, "--member=" + MEMBER, "--role=" + ROLE)
        granted = True
        ledger["secret_version"] = version
        dump(ledger_path, ledger)
        build = cloud("builds", "submit", "scripts/nuextract-lora", "--config=scripts/nuextract-lora/cloudbuild-publish.yaml",
                      "--substitutions=_HF_SECRET_VERSION=" + version, "--async")
        build_id = build["id"]
        ledger["build_id"] = build_id
        dump(ledger_path, ledger)
        print(f"CPU publication build submitted: {build_id}. Token is not logged.", flush=True)
        previous = None
        deadline = time.monotonic() + 2400
        while time.monotonic() < deadline:
            state = cloud("builds", "describe", build_id)["status"]
            if state != previous:
                print(f"Publication build: {state}", flush=True)
                previous = state
            if state == "SUCCESS":
                ledger["status"] = "published"
                break
            if state not in {"PENDING", "QUEUED", "WORKING", "STATUS_UNKNOWN"}:
                raise RuntimeError(f"Publication build ended with {state}; inspect logs before retrying")
            time.sleep(20)
        else:
            cloud("builds", "cancel", build_id)
            raise TimeoutError("Publication waiting limit reached; build cancelled before secret cleanup")
    finally:
        errors = []
        if granted:
            try:
                cloud("secrets", "remove-iam-policy-binding", SECRET, "--member=" + MEMBER, "--role=" + ROLE)
                ledger["temporary_access_removed"] = True
            except Exception:
                errors.append("temporary access cleanup")
        if created:
            try:
                cloud("secrets", "delete", SECRET)
                ledger["temporary_secret_deleted"] = True
            except Exception:
                errors.append("temporary secret deletion")
        ledger["cleanup_errors"] = errors
        dump(ledger_path, ledger)
        if errors:
            raise RuntimeError("Manual cleanup required: " + ", ".join(errors))
        print("Temporary secret and temporary access removed.", flush=True)


if __name__ == "__main__":
    main()
