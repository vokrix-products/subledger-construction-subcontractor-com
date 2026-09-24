# SubLedger — Construction Subcontractor Compliance

**Archetype:** B2B compliance tracking backend.

SubLedger processes subcontractor compliance documents (certificates of insurance,
W-9s, bonds, waivers, and similar paperwork) and emits normalized compliance
records that a buyer can track across its subcontractor roster.

## Phase 1 scope

Phase 1 is a **pure processing module**. Specifically:

- **No HTTP server** is included in this phase.
- **`poller.py` is intentionally not part of phase 1.**
- The backend is **processing scripts only** — extraction, normalization, and
  contract validation.

The only public entry point is:

```text
process_file(file_bytes: bytes) -> list[dict]
```

## `process_file()` contract

Returns a `list[dict]`. Each record has **exactly** these top-level keys:

| Key | Type | Notes |
|---|---|---|
| `title` | `str` | The primary tracked entity (subcontractor legal name, named insured, vendor name). Never a document type or category. |
| `status` | `str` | One of the exact allowed status strings below. |
| `details` | `dict` | Extracted fields. Never contains a top-level `due_date` key. |
| `due_date` | `str \| None` | ISO-8601 date string such as `2026-06-30`, or `null`. |

Records are produced regardless of input format. Extraction order:

1. PDF via `pdfplumber`.
2. Excel via `openpyxl` when PDF yields no usable text.
3. UTF-8 text/CSV fallback via `decode("utf-8", errors="ignore")`.
4. CSV-like text is parsed row-by-row directly.
5. Non-tabular text uses DeepSeek extraction when `DEEPSEEK_API_KEY` is set.
6. Regex/fallback extractor when DeepSeek is unavailable or fails.

## Allowed status strings

```text
expired:critical
expiring_soon:warning
non_compliant:critical
blocked:critical
compliant:good
awaiting_upload:warning
flagged:warning
pending_review:info
unverified:warning
missing_coverage:critical
partial:warning
valid:good
not_required:good
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DEEPSEEK_API_KEY` | Optional (phase 1) | Enables DeepSeek extraction (`deepseek-v4-flash`) for non-tabular documents. Demo and tests run without it. |
| `SUPABASE_URL` | Phase 2 | Base URL for `REST_URL = os.environ["SUPABASE_URL"] + "/rest/v1"`. |
| `SUPABASE_SERVICE_KEY` | Phase 2 | Used for Supabase Storage auth in poller work. |

## Scripts

| File | Purpose |
|---|---|
| `processor.py` | Core extraction and normalization module. Defines `process_file()`. |
| `run_demo.py` | Zero-argument smoke test on hardcoded CSV bytes. Prints records, exits 0. |
| `run_tests.py` | `py_compile` check plus `process_file()` record-contract validation. |
| `requirements.txt` | Third-party dependencies: `openai`, `requests`, `pdfplumber`, `openpyxl`. |

## Run

```text
pip install -r requirements.txt
python3 run_demo.py
python3 run_tests.py
```

## Poller contract (next phase)

The future `poller.py` will consume queued jobs and call `process_file()` on
downloaded bytes. Constants preserved for that phase:

```text
REST_URL = os.environ["SUPABASE_URL"] + "/rest/v1"
```

Storage result upload path (no `results/` prefix):

```text
f"{job_id}.json"
```

Supabase Storage download and upload requests must send **both** headers:

```text
Authorization: Bearer SUPABASE_SERVICE_KEY
apikey: SUPABASE_SERVICE_KEY
```

Uploads use the `PUT` method. The poller expects job input of the form
`{ "job_id": str, "storage_path": str }` and writes the resulting record list
to Storage at `f"{job_id}.json"`.
