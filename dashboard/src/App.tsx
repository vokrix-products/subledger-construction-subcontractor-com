import { useCallback, useEffect, useMemo, useState } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ToastProvider, useToast } from "./components/Toast";
import { Paywall } from "./components/Paywall";
import { DashboardPage } from "./pages/DashboardPage";
import { SubcontractorsPage } from "./pages/SubcontractorsPage";
import { UploadPage } from "./pages/UploadPage";
import { AssistantPage } from "./pages/AssistantPage";
import { ActivityPage } from "./pages/ActivityPage";
import { createRecords, deleteRecord, listRecords, updateRecord, usingRemote } from "./lib/store";
import { appendActivity, makeId, readActivity } from "./lib/activity";
import { freeLimit, readEntitlement, writeEntitlement } from "./lib/freemium";
import type { ActivityEntry, SubcontractorRecord } from "./lib/types";

function Shell() {
  const { push } = useToast();
  const navigate = useNavigate();
  const [records, setRecords] = useState<SubcontractorRecord[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [paywall, setPaywall] = useState(false);
  const [unlocked, setUnlocked] = useState(() => readEntitlement().unlocked);

  useEffect(() => {
    let live = true;
    listRecords()
      .then((rows) => {
        if (live) setRecords(rows);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    setActivity(readActivity());
    return () => {
      live = false;
    };
  }, []);

  const log = useCallback(
    (kind: ActivityEntry["kind"], message: string, tone?: ActivityEntry["tone"]) => {
      const entry: ActivityEntry = {
        id: makeId("act"),
        at: new Date().toISOString(),
        kind,
        message,
        tone,
      };
      setActivity(appendActivity(entry));
    },
    []
  );

  const atLimit = !unlocked && records.length >= freeLimit();

  const addRecords = useCallback(
    async (incoming: SubcontractorRecord[], sourceLabel: string) => {
      if (!unlocked && records.length >= freeLimit()) {
        setPaywall(true);
        return { saved: 0 };
      }
      const room = unlocked ? incoming.length : Math.max(0, freeLimit() - records.length);
      const slice = incoming.slice(0, room);
      if (!slice.length) {
        setPaywall(true);
        return { saved: 0 };
      }
      const result = await createRecords(slice);
      setRecords((prev) => [...result.records, ...prev]);
      const skipped = incoming.length - slice.length;
      log(
        "upload",
        `Imported ${result.records.length} record${
          result.records.length === 1 ? "" : "s"
        } from ${sourceLabel}${result.source === "local" ? " (local)" : ""}`,
        "info"
      );
      if (skipped > 0) setPaywall(true);
      return { saved: result.records.length };
    },
    [log, records.length, unlocked]
  );

  const editRecord = useCallback(
    async (id: string, patch: Partial<SubcontractorRecord>) => {
      setRecords((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...patch, updated_at: new Date().toISOString() } : r))
      );
      await updateRecord(id, patch);
      log("status", `Updated ${patch.title ?? "record"}${patch.status ? ` to ${patch.status}` : ""}`, "info");
    },
    [log]
  );

  const removeRecord = useCallback(
    async (id: string) => {
      const target = records.find((r) => r.id === id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      await deleteRecord(id);
      log("delete", `Removed ${target?.title ?? "record"} from the ledger`, "warn");
    },
    [log, records]
  );

  const stats = useMemo(() => {
    const total = records.length;
    const critical = records.filter((r) => r.status.includes(":critical")).length;
    const warning = records.filter((r) => r.status.includes(":warning")).length;
    const good = records.filter((r) => r.status.includes(":good")).length;
    const score = total ? Math.round((good / total) * 100) : 100;
    return { total, critical, warning, good, score };
  }, [records]);

  const onUnlocked = useCallback(() => {
    setUnlocked(true);
    log("assistant", "Workspace upgraded to unlimited subcontractors", "good");
  }, [log]);

  return (
    <>
      <Layout>
        <Routes>
          <Route
            path="/"
            element={
              <DashboardPage
                records={records}
                activity={activity}
                loading={loading}
                stats={stats}
                usingRemote={usingRemote}
                unlocked={unlocked}
                onOpenSubs={() => navigate("/subcontractors")}
                onOpenUpload={() => navigate("/upload")}
              />
            }
          />
          <Route
            path="/subcontractors"
            element={
              <SubcontractorsPage
                records={records}
                loading={loading}
                onEdit={editRecord}
                onDelete={removeRecord}
                onUpload={() => navigate("/upload")}
              />
            }
          />
          <Route path="/upload" element={<UploadPage atLimit={atLimit} onImport={addRecords} onEdit={editRecord} />} />
          <Route path="/assistant" element={<AssistantPage onImport={addRecords} />} />
          <Route path="/activity" element={<ActivityPage activity={activity} />} />
        </Routes>
      </Layout>
      {paywall ? (
        <Paywall
          onClose={() => {
            setPaywall(false);
            if (readEntitlement().unlocked) onUnlocked();
          }}
        />
      ) : null}
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
