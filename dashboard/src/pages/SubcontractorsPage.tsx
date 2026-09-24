import { useMemo, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { detailValue, expiryLabel, formatDate, titleCase } from "../lib/format";
import { ALLOWED_STATUSES, statusLabel, statusTone } from "../lib/status";
import type { SubcontractorRecord } from "../lib/types";

type SortKey = "title" | "status" | "due_date" | "created_at";

export function SubcontractorsPage({
  records,
  loading,
  onEdit,
  onDelete,
  onUpload,
}: {
  records: SubcontractorRecord[];
  loading: boolean;
  onEdit: (id: string, patch: Partial<SubcontractorRecord>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUpload: () => void;
}) {
  const { push } = useToast();
  const [query, setQuery] = useState("");
  const [tone, setTone] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("created_at");
  const [asc, setAsc] = useState(false);
  const [selected, setSelected] = useState<SubcontractorRecord | null>(null);
  const [editing, setEditing] = useState<SubcontractorRecord | null>(null);
  const [draftStatus, setDraftStatus] = useState("pending_review:info");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = records.filter((r) => {
      const matchesQuery =
        !q ||
        r.title.toLowerCase().includes(q) ||
        JSON.stringify(r.details || {}).toLowerCase().includes(q);
      const matchesTone = tone === "all" || statusTone(r.status) === tone;
      return matchesQuery && matchesTone;
    });
    const dir = asc ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sort] ?? "";
      const bv = b[sort] ?? "";
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [records, query, tone, sort, asc]);

  function toggleSort(key: SortKey) {
    if (sort === key) setAsc((v) => !v);
    else {
      setSort(key);
      setAsc(true);
    }
  }

  function openEdit(record: SubcontractorRecord) {
    setEditing(record);
    setDraftStatus(record.status);
  }

  async function saveEdit() {
    if (!editing) return;
    await onEdit(editing.id, { status: draftStatus as SubcontractorRecord["status"] });
    push("Status updated.", "success");
    setEditing(null);
  }

  async function confirmDelete(record: SubcontractorRecord) {
    await onDelete(record.id);
    push("Record removed.", "info");
    setSelected(null);
  }

  if (loading) {
    return <div className="skeleton" style={{ height: 320 }} />;
  }

  return (
    <>
      <div className="toolbar">
        <input
          className="input grow"
          placeholder="Search subcontractors, insurers, policy numbers..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="select" value={tone} onChange={(e) => setTone(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="danger">Critical</option>
          <option value="warn">Warning</option>
          <option value="info">Pending</option>
          <option value="good">Compliant</option>
        </select>
        <button className="btn btn-primary" onClick={onUpload}>Import</button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={records.length === 0 ? "No subcontractors yet" : "No matches"}
          body={
            records.length === 0
              ? "Upload a COI, licence, W-9, bond or CSV to populate the ledger."
              : "Adjust the search or status filter to find records."
          }
          action={
            records.length === 0 ? (
              <button className="btn btn-primary" onClick={onUpload}>Upload documents</button>
            ) : undefined
          }
        />
      ) : (
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort("title")}>Subcontractor</th>
                <th className="sortable" onClick={() => toggleSort("status")}>Status</th>
                <th className="sortable" onClick={() => toggleSort("due_date")}>Expiry / due</th>
                <th>Details</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => setSelected(r)}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.title}</div>
                    <div className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>
                      {r.source_file || "manual"}
                    </div>
                  </td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="mono">{expiryLabel(r.due_date)}</td>
                  <td style={{ color: "var(--muted)", fontSize: 12 }}>
                    {Object.keys(r.details || {}).length} fields
                  </td>
                  <td className="row row-end">
                    <button
                      className="btn btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(r);
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected ? (
        <Modal
          title={selected.title}
          onClose={() => setSelected(null)}
          footer={
            <>
              <button className="btn btn-danger" onClick={() => confirmDelete(selected)}>Delete</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  openEdit(selected);
                  setSelected(null);
                }}
              >
                Change status
              </button>
            </>
          }
        >
          <div className="row" style={{ marginBottom: 14 }}>
            <StatusBadge status={selected.status} />
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              Added {formatDate(selected.created_at)}
            </span>
          </div>
          <div className="kv">
            <div className="kv-row">
              <span>Expiry / due</span>
              <span className="mono">{selected.due_date ? formatDate(selected.due_date) : "-"}</span>
            </div>
            {Object.entries(selected.details || {}).map(([k, v]) => (
              <div className="kv-row" key={k}>
                <span>{titleCase(k)}</span>
                <span className="mono">{detailValue(v)}</span>
              </div>
            ))}
          </div>
        </Modal>
      ) : null}

      {editing ? (
        <Modal
          title={`Update status - ${editing.title}`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit}>Save</button>
            </>
          }
        >
          <label className="field">
            <span>Compliance status</span>
            <select className="select" value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)}>
              {ALLOWED_STATUSES.map((s) => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </select>
          </label>
        </Modal>
      ) : null}
    </>
  );
}
