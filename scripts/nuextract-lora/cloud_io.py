"""Private GCS artifacts; credentials come from the training service identity."""
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse


def gs_parts(uri):
    parsed = urlparse(uri)
    prefix = parsed.path.strip("/")
    if parsed.scheme != "gs" or not parsed.netloc or not prefix or parsed.query or parsed.fragment:
        raise ValueError("Use gs://bucket/nonempty-prefix")
    if any(part in {".", ".."} for part in prefix.split("/")):
        raise ValueError("Unsafe GCS prefix")
    return parsed.netloc, prefix


def upload_tree(directory, uri):
    from google.cloud import storage
    bucket_name, prefix = gs_parts(uri)
    bucket = storage.Client().bucket(bucket_name)
    for path in sorted(directory.rglob("*")):
        if path.is_file():
            bucket.blob(f"{prefix}/{path.relative_to(directory).as_posix()}").upload_from_filename(str(path))


def download_tree(uri, directory, allowed=None):
    """Download a private artifact prefix with path checks and optional selection."""
    from google.cloud import storage
    bucket_name, prefix = gs_parts(uri)
    count = 0
    for blob in storage.Client().list_blobs(bucket_name, prefix=prefix + "/"):
        relative = blob.name[len(prefix) + 1:]
        parts = PurePosixPath(relative).parts
        if not parts or ".." in parts or ":" in relative or "\\" in relative or relative.startswith("/"):
            raise ValueError("Unsafe remote artifact path")
        if allowed and not allowed(relative):
            continue
        destination = directory.joinpath(*parts)
        destination.parent.mkdir(parents=True, exist_ok=True)
        blob.download_to_filename(str(destination))
        count += 1
    if not count:
        raise ValueError("No matching cloud artifacts")
    return count


def save_checkpoint(output, step, uri):
    from google.cloud import storage
    bucket_name, prefix = gs_parts(uri)
    bucket = storage.Client().bucket(bucket_name)
    # Completion marker is written last. A preemption during upload never creates
    # a resumable partial checkpoint.
    checkpoint = output / f"checkpoint-{step}"
    upload_tree(checkpoint, f"{uri.rstrip('/')}/{checkpoint.name}")
    bucket.blob(f"{prefix}/run.json").upload_from_filename(str(output / "run.json"))
    bucket.blob(f"{prefix}/{checkpoint.name}/_COMPLETE").upload_from_string("complete\n")
    print(f"Private cloud checkpoint saved: step {step}", flush=True)


def restore_checkpoints(output, uri):
    from google.cloud import storage
    bucket_name, prefix = gs_parts(uri)
    client = storage.Client()
    blobs = list(client.list_blobs(bucket_name, prefix=prefix + "/"))
    completed = {blob.name[len(prefix) + 1:].split("/")[0] for blob in blobs if blob.name.endswith("/_COMPLETE")}
    completed = {name for name in completed if name.startswith("checkpoint-") and name[11:].isdigit()}
    if not completed:
        if any(blob.name.endswith("/run.json") for blob in blobs):
            print("No complete cloud checkpoint; restarting from the pinned base.", flush=True)
        return None
    output.mkdir(parents=True, exist_ok=True)
    for blob in blobs:
        relative = blob.name[len(prefix) + 1:]
        parts = PurePosixPath(relative).parts
        if relative != "run.json" and (not parts or parts[0] not in completed):
            continue
        if ".." in parts or ":" in relative or "\\" in relative or relative.startswith("/"):
            raise ValueError("Unsafe remote checkpoint path")
        destination = output.joinpath(*parts)
        destination.parent.mkdir(parents=True, exist_ok=True)
        blob.download_to_filename(str(destination))
    if not (output / "run.json").is_file():
        raise ValueError("Cloud checkpoint has no run manifest")
    return output / max(completed, key=lambda name: int(name[11:]))
