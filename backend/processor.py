"""SubLedger core extraction and processing module (Phase 1).

Single processing module. No HTTP server, no CLI entry point.
"""

import csv
import io
import json
import os
import re
from typing import Any, Dict, List, Optional

try:
    from openai import OpenAI
except Exception:  # pragma: no cover - openai may be absent at import time
    OpenAI = None  # type: ignore

# ---------------------------------------------------------------------------
# Constants preserved for later poller work.
# ---------------------------------------------------------------------------
REST_URL = os.environ.get("SUPABASE_URL", "") + "/rest/v1"

DEEPSEEK_MODEL = "deepseek-v4-flash"
DEEPSEEK_BASE_URL = "https://api.deepseek.com"

# Exact allowed status strings.
ALLOWED_STATUSES = {
    "expired:critical",
    "expiring_soon:warning",
    "non_compliant:critical",
    "blocked:critical",
    "compliant:good",
    "awaiting_upload:warning",
    "flagged:warning",
    "pending_review:info",
    "unverified:warning",
    "missing_coverage:critical",
    "partial:warning",
    "valid:good",
    "not_required:good",
}

DEFAULT_STATUS = "pending_review:info"

DOCUMENT_TYPE_WORDS = {
    "certificate",
    "cert",
    "coi",
    "insurance",
    "policy",
    "w9",
    "w-9",
    "invoice",
    "agreement",
    "contract",
    "document",
    "form",
    "letter",
    "notice",
    "report",
    "statement",
    "license",
    "permit",
    "bond",
    "waiver",
    "lien",
    "subcontract",
    "compliance",
    "certificate of insurance",
    "coi certificate",
}

DATE_RE = re.compile(
    r"\b(\d{4}-\d{2}-\d{2})\b|"
    r"\b(\d{1,2}/\d{1,2}/\d{2,4})\b|"
    r"\b([A-Z][a-z]+ \d{1,2},? \d{4})\b"
)

