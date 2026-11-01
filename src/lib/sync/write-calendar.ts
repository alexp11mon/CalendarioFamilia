import { MAX_CALENDARS_PER_ACCOUNT } from "./limits";
import { openSession } from "./providers";
import type { ProviderSession } from "./providers/types";
import type { SyncDeps } from "./run-sync";
import { writeFailureOf, type WriteFailure } from "./write-errors";

// Calendars in the provider from CaFam: renaming a synced one and creating a
// new one (plan D13, D15; RF-29 to RF-33). The provider first, CaFam after, as
// with events. Since spec 018 the provider is Google or iCloud (RF-52, RF-54).

export type CalendarWriteResult =
  | { status: "normal" }
  | { status: "done"; calendarId?: string }
  | { status: "failed"; failure: Exclude<WriteFailure, "gone"> }
  | { status: "forbidden" }
  | { status: "notFound" }
  | { status: "limit" }
  | { status: "dbError"; error: unknown };

async function call(deps: SyncDeps, fn: string, args: Record<string, unknown>) {
  return (
    deps.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>
  )(fn, { p_secret: deps.secret, ...args });
}

/** A calendar that no longer exists in Google cannot be renamed: Google refused. */
function failed(error: unknown): CalendarWriteResult {
  const failure = writeFailureOf(error);
  return {
    status: "failed",
    failure: failure === "gone" ? "rejected" : failure,
  };
}

/**
 * With a new name, a synced calendar is renamed in Google and then in CaFam,
 * with its color and description, which stay only in CaFam (RF-29 to RF-31).
 * Without a new name, or for a normal calendar, the caller saves as always.
 */
export async function renameSyncedCalendar(
  deps: SyncDeps,
  input: {
    userId: string;
    calendarId: string;
    name: string;
    description: string | null;
    color: string;
  },
): Promise<CalendarWriteResult> {
  const { data: synced, error } = await deps.supabase
    .from("synced_calendars")
    .select("connection_id, external_id, can_write, provider")
    .eq("calendar_id", input.calendarId)
    .maybeSingle();
  if (error) return { status: "dbError", error };
  if (!synced) return { status: "normal" };

  const { data: calendar } = await deps.supabase
    .from("calendars")
    .select("name, owner_id")
    .eq("id", input.calendarId)
    .maybeSingle();
  if (!calendar) return { status: "notFound" };
  if (calendar.name === input.name) return { status: "normal" };
  // Checked before Google so a refused rename never reaches it.
  const row = synced as unknown as { can_write: boolean | null };
  if (calendar.owner_id !== input.userId || !row.can_write) {
    return { status: "forbidden" };
  }

  try {
    const session = await openSession(
      deps,
      synced.provider ?? "google",
      synced.connection_id,
    );
    await session.renameCalendar(synced.external_id, input.name);
  } catch (error) {
    return failed(error);
  }

  const saved = await call(deps, "sync_update_calendar", {
    p_calendar_id: input.calendarId,
    p_name: input.name,
    p_description: input.description,
    p_color: input.color,
  });
  return saved.error
    ? { status: "dbError", error: saved.error }
    : { status: "done" };
}

/** A new calendar in a connected account, brought to CaFam (RF-32, RF-33, D15). */
export async function createSyncedCalendar(
  deps: SyncDeps,
  input: { connectionId: string; name: string; timeZone: string },
): Promise<CalendarWriteResult> {
  // RLS shows only the user's own connections.
  const { data: connection } = await deps.supabase
    .from("calendar_connections")
    .select("status, can_write, provider")
    .eq("id", input.connectionId)
    .maybeSingle();
  if (!connection) return { status: "notFound" };
  if (connection.status !== "active" || !connection.can_write) {
    return { status: "forbidden" };
  }
  const { count } = await deps.supabase
    .from("synced_calendars")
    .select("calendar_id", { count: "exact", head: true })
    .eq("connection_id", input.connectionId);
  if ((count ?? 0) >= MAX_CALENDARS_PER_ACCOUNT) return { status: "limit" };

  let session: ProviderSession;
  let externalId: string;
  try {
    session = await openSession(
      deps,
      connection.provider ?? "google",
      input.connectionId,
    );
    externalId = await session.insertCalendar({
      name: input.name,
      timeZone: input.timeZone,
    });
  } catch (error) {
    return failed(error);
  }

  const { data, error } = await call(deps, "sync_attach_created", {
    p_connection_id: input.connectionId,
    p_external_id: externalId,
    p_name: input.name,
  });
  if (error) {
    // Undo it: nothing in Google that CaFam does not show (D15).
    await session.deleteCalendar(externalId).catch(() => undefined);
    const code = (error as { code?: unknown }).code;
    return code === "CF429"
      ? { status: "limit" }
      : { status: "dbError", error };
  }
  return { status: "done", calendarId: data as string };
}
