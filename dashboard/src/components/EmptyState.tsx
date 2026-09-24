import type { ReactNode } from "react";

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      <div style={{ marginBottom: action ? 18 : 0 }}>{body}</div>
      {action}
    </div>
  );
}
