"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  CALENDAR_MESSAGES,
  getCalendarErrorMessage,
} from "@/lib/calendar/error-messages";
import { canSeeCalendar, requireActionUser } from "@/lib/calendar/queries";
import {
  calendarSchema,
  parseMergeInput,
  type CalendarField,
  type MergeField,
} from "@/lib/calendar/schemas";
import {
  fieldErrorsFromZod,
  readString,
  type ConfirmState,
  type FormState,
} from "@/lib/forms/form-state";
import { writeEngineDeps } from "@/lib/sync/engine";
import { renameSyncedCalendar } from "@/lib/sync/write-calendar";
import { writeErrorText } from "@/lib/sync/write-errors";

type CalendarFormState = FormState<CalendarField>;

function readCalendarValues(formData: FormData): CalendarFormState["values"] {
  return {
    name: readString(formData, "name"),
    description: readString(formData, "description"),
    color: readString(formData, "color"),
  };
}

export async function createCalendar(
  _prevState: CalendarFormState,
  formData: FormData,
): Promise<CalendarFormState> {
  const values = readCalendarValues(formData);
  const parsed = calendarSchema.safeParse(values);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod<CalendarField>(parsed.error),
      values,
    };
  }

  const { supabase, userId } = await requireActionUser();
  try {
    const { error } = await supabase
      .from("calendars")
      .insert({ owner_id: userId, ...parsed.data });
    if (error) return { formError: getCalendarErrorMessage(error), values };
  } catch (error) {
    return { formError: getCalendarErrorMessage(error), values };
  }

  // Drop the client router cache: the panel and the views must show the change.
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/calendars");
}

/** RLS hides rows without an error, so an empty result is explained afterwards (RF-8). */
async function explainMissing(
  supabase: Awaited<ReturnType<typeof requireActionUser>>["supabase"],
  id: string,
): Promise<string> {
  return (await canSeeCalendar(supabase, id))
    ? CALENDAR_MESSAGES.forbidden
    : CALENDAR_MESSAGES.notFound;
}

export async function updateCalendar(
  id: string,
  _prevState: CalendarFormState,
  formData: FormData,
): Promise<CalendarFormState> {
  const values = readCalendarValues(formData);
  const parsed = calendarSchema.safeParse(values);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod<CalendarField>(parsed.error),
      values,
    };
  }
  if (!z.uuid().safeParse(id).success) {
    return { formError: CALENDAR_MESSAGES.notFound, values };
  }

  const { supabase, userId } = await requireActionUser();
  try {
    // A new name of a synced calendar goes to Google first (spec 009 RF-29, RF-30).
    const synced = await renameSyncedCalendar(writeEngineDeps(supabase), {
      userId,
      calendarId: id,
      name: parsed.data.name,
      description: parsed.data.description,
      color: parsed.data.color,
    });
    if (synced.status === "failed") {
      return {
        formError: writeErrorText(synced.failure, synced.provider),
        values,
      };
    }
    if (synced.status === "forbidden") {
      return { formError: CALENDAR_MESSAGES.forbidden, values };
    }
    if (synced.status === "notFound") {
      return { formError: CALENDAR_MESSAGES.notFound, values };
    }
    if (synced.status === "dbError") {
      return { formError: getCalendarErrorMessage(synced.error), values };
    }
    if (synced.status === "normal") {
      const { data, error } = await supabase
        .from("calendars")
        .update(parsed.data)
        .eq("id", id)
        .select("id");
      if (error) return { formError: getCalendarErrorMessage(error), values };
      if (!data || data.length === 0) {
        return { formError: await explainMissing(supabase, id), values };
      }
    }
  } catch (error) {
    return { formError: getCalendarErrorMessage(error), values };
  }

  // Drop the client router cache: the panel and the views must show the change.
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/calendars");
}

// The state argument useActionState passes is not needed: nothing to carry over.
export async function deleteCalendar(id: string): Promise<ConfirmState> {
  if (!z.uuid().safeParse(id).success) {
    return { formError: CALENDAR_MESSAGES.notFound };
  }

  const { supabase } = await requireActionUser();
  try {
    const { data, error } = await supabase
      .from("calendars")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) return { formError: getCalendarErrorMessage(error) };
    if (!data || data.length === 0) {
      return { formError: await explainMissing(supabase, id) };
    }
  } catch (error) {
    return { formError: getCalendarErrorMessage(error) };
  }

  // Drop the client router cache: the panel and the views must show the change.
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/calendars");
}

type MergeFormState = FormState<MergeField>;

export async function mergeCalendars(
  _prevState: MergeFormState,
  formData: FormData,
): Promise<MergeFormState> {
  const sourceIds = formData
    .getAll("sourceIds")
    .filter((value): value is string => typeof value === "string");
  const raw = {
    sourceIds,
    targetId: readString(formData, "targetId"),
    newName: readString(formData, "newName"),
    newColor: readString(formData, "newColor"),
  };
  const values = { ...raw, sourceIds: sourceIds.join(",") };
  const parsed = parseMergeInput(raw);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values };

  const { supabase } = await requireActionUser();
  try {
    // One transaction in the database: all calendars merge or none does (RF-54).
    const { error } = await supabase.rpc("merge_calendars", {
      p_source_ids: parsed.data.sourceIds,
      p_target_id: parsed.data.targetId ?? undefined,
      p_name: parsed.data.name ?? undefined,
      p_color: parsed.data.color ?? undefined,
    });
    if (error) {
      return { formError: getCalendarErrorMessage(error, "merge"), values };
    }
  } catch (error) {
    return { formError: getCalendarErrorMessage(error, "merge"), values };
  }

  // Drop the client router cache: the panel and the views must show the result.
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/calendars");
}
