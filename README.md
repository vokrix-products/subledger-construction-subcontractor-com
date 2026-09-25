# SubLedger — Construction Subcontractor Compliance

**Archetype:** B2B compliance extraction, tracking, and dashboard.

SubLedger processes subcontractor compliance documents (certificates of insurance, W-9s, bonds, licences, waivers) and emits normalized compliance records tracked across a subcontractor roster.

## Components

| Path | Purpose |
|---|---|
| `processor.py` | Core extraction and normalization. Defines `process_file(file_bytes) -> list[dict]`. |
| `poller.py` | Railway worker. Polls Supabase `jobs` for `process_upload` jobs and calls `process_file()`. |
| `backend/` | Processing modules copied for the Railway worker runtime. |
| `dashboard/` | Vite + React + TypeScript SPA deployed to Vercel. |
| `Dockerfile` | Railway build (python:3.12-slim, CMD python3 poller.py). |
| `requirements.txt` | openai, requests, pdfplumber, openpyxl. |

## Endpoints

- Domain: https://subledger-construction-subcontractor-com.vokrix.co
- Landing: https://vokrix.co/subledger-construction-subcontractor-com
- Railway worker: subledger-construction-subcontractor-com

## Poller contract

Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `PRODUCT_ID`, `ANTHROPIC_API_KEY`.

Loop (`poll()`, sleeps 60s):

1. `GET /rest/v1/jobs?status=eq.pending&job_type=eq.process_upload&product_id=eq.$PRODUCT_ID`
2. Download bytes from the `uploads` bucket with both `Authorization` and `apikey` headers.
3. `processor.process_file(file_bytes)`.
4. Insert each record into `records` (product_id, customer_id from the job, title, status, details, source_file_path from job input_file_path, due_date).
5. Upload the JSON result to the `results` bucket.
6. Update the job to `completed` or `failed` with output_file_path, result_summary, completed_at.
7. Insert a `notifications` row (type success or error).

## Allowed status strings

expired:critical, expiring_soon:warning, non_compliant:critical, blocked:critical, compliant:good, awaiting_upload:warning, flagged:warning, pending_review:info, unverified:warning, missing_coverage:critical, partial:warning, valid:good, not_required:good

## Run

pip install -r requirements.txt
python3 run_demo.py
python3 run_tests.py
python3 poller.py
