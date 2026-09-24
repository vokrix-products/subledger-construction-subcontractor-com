import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const TABLE = "subcontractors";
export const ACTIVITY_TABLE = "subcontractor_activity";

export function requireClient(): SupabaseClient {
  if (!supabase) {
    throw new Error("Supabase is not configured for this build.");
  }
  return supabase;
}
