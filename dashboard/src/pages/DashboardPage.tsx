import { useMemo } from "react";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { expiryLabel, relativeTime } from "../lib/dashboardHelpers";
import { statusTone } from "../lib/status";
import { detailValue, pluralize } from "../lib/format";
import type { ActivityEntry, SubcontractorRecord } from "../lib/types";

interface Stats {
  total: number;
  critical: number;
  warning: number;
  good: number;
  score: number;
}

export function DashboardPage({
  records,
  activity,
  loading,
  stats,
  usingRemote,
  unlocked,
  onOpenSubs,
  onOpenUpload,
}: {
  records: SubcontractorRecord[];
  activity: ActivityEntry[];
  loading: boolean;
  stats: Stats;
  usingRemote: boolean;
  unlocked: boolean;
  onOpenSubs: () => void;
  onOpenUpload: () => void;
}) {
  const riskiest = useMemo(() => {
    const weight: Record<string, number> = { danger: 0, warn: 1, info: 2, good: 3, muted: 4 };
    return [...records]
      .sort((a, b) => (weight[statusTone(a.status)] ?? 9) - (weight[statusTone(b.status)] ?? 9))
      .slice(0, 6);
  }, [records]);

  const upcoming = useMemo(() => {
    return [...records]
      .filter((r) => r.due_date)
      .sort((a, b) => new Date(a.due_date || 0).getTime() - new Date(b.due_date || 0).getTime())
      .slice(0, 5);
  }, [records]);

  if (loading) {
    return (
      <div className="grid stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 110 }} />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="grid stats" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="stat-label">Tracked subs</div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-foot">
            {unlocked ? "Unlimited plan" : "Free tier limit"} - {usingRemote ? "cloud sync" : "local store"}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">Critical</div>
          <div className="stat-value" style={{ color: "var(--danger)" }}>{stats.critical}</div>
          <div className="stat-foot">Expired, blocked or non-compliant</div>
        </div>
        <div className="card">
          <div className="stat-label">Expiring soon</div>
          <div className="stat-value" style={{ color: "var(--warn)" }}>{stats.warning}</div>
          <div className="stat-foot">Needs chasing this month</div>
        </div>
        <div className="card">
          <div className="stat-label">Compliance score</div>
          <div className="stat-value" style={{ color: "var(--good)" }}>{stats.score}%</div>
          <div className="progress" style={{ marginTop: 10 }}>
            <div style={{ width: `${stats.score}%` }} />
          </div>
        </div>
      </div>

      <div className="grid cols-2">
        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Risk queue</div>
              <div className="card-hint">Highest exposure subcontractors first</div>
            </div>
            <button className="btn btn-sm" onClick={onOpenSubs}>Open ledger</button>
          </div>
          {riskiest.length === 0 ? (
            <EmptyState
              title="No subcontractors yet"
              body="Import certificates of insurance, licences, W-9s or bonds to start tracking compliance."
              action={<button className="btn btn-primary" onClick={onOpenUpload}>Upload documents</button>}
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Subcontractor</th>
                    <th>Status</th>
                    <th>Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {riskiest.map((r) => (
                    <tr key={r.id}>
                      <td>{r.title}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="mono">{expiryLabel(r.due_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Upcoming expirations</div>
              <div className="card-hint">Next dates pulled from your documents</div>
            </div>
          </div>
          {upcoming.length === 0 ? (
            <EmptyState title="No expiry dates captured" body="Upload a COI, licence or bond and SubLedger will read the dates automatically." />
          ) : (
            <div className="timeline">
              {upcoming.map((r) => (
                <div className="timeline-item" key={r.id}>
                  <div
                    className="timeline-dot"
                    style={{ background: statusTone(r.status) === "danger" ? "var(--danger)" : statusTone(r.status) === "warn" ? "var(--warn)" : "var(--good)" }}
                  />
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{r.title}</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>{expiryLabel(r.due_date)}</div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid cols-2" style={{ marginTop: 20 }}>
        <section className="card">
          <div className="card-head">
            <div className="card-title">Recent activity</div>
          </div>
          {activity.length === 0 ? (
            <EmptyState title="Nothing logged yet" body="Imports, status changes and assistant actions appear here." />
          ) : (
            <div className="timeline">
              {activity.slice(0, 6).map((a) => (
                <div className="timeline-item" key={a.id}>
                  <div className="timeline-dot" style={{ background: a.tone === "danger" ? "var(--danger)" : a.tone === "warn" ? "var(--warn)" : a.tone === "good" ? "var(--good)" : "var(--accent)" }} />
                  <div className="grow">
                    <div>{a.message}</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>{relativeTime(a.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div className="card-title">What SubLedger watches</div>
          </div>
          <div style={{ color: "var(--muted)", lineHeight: 1.9, fontSize: 13 }}>
            <div>- Certificate of insurance limits and expiry</div>
            <div>- State and trade licence renewals</div>
            <div>- W-9 collection status</div>
            <div>- Payment and performance bond dates</div>
            <div>- Lien waiver and waiver-of-subrogation flags</div>
            <div style={{ marginTop: 12 }}>
              {records.length} {pluralize(records.length, "subcontractor")} currently tracked
              {stats.critical > 0 ? `, ${stats.critical} needing immediate chase` : ""}.
            </div>
          </div>
        </section>
      </div>

      <div className="footer-note">
        <span>{import.meta.env.VITE_PRODUCT_NAME || "SubLedger"}</span>
        <span>{detailValue({ critical: stats.critical, warning: stats.warning, compliant: stats.good })}</span>
      </div>
    </>
  );
}
