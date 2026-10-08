# NuExtract3 image + JSON LoRA trainer

This prepares **our own LoRA adapter** for the NuExtract3 checkpoint currently used by
Fiscora. It does not provision a VM, start a Vertex job, upload documents, publish a
model to Hugging Face/NuMind, or change the live Cloud Run service.

## What each file does

- `data.py`: loads the split files, checks targets, prevents path escape and split
  leakage, fingerprints training data, and scores strict JSON field matches.
- `train.py`: CPU processor preflight, GPU LoRA training/checkpoints/resume, and
  base-vs-adapter evaluation.
- `requirements.txt`: fixed ML package versions, selected to match the pinned model.
- `test_data.py` / `test_processor.py`: offline tests and optional actual-processor tests.

The base is `numind/NuExtract3` at revision
`c99dc8f5641b866aa0192b6ea78f84bf9f3535f1`, not a separately served Qwen model.
That checkpoint's architecture is Qwen3.5; its processor is Qwen3VLProcessor.
No NuMind account or upload is needed.

## Install on a test/training machine

Use an isolated Python 3.12 environment. Training should run on Linux with an approved
BF16-capable NVIDIA GPU. An A100 40 GB is a candidate, **not a confirmed memory guarantee**.

```bash
python -m venv .venv
# Linux: source .venv/bin/activate
# Windows PowerShell: .\.venv\Scripts\Activate.ps1
```

For CPU-only processor tests (no real model weights):

```bash
python -m pip install torch==2.10.0 torchvision==0.25.0 --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r scripts/nuextract-lora/requirements.txt
```

For a Linux GPU job, install the CUDA build appropriate for its driver instead. Example
for a CUDA 12.8-compatible host:

```bash
python -m pip install torch==2.10.0 torchvision==0.25.0 --index-url https://download.pytorch.org/whl/cu128
python -m pip install -r scripts/nuextract-lora/requirements.txt
```

Do not copy a CPU environment into the GPU job. Optional optimized Qwen recurrent/conv
kernels are not required by this pilot; fallback performance must be measured. The
installed package versions and GPU name are recorded with the run.

## Stage 1 - data checks (no ML dependencies or network)

Run from the backend repository root. The default dataset is the existing sibling
`../output/financial-synthetic-pilot-v1`. On another machine pass `--dataset /path/to/unzipped-dataset`.

```bash
python scripts/nuextract-lora/train.py validate
python -m unittest discover -s scripts/nuextract-lora -p 'test_data.py'
```

## Stage 2 - processor preflight (CPU, no weights)

```bash
python scripts/nuextract-lora/train.py preflight
```

This downloads only processor/tokenizer/config files from the pinned public checkpoint.
It checks all 80 training and 10 validation examples. Ordered pages are passed as images
with their extraction template/instructions. The official non-thinking chat template
is used without modification. A full answer must have the exact same token prefix as
the generation prompt. Only JSON and its ending tokens receive labels; prompt, image,
assistant/thinking prefix and padding tokens are `-100`. Decoded labels must equal the
JSON target exactly. It fails on overlength documents instead of truncating them.

The default maximum is 1,048,576 pixels per page and 16,384 total tokens. The processor
report includes the measured lengths. Image resizing can lose fine text; evaluate its
effect instead of assuming lower resolution is free. This is not model inference.

## Stage 3 - approved 10-step GPU smoke test (NOT launched automatically)

```bash
python scripts/nuextract-lora/train.py train --run --max-steps 10 --max-seconds 1800
```

Defaults: rank 8, alpha 16, dropout 0.05, learning rate 0.0001, batch size 1 with four-step
gradient accumulation, BF16, gradient checkpointing. Only language decoder projections
receive LoRA; the image encoder, base weights and output head remain frozen. Exact
target names are discovered from the loaded architecture and recorded. This is ordinary
LoRA, **not** 4-bit QLoRA. The script saves optimizer/RNG checkpoints every five steps,
evaluates validation loss, and saves the best selected adapter plus processor files.

The time limit is checked **between optimizer steps**, not a billing cap. Loading model
weights and a long step can exceed it. A Vertex job must also have an overall timeout,
and its compute resources must be stopped/deleted afterward. Budget alerts are not hard
spending limits. Confirm actual region, quotas, price and cost ceiling before launching.

The smoke test verifies finite loss, memory/speed, checkpoint saving and resuming. Loss
decreasing is not proof that extraction accuracy improved. The real A100 smoke job
`5063248718036205568` passed on 2026-10-08: 10 steps, 268 seconds training, peak allocated
CUDA memory 21.55 GiB. CPU tests alone cannot establish those measurements.

Optional integration tests download the real processor/config but no model weights:

```powershell
$env:NUEXTRACT_PROCESSOR_TESTS = '1'
python -m unittest discover -s scripts/nuextract-lora -p 'test_processor.py'
```

