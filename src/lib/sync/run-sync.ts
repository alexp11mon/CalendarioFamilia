import { rpc, type SyncDeps } from "./deps";
import { limitEvents } from "./limit-events";
import { openSession } from "./providers";
import {
  ProviderError,
  type FailureKind,
  type ProviderSession,
} from "./providers/types";
import type { UpdateSummary } from "./summary";
import { syncWindow } from "./window";

// The sync engine shared by the hourly run and "Actualizar ahora" (plan D1, D5,
// D7, D17, D19): open the connection, read, convert, cap and apply. The database
// writes go through the secret-protected functions of T4 (plan D4). Since spec
// 018 the provider (Google or iCloud) sits behind one interface (plan D1).

export { accessToken, type SyncDeps } from "./deps";

const CONCURRENCY = 4;
const BUDGET_MS = 50_000;

export interface ClaimedCalendar {
  calendar_id: string;
  connection_id: string;
  /** From sync_claim_*; Google when missing (calendars claimed before spec 018). */
  provider?: string;
  external_id: string;
}

export type SyncResult =
  | { calendarId: string; summary: UpdateSummary }
  | { calendarId: string; error: FailureKind };

async function syncOne(
  deps: SyncDeps,
  calendar: ClaimedCalendar,
  session: Promise<ProviderSession>,
): Promise<SyncResult> {
  // Taken before reading: CaFam changes after it win (spec 009 RF-27, plan D5).
  const now = deps.now?.() ?? new Date();
  try {
    const read = await (
      await session
    ).listEvents(calendar.external_id, syncWindow(now));
    const { events, omitted } = limitEvents(read.events, now);
    const summary = (await rpc(deps, "sync_apply_events", {
      p_secret: deps.secret,
      p_calendar_id: calendar.calendar_id,
      p_events: events,
      p_skipped: read.skipped,
      p_omitted: omitted,
      p_read_at: now.toISOString(),
      p_access: read.access,
    })) as UpdateSummary;
    return { calendarId: calendar.calendar_id, summary };
  } catch (error) {
    // Anything unexpected is retried in the next run (RF-33).
    const raw = error instanceof ProviderError ? error.kind : "transient";
    // A refused read is retried like a transient one (spec 009).
    const kind = raw === "rejected" ? "transient" : raw;
    await rpc(deps, "sync_fail", {
      p_secret: deps.secret,
      p_calendar_id: calendar.calendar_id,
      p_kind: kind,
    }).catch(() => undefined);
    return { calendarId: calendar.calendar_id, error: kind };
  }
}

/** Updates already claimed calendars, at most 4 at a time (plan D19). */
export async function syncCalendars(
  calendars: ClaimedCalendar[],
  deps: SyncDeps,
): Promise<SyncResult[]> {
  const sessions = new Map<string, Promise<ProviderSession>>();
  const sessionFor = ({ connection_id, provider }: ClaimedCalendar) => {
    let session = sessions.get(connection_id);
    if (!session) {
      session = openSession(deps, provider ?? "google", connection_id);
      // Handled per calendar in syncOne; this only avoids an unhandled rejection.
      session.catch(() => undefined);
      sessions.set(connection_id, session);
    }
    return session;
  };

  const results: SyncResult[] = [];
  const queue = [...calendars];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      results.push(await syncOne(deps, next, sessionFor(next)));
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

/**
 * The hourly run: claims 4 due calendars at a time while there is time left,
 * so what does not fit stays unclaimed for the next run (RF-22, plan D19).
 */
export async function runDue(deps: SyncDeps): Promise<number> {
  const started = Date.now();
  const elapsed = deps.elapsedMs ?? (() => Date.now() - started);
  let count = 0;
  while (elapsed() < BUDGET_MS) {
    const batch = (await rpc(deps, "sync_claim_due", {
      p_secret: deps.secret,
      p_limit: CONCURRENCY,
    })) as ClaimedCalendar[] | null;
    if (!batch?.length) break;
    await syncCalendars(batch, deps);
    count += batch.length;
  }
  return count;
}
