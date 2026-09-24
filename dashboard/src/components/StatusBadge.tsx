import { badgeClass, statusLabel } from "../lib/status";

export function StatusBadge({ status }: { status: string }) {
  return <span className={badgeClass(status)}>{statusLabel(status)}</span>;
}
