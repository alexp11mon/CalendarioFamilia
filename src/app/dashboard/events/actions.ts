"use server";

import { redirect } from "next/navigation";
import {
  CALENDAR_MESSAGES,
  getCalendarErrorMessage,
} from "@/lib/calendar/error-messages";
import {
  getEvent,
  getProfileTimeZone,
  requireActionUser,
  type EventRecord,
} from "@/lib/calendar/queries";
import {
  parseEventInput,
  type EventData,
  type EventFormValues,
} from "@/lib/calendar/schemas";
import { readString, type ConfirmState } from "@/lib/forms/form-state";
import { RECURRENCE_MESSAGES } from "@/lib/recurrence/error-messages";
import { resolveRepeat } from "@/lib/recurrence/presets";
import type { RecurrenceRule } from "@/lib/recurrence/rule";
import { parseEventId } from "@/lib/recurrence/occurrence-id";
import {
  seriesColumns,
  SERIES_SCOPES,
  type SeriesScope,
} from "@/lib/recurrence/series-write";
import { WRITE_ERRORS } from "@/lib/sync/write-errors";
import {
  changeOccurrence,
  deleteOccurrences,
  deleteSingle,
  failure,
  isSyncedCalendar,
  refresh,
  seriesFailure,
  syncedWrite,
  toRow,
  updateSingle,
  type EventFormState,
  type Saved,
  type Supabase,
} from "./event-writes";

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

function readScope(formData: FormData): SeriesScope | null {
  const scope = readString(formData, "scope");
  return (SERIES_SCOPES as readonly string[]).includes(scope)
    ? (scope as SeriesScope)
    : null;
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
        {
          data: parsed.data,
          values,
          scope: readScope(formData),
          confirmLoss: formData.get("confirmLoss") === "1",
          timeZone,
        },
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
      const failed = await deleteOccurrences(
        supabase,
        series,
        formData ? readScope(formData) : null,
        formData?.get("confirmLoss") === "1",
      );
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
