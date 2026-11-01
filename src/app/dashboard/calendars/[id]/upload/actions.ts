"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AUTH_MESSAGES } from "@/lib/auth/error-messages";
import { CALENDAR_MESSAGES } from "@/lib/calendar/error-messages";
import { getProfileTimeZone, requireActionUser } from "@/lib/calendar/queries";
import { readString, type FormState } from "@/lib/forms/form-state";
import { writeEngineDeps } from "@/lib/sync/engine";
import { uploadCalendar } from "@/lib/sync/upload-calendar";
import { writeErrorText } from "@/lib/sync/write-errors";
import { calendarEvents, uploadableCalendar } from "./load-upload";

export type UploadState = FormState<"connectionId">;

const LIMIT = "Esa cuenta ya tiene 20 calendarios traídos, el máximo.";
const NO_ACCOUNT = "Elige una de tus cuentas de Google que puedan escribir.";

/** Uploads a CaFam calendar to a connected Google account (spec 009 RF-34 to RF-38). */
export async function uploadToGoogle(
  calendarId: string,
  _prevState: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const values = { connectionId: readString(formData, "connectionId") };
  if (!z.uuid().safeParse(values.connectionId).success) {
    return { fieldErrors: { connectionId: NO_ACCOUNT }, values };
  }
  if (!z.uuid().safeParse(calendarId).success) {
    return { formError: CALENDAR_MESSAGES.notFound, values };
  }

  const { supabase, userId } = await requireActionUser();
  try {
    const calendar = await uploadableCalendar(supabase, userId, calendarId);
    if (!calendar) return { formError: CALENDAR_MESSAGES.notFound, values };

    const result = await uploadCalendar(writeEngineDeps(supabase), {
      calendarId,
      connectionId: values.connectionId,
      name: calendar.name,
      timeZone: await getProfileTimeZone(supabase, userId),
      events: await calendarEvents(supabase, calendarId),
    });
    if (result.status === "failed") {
      return {
        formError: writeErrorText(result.failure, result.provider),
        values,
      };
    }
    if (result.status === "limit") return { formError: LIMIT, values };
    if (result.status === "forbidden" || result.status === "notFound") {
      return { fieldErrors: { connectionId: NO_ACCOUNT }, values };
    }
    if (result.status === "dbError") {
      return { formError: AUTH_MESSAGES.connection, values };
    }
  } catch {
    return { formError: AUTH_MESSAGES.connection, values };
  }

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/calendars");
}