They check real token masks, multiple images, language-only LoRA attachment on the full
architecture using metadata-only tensors, and a tiny randomly initialized model's CPU
forward/backward/checkpoint resume. That tiny model is not a useful trained NuExtract model.

## Resume and full training

```bash
python scripts/nuextract-lora/train.py train --run --resume output/nuextract-lora/smoke-001/checkpoint-5
```

Resume requires the same data fingerprint, model, packages and training settings. An
existing run is never overwritten accidentally. After the smoke test and evaluation,
a separately approved full run could use:

```bash
python scripts/nuextract-lora/train.py train --run --max-steps -1 --epochs 3 --output output/nuextract-lora/full-001
```

100 synthetic examples are only a pipeline pilot. Increase dataset diversity and include
authorized accountant-reviewed examples before claiming a better production model.

## Stage 4 - compare base and adapter on validation

These commands load the real model and use the GPU, so they are billable on a cloud machine:

```bash
python scripts/nuextract-lora/train.py evaluate --output output/nuextract-lora/base-validation
python scripts/nuextract-lora/train.py evaluate --adapter output/nuextract-lora/smoke-001/adapter --output output/nuextract-lora/adapter-validation
```

Compare `evaluation.json` in both directories using identical limits. Metrics include
valid JSON, exact-document match, exact fields (including list lengths/extra keys),
nonnull exact fields, latency and generated tokens. Strict string matching is deliberate:
our app requires verbatim amounts/dates. Detailed predictions remain local.

The local comparison command rejects mismatched data/settings and reports changes:

```bash
python scripts/nuextract-lora/train.py compare --baseline-report output/nuextract-lora/base-validation/evaluation.json --adapter-report output/nuextract-lora/adapter-validation/evaluation.json
```

Use `--split test --final-test` only after all model/settings choices have been fixed.
Do not tune on test results. Synthetic scores are not production accuracy; validate
against a separate real accountant-reviewed holdout before switching live traffic.

## Stage 5 - later deployment, separate approval

Training output is an **adapter**, not a standalone model. Keep the base revision and
the adapter together. Later, save artifacts to a private GCS bucket, merge the adapter
into the pinned base (or configure explicitly supported LoRA serving), build a versioned
inference image, and test a new Cloud Run revision. Preserve NuExtract's chat template,
processor and model licensing notices. Do not silently replace the base weights or promote
an unevaluated checkpoint. Keep the previous Cloud Run image/revision for rollback.

## Primary references

