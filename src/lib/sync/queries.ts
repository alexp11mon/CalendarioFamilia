import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ProviderName } from "./providers/types";
import type { UpdateSummary } from "./summary";

// Reads with the user's session: RLS shows only own connections and the
// synced calendars the user is a member of (spec 007, T2).

type Client = SupabaseClient<Database>;

export interface Connection {
  id: string;
  /** Google or, since spec 018, iCloud. */
  provider: ProviderName;
  email: string;
  status: "active" | "needs_reauth";
  /** Granted every permission of spec 009 (plan D2). */
  canWrite: boolean;
}

export interface SyncedCalendarView {
  calendarId: string;
  externalId?: string;
  name: string;
  state: "active" | "missing";
  lastSyncedAt: string | null;
  lastError: string | null;
  lastSummary: UpdateSummary | null;
}

export async function getConnections(supabase: Client): Promise<Connection[]> {
  const { data, error } = await supabase
    .from("calendar_connections")
    .select("id, provider, account_email, status, can_write")
    .order("created_at");
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    provider: row.provider as ProviderName,
    email: row.account_email,
    status: row.status as Connection["status"],
    canWrite: row.can_write,
  }));
}

export async function getConnection(
  supabase: Client,
  id: string,
): Promise<Connection | null> {
  const { data, error } = await supabase
    .from("calendar_connections")
    .select("id, provider, account_email, status, can_write")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data
    ? {
        id: data.id,
        provider: data.provider as ProviderName,
        email: data.account_email,
        status: data.status as Connection["status"],
        canWrite: data.can_write,
      }
    : null;
}

export async function getSyncedCalendars(
  supabase: Client,
  connectionId: string,
): Promise<SyncedCalendarView[]> {
  const { data, error } = await supabase
    .from("synced_calendars")
    .select(
      "calendar_id, external_id, state, last_synced_at, last_error, last_summary, calendars(name)",
    )
    .eq("connection_id", connectionId)
    .order("created_at");
  if (error) throw error;
  return data.map((row) => ({
    calendarId: row.calendar_id,
    externalId: row.external_id,
    name: row.calendars?.name ?? "",
    state: row.state as SyncedCalendarView["state"],
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
    lastSummary: row.last_summary as UpdateSummary | null,
  }));
}

/** People other than the owner in each calendar; the owner reads every member (RF-27). */
export async function getSharedCounts(
  supabase: Client,
  calendarIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map(calendarIds.map((id) => [id, 0]));
  if (calendarIds.length === 0) return counts;
  const { data, error } = await supabase
    .from("calendar_members")
    .select("calendar_id")
    .in("calendar_id", calendarIds)
    .neq("role", "owner");
  if (error) throw error;
  for (const row of data) {
    counts.set(row.calendar_id, (counts.get(row.calendar_id) ?? 0) + 1);
  }
  return counts;
}
