import { convertGoogleEvents } from "../google-events";
import { toGoogleEvent, toGooglePatch } from "../google-payload";
import {
  deleteCalendar,
  deleteEvent,
  insertCalendar,
  insertEvent,
  listCalendars,
  listEvents,
  moveEvent,
  patchCalendar,
  patchEvent,
} from "./google";
import type { ProviderSession } from "./types";

// Google behind the provider interface (spec 018 plan D1): the same calls and
// bodies as specs 007 and 009, now reached through one session per connection.

export function googleSession(
  accessToken: string,
  fetchFn: typeof fetch = fetch,
): ProviderSession {
  return {
    listCalendars: () => listCalendars(accessToken, fetchFn),

    async listEvents(calendarId, range) {
      const { events, accessRole } = await listEvents(
        accessToken,
        calendarId,
        range,
        fetchFn,
      );
      const converted = convertGoogleEvents(events);
      return { ...converted, access: accessRole };
    },

    insertEvent: (calendarId, event) =>
      insertEvent(accessToken, calendarId, toGoogleEvent(event), fetchFn),

    updateEvent: (calendarId, eventId, before, after) =>
      patchEvent(
        accessToken,
        calendarId,
        eventId,
        toGooglePatch(before, after),
        fetchFn,
      ),

    // Google keeps the id when moving (spec 009 RF-19).
    async moveEvent(calendarId, eventId, destination) {
      await moveEvent(accessToken, calendarId, eventId, destination, fetchFn);
      return eventId;
    },

    deleteEvent: (calendarId, eventId) =>
      deleteEvent(accessToken, calendarId, eventId, fetchFn),

    insertCalendar: ({ name, timeZone }) =>
      insertCalendar(accessToken, { summary: name, timeZone }, fetchFn),

    renameCalendar: (calendarId, name) =>
      patchCalendar(accessToken, calendarId, name, fetchFn),

    deleteCalendar: (calendarId) =>
      deleteCalendar(accessToken, calendarId, fetchFn),
  };
}
