import { CALENDAR_MESSAGES } from "@/lib/calendar/error-messages";
import type { EventRecord } from "@/lib/calendar/queries";
import type { EventData, EventFormValues } from "@/lib/calendar/schemas";
import { utcDateKey, zonedDateKey } from "@/lib/calendar/time-zone";
import type { Change, UndoToken } from "@/lib/calendar/undo";
import type { Loss } from "@/lib/forms/form-state";
import { SERIES_SCOPES, type SeriesScope } from "@/lib/recurrence/series-write";
import { isGoneDone, type GoneDone } from "@/lib/sync/provider-labels";
import { goneText } from "@/lib/sync/write-errors";
import {
  changeOccurrence,
  refresh,
  updateSingle,
  type EventFormState,
  type Supabase,
} from "./event-writes";

// Shared by the quick actions (spec 017 plan quick-actions, D5): they reuse
// the form's writes (Google first, series scopes) and answer a result
// instead of redirecting.

export type QuickResult =
  | { ok: true; id: string; undo?: UndoToken }
  | { ok: false; error: string; gone?: GoneDone; loss?: Loss };

export interface ScopeOptions {
  scope?: SeriesScope;
  confirmLoss?: boolean;
}

export const NOT_FOUND: QuickResult = {
  ok: false,
  error: CALENDAR_MESSAGES.notFound,
};

export function readScope(options: ScopeOptions): SeriesScope | null {
  return options.scope && SERIES_SCOPES.includes(options.scope)
    ? options.scope
    : null;
}

/** The event with only the change applied: everything else stays (RF-18). */
function withChange(event: EventRecord, change: Change): EventData {
  return {
    title: event.title,
    calendarId: event.calendarId,
    description: event.description,
    location: event.location,
    categoryId: event.categoryId,
    color: change.kind === "color" ? change.color : event.color,
    startsAt: change.kind === "times" ? change.startsAt : event.startsAt,
    endsAt: change.kind === "times" ? change.endsAt : event.endsAt,
    allDay: change.kind === "times" ? change.allDay : event.allDay,
  };
}

/** What planSeriesChange reads from the form: the same rule, the new date. */
function seriesValues(
  event: EventRecord,
  data: EventData,
  timeZone: string,
): EventFormValues {
  return {
    title: data.title,
    calendarId: data.calendarId,
    allDay: data.allDay ? "on" : "",
    startDate: data.allDay
      ? utcDateKey(data.startsAt)
      : zonedDateKey(data.startsAt, timeZone),
    startTime: "",
    endDate: "",
    endTime: "",
    description: data.description ?? "",
    location: data.location ?? "",
    color: data.color ?? "",
    categoryId: data.categoryId ?? "",
    repeat: event.series ? `custom:${event.series.recurrence}` : "none",
  };
}

function before(event: EventRecord, change: Change): Change {
  return change.kind === "color"
    ? { kind: "color", color: event.color }
    : {
        kind: "times",
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        allDay: event.allDay,
      };
}

/** A form state as a quick result: its first message, or the loss to confirm. */
export function fromState(state: EventFormState): QuickResult {
  if (state.loss) return { ok: false, error: "", loss: state.loss };
  const field = Object.values(state.fieldErrors ?? {}).find(Boolean);
  return {
    ok: false,
    error: state.formError ?? field ?? CALENDAR_MESSAGES.notFound,
  };
}

export async function updatedAtOf(
  supabase: Supabase,
  id: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("events")
    .select("updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data?.updated_at ?? "";
}

/** Writes a change to an event already read; shared with undoAction. */
export async function applyChange(
  supabase: Supabase,
  event: EventRecord,
  change: Change,
  options: ScopeOptions & { timeZone: string },
): Promise<QuickResult> {
  const data = withChange(event, change);
  const values = seriesValues(event, data, options.timeZone);
  const scope = readScope(options);
  const saved = event.series
    ? await changeOccurrence(
        supabase,
        { ...event, series: event.series },
        {
          data,
          values,
          scope,
          confirmLoss: Boolean(options.confirmLoss),
          timeZone: options.timeZone,
        },
      )
    : await updateSingle(supabase, event, data, values);

  if (isGoneDone(saved)) {
    refresh();
    return { ok: false, gone: saved, error: goneText(saved) };
  }
  if (!("id" in saved)) return fromState(saved);
  refresh();
  // Undoing a cut or the whole series is not "the values of before" (plan D10).
  if (event.series && scope !== "this") return { ok: true, id: saved.id };
  return {
    ok: true,
    id: saved.id,
    undo: {
      kind: "change",
      id: saved.id,
      before: before(event, change),
      updatedAt: await updatedAtOf(supabase, saved.id),
      series: Boolean(event.series),
    },
  };
}
