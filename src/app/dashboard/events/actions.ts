"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  CALENDAR_MESSAGES,
  getCalendarErrorMessage,
} from "@/lib/calendar/error-messages";
import {
  canSeeEvent,
  getEvent,
  getProfileTimeZone,
  requireActionUser,
  type EventRecord,
} from "@/lib/calendar/queries";
import {
  parseEventInput,
  type EventData,
  type EventFormField,
  type EventFormValues,
} from "@/lib/calendar/schemas";
import {
  readString,
  type ConfirmState,
  type FormState,
  type Loss,
} from "@/lib/forms/form-state";
import {
  RECURRENCE_MESSAGES,
  recurrenceErrorMessage,
} from "@/lib/recurrence/error-messages";
import { resolveRepeat } from "@/lib/recurrence/presets";
import type { RecurrenceRule } from "@/lib/recurrence/rule";
import { parseEventId } from "@/lib/recurrence/occurrence-id";
import {
  planSeriesChange,
  planSeriesDelete,
  seriesColumns,
  SERIES_SCOPES,
  type LossQuery,
  type SeriesScope,
} from "@/lib/recurrence/series-write";
import { writeEngineDeps } from "@/lib/sync/engine";
import { WRITE_ERRORS } from "@/lib/sync/write-errors";
import {
  writeEvent,
  type WriteRequest,
  type WriteResult,
} from "@/lib/sync/write-event";

type EventFormState = FormState<EventFormField>;

const FOREIGN_KEY_CODE = "23503";

function readEventValues(formData: FormData): EventFormValues {
  return {
    title: readString(formData, "title"),
    calendarId: readString(formData, "calendarId"),
    allDay: formData.get("allDay") === "on" ? "on" : "",
    startDate: readString(formData, "startDate"),
    startTime: readString(formData, "startTime"),
    endDate: readString(formData, "endDate"),
    endTime: readString(formData, "endTime"),
    description: readString(formData, "description"),
    location: readString(formData, "location"),
    color: readString(formData, "color"),
    categoryId: readString(formData, "categoryId"),
    repeat: readString(formData, "repeat") || "none",
  };
}

// Inside the event window the form sends mode=modal: answer with a state so the
// window closes itself and the calendar stays where it was (spec 008 RF-8, plan D2).
function inWindow(formData: FormData): boolean {
  return formData.get("mode") === "modal";
}

function refresh() {
  // Drop the client router cache: the views must show the change.
  revalidatePath("/dashboard", "layout");
}

