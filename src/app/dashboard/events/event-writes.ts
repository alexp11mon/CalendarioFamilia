import { revalidatePath } from "next/cache";
import {
  CALENDAR_MESSAGES,
  getCalendarErrorMessage,
} from "@/lib/calendar/error-messages";
import {
  canSeeEvent,
  type EventRecord,
  type requireActionUser,
} from "@/lib/calendar/queries";
import type {
  EventData,
  EventFormField,
  EventFormValues,
} from "@/lib/calendar/schemas";
import type { ConfirmState, FormState, Loss } from "@/lib/forms/form-state";
import {
  RECURRENCE_MESSAGES,
  recurrenceErrorMessage,
} from "@/lib/recurrence/error-messages";
import {
  planSeriesChange,
  planSeriesDelete,
  type LossQuery,
  type SeriesScope,
} from "@/lib/recurrence/series-write";
import { writeEngineDeps } from "@/lib/sync/engine";
import { goneDone, type GoneDone } from "@/lib/sync/provider-labels";
import { writeErrorText } from "@/lib/sync/write-errors";
import {
  writeEvent,
  type WriteRequest,
  type WriteResult,
} from "@/lib/sync/write-event";

// The writes shared by the form actions (actions.ts) and the quick ones of
// spec 017 (quick-actions.ts, plan D5). Not a "use server" file: its exports
// must not become endpoints.

export type EventFormState = FormState<EventFormField>;
export type Supabase = Awaited<
  ReturnType<typeof requireActionUser>
>["supabase"];
export type Saved = { id: string } | EventFormState;

const FOREIGN_KEY_CODE = "23503";

export function refresh() {
  // Drop the client router cache: the views must show the change.
  revalidatePath("/dashboard", "layout");
}

export function toRow(data: EventData) {
  return {
    calendar_id: data.calendarId,
    title: data.title,
    description: data.description,
    location: data.location,
    starts_at: data.startsAt,
    ends_at: data.endsAt,
    all_day: data.allDay,
    color: data.color,
    category_id: data.categoryId,
  };
}

export function failure(
  error: unknown,
  values: EventFormValues,
): EventFormState {
  // A category of another calendar belongs next to its field (RF-28).
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === FOREIGN_KEY_CODE
  ) {
    return {
      fieldErrors: { categoryId: CALENDAR_MESSAGES.foreignCategory },
      values,
    };
  }
  return { formError: getCalendarErrorMessage(error), values };
}

/**
 * Synced calendars write in Google first (spec 009 plan D3, D4); for normal
 * ones the engine answers "normal" and the action writes as always.
 */
export function syncedWrite(
  supabase: Supabase,
  request: WriteRequest,
): Promise<WriteResult> {
  return writeEvent(request, writeEngineDeps(supabase));
}