ENTITY_LABEL_RE = re.compile(
    r"(?im)^\s*(?:named insured|insured|subcontractor|vendor|supplier|"
    r"company|contractor|business|legal name|name|party)\s*[:\-]\s*(.+?)\s*$"
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _clean(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _is_document_type(word: str) -> bool:
    return word.strip().lower() in DOCUMENT_TYPE_WORDS


def _pick_title(record: Dict[str, Any]) -> str:
    """Choose the primary tracked entity as title, never a document type."""
    preferred = [
        "title",
        "named_insured",
        "insured",
        "subcontractor",
        "subcontractor_legal_name",
        "legal_name",
        "vendor",
        "supplier",
        "company",
        "contractor",
        "business",
        "party",
        "name",
    ]
    for key in preferred:
        value = _clean(record.get(key))
        if value and not _is_document_type(value):
            return value
    # Fall back to any non-empty value that is not a document type.
    for key, value in record.items():
        cleaned = _clean(value)
        if cleaned and not _is_document_type(cleaned) and key not in ("status",):
            return cleaned
    return "Unknown Entity"


def _normalize_status(value: Any) -> str:
    candidate = _clean(value).lower().replace(" ", "_")
    if candidate in ALLOWED_STATUSES:
        return candidate
    # Accept a bare bucket name and map to a sensible default status.
    mapping = {
        "expired": "expired:critical",
        "critical": "non_compliant:critical",
        "expiring": "expiring_soon:warning",
        "expiring_soon": "expiring_soon:warning",
        "blocked": "blocked:critical",
        "compliant": "compliant:good",
        "valid": "valid:good",
        "good": "compliant:good",
        "pending": "pending_review:info",
        "pending_review": "pending_review:info",
        "info": "pending_review:info",
        "flagged": "flagged:warning",
        "warning": "flagged:warning",
        "awaiting_upload": "awaiting_upload:warning",
        "unverified": "unverified:warning",
        "missing_coverage": "missing_coverage:critical",
        "partial": "partial:warning",
        "not_required": "not_required:good",
    }
    if candidate in mapping:
        return mapping[candidate]
    return DEFAULT_STATUS


def _normalize_due_date(value: Any) -> Optional[str]:
    text = _clean(value)
    if not text:
        return None
    iso = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", text)
    if iso:
        return iso.group(1)
    return text or None


def _first_date_in_text(text: str) -> Optional[str]:
    match = DATE_RE.search(text or "")
    if not match:
        return None
    raw = next((g for g in match.groups() if g), None)
    if not raw:
        return None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        return raw
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", raw)
    if m:
        month, day, year = m.group(1), m.group(2), m.group(3)
        if len(year) == 2:
            year = "20" + year
        return "%04d-%02d-%02d" % (int(year), int(month), int(day))
    return raw


def _entity_from_labeled_text(text: str) -> Optional[str]:
    for match in ENTITY_LABEL_RE.finditer(text or ""):
        candidate = _clean(match.group(1))
        candidate = candidate.split("\n")[0].strip(" .;,")
        if candidate and not _is_document_type(candidate):
            return candidate
    return None


def _build_record(
    title: str,
    status: str,
    details: Dict[str, Any],
    due_date: Optional[str],
) -> Dict[str, Any]:
    details = dict(details or {})
    # details must never carry a top-level due_date key.
    details.pop("due_date", None)
    return {
        "title": _clean(title) or "Unknown Entity",
        "status": _normalize_status(status),
        "details": details,
        "due_date": _normalize_due_date(due_date),
    }


# ---------------------------------------------------------------------------
# Extraction backends
# ---------------------------------------------------------------------------
def _extract_pdf_text(file_bytes: bytes) -> str:
    try:
        import pdfplumber  # type: ignore
    except Exception:
        return ""
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            parts: List[str] = []
            for page in pdf.pages:
                parts.append(page.extract_text() or "")
            return "\n".join(p for p in parts if p)
    except Exception:
        return ""


def _extract_excel_text(file_bytes: bytes) -> str:
    try:
        import openpyxl  # type: ignore
    except Exception:
        return ""
    try:
        workbook = openpyxl.load_workbook(
            io.BytesIO(file_bytes), data_only=True, read_only=True
        )
    except Exception:
        return ""
    try:
        rows_out: List[str] = []
        for sheet in workbook.worksheets:
            for row in sheet.iter_rows(values_only=True):
                cells = ["" if c is None else str(c).strip() for c in row]
                if any(cells):
                    rows_out.append(",".join(cells))
        return "\n".join(rows_out)
    except Exception:
        return ""
    finally:
        try:
            workbook.close()
        except Exception:
            pass


def _looks_like_csv(text: str) -> bool:
    lines = [ln for ln in (text or "").splitlines() if ln.strip()]
    if not lines:
        return False
    sample = lines[:5]
    for line in sample:
        if "," in line and len(line.split(",")) >= 2:
            return True
    return False


def _parse_csv_records(text: str) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    try:
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
    except Exception:
        return records
    if not rows:
        return records
    for row in rows:
        normalized = {_clean(k).lower(): _clean(v) for k, v in row.items() if k}
        if not any(normalized.values()):
            continue
        title = _pick_title(normalized)
        status = normalized.get("status", DEFAULT_STATUS)
        due_date = (
            normalized.get("due_date")
            or normalized.get("due date")
            or normalized.get("expiry")
            or normalized.get("expiration")
            or normalized.get("expires")
        )
        details = dict(normalized)
        for key in (
            "title",
            "status",
            "due_date",
            "due date",
            "expiry",
            "expiration",
            "expires",
        ):
            details.pop(key, None)
        records.append(_build_record(title, status, details, due_date))
    return records


def _deepseek_extract(text: str) -> Optional[List[Dict[str, Any]]]:
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key or OpenAI is None:
        return None
    try:
        client = OpenAI(
            api_key=os.environ["DEEPSEEK_API_KEY"],
            base_url="https://api.deepseek.com",
        )
        prompt = (
            "Extract subcontractor compliance records from the document text "
            "below. Return ONLY a JSON array of objects. Each object must have "
            "the keys: title, status, details, due_date. "
            "The title field must be the primary entity the buyer tracks, "
            "such as named insured or subcontractor legal name. Never use "
            "document type or category as title. "
            "status must be one of: " + ", ".join(sorted(ALLOWED_STATUSES)) + ". "
            "details must be a JSON object of extracted fields and must not "
            "contain a due_date key. due_date must be an ISO-8601 date string "
            "or null.\n\nDocument text:\n" + (text or "")[:12000]
        )
        response = client.chat.completions.create(
            model="deepseek-v4-flash",
            messages=[
                {
                    "role": "system",
                    "content": "You extract structured compliance records as JSON only.",
                },
                {"role": "user", "content": prompt},
            ],
        )
        content = response.choices[0].message.content or ""
        content = content.strip()
        if content.startswith("```"):
            content = re.sub(r"^```[a-zA-Z]*\n?", "", content)
            content = re.sub(r"\n?```$", "", content)
        start = content.find("[")
        end = content.rfind("]")
        if start == -1 or end == -1:
            return None
        parsed = json.loads(content[start : end + 1])
        if not isinstance(parsed, list):
            return None
        records: List[Dict[str, Any]] = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            records.append(
                _build_record(
                    _pick_title(item),
                    item.get("status", DEFAULT_STATUS),
                    item.get("details") or {},
                    item.get("due_date"),
                )
            )
        return records or None
    except Exception:
        return None


def _fallback_extract(text: str) -> List[Dict[str, Any]]:
    text = text or ""
    title = _entity_from_labeled_text(text)
    if not title:
        for line in text.splitlines():
            cleaned = line.strip()
            if cleaned and not _is_document_type(cleaned):
                title = cleaned[:200]
                break
    if not title:
        title = "Unknown Entity"
    due_date = _first_date_in_text(text)
    details: Dict[str, Any] = {}
    for match in ENTITY_LABEL_RE.finditer(text):
        key = match.group(0).split(":", 1)[0].strip().lower().replace(" ", "_")
        key = key.split("-", 1)[0].strip()
        value = _clean(match.group(1)).split("\n")[0].strip(" .;,")
        if key and value:
            details[key] = value
    details["source_text_length"] = len(text)
    return [_build_record(title, DEFAULT_STATUS, details, due_date)]


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def process_file(file_bytes: bytes) -> List[Dict[str, Any]]:
    """Extract compliance records from arbitrary file bytes.

    Returns a list of dicts with top-level keys:
    title, status, details, due_date.
    """
    if file_bytes is None:
        return []
    if isinstance(file_bytes, str):
        file_bytes = file_bytes.encode("utf-8", errors="ignore")

    text = ""
    if isinstance(file_bytes, (bytes, bytearray)) and len(file_bytes) > 0:
        text = _extract_pdf_text(bytes(file_bytes))
        if not text.strip():
            text = _extract_excel_text(bytes(file_bytes))
    if not text.strip():
        try:
            text = bytes(file_bytes).decode("utf-8", errors="ignore")
        except Exception:
            text = str(file_bytes)

    if not text.strip():
        return []

    if _looks_like_csv(text):
        records = _parse_csv_records(text)
        if records:
            return records

    deepseek_records = _deepseek_extract(text)
    if deepseek_records:
        return deepseek_records

    return _fallback_extract(text)


def extract_text(file_bytes):
    try:
        import pdfplumber, io
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            text = ""
            for p in pdf.pages:
                text = text + (p.extract_text() or "") + "\n"
            if text.strip():
                return text
    except Exception:
        pass
    try:
        return file_bytes.decode("utf-8", errors="ignore")
    except Exception:
        return ""
