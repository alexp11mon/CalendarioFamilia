import type { WritableEvent } from "./google-payload";
import { MAX_CALENDARS_PER_ACCOUNT } from "./limits";
import { openSession } from "./providers";
import { ProviderError, type ProviderSession } from "./providers/types";
import type { SyncDeps } from "./run-sync";
import { planUpload, withOccurrences, type UploadRow } from "./upload-plan";
import type { CalendarWriteResult } from "./write-calendar";
import { writeFailureOf } from "./write-errors";

// Copies a normal CaFam calendar to the provider and turns it into a synced one
// (plan D14; RF-34 to RF-37, RF-42). CaFam changes only at the end, in one
// transaction; any failure before deletes what was created in the provider.
// Since spec 018 the provider is Google or iCloud (RF-55 to RF-60).

const CONCURRENCY = 4;
/** maxDuration of /upload is 300 s (T1): stop copying with room to clean up. */
const BUDGET_MS = 270_000;
const RETRIES = 3;

export interface UploadEvent extends WritableEvent, UploadRow {
  id: string;
}

export type UploadDeps = SyncDeps & {
  sleep?: (ms: number) => Promise<void>;
};

async function call(deps: SyncDeps, fn: string, args: Record<string, unknown>) {
  return (
    deps.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>
  )(fn, { p_secret: deps.secret, ...args });
}

/** Google's usage limits answer as transient: wait 1, 2 and 4 s (plan D14). */
async function withRetry<T>(deps: UploadDeps, run: () => Promise<T>) {
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const transient =
        error instanceof ProviderError && error.kind === "transient";
      if (!transient || attempt >= RETRIES - 1) throw error;
      await sleep(1000 * 2 ** attempt);
    }
  }
}

export async function uploadCalendar(
  deps: UploadDeps,
  input: {
    calendarId: string;
    connectionId: string;
    name: string;
    timeZone: string;
    events: UploadEvent[];
  },
): Promise<CalendarWriteResult> {
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

  const started = Date.now();
  const elapsed = deps.elapsedMs ?? (() => Date.now() - started);
  const now = deps.now?.() ?? new Date();

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
    const failure = writeFailureOf(error);
    return {
      status: "failed",
      failure: failure === "gone" ? "rejected" : failure,
    };
  }
  const undo = () => session.deleteCalendar(externalId).catch(() => undefined);

  // A row by its id; an occurrence of a series by its dates (spec 013 RF-30).
  const mapping: Record<string, string>[] = [];
  const queue = [
    ...planUpload(withOccurrences(input.events, now).events, now).toGoogle,
  ];
  try {
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        if (elapsed() > BUDGET_MS) {
          throw new ProviderError("transient", "Upload ran out of time");
        }
        const event = next;
        const id = await withRetry(deps, () =>
          session.insertEvent(externalId, event),
        );
        mapping.push(
          event.seriesId
            ? {
                series_id: event.seriesId,
                starts_at: event.starts_at,
                ends_at: event.ends_at,
                external_id: id,
              }
            : { event_id: event.id, external_id: id },
        );
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  } catch (error) {
    queue.length = 0;
    await undo();
    const failure = writeFailureOf(error);
    return {
      status: "failed",
      failure: failure === "gone" ? "rejected" : failure,
    };
  }

  const { error } = await call(deps, "sync_attach_uploaded", {
    p_calendar_id: input.calendarId,
    p_connection_id: input.connectionId,
    p_external_id: externalId,
    p_mapping: mapping,
  });
  if (error) {
    await undo();
    const code = (error as { code?: unknown }).code;
    if (code === "CF429") return { status: "limit" };
    if (code === "CF404") return { status: "notFound" };
    return { status: "dbError", error };
  }
  return { status: "done" };
}
