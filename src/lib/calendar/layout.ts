// Pure layout of events into days, banners and overlap columns for the
// month, week and day views (spec 002 RF-20, RF-21, RF-35, RF-39, RF-40).
import {
  addDays,
  utcDateKey,
  utcToZonedParts,
  zonedDateKey,
} from "./time-zone";

export interface LayoutEventInput {
  id: string;
  /** ISO timestamps as returned by Postgres (`+00:00` offsets are fine). */
  startsAt: string;
  endsAt: string;
  allDay: boolean;
}

const DAY_MS = 86_400_000;
const MINUTES_PER_DAY = 1440;
// Overlap is computed on at least this many minutes so short and zero-length
// events do not stack on top of each other.
const MIN_BLOCK_MINUTES = 15;
// shortcut: events longer than a year are cut off here, lift the cap if they appear.
const MAX_SPAN_DAYS = 366;

function listKeys(first: string, last: string): string[] {
  const keys: string[] = [];
  for (
    let key = first;
    key <= last && keys.length < MAX_SPAN_DAYS;
    key = addDays(key, 1)
  ) {
    keys.push(key);
  }
  return keys;
}

/** Every local day the event touches (RF-21). All-day events use their UTC dates (plan D6). */
export function eventDayKeys(
  event: LayoutEventInput,
  timeZone: string,
): string[] {
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);

  if (event.allDay) {
    const first = utcDateKey(start);
    const last = utcDateKey(end - DAY_MS);
    return listKeys(first, last < first ? first : last);
  }

  const first = zonedDateKey(start, timeZone);
  // An event ending exactly at midnight does not occupy the next day.
  const last = zonedDateKey(end > start ? end - 1 : start, timeZone);
  return listKeys(first, last);
}

/**
 * Shown in the highlighted strip instead of the time grid (RF-35): all-day
 * events and timed events of a day or more over several days. An overnight
 * event under 24 h stays in the grid and appears on both days.
 */
export function isBanner(event: LayoutEventInput, timeZone: string): boolean {
  if (event.allDay) return true;
  const duration = Date.parse(event.endsAt) - Date.parse(event.startsAt);
  return duration >= DAY_MS && eventDayKeys(event, timeZone).length > 1;
}

export interface DayItem<T extends LayoutEventInput> {
  event: T;
  banner: boolean;
}

/** Events of one day: banners first, then by start time (RF-35, RF-39). */
export function dayEvents<T extends LayoutEventInput>(
  events: readonly T[],
  dayKey: string,
  timeZone: string,
): DayItem<T>[] {
  return events
    .filter((event) => eventDayKeys(event, timeZone).includes(dayKey))
    .map((event) => ({ event, banner: isBanner(event, timeZone) }))
    .sort((a, b) => {
      if (a.banner !== b.banner) return a.banner ? -1 : 1;
      return (
        Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt) ||
        Date.parse(b.event.endsAt) - Date.parse(a.event.endsAt) ||
        a.event.id.localeCompare(b.event.id)
      );
    });
}

/** First `max` items plus how many are left, for the "+N más" indicator (RF-39). */
export function splitVisible<T>(
  items: readonly T[],
  max: number,
): { visible: T[]; hidden: number } {
  return {
    visible: items.slice(0, max),
    hidden: Math.max(0, items.length - max),
  };
}

export interface TimedSlot<T extends LayoutEventInput> {
  event: T;
  /** Minutes from local midnight, clipped to the day. */
  startMinute: number;
  endMinute: number;
  column: number;
  /** Columns of the overlap group this slot belongs to. */
  columns: number;
}

function minuteOfDay(instant: number, timeZone: string): number {
  const { hour, minute } = utcToZonedParts(instant, timeZone);
  return hour * 60 + minute;
}

/** Time-grid slots of one day with side-by-side columns for overlaps (RF-40). */
export function layoutTimedDay<T extends LayoutEventInput>(
  events: readonly T[],
  dayKey: string,
  timeZone: string,
): TimedSlot<T>[] {
  const segments = events
    .filter(
      (event) =>
        !isBanner(event, timeZone) &&
        eventDayKeys(event, timeZone).includes(dayKey),
    )
    .map((event) => {
      const start = Date.parse(event.startsAt);
      const end = Date.parse(event.endsAt);
      const startMinute =
        zonedDateKey(start, timeZone) === dayKey
          ? minuteOfDay(start, timeZone)
          : 0;
      const endMinute =
        end <= start
          ? startMinute
          : zonedDateKey(end, timeZone) === dayKey
            ? minuteOfDay(end, timeZone)
            : MINUTES_PER_DAY;
      return {
        event,
        startMinute,
        endMinute,
        blockEnd: Math.max(endMinute, startMinute + MIN_BLOCK_MINUTES),
      };
    })
    .sort(
      (a, b) =>
        a.startMinute - b.startMinute ||
        b.blockEnd - a.blockEnd ||
        a.event.id.localeCompare(b.event.id),
    );

  const slots: TimedSlot<T>[] = [];
  let group: TimedSlot<T>[] = [];
  let columnEnds: number[] = [];
  let groupEnd = 0;

  const closeGroup = () => {
    for (const slot of group) slot.columns = columnEnds.length;
    group = [];
    columnEnds = [];
  };

  for (const segment of segments) {
    if (group.length > 0 && segment.startMinute >= groupEnd) closeGroup();

    let column = columnEnds.findIndex((end) => end <= segment.startMinute);
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = segment.blockEnd;
    groupEnd = Math.max(groupEnd, segment.blockEnd);

    const slot: TimedSlot<T> = {
      event: segment.event,
      startMinute: segment.startMinute,
      endMinute: segment.endMinute,
      column,
      columns: 1,
    };
    group.push(slot);
    slots.push(slot);
  }
  closeGroup();

  return slots;
}

/** An event as the views draw it: color already resolved (own or its calendar's, RF-17). */
export interface CalendarEventItem extends LayoutEventInput {
  title: string;
  color: string;
  calendarId: string;
  categoryId: string | null;
  /** Spec 012 RF-12: the views mark events with images. */
  imageCount?: number;
  /** Spec 014 RF-5: the views mark events with comments and their number. */
  commentCount?: number;
  /** Shown under the title in the hour grid and the agenda (spec 016 RF-41, RF-54). */
  location?: string | null;
  /** Series of an occurrence: the views mark it as repeating (spec 013 RF-10). */
  seriesId?: string | null;
}