function toRow(data: EventData) {
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

function failure(error: unknown, values: EventFormValues): EventFormState {
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

type Supabase = Awaited<ReturnType<typeof requireActionUser>>["supabase"];

/**
 * Synced calendars write in Google first (spec 009 plan D3, D4); for normal
 * ones the engine answers "normal" and the action writes as always.
 */
function syncedWrite(
  supabase: Supabase,
  request: WriteRequest,
): Promise<WriteResult> {
  return writeEvent(request, writeEngineDeps(supabase));
}

/** The event as it is now: its calendar and what Google gets compared with (RF-14). */
async function currentEvent(supabase: Supabase, id: string) {
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

/** Deleted in Google meanwhile: CaFam already removed it (spec 009 RF-25). */
function gone(formData: FormData, values: EventFormValues): EventFormState {
  refresh();
  if (inWindow(formData)) return { done: "gone", values };
  return { formError: WRITE_ERRORS.gone, values };
}

function parseForm(values: EventFormValues, timeZone: string) {
  return parseEventInput(
    { ...values, allDay: values.allDay === "on" },
    timeZone,
  );
}

async function isSyncedCalendar(
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

function seriesFailure(
  error: unknown,
  values: EventFormValues,
): EventFormState {
  const message = recurrenceErrorMessage(error);
  return message ? { formError: message, values } : failure(error, values);
}

/** What would be lost and was not confirmed yet (RF-19, RF-24b), or null. */
async function unconfirmedLoss(
  supabase: Supabase,
  seriesId: string,
  query: LossQuery,
  formData: FormData,
): Promise<Loss | null> {
  if (!query || formData.get("confirmLoss") === "1") return null;
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

function readScope(formData: FormData): SeriesScope | null {
  const scope = readString(formData, "scope");
  return (SERIES_SCOPES as readonly string[]).includes(scope)
    ? (scope as SeriesScope)
    : null;
}

type Saved = { id: string } | EventFormState;

/**
 * A change to an occurrence in the chosen scope (RF-15 to RF-19, RF-23,
 * RF-32): the id to show afterwards, or the state to answer.
 */
async function changeOccurrence(
  supabase: Supabase,
  event: EventRecord & { series: NonNullable<EventRecord["series"]> },
  input: {
    data: EventData;
    values: EventFormValues;
    formData: FormData;
    timeZone: string;
  },
): Promise<Saved> {
  const { data, values, formData, timeZone } = input;
  const scope = readScope(formData);
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
    formData,
  );
  if (loss) return { loss, values };
  // Each function's arguments come from planSeriesChange, tested there.
  const { data: id, error } = await supabase.rpc(plan.fn, plan.args as never);
  if (error) return seriesFailure(error, values);
  return { id: id as string };
}

/**
 * A single event becomes a series (RF-21). With images it stays as the first
 * occurrence of a new series row, which never holds images (plan D7).
 */
async function convertToSeries(
  supabase: Supabase,
  event: EventRecord,
  input: {
    data: EventData;
    rule: RecurrenceRule;
    timeZone: string;
    values: EventFormValues;
  },
): Promise<Saved> {
  const { data, rule, timeZone, values } = input;
  if (await isSyncedCalendar(supabase, data.calendarId)) {
    return { fieldErrors: { repeat: RECURRENCE_MESSAGES.synced }, values };
  }
  const columns = seriesColumns(data, rule, timeZone);
  if (!columns) {
    return { fieldErrors: { repeat: RECURRENCE_MESSAGES.empty }, values };
  }
  const { count, error: countError } = await supabase
    .from("event_images")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id);
  if (countError) throw countError;

  if (!count) {
    const { error } = await supabase
      .from("events")
      .update({ ...toRow(data), ...columns })
      .eq("id", event.id);
    return error ? seriesFailure(error, values) : { id: event.id };
  }

  const { data: series, error } = await supabase
    .from("events")
    .insert({ ...toRow(data), ...columns, created_by: event.createdBy })
    .select("id")
    .single();
  if (error) return seriesFailure(error, values);
  const { error: attachError } = await supabase
    .from("events")
    .update({
      ...toRow(data),
      starts_at: columns.starts_at,
      ends_at: columns.ends_at,
      series_id: series.id,
      original_start: columns.starts_at,
    })
    .eq("id", event.id);
  if (attachError) {
    // Two writes: undo the first so the event is not shown twice.
    await supabase.from("events").delete().eq("id", series.id);
    return seriesFailure(attachError, values);
  }
  return { id: event.id };
}

/** A single event, through Google when its calendar is synced (spec 009 RF-11). */
async function updateSingle(
  supabase: Supabase,
  event: EventRecord,
  data: EventData,
  values: EventFormValues,
): Promise<Saved | "gone"> {
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
    return { formError: WRITE_ERRORS[synced.failure], values };
  }
  if (synced.status === "dbError") return failure(synced.error, values);
  if (synced.status === "gone") return "gone";
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
 * A new series (spec 013 RF-6, RF-8): never in a calendar of Google (RF-29),
 * starting at its first occurrence, with the creator's zone (RF-12).
 */
async function createSeries(
  supabase: Supabase,
  userId: string,
  input: {
    data: EventData;
    rule: RecurrenceRule;
    timeZone: string;
    values: EventFormValues;
  },
): Promise<{ id: string } | EventFormState> {
  const { data, rule, timeZone, values } = input;
  if (await isSyncedCalendar(supabase, data.calendarId)) {
    return { fieldErrors: { repeat: RECURRENCE_MESSAGES.synced }, values };
  }
  const columns = seriesColumns(data, rule, timeZone);
  if (!columns) {
    return { fieldErrors: { repeat: RECURRENCE_MESSAGES.empty }, values };
  }
  const { data: row, error } = await supabase
    .from("events")
    .insert({ ...toRow(data), ...columns, created_by: userId })
    .select("id")
    .single();
  if (error) return seriesFailure(error, values);
  return { id: row.id };
}

export async function createEvent(
  _prevState: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const values = readEventValues(formData);
  const { supabase, userId } = await requireActionUser();

  let id: string;
  try {
    // The zone comes from the profile, never from the client (RF-34).
    const timeZone = await getProfileTimeZone(supabase, userId);
    const parsed = parseForm(values, timeZone);
    const repeat = resolveRepeat(values.repeat, values.startDate);
    if (!parsed.ok || !repeat.ok) {
      return {
        fieldErrors: {
          ...(parsed.ok ? {} : parsed.fieldErrors),
          ...(repeat.ok ? {} : { repeat: RECURRENCE_MESSAGES.invalid }),
        },
        values,
      };
    }

    if (repeat.rule) {
      const created = await createSeries(supabase, userId, {
        data: parsed.data,
        rule: repeat.rule,
        timeZone,
        values,
      });
      if (!("id" in created)) return created;
      id = created.id;
    } else {
      const synced = await syncedWrite(supabase, {
        op: "create",
        row: toRow(parsed.data),
      });
      if (synced.status === "failed") {
        return { formError: WRITE_ERRORS[synced.failure], values };
      }
      if (synced.status === "dbError") return failure(synced.error, values);
      if (synced.status === "done") {
        id = synced.eventId;
      } else {
        const { data, error } = await supabase
          .from("events")
          .insert({ ...toRow(parsed.data), created_by: userId })
          .select("id")
          .single();
        if (error) return failure(error, values);
        id = data.id;
      }
    }
  } catch (error) {
    return failure(error, values);
  }

  refresh();
  // With images to upload the form needs the id first (spec 012 RF-7, plan D11).
  if (inWindow(formData) || formData.get("images") === "1") {
    return { done: "created", values, eventId: id };
  }
  redirect(`/dashboard/events/${id}`);
}

export async function updateEvent(
  id: string,
  _prevState: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const values = readEventValues(formData);
  // An occurrence of a series has its own kind of id (spec 013 RF-9).
  if (!parseEventId(id)) {
    return { formError: CALENDAR_MESSAGES.notFound, values };
  }
  const { supabase, userId } = await requireActionUser();

  let saved: Saved | "gone";
  try {
    const timeZone = await getProfileTimeZone(supabase, userId);
    const parsed = parseForm(values, timeZone);
    if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values };

    const event = await getEvent(supabase, id);
    if (!event) return { formError: CALENDAR_MESSAGES.notFound, values };

    const repeat = resolveRepeat(values.repeat, values.startDate);
    if (event.series) {
      saved = await changeOccurrence(
        supabase,
        { ...event, series: event.series },
        { data: parsed.data, values, formData, timeZone },
      );
    } else if (!repeat.ok) {
      return { fieldErrors: { repeat: RECURRENCE_MESSAGES.invalid }, values };
    } else if (repeat.rule) {
      saved = await convertToSeries(supabase, event, {
        data: parsed.data,
        rule: repeat.rule,
        timeZone,
        values,
      });
    } else {
      saved = await updateSingle(supabase, event, parsed.data, values);
    }
  } catch (error) {
    return failure(error, values);
  }

  if (saved === "gone") return gone(formData, values);
  if (!("id" in saved)) return saved;
  refresh();
  if (inWindow(formData)) return { done: "updated", values };
  redirect(`/dashboard/events/${saved.id}`);
}

/**
 * Deleting occurrences in the chosen scope (spec 013 RF-20), once the images
 * that go with them are confirmed (RF-24b).
 */
async function deleteOccurrences(
  supabase: Supabase,
  series: NonNullable<EventRecord["series"]>,
  formData: FormData | undefined,
): Promise<ConfirmState | null> {
  const scope = formData ? readScope(formData) : null;
  if (!scope) return { formError: RECURRENCE_MESSAGES.scope };
  const plan = planSeriesDelete(series, scope);
  const loss = await unconfirmedLoss(supabase, series.id, plan.loss, formData!);
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

// Bound as deleteEvent(id) or deleteEvent(id, "modal"); useActionState then appends
// its state and form data. Only an occurrence needs the form: it carries the scope.
export async function deleteEvent(
  id: string,
  mode?: unknown,
  ...rest: unknown[]
): Promise<ConfirmState> {
  if (!parseEventId(id)) {
    return { formError: CALENDAR_MESSAGES.notFound };
  }
  const { supabase } = await requireActionUser();
  const formData = [mode, ...rest].find(
    (arg): arg is FormData => arg instanceof FormData,
  );

  let series: EventRecord["series"] = null;
  try {
    series = (await getEvent(supabase, id))?.series ?? null;
    if (series) {
      const failed = await deleteOccurrences(supabase, series, formData);
      if (failed) return failed;
    }
  } catch (error) {
    return { formError: getCalendarErrorMessage(error) };
  }

  if (!series) {
    const failed = await deleteSingle(supabase, id, mode);
    if (failed) return failed;
  }

  refresh();
  if (mode === "modal") return { done: "deleted" };
  redirect("/dashboard/calendar");
}

/** A single event, through Google when its calendar is synced (spec 009 RF-12). */
async function deleteSingle(
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
      return { formError: WRITE_ERRORS[synced.failure] };
    }
    if (synced.status === "dbError") {
      return { formError: getCalendarErrorMessage(synced.error) };
    }
    if (synced.status === "gone") {
      refresh();
      return mode === "modal"
        ? { done: "gone" }
        : { formError: WRITE_ERRORS.gone };
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
