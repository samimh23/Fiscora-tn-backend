"""Dataset checks and metrics that require no ML libraries or cloud access."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

BASE_MODEL = "numind/NuExtract3"
BASE_REVISION = "c99dc8f5641b866aa0192b6ea78f84bf9f3535f1"


def safe_path(root: Path, relative: str) -> Path:
    path = Path(relative)
    if path.is_absolute() or not relative or ":" in relative or "\\" in relative:
        raise ValueError(f"Expected a relative POSIX image path: {relative}")
    resolved = (root / path).resolve()
    if not resolved.is_relative_to(root.resolve()) or not resolved.is_file():
        raise ValueError(f"Missing or out-of-dataset file: {relative}")
    return resolved


def validate_target(value, schema, path="output"):
    if isinstance(schema, dict):
        if not isinstance(value, dict) or value.keys() != schema.keys():
            raise ValueError(f"{path}: wrong JSON keys/type")
        for key in schema:
            validate_target(value[key], schema[key], f"{path}.{key}")
    elif isinstance(schema, list) and len(schema) == 1 and isinstance(schema[0], dict):
        if not isinstance(value, list):
            raise ValueError(f"{path}: expected list")
        for index, item in enumerate(value):
            validate_target(item, schema[0], f"{path}[{index}]")
    elif isinstance(schema, list):
        if value is not None and value not in schema:
            raise ValueError(f"{path}: not an allowed enum")
    elif value is not None and not isinstance(value, str):
        raise ValueError(f"{path}: expected a verbatim string or null")


def load_split(root: Path, split: str) -> list[dict]:
    if split not in {"train", "validation", "test"}:
        raise ValueError("Unknown split")
    rows = []
    for line in (root / "splits" / f"{split}.jsonl").read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get("split") != split or not row.get("id") or not row.get("source_id"):
            raise ValueError("Missing identity or wrong split label")
        if row.get("kind") not in {"invoice", "bank_statement"}:
            raise ValueError("Only invoice and bank_statement are supported")
        if not isinstance(row.get("instructions"), str) or not row["instructions"].strip():
            raise ValueError("Extraction instructions are required")
        if not 1 <= len(row.get("images", [])) <= 6:
            raise ValueError("Expected one to six ordered image pages")
        for image in row["images"]:
            safe_path(root, image)
        template = json.loads((root / "templates" / f"{row['kind']}.json").read_text(encoding="utf-8"))
        if row.get("template") != template:
            raise ValueError("Row template does not match dataset template")
        validate_target(row["output"], template)
        rows.append(row)
    if not rows or len({row["id"] for row in rows}) != len(rows):
        raise ValueError("Empty split or duplicate document IDs")
    return rows


def dataset_check(root: Path):
    train, validation = load_split(root, "train"), load_split(root, "validation")
    # Read test identity metadata only; test answers are never fed to Trainer.
    manifest = [json.loads(line) for line in (root / "manifest.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    seen_ids, source_splits = set(), {}
    for row in manifest:
        if row["id"] in seen_ids or row["split"] not in {"train", "validation", "test"}:
            raise ValueError("Manifest has duplicate IDs or invalid split")
        seen_ids.add(row["id"])
        source = row["source_id"]
        if source in source_splits and source_splits[source] != row["split"]:
            raise ValueError("Source leakage between splits")
        source_splits[source] = row["split"]
    mapping = {row["id"]: row for row in manifest}
    image_splits = {}
    fingerprint = hashlib.sha256()
    for split, rows in [("train", train), ("validation", validation)]:
        fingerprint.update((root / "splits" / f"{split}.jsonl").read_bytes())
        if {row["id"] for row in rows} != {row["id"] for row in manifest if row["split"] == split}:
            raise ValueError("Split and manifest identities differ")
        for row in rows:
            meta = mapping[row["id"]]
            if meta["source_id"] != row["source_id"] or meta["images"] != row["images"]:
                raise ValueError("Split and manifest source/pages differ")
            for relative in row["images"]:
                content = safe_path(root, relative).read_bytes()
                digest = hashlib.sha256(content).hexdigest()
                if digest in image_splits and image_splits[digest] != split:
                    raise ValueError("Duplicate image crosses train/validation splits")
                image_splits[digest] = split
                fingerprint.update(content)
    # Protect against duplicated train images under different test filenames too.
    for row in manifest:
        if row["split"] == "test":
            for relative in row["images"]:
                digest = hashlib.sha256(safe_path(root, relative).read_bytes()).hexdigest()
                if digest in image_splits:
                    raise ValueError("Test image duplicates train/validation data")
    report = json.loads((root / "validation-report.json").read_text(encoding="utf-8"))
    if report.get("status") != "PASS" or report.get("base_model") != BASE_MODEL or report.get("base_revision") != BASE_REVISION:
        raise ValueError("Dataset has not passed checks or base model revision differs")
    return train, validation, {"train": len(train), "validation": len(validation), "test": sum(row["split"] == "test" for row in manifest),
                              "training_data_sha256": fingerprint.hexdigest(), "base_model": BASE_MODEL, "base_revision": BASE_REVISION}


def flatten(value, path=""):
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            result.update(flatten(item, f"{path}.{key}" if path else key))
        return result
    if isinstance(value, list):
        result = {f"{path}.__length__": len(value)}
        for index, item in enumerate(value):
            result.update(flatten(item, f"{path}[{index}]"))
        return result
    return {path: value}


def score_prediction(expected, predicted):
    wanted, got = flatten(expected), flatten(predicted)
    missing = object()
    paths = wanted.keys() | got.keys()
    correct = sum(wanted.get(p, missing) == got.get(p, missing) for p in paths)
    nonnull = [p for p, value in wanted.items() if value is not None and not p.endswith(".__length__")]
    # Strict string equality is intentional: our app uses verbatim monetary/date strings.
    return {"exact_document": expected == predicted, "fields_correct": correct, "fields_total": len(paths),
            "nonnull_correct": sum(wanted[p] == got.get(p, missing) for p in nonnull), "nonnull_total": len(nonnull)}


def compare_reports(baseline, adapter):
    for key in ["training_data_sha256", "base_model", "base_revision", "split", "documents", "max_pixels", "max_length", "max_new_tokens", "packages"]:
        if key not in baseline or baseline[key] != adapter.get(key):
            raise ValueError(f"Evaluation settings/data differ: {key}")
    if baseline.get("adapter") is not None or not adapter.get("adapter"):
        raise ValueError("Expected a base-model report and an adapter report")
    for key in ["evaluation_data_sha256", "document_ids"]:
        if key not in baseline or baseline[key] != adapter.get(key):
            raise ValueError(f"Evaluation settings/data differ: {key}")
    keys = ["json_validity", "document_exact_match", "field_exact_match", "nonnull_field_exact_match", "mean_seconds"]
    return {"split": baseline["split"], "documents": baseline["documents"],
            "evaluation_data_sha256": baseline["evaluation_data_sha256"],
            "document_ids": baseline["document_ids"],
            "comparison": {key: {"base": baseline[key], "adapter": adapter[key], "change": adapter[key] - baseline[key]} for key in keys},
            "production_accuracy_claim": False, "auto_deploy": False}


def evaluation_fingerprint(root, rows):
    digest = hashlib.sha256()
    for row in rows:
        digest.update(json.dumps(row, sort_keys=True, ensure_ascii=False).encode("utf-8"))
        for image in row["images"]:
            digest.update(safe_path(root, image).read_bytes())
    return digest.hexdigest()
