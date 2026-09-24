import { normalizeStatus } from "./status";
import type { ExtractedRecord, SubcontractorRecord } from "./types";
import { makeId } from "./activity";

const DOCUMENT_TYPE_WORDS = new Set([
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
  "licence",
  "permit",
  "bond",
  "waiver",
  "lien",
  "subcontract",
  "compliance",
]);

const LABEL_RE =
  /^\s*(?:named insured|insured|subcontractor|vendor|supplier|company|contractor|business|legal name|name|party)\s*[:\-]\s*(.+?)\s*$/gim;

const DATE_RE =
  /\b(\d{4}-\d{2}-\d{2})\b|\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b|\b([A-Z][a-z]+ \d{1,2},? \d{4})\b/;

export function isDocumentType(word: string): boolean {
  return DOCUMENT_TYPE_WORDS.has(word.trim().toLowerCase());
}

function pickTitle(record: Record<string, unknown>): string {
  const preferred = [
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
  ];
  for (const key of preferred) {
    const value = String(record[key] ?? "").trim();
    if (value && !isDocumentType(value)) return value;
  }
  for (const [key, raw] of Object.entries(record)) {
    const value = String(raw ?? "").trim();
    if (value && !isDocumentType(value) && key !== "status") return value;
  }
  return "Unknown Entity";
}

function normalizeDueDate(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  return text;
}

function firstDateInText(text: string): string | null {
  const match = text.match(DATE_RE);
  if (!match) return null;
  const raw = match[1] || match[2] || match[3];
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let year = m[3];
    if (year.length === 2) year = `20${year}`;
    return `${year.padStart(4, "0")}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return raw;
}

function buildRecord(
  title: string,
  status: unknown,
  details: Record<string, unknown>,
  dueDate: unknown
): ExtractedRecord {
  const cleanDetails: Record<string, unknown> = { ...(details || {}) };
  delete cleanDetails.due_date;
  delete cleanDetails.dueDate;
  return {
    title: String(title || "Unknown Entity").trim() || "Unknown Entity",
    status: normalizeStatus(status),
    details: cleanDetails,
    due_date: normalizeDueDate(dueDate),
  };
}

function entityFromLabeledText(text: string): string | null {
  const re = new RegExp(LABEL_RE.source, "gim");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const candidate = (match[1] || "").split("\n")[0].trim().replace(/[.;,]+$/, "");
    if (candidate && !isDocumentType(candidate)) return candidate;
  }
  return null;
}

function looksLikeCsv(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.slice(0, 5).some((line) => line.includes(",") && line.split(",").length >= 2);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function parseCsvRecords(text: string): ExtractedRecord[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const records: ExtractedRecord[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    if (!cells.some((c) => c)) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) row[h] = cells[i] ?? "";
    });
    const title = pickTitle(row);
    const status = row.status ?? "";
    const dueDate =
      row.due_date ?? row["due date"] ?? row.expiry ?? row.expiration ?? row.expires ?? "";
    const details: Record<string, unknown> = { ...row };
    ["title", "status", "due_date", "due date", "expiry", "expiration", "expires"].forEach(
      (k) => delete details[k]
    );
    records.push(buildRecord(title, status, details, dueDate));
  }
  return records;
}

function fallbackExtract(text: string): ExtractedRecord[] {
  let title = entityFromLabeledText(text);
  if (!title) {
    for (const line of text.split(/\r?\n/)) {
      const cleaned = line.trim();
      if (cleaned && !isDocumentType(cleaned)) {
        title = cleaned.slice(0, 200);
        break;
      }
    }
  }
  if (!title) title = "Unknown Entity";
  const dueDate = firstDateInText(text);
  const details: Record<string, unknown> = {};
  const re = new RegExp(LABEL_RE.source, "gim");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const key = (match[0].split(":")[0] || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .split("-")[0]
      .trim();
    const value = (match[1] || "").split("\n")[0].trim().replace(/[.;,]+$/, "");
    if (key && value) details[key] = value;
  }
  details.source_text_length = text.length;
  return [buildRecord(title, "pending_review:info", details, dueDate)];
}

export function extractFromText(text: string): ExtractedRecord[] {
  const trimmed = (text || "").trim();
  if (!trimmed) return [];
  if (looksLikeCsv(trimmed)) {
    const records = parseCsvRecords(trimmed);
    if (records.length) return records;
  }
  return fallbackExtract(trimmed);
}

export async function extractFromFile(file: File): Promise<ExtractedRecord[]> {
  const text = await file.text();
  return extractFromText(text);
}

export function toStoredRecord(
  record: ExtractedRecord,
  sourceFile: string
): SubcontractorRecord {
  const now = new Date().toISOString();
  return {
    id: makeId("rec"),
    title: record.title,
    status: record.status as SubcontractorRecord["status"],
    details: record.details || {},
    due_date: record.due_date,
    created_at: now,
    updated_at: now,
    source_file: sourceFile,
  };
}