- [NuMind model card and official template](https://huggingface.co/numind/NuExtract3)
- [Transformers multimodal processors](https://huggingface.co/docs/transformers/chat_templating_multimodal)
- [PEFT LoRA configuration](https://huggingface.co/docs/peft/package_reference/lora)
- [Vertex custom training](https://cloud.google.com/vertex-ai/docs/training/overview)

No credentials, generated datasets, model weights, predictions or checkpoints belong in Git.

## Our public release target

The intended repository is `samimh23/fiscora-nuextract3-financial-v1` (public).
After real GPU training, compare the pinned base and trained model on the same held-out
documents, merge the adapter into the pinned base, and verify the merged model before
uploading. Include actual metrics, split sizes, hyperparameters, base revision, license
notices and limitations in the model card. Use `base_model: numind/NuExtract3` and
`base_model_relation: finetune`. Do not fabricate scores or claim that synthetic pilot
results demonstrate accuracy on real client documents. Model upload is separate from
live Fiscora deployment; neither happens in the training entry point.

## GCP smoke job

`Dockerfile` builds the isolated CUDA trainer. `cloud_entry.py` downloads only the
reviewed synthetic ZIP and verifies its SHA-256 before extraction. `cloud_io.py` syncs
private checkpoints with completion markers and resumes only fully uploaded checkpoints.
`vertex-smoke.json` specifies one Spot A100 40 GB, a 150 GB boot disk, and a one-hour job
timeout. Spot capacity can interrupt the job; availability is not guaranteed by quota.
Replace its image placeholder with an immutable Artifact Registry image digest before
submission. The job configuration does not submit itself.

Use a dedicated private bucket with uniform access and public access prevention, and a
dedicated training service account with object access to that bucket only. This should
not reuse the live inference service identity or Terraform state bucket. Cloud Build,
training compute, artifact storage and GCS are billable. The active GPU ends when the
job ends; private stored checkpoints remain until intentionally removed.

The official configuration references are [Spot training](https://cloud.google.com/vertex-ai/docs/training/use-spot-vms)
and [custom jobs](https://cloud.google.com/vertex-ai/docs/training/create-custom-job).

## Full synthetic pilot and verified public release

`vertex-full.json` uses the GPU-verified immutable trainer image, a **new** private
run prefix, three epochs / 60 optimizer steps, a 3,600-second in-training deadline,
and a 5,400-second whole-job timeout. It starts from the pinned base, not the smoke
adapter, and saves the best validation-loss checkpoint. The submitted full run is
`1746347592477835264` in `us-central1`. Do not submit duplicate paid jobs.

```powershell
gcloud ai custom-jobs describe 1746347592477835264 --project=fiscora-ai --region=us-central1
```

After this job succeeds **and result.json confirms 60 steps**, use `vertex-release.json`
with the verified release image digest. Never start it while training is pending.
`cloud_release.py` downloads only the synthetic ZIP and completed adapter/run metadata.
It runs `release.py`, which:

1. Rejects incomplete, smoke, wrong-data or wrong-base training runs.
2. Evaluates the original model and selected adapter on the fixed 10-document test.
3. Safely merges LoRA, saves standalone Safetensors, processor and license notices.
4. Reloads the saved model **and processor**, and evaluates all 10 documents again.
5. Records actual metrics/predictions, hashes test data, and rejects a merge whose
   metrics are lower than the unmerged adapter. BF16 generation differences are
   reported rather than hidden.
6. Writes a model card with the **merged model's** real results and explicit synthetic
   pilot limitations. It hashes every public artifact in `release-manifest.json`.

All these files remain private in `gs://fiscora-ai-training-472441103512/releases/financial-v1`.
No HF credentials are installed in the GPU job. No live deployment occurs.

Build the small release-script layer (existing CUDA libraries are reused):

```powershell
gcloud builds submit scripts/nuextract-lora --project=fiscora-ai --config=scripts/nuextract-lora/cloudbuild-release.yaml
```

Local release processing also works on an approved GPU:

```powershell
python scripts/nuextract-lora/release.py --dataset /path/to/dataset --run /path/to/full-run --output /path/to/new-release
```

For publication, download only the final standalone `model/` directory, not raw
optimizer/checkpoint files. Use the existing private-bucket credentials:

```powershell
gcloud storage rsync --recursive gs://fiscora-ai-training-472441103512/releases/financial-v1/model output/nuextract-lora/public-model-v1
.\tmp\nuextract-trainer-venv\Scripts\hf.exe auth login
.\tmp\nuextract-trainer-venv\Scripts\python.exe scripts/nuextract-lora/publish.py --folder output/nuextract-lora/public-model-v1
# Only after local verification passes:
.\tmp\nuextract-trainer-venv\Scripts\python.exe scripts/nuextract-lora/publish.py --folder output/nuextract-lora/public-model-v1 --publish-public
```

Enter a write-enabled HF token only in the local login prompt, **never in chat or Git**.
`publish.py` checks the logged-in account is `samimh23`, validates artifact checksums,
then uploads an explicit file allowlist to the authorized public repository in one
commit. It refuses to overwrite an existing release or change a private repository's
visibility. The downloadable weights, JSON reports, original Apache license and model
card are public; no real customer data or training service credentials are uploaded.

`finish_pipeline.py` is an optional **one-off local continuation**, not a recurring
automation. It waits for the approved training job, submits at most one release job
(with a durable job-ID ledger), waits for its result, downloads the verified standalone
model, and optionally publishes using your existing local HF login. If login is missing,
it stops safely with the files ready; no token is requested in chat. Keep this computer
awake and the process running. Cloud jobs themselves continue independently if the
local process stops; use the ledger before resuming so jobs are not duplicated.

```powershell
.\tmp\nuextract-trainer-venv\Scripts\python.exe -u scripts/nuextract-lora/finish_pipeline.py --publish-public
```

Reference: [PEFT checkpoint merging](https://huggingface.co/docs/peft/developer_guides/checkpoint)
and [Hub folder uploads](https://huggingface.co/docs/huggingface_hub/guides/upload).

### Approved direct-cloud alternative

If the local 9 GB transfer fails, `direct_publish.py` supports a separately approved
CPU-only Cloud Build upload. It reads the existing local HF login without displaying
the token, stores it in a new temporary Secret Manager secret, and grants only the
build service account accessor permission on that secret. No project-wide role is
added. `cloudbuild-publish.yaml` injects the token only into its publication step.
`cloud_publish.py` downloads the private verified release inside GCP, checks all
hashes, explicitly discloses invalid-JSON failures in the model card, and publishes
only the allowlisted model artifacts. The token/cache are outside that public folder.

The local helper tracks the CPU build and removes the temporary accessor binding
and secret in `finally`, on success or failure. Keep it running until cleanup is
confirmed; if interrupted, inspect `output/nuextract-lora/direct-publish-v1.json` and
complete the secret cleanup manually. Never run a second uploader concurrently.
This route is not automatic authorization to copy a credential into GCP: obtain
explicit permission first. It changes neither the live model nor the dataset.
