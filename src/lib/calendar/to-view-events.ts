import type { CalendarEventItem } from "./layout";
import { DEFAULT_CALENDAR_COLOR } from "./palette";
import type { CalendarEventRecord } from "./queries";

/** An event as the views draw it, with the name of its calendar for the agenda. */
export interface AgendaEvent extends CalendarEventItem {
  location?: string | null;
  calendarName?: string;
}

/** Rows of the database to view events; one without its own color takes its calendar's (spec 002 RF-17). */
export function toViewEvents(
  records: readonly CalendarEventRecord[],
  calendars: readonly { id: string; name: string; color: string }[],
): AgendaEvent[] {
  const byId = new Map(calendars.map((calendar) => [calendar.id, calendar]));
  return records.map((record) => ({
    id: record.id,
    title: record.title,
    startsAt: record.startsAt,
    endsAt: record.endsAt,
    allDay: record.allDay,
    calendarId: record.calendarId,
    categoryId: record.categoryId,
    color:
      record.color ??
      byId.get(record.calendarId)?.color ??
      DEFAULT_CALENDAR_COLOR,
    location: record.location,
    imageCount: record.imageCount,
    commentCount: record.commentCount,
    seriesId: record.seriesId,
    calendarName: byId.get(record.calendarId)?.name ?? "",
  }));
}
