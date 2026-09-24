import type { StatusKey, StatusTone } from "./types";

export const STATUS_TONES: Record<string, StatusTone> = {
  "expired:critical": "danger",
  "non_compliant:critical": "danger",
  "blocked:critical": "danger",
  "missing_coverage:critical": "danger",
  "expiring_soon:warning": "warn",
  "awaiting_upload:warning": "warn",
  "flagged:warning": "warn",
  "unverified:warning": "warn",
  "partial:warning": "warn",
  "pending_review:info": "info",
  compliant_good: "good",
  "compliant:good": "good",
  "valid:good": "good",
  "not_required:good": "good",
};

export const STATUS_LABELS: Record<string, string> = {
  "expired:critical": "Expired",
  "non_compliant:critical": "Non-compliant",
  "blocked:critical": "Blocked",
  "missing_coverage:critical": "Missing coverage",
  "expiring_soon:warning": "Expiring soon",
  "awaiting_upload:warning": "Awaiting upload",
  "flagged:warning": "Flagged",
  "unverified:warning": "Unverified",
  "partial:warning": "Partial",
  "pending_review:info": "Pending review",
  "compliant:good": "Compliant",
  "valid:good": "Valid",
  "not_required:good": "Not required",
};

export const ALLOWED_STATUSES: StatusKey[] = [
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
];

export const DEFAULT_STATUS: StatusKey = "pending_review:info";

const BUCKET_MAP: Record<string, StatusKey> = {
  expired: "expired:critical",
  critical: "non_compliant:critical",
  expiring: "expiring_soon:warning",
  expiring_soon: "expiring_soon:warning",
  blocked: "blocked:critical",
  compliant: "compliant:good",
  valid: "valid:good",
  good: "compliant:good",
  pending: "pending_review:info",
  pending_review: "pending_review:info",
  info: "pending_review:info",
  flagged: "flagged:warning",
  warning: "flagged:warning",
  awaiting_upload: "awaiting_upload:warning",
  unverified: "unverified:warning",
  missing_coverage: "missing_coverage:critical",
  partial: "partial:warning",
  not_required: "not_required:good",
};

export function normalizeStatus(value: unknown): StatusKey {
  const candidate = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if ((ALLOWED_STATUSES as string[]).includes(candidate)) return candidate as StatusKey;
  if (BUCKET_MAP[candidate]) return BUCKET_MAP[candidate];
  return DEFAULT_STATUS;
}

export function statusTone(status: string): StatusTone {
  return STATUS_TONES[status] ?? STATUS_TONES[normalizeStatus(status)] ?? "muted";
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? STATUS_LABELS[normalizeStatus(status)] ?? "Pending review";
}

export function badgeClass(status: string): string {
  return `badge badge-${statusTone(status)}`;
}

export function isCritical(status: string): boolean {
  return statusTone(status) === "danger";
}
