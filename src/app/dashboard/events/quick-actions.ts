"use server";

import { getCalendarErrorMessage } from "@/lib/calendar/error-messages";
import {
  getEvent,
  getProfileTimeZone,
  requireActionUser,
} from "@/lib/calendar/queries";
import { changeSchema, type Change } from "@/lib/calendar/undo";
import { parseEventId } from "@/lib/recurrence/occurrence-id";
import {
  applyChange,
  NOT_FOUND,
  type QuickResult,
  type ScopeOptions,
} from "./quick-writes";

// Changes made without the form: dragging, the context menu and the keyboard
// (spec 017 plan quick-actions, D5). Only actions here: the helpers live in
// quick-writes.ts so they never become endpoints.

/** Moves, resizes or recolors an event (RF-18, RF-36 to RF-38). */
export async function quickChange(
  id: string,
  change: Change,
  options: ScopeOptions = {},
): Promise<QuickResult> {
  const parsed = changeSchema.safeParse(change);
  if (!parseEventId(id) || !parsed.success) return NOT_FOUND;
  const { supabase, userId } = await requireActionUser();
  try {
    // The zone comes from the profile, never from the client (spec 002 RF-34).
    const timeZone = await getProfileTimeZone(supabase, userId);
    const event = await getEvent(supabase, id);
    if (!event) return NOT_FOUND;
    return await applyChange(supabase, event, parsed.data, {
      ...options,
      timeZone,
    });
  } catch (error) {
    return { ok: false, error: getCalendarErrorMessage(error) };
  }
}
