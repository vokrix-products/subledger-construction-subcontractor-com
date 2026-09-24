export type StatusKey =
  | "expired:critical"
  | "expiring_soon:warning"
  | "non_compliant:critical"
  | "blocked:critical"
  | "compliant:good"
  | "awaiting_upload:warning"
  | "flagged:warning"
  | "pending_review:info"
  | "unverified:warning"
  | "missing_coverage:critical"
  | "partial:warning"
  | "valid:good"
  | "not_required:good";

export type StatusTone = "good" | "warn" | "danger" | "info" | "muted";

export interface SubcontractorRecord {
  id: string;
  title: string;
  status: StatusKey;
  details: Record<string, unknown>;
  due_date: string | null;
  created_at: string;
  updated_at?: string;
  source_file?: string;
}

export interface ExtractedRecord {
  title: string;
  status: StatusKey | string;
  details: Record<string, unknown>;
  due_date: string | null;
}

export interface ActivityEntry {
  id: string;
  at: string;
  kind: "upload" | "status" | "note" | "delete" | "assistant";
  message: string;
  tone?: StatusTone;
}
