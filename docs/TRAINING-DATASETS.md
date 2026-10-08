# Private NuExtract training-data exports

This feature collects accountant-reviewed references from Fiscora. It does **not** train a model, change model weights, transfer a dataset to a training GPU, or deploy a new model.

## User workflow

1. A cabinet **owner** opens a client dossier → Documents → Autoriser la collecte.
2. They confirm client authorization and record its reference. The default is disabled. Authorization includes existing approved extractions in that dossier.
3. The worker checks every 30 seconds, up to 20 new references per pass. It accepts NuExtract invoices/credit notes/receipts and bank statements, reviewed by a human, with no remaining ERROR validation issues, a clean malware scan and a non-deleted original.
4. It creates immutable source/answer snapshots in the private `training-datasets` container/bucket. Duplicate source + answer pairs are excluded within a cabinet. Re-review or authorization revision changes invalidate old examples.
5. A platform administrator opens **Jeux de données IA**, confirms confidentiality and requests a ZIP. The worker renders PDFs using the existing Paddle/PDFium service. It does not perform extraction again. PNG/JPEG inputs are exported directly.
6. The administrator downloads the ZIP. The endpoint rechecks live authorization/approval and issues a read-only storage URL valid for 60 seconds; the action is audited. The ZIP expires after 24 hours.
7. Manually audit the labels, partition by source/supplier/bank/layout, upload to the chosen GPU environment and fine-tune using a compatible NuExtract3 LoRA recipe. Evaluate against the unchanged base model before deployment.

## Files in the ZIP

`manifest.json`, `samples.jsonl`, `README.txt` and `examples/<random-id>/page-001.png|jpg`, `expected.json`, `template.json`, `metadata.json`. Multipage documents remain ordered and share a single expected answer. No original filenames, cabinet/dossier identifiers or reviewer emails are included in the exported metadata, but the **images and answers themselves still contain sensitive client data**. These are not anonymized datasets.

Reviewed normalized answers are projected to the extraction template; OCR evidence and internal bookkeeping fields are removed. Date/amount normalization can differ from verbatim inference output. **This is a collection/export feature, not a guarantee that every answer is a suitable fine-tuning target.** Audit targets and adapt formatting/schema consistently before training. Base model names are recorded; historical data may not include an exact weights revision.

## Operational limits and setup

- Apply migration `TrainingDatasets1791468000000`; it is registered for startup migrations and the CLI migration runner. Three additive tables only; no existing business data is rewritten.
- Azure uses the same account and application identity as documents, in a separate private `training-datasets` container. `azure/environments/staging/training-storage.tf` declares it; the worker can also create it using existing account-scoped blob contributor rights. Local MinIO uses a separate bucket of the same name.
- Existing `OBJECT_STORAGE_PROVIDER`, Azure storage URL/identity or MinIO credentials and PDF rendering settings are reused. There are no new API keys or public storage permissions.
- One export at a time, up to 1,000 examples / 512 MiB, streamed to a temporary file rather than accumulating all image buffers in RAM. Large datasets must be exported in smaller selections. Image export may call the existing GCP PDF renderer; no automatic GCP training upload is added.
- Failed collectors require resolving the storage issue, then retiring/re-enabling the dossier authorization. Expired/invalidated examples and ZIPs are purged from active storage by the worker. Existing Azure versioning/soft-delete retention can retain deleted versions for the account's recovery period; this is not an immediate physical erasure guarantee.
- Revocation blocks future downloads and purges active copies. It cannot recall previously downloaded ZIPs or untrain an already-trained model. A one-minute link already issued can remain usable until it expires.
- The feature rechecks disabled cabinets, source deletion, approval status and unresolved validation errors before downloads. Do not publish exports or commit them to Git. Keep dataset/model versions and an untouched test set.

## Endpoints

Owner: `GET/PATCH /api/organizations/:organizationId/dossiers/:dossierId/training-consent`.

Platform admin only: `GET /api/platform-admin/training-datasets`, `POST /api/platform-admin/training-datasets/exports`, `POST /api/platform-admin/training-datasets/exports/:id/download`.

The production CI validates migrations against PostgreSQL. Unit tests cover access guards, opt-in default, authorization invalidation, ZIP contents, PDF page ordering, answer projection and source integrity. No production client examples are used in these tests.
