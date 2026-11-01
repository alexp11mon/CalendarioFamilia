import {
  toGoogleEvent,
  toGooglePatch,
  type WritableEvent,
} from "./google-payload";
import {
  deleteEvent,
  insertEvent,
  moveEvent,
  patchEvent,
} from "./providers/google";
import { accessToken, type SyncDeps } from "./run-sync";
import { writeFailureOf, type WriteFailure } from "./write-errors";

// Writes an event of a synced calendar: Google first, CaFam after, so CaFam
// never shows a change Google does not have (plan D3, D4; RF-10 to RF-12,
// RF-21). Every Google call shares one 9 s deadline (D12, RF-22).

const DEADLINE_MS = 9_000;

/** The event as the actions save it: Google fields plus CaFam's own color and category. */
export interface EventRowInput extends WritableEvent {
  calendar_id: string;
  color: string | null;
  category_id: string | null;
}

export type WriteRequest =
  | { op: "create"; row: EventRowInput }
  | {
      op: "update";
      eventId: string;
      calendarId: string;
      before: WritableEvent;
      row: EventRowInput;
    }
  | { op: "delete"; eventId: string; calendarId: string };

export type WriteResult =
  /** Neither side is synced: the caller writes as always. */
  | { status: "normal" }
  | { status: "done"; eventId: string }
  /** Deleted in Google meanwhile: removed from CaFam, nothing saved (RF-25). */
  | { status: "gone" }
  | { status: "failed"; failure: Exclude<WriteFailure, "gone"> }
  /** Refused by the database (role, mixed calendars): the caller explains it. */
  | { status: "dbError"; error: unknown };

interface Context {
  synced: boolean;
  connection_id: string;
  calendar_external_id: string;
  target_external_id: string;
  event_external_id: string | null;
}

async function call(deps: SyncDeps, fn: string, args: Record<string, unknown>) {
  // The write functions are not in the generated types' overloads used here.
  return (
    deps.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>
  )(fn, { p_secret: deps.secret, ...args });
}

/** One deadline for the token and the writes of a request (D12). */
function withDeadline(fetchFn: typeof fetch = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
  return {
    fetchFn: ((input, init) =>
      fetchFn(input, { ...init, signal: controller.signal })) as typeof fetch,
    done: () => clearTimeout(timer),
  };
}

export async function writeEvent(
  request: WriteRequest,
  deps: SyncDeps,
): Promise<WriteResult> {
  const calendarId =
    request.op === "create" ? request.row.calendar_id : request.calendarId;
  const target = request.op === "delete" ? null : request.row.calendar_id;

  const { data, error } = await call(deps, "sync_write_context", {
    p_calendar_id: calendarId,
    p_event_id: request.op === "create" ? null : request.eventId,
    p_target_calendar_id: target,
  });
  if (error) return { status: "dbError", error };
  const context = data as Context;
  if (!context.synced) return { status: "normal" };

  const commit = async (
    op: string,
    eventId: string | null,
    externalId: string | null,
  ): Promise<WriteResult> => {
    const saved = await call(deps, "sync_commit_event", {
      p_op: op,
      p_calendar_id: calendarId,
      p_event_id: eventId,
      p_row: request.op === "delete" ? null : request.row,
      p_external_id: externalId,
    });
    if (saved.error) return { status: "dbError", error: saved.error };
    return op === "gone"
      ? { status: "gone" }
      : { status: "done", eventId: saved.data as string };
  };

  // Left out when the calendar was uploaded: stays only in CaFam (D9, RF-42).
  // Nothing Google keeps changed (the color, spec 017 RF-38): only CaFam.
  if (
    (request.op !== "create" && !context.event_external_id) ||
    (request.op === "update" &&
      context.target_external_id === context.calendar_external_id &&
      Object.keys(toGooglePatch(request.before, request.row)).length === 0)
  ) {
    return commit(
      request.op === "update" ? "update" : "delete",
      request.eventId,
      null,
    );
  }

  const { fetchFn, done } = withDeadline(deps.fetchFn);
  try {
    const token = await accessToken(
      { ...deps, fetchFn },
      context.connection_id,
    );
    const source = context.calendar_external_id;

    if (request.op === "create") {
      const id = await insertEvent(
        token,
        source,
        toGoogleEvent(request.row),
        fetchFn,
      );
      return commit("insert", null, id);
    }

    const eventExternal = context.event_external_id!;
    if (request.op === "update") {
      // Patch before moving: if the move fails, the next sync brings the change (D7).
      await patchEvent(
        token,
        source,
        eventExternal,
        toGooglePatch(request.before, request.row),
        fetchFn,
      );
      if (context.target_external_id !== source) {
        await moveEvent(
          token,
          source,
          eventExternal,
          context.target_external_id,
          fetchFn,
        );
      }
      return commit("update", request.eventId, null);
    }

    await deleteEvent(token, source, eventExternal, fetchFn);
    return commit("delete", request.eventId, null);
  } catch (error) {
    const failure = writeFailureOf(error);
    if (failure === "gone") {
      // A new event cannot be "gone": its calendar is missing, Google refused.
      if (request.op === "create")
        return { status: "failed", failure: "rejected" };
      return commit("gone", request.eventId, null);
    }
    if (failure === "revoked") {
      await call(deps, "sync_fail", {
        p_calendar_id: calendarId,
        p_kind: "revoked",
      }).catch(() => undefined);
    }
    return { status: "failed", failure };
  } finally {
    done();
  }
}