/** The event as it is now: its calendar and what Google gets compared with (RF-14). */
export async function currentEvent(supabase: Supabase, id: string) {
  const { data, error } = await supabase
    .from("events")
    .select(
      "calendar_id, title, description, location, starts_at, ends_at, all_day",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function isSyncedCalendar(
  supabase: Supabase,
  calendarId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("synced_calendars")
    .select("calendar_id")
    .eq("calendar_id", calendarId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export function seriesFailure(
  error: unknown,
  values: EventFormValues,
): EventFormState {
  const message = recurrenceErrorMessage(error);
  return message ? { formError: message, values } : failure(error, values);
}

/** What would be lost and was not confirmed yet (RF-19, RF-24b), or null. */
export async function unconfirmedLoss(
  supabase: Supabase,
  seriesId: string,
  query: LossQuery,
  confirmed: boolean,
): Promise<Loss | null> {
  if (!query || confirmed) return null;
  const { data, error } = await supabase.rpc("series_loss", {
    p_series_id: seriesId,
    ...(query.from ? { p_from: query.from } : {}),
    ...(query.only ? { p_only: query.only } : {}),
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row || row.exceptions + row.images + row.comments === 0) return null;
  return {
    exceptions: row.exceptions,
    images: row.images,
    // Spec 014 plan D6: the comments of those exceptions go too.
    comments: row.comments,
  };
}

/**
 * A change to an occurrence in the chosen scope (RF-15 to RF-19, RF-23,
 * RF-32): the id to show afterwards, or the state to answer.
 */
export async function changeOccurrence(
  supabase: Supabase,
  event: EventRecord & { series: NonNullable<EventRecord["series"]> },
  input: {
    data: EventData;
    values: EventFormValues;
    scope: SeriesScope | null;
    confirmLoss: boolean;
    timeZone: string;
  },
): Promise<Saved> {
  const { data, values, scope, timeZone } = input;
  if (!scope) return { formError: RECURRENCE_MESSAGES.scope, values };
  // A series never goes to a calendar of Google (RF-29).
  if (
    data.calendarId !== event.calendarId &&
    (await isSyncedCalendar(supabase, data.calendarId))
  ) {
    return { fieldErrors: { repeat: RECURRENCE_MESSAGES.synced }, values };
  }
  const plan = planSeriesChange({
    series: event.series,
    occurrence: event,
    row: toRow(data),
    repeat: values.repeat,
    startDate: values.startDate,
    scope,
    timeZone,
  });
  if (plan.kind === "error") {
    return plan.field
      ? { fieldErrors: { [plan.field]: plan.message }, values }
      : { formError: plan.message, values };
  }
  const loss = await unconfirmedLoss(
    supabase,
    event.series.id,
    plan.loss,
    input.confirmLoss,
  );
  if (loss) return { loss, values };
  // Each function's arguments come from planSeriesChange, tested there.
  const { data: id, error } = await supabase.rpc(plan.fn, plan.args as never);
  if (error) return seriesFailure(error, values);
  return { id: id as string };
}

/** A single event, through Google when its calendar is synced (spec 009 RF-11). */
export async function updateSingle(
  supabase: Supabase,
  event: EventRecord,
  data: EventData,
  values: EventFormValues,
): Promise<Saved | GoneDone> {
  const synced = await syncedWrite(supabase, {
    op: "update",
    eventId: event.id,
    calendarId: event.calendarId,
    before: {
      title: event.title,
      description: event.description,
      location: event.location,
      starts_at: event.startsAt,
      ends_at: event.endsAt,
      all_day: event.allDay,
    },
    row: toRow(data),
  });
  if (synced.status === "failed") {
    return {
      formError: writeErrorText(synced.failure, synced.provider),
      values,
    };
  }
  if (synced.status === "dbError") return failure(synced.error, values);
  if (synced.status === "gone") return goneDone(synced.provider);
  if (synced.status === "normal") {
    // Changing calendar is checked by RLS on both sides (RF-27).
    const { data: rows, error } = await supabase
      .from("events")
      .update(toRow(data))
      .eq("id", event.id)
      .select("id");
    if (error) return failure(error, values);
    if (!rows || rows.length === 0) {
      // RLS hides rows without an error (RF-25).
      return {
        formError: (await canSeeEvent(supabase, event.id))
          ? CALENDAR_MESSAGES.forbidden
          : CALENDAR_MESSAGES.notFound,
        values,
      };
    }
  }
  return { id: event.id };
}

/**
 * Deleting occurrences in the chosen scope (spec 013 RF-20), once the images
 * that go with them are confirmed (RF-24b).
 */
export async function deleteOccurrences(
  supabase: Supabase,
  series: NonNullable<EventRecord["series"]>,
  scope: SeriesScope | null,
  confirmLoss: boolean,
): Promise<ConfirmState | null> {
  if (!scope) return { formError: RECURRENCE_MESSAGES.scope };
  const plan = planSeriesDelete(series, scope);
  const loss = await unconfirmedLoss(
    supabase,
    series.id,
    plan.loss,
    confirmLoss,
  );
  if (loss) return { loss };
  // The arguments come from planSeriesDelete, tested there.
  const { error } = await supabase.rpc(
    "delete_occurrences",
    plan.args as never,
  );
  if (error) {
    return {
      formError:
        recurrenceErrorMessage(error) ?? getCalendarErrorMessage(error),
    };
  }
  return null;
}

/** A single event, through Google when its calendar is synced (spec 009 RF-12). */
export async function deleteSingle(
  supabase: Supabase,
  id: string,
  mode: unknown,
): Promise<ConfirmState | null> {
  try {
    const current = await currentEvent(supabase, id);
    if (!current) return { formError: CALENDAR_MESSAGES.notFound };
    const synced = await syncedWrite(supabase, {
      op: "delete",
      eventId: id,
      calendarId: current.calendar_id,
    });
    if (synced.status === "failed") {
      return { formError: writeErrorText(synced.failure, synced.provider) };
    }
    if (synced.status === "dbError") {
      return { formError: getCalendarErrorMessage(synced.error) };
    }
    if (synced.status === "gone") {
      refresh();
      return mode === "modal"
        ? { done: goneDone(synced.provider) }
        : { formError: writeErrorText("gone", synced.provider) };
    }

    if (synced.status === "normal") {
      const { data, error } = await supabase
        .from("events")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) return { formError: getCalendarErrorMessage(error) };
      if (!data || data.length === 0) {
        return {
          formError: (await canSeeEvent(supabase, id))
            ? CALENDAR_MESSAGES.forbidden
            : CALENDAR_MESSAGES.notFound,
        };
      }
    }
  } catch (error) {
    return { formError: getCalendarErrorMessage(error) };
  }
  return null;
}
