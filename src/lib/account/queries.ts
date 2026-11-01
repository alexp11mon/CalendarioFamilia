// Reads for the account screens (spec 006). Everything goes through the user's
// session: Auth for the addresses, RLS for the rows.
import type { SupabaseClient } from "@supabase/supabase-js";
import { providerOrGoogle } from "@/lib/sync/provider-labels";
import type { ProviderName } from "@/lib/sync/providers/types";
import type { Database } from "@/types/database";

// The server client and the test clients share this type.
type Client = SupabaseClient<Database>;

/** Current address and the one waiting for confirmation, if any (RF-10). */
export async function getAccountEmails(
  supabase: Client,
): Promise<{ email: string; pendingEmail: string | null }> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return {
    email: data.user?.email ?? "",
    pendingEmail: data.user?.new_email ?? null,
  };
}

/** Name and time zone of the own profile (RF-13, RF-14). */
export async function getProfile(
  supabase: Client,
  userId: string,
): Promise<{ displayName: string; timeZone: string }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, time_zone")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return { displayName: data.display_name, timeZone: data.time_zone };
}

export type NoticeKind =
  | "orphaned"
  | "kept_copy"
  | "deleted_calendar"
  | "sync_revoked"
  | "sync_failing";

export interface AccountNotice {
  id: string;
  kind: NoticeKind;
  personName: string;
  calendarName: string;
  createdAt: string;
  /** sync_revoked only: the account to reconnect (spec 018 RF-62). */
  provider?: ProviderName;
  connectionId?: string;
}

const NOTICE_KINDS = new Set<string>([
  "orphaned",
  "kept_copy",
  "deleted_calendar",
  "sync_revoked",
  "sync_failing",
]);

/** Unread notices of the user, newest first; RLS only returns the own ones (RF-23). */
export async function getNotices(supabase: Client): Promise<AccountNotice[]> {
  const { data, error } = await supabase
    .from("account_notices")
    .select("id, kind, person_name, calendar_name, created_at")
    .is("read_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []).filter((row) => NOTICE_KINDS.has(row.kind));

  // The notice keeps only the account's address: find the own connection
  // that needs reconnecting, Google or iCloud (spec 018 RF-62).
  const revoked = rows.some((row) => row.kind === "sync_revoked");
  const { data: connections } = revoked
    ? await supabase
        .from("calendar_connections")
        .select("id, provider, account_email, status")
    : { data: [] };
  const accountOf = (email: string) =>
    (connections ?? [])
      .filter((c) => c.account_email === email)
      .sort((a) => (a.status === "needs_reauth" ? -1 : 1))[0];

  return rows.map((row) => {
    const notice: AccountNotice = {
      id: row.id,
      kind: row.kind as NoticeKind,
      personName: row.person_name,
      calendarName: row.calendar_name,
      createdAt: row.created_at,
    };
    const account =
      row.kind === "sync_revoked" ? accountOf(row.calendar_name) : undefined;
    if (account) {
      notice.provider = providerOrGoogle(account.provider);
      notice.connectionId = account.id;
    }
    return notice;
  });
}

export interface OrphanCalendar {
  id: string;
  name: string;
  color: string;
  orphanedAt: string;
  /** true keeps it, false left it, null not decided yet (RF-24, RF-25). */
  decision: boolean | null;
}

/** Calendars without owner the user belongs to, with their own decision (RF-24, RF-26). */
export async function getOrphanCalendars(
  supabase: Client,
  userId: string,
): Promise<OrphanCalendar[]> {
  const [calendars, decisions] = await Promise.all([
    supabase
      .from("calendars")
      .select("id, name, color, orphaned_at")
      .is("owner_id", null)
      .order("orphaned_at"),
    supabase
      .from("calendar_orphan_decisions")
      .select("calendar_id, keep")
      .eq("user_id", userId),
  ]);
  if (calendars.error) throw calendars.error;
  if (decisions.error) throw decisions.error;
  const keepById = new Map(
    (decisions.data ?? []).map((row) => [row.calendar_id, row.keep]),
  );
  return (calendars.data ?? []).flatMap((row) =>
    row.orphaned_at
      ? [
          {
            id: row.id,
            name: row.name,
            color: row.color,
            orphanedAt: row.orphaned_at,
            decision: keepById.get(row.id) ?? null,
          },
        ]
      : [],
  );
}
