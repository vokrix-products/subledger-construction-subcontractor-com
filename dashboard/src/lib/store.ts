import { supabase, TABLE, requireClient } from "./supabase";
import { normalizeStatus } from "./status";
import type { SubcontractorRecord } from "./types";

const LOCAL_KEY = "subledger.records.v1";

function readLocal(): SubcontractorRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SubcontractorRecord[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(records: SubcontractorRecord[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(records));
  } catch {
    /* ignore */
  }
}

function coerce(row: Record<string, unknown>): SubcontractorRecord {
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? "Unknown Entity"),
    status: normalizeStatus(row.status),
    details: (row.details as Record<string, unknown>) ?? {},
    due_date: (row.due_date as string) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: (row.updated_at as string) ?? undefined,
    source_file: (row.source_file as string) ?? undefined,
  };
}

export const usingRemote = Boolean(supabase);

export async function listRecords(): Promise<SubcontractorRecord[]> {
  if (!supabase) return readLocal();
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(coerce);
  } catch {
    return readLocal();
  }
}

export async function createRecords(
  records: SubcontractorRecord[]
): Promise<{ records: SubcontractorRecord[]; source: "remote" | "local" }> {
  if (!records.length) return { records: [], source: "local" };
  if (!supabase) {
    const next = [...records, ...readLocal()];
    writeLocal(next);
    return { records, source: "local" };
  }
  try {
    const client = requireClient();
    const { data, error } = await client.from(TABLE).insert(records).select("*");
    if (error) throw error;
    return { records: (data ?? []).map(coerce), source: "remote" };
  } catch {
    const next = [...records, ...readLocal()];
    writeLocal(next);
    return { records, source: "local" };
  }
}

export async function updateRecord(
  id: string,
  patch: Partial<SubcontractorRecord>
): Promise<void> {
  if (!supabase) {
    const next = readLocal().map((r) => (r.id === id ? { ...r, ...patch } : r));
    writeLocal(next);
    return;
  }
  try {
    const client = requireClient();
    await client
      .from(TABLE)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
  } catch {
    const next = readLocal().map((r) => (r.id === id ? { ...r, ...patch } : r));
    writeLocal(next);
  }
}

export async function deleteRecord(id: string): Promise<void> {
  if (!supabase) {
    writeLocal(readLocal().filter((r) => r.id !== id));
    return;
  }
  try {
    const client = requireClient();
    await client.from(TABLE).delete().eq("id", id);
  } catch {
    writeLocal(readLocal().filter((r) => r.id !== id));
  }
}

export function seedLocal(records: SubcontractorRecord[]): void {
  writeLocal(records);
}
