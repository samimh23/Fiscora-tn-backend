# NuExtract synthetic financial pilot

Offline dataset generation only. This script does not access customer data, call cloud
services, train a model, or deploy anything. All parties and identifiers are fictional.
The printed tax values are arithmetic test cases, not tax advice.

## Generate

Requires Python 3.10+, Node.js and the packages in `requirements.txt`:

```powershell
python -m pip install -r scripts/synthetic-dataset/requirements.txt
python scripts/synthetic-dataset/generate.py
```

Default output is `../output/financial-synthetic-pilot-v1` (relative to this repository).
Existing output directories are never overwritten; use `--output <new-directory>` to
create another version. The current app's invoice and bank templates are read directly
from `src/documents/extraction/nuextract-extraction-client.service.ts` using Node's VM
on the two constant object literals. No cloud credentials are needed.

## Contents

- 70 invoices, including credit notes, goods/services, ambiguous descriptions,
  missing IDs, global and line discounts, optional taxes, partial payments.
- 30 bank statements, debit/credit or signed amounts, running balances, missing
  IBANs, and some two-page statements.
- French ASCII labels, TND, three monetary formats and two date formats.
- Six layout families, with four for train, one held out for validation, one for test.
- Clean, light-scan and reduced-contrast images (one version per source).
- `images/`: ordered JPEG pages used as model input.
- `targets/`: exact visible-string JSON targets, matching the app's schema.
- `templates/`: extraction templates for both document kinds.
- `samples.jsonl`: combined examples; **do not train on this combined file**.
- `splits/train.jsonl`: 80 examples (56 invoices, 24 statements).
- `splits/validation.jsonl`: 10 examples (7 invoices, 3 statements).
- `splits/test.jsonl`: 10 examples (7 invoices, 3 statements).
- `annotations/`: drawn-value evidence boxes, layout, profile and generation metadata.
- `source-pdfs/`: synthetic source documents, for auditing and rerendering.
- `validation-report.json`: schema, visibility, arithmetic and leakage checks.
- `previews/`: selected full-size pages and contact sheet for visual review.
- A sibling ZIP with all dataset files. Generated assets are outside the repository
  and must not be committed to Git; model weights must not be committed either.

Bank targets preserve printed strings. Empty debit/credit cells are null. When a signed
amount column is printed instead, debit and credit are null; they are not calculated.
Invoice nature and document type are semantic classifications. HT basis is provided by
the printed column headers. All other nonnull target values have drawn-value evidence.

## Validation and limits

Run `python -m unittest discover -s scripts/synthetic-dataset -p 'test_*.py'`.
Check the validation report, then inspect the contact sheet and several full-size
images. Evidence coverage checks do not by themselves prove labels are visually readable.
Check the second page of a multipage statement too. No rotation/perspective is applied,
so the rendered PDF evidence boxes remain aligned with the images.

This is a **100-document pipeline pilot**, not a dataset sufficient to demonstrate
production improvement. Splits have disjoint source IDs, fictional party names and
layout families. Shared vocabulary/number formatting is intentional. Keep all future
augmentations of one source in its original split. Repeated footers and narrow language
coverage create a synthetic-domain gap. Real accountant-reviewed holdout documents are
needed before promoting a fine-tuned model.

## Next stage (not run by this script)

1. Prepare a NuExtract3-compatible LoRA trainer pinned to the base revision in the report.
2. Use the official processor and template/instructions chat arguments; train only the
   assistant JSON, masking prompt, image and padding tokens.
3. After budget approval, run a short GPU smoke test and measure memory/speed/cost.
4. Train only `train.jsonl`; choose checkpoints using validation, never test data.
5. Compare the base model and adapter on held-out JSON validity, field accuracy,
   line/transaction rows and latency. Evaluate real documents before production claims.
6. Save artifacts/version metadata to private GCS, then deploy a separately tested
   Cloud Run revision. Keep the current model for rollback; no automatic promotion.
