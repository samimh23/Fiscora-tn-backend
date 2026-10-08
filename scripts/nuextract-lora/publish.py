"""Publish only an explicitly verified synthetic merged release to samimh23."""
import argparse
import json
from pathlib import Path, PurePosixPath

from release import BASE_MODEL, BASE_REVISION, REPO_ID, file_hash


def verify_folder(folder):
    manifest = json.loads((folder / "release-manifest.json").read_text(encoding="utf-8"))
    if (manifest.get("repo_id") != REPO_ID or manifest.get("status") != "verified_not_published"
            or manifest.get("base_model") != BASE_MODEL or manifest.get("base_revision") != BASE_REVISION
            or manifest.get("synthetic_only") is not True or manifest.get("auto_deploy") is not False):
        raise ValueError("Not the reviewed synthetic release")
    files = manifest["files_sha256"]
    required = {"README.md", "LICENSE", "BASE_MODEL_CARD.md", "config.json", "tokenizer_config.json", "tokenizer.json",
                "processor_config.json", "chat_template.jinja",
                "evaluation/comparison.json", "evaluation/merge-verification.json", "evaluation/merged/evaluation.json"}
    if not required.issubset(files) or not any(name.startswith("model") and name.endswith(".safetensors") for name in files):
        raise ValueError("Missing standalone weights, processor, notices or results")
    for relative, expected in files.items():
        path = PurePosixPath(relative)
        if path.is_absolute() or ".." in path.parts or ":" in relative or "\\" in relative or relative.startswith("."):
            raise ValueError("Unsafe release path")
        resolved = (folder / relative).resolve()
        if not resolved.is_relative_to(folder.resolve()) or not resolved.is_file() or file_hash(resolved) != expected:
            raise ValueError(f"Release file changed or missing: {relative}")
        if path.suffix not in {".json", ".md", ".safetensors", ".jinja", ".txt"} and relative != "LICENSE":
            raise ValueError("Unexpected file type in public release")
    verification = json.loads((folder / "evaluation/merge-verification.json").read_text(encoding="utf-8"))
    if verification.get("status") != "PASS" or not verification.get("reloaded_from_saved_weights"):
        raise ValueError("Merged weights were not verified")
    return sorted(files) + ["release-manifest.json"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--folder", type=Path, required=True)
    parser.add_argument("--publish-public", action="store_true")
    args = parser.parse_args()
    files = verify_folder(args.folder)
    if not args.publish_public:
        print(f"Verified {len(files)} public files. Add --publish-public to upload to {REPO_ID}.")
        return
    from huggingface_hub import HfApi, get_token
    from huggingface_hub.errors import RepositoryNotFoundError
    if not get_token():
        raise RuntimeError("Log in locally with hf auth login; never paste tokens in chat")
    api = HfApi()
    if api.whoami()["name"] != "samimh23":
        raise ValueError("Expected the authorized samimh23 account")
    try:
        info = api.repo_info(REPO_ID, repo_type="model")
    except RepositoryNotFoundError:
        info = None
    if info is not None and (info.private or any(f != ".gitattributes" for f in api.list_repo_files(REPO_ID))):
        raise ValueError("Target is private or already contains a release; inspect before changing/overwriting it")
    api.create_repo(REPO_ID, repo_type="model", private=False, exist_ok=True)
    # One explicit allowlist, one commit: no optimizer states, tokens or unrelated files.
    api.upload_folder(repo_id=REPO_ID, repo_type="model", folder_path=str(args.folder), allow_patterns=files,
                      commit_message="Publish verified synthetic NuExtract3 financial pilot and actual evaluation")
    remote = set(api.list_repo_files(REPO_ID))
    if not set(files).issubset(remote):
        raise RuntimeError("Upload returned but remote files are incomplete; inspect repository")
    print(f"Published https://huggingface.co/{REPO_ID}. Live Fiscora model unchanged.")


if __name__ == "__main__":
    main()
