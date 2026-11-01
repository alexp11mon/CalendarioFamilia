// Where a dragged, resized or nudged event lands (spec 017 RF-5 to RF-17,
// RF-19, RF-64, plan drag-core, D1). Pure: the gesture hook gives minutes and
// days, this answers the new times, or null when nothing changes.
import { formatDayHeading } from "./format";
import { daysBetween } from "./ranges";
import {
  addDays,
  allDayToRange,
  formatTime,
  parseDateKey,
  utcDateKey,
  utcToZonedParts,
  zonedDateKey,
  zonedLocalToUtc,
} from "./time-zone";

export interface Times {
  startsAt: string;
  endsAt: string;
  allDay: boolean;
}

const STEP = 15;
const DAY_MINUTES = 24 * 60;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

const snap = (minutes: number) => Math.round(minutes / STEP) * STEP;
const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), high);

/** How far the pointer moved, in whole quarters (RF-5). */
export function minuteDelta(fromMinute: number, toMinute: number): number {
  return snap(toMinute - fromMinute);
}

export function sameTimes(a: Times, b: Times): boolean {
  return (
    a.allDay === b.allDay &&
    Date.parse(a.startsAt) === Date.parse(b.startsAt) &&
    Date.parse(a.endsAt) === Date.parse(b.endsAt)
  );
}

function minuteOfDay(instant: number, timeZone: string): number {
  const { hour, minute } = utcToZonedParts(instant, timeZone);
  return hour * 60 + minute;
}

/**
 * The instant of `minute` on `day`. A spring hour that does not exist goes
 * to the first valid one, the end of the gap (case "cambio de hora").
 */
function wallClock(day: string, minute: number, timeZone: string): number {
  const parts = parseDateKey(day)!;
  let instant = zonedLocalToUtc(
    { ...parts, hour: Math.floor(minute / 60), minute: minute % 60 },
    timeZone,
  ).getTime();
  // zonedLocalToUtc moves 02:30 to 03:30; walk back to 03:00.
  while (
    zonedDateKey(instant - STEP * MINUTE_MS, timeZone) === day &&
    minuteOfDay(instant - STEP * MINUTE_MS, timeZone) > minute
  ) {
    instant -= STEP * MINUTE_MS;
  }
  return instant;
}

function timed(start: number, end: number): Times {
  return {
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
    allDay: false,
  };
}

function changed(before: Times, after: Times): Times | null {
  return sameTimes(before, after) ? null : after;
}

/**
 * A timed event moved by whole days and minutes: same duration, start in
 * quarters and inside its day (RF-5, RF-7, case of multi-day timed events).
 * An exact delta (the keyboard) keeps an odd start as it is.
 */
export function moveTimed(
  event: Times,
  delta: { days: number; minutes: number },
  timeZone: string,
  exact = false,
): Times | null {
  if (delta.days === 0 && delta.minutes === 0) return null;
  const start = Date.parse(event.startsAt);
  const duration = Date.parse(event.endsAt) - start;
  const day = addDays(zonedDateKey(start, timeZone), delta.days);
  let minute = minuteOfDay(start, timeZone) + delta.minutes;
  if (!exact && delta.minutes !== 0) minute = snap(minute);
  minute = clamp(minute, 0, DAY_MINUTES - STEP);
  const next = wallClock(day, minute, timeZone);
  return changed(event, timed(next, next + duration));
}

/**
 * New end at `minute` of the event's first day, in quarters and at least 15
 * minutes after the start (RF-10, RF-12). The part of an overnight event on
 * the next day is never resized (case "cruza la medianoche").
 */
export function resizeEnd(
  event: Times,
  minute: number,
  timeZone: string,
): Times | null {
  const start = Date.parse(event.startsAt);
  const day = zonedDateKey(start, timeZone);
  const startMinute = minuteOfDay(start, timeZone);
  const endMinute = clamp(snap(minute), startMinute + STEP, DAY_MINUTES);
  const end =
    endMinute === DAY_MINUTES
      ? wallClock(addDays(day, 1), 0, timeZone)
      : wallClock(day, endMinute, timeZone);
  return changed(event, timed(start, Math.max(end, start + STEP * MINUTE_MS)));
}

/** Dropped on the all-day strip: an all-day event of that day (RF-13). */
export function toAllDay(event: Times, day: string): Times | null {
  return changed(event, { ...allDayToRange(day, day), allDay: true });
}

function allDayLength(event: Times): number {
  return Math.max(
    1,
    Math.round(
      (Date.parse(event.endsAt) - Date.parse(event.startsAt)) / DAY_MS,
    ),
  );
}

/** A one-day all-day event dropped on the grid: 1 h from there (RF-14). */
export function toTimed(
  event: Times,
  day: string,
  minute: number,
  timeZone: string,
): Times | null {
  if (allDayLength(event) > 1) return null;
  const start = wallClock(
    day,
    clamp(snap(minute), 0, DAY_MINUTES - STEP),
    timeZone,
  );
  return timed(start, start + 60 * MINUTE_MS);
}

/** An all-day event moved by whole days, keeping how many it lasts (RF-15). */
export function moveAllDay(event: Times, days: number): Times | null {
  if (days === 0) return null;
  const first = addDays(utcDateKey(event.startsAt), days);
  return {
    ...allDayToRange(first, addDays(first, allDayLength(event) - 1)),
    allDay: true,
  };
}

/**
 * Month view: the first day goes to the day it is dropped on, keeping the
 * hour, the duration and the number of days (RF-16, RF-17).
 */
export function moveInMonth(
  event: Times,
  day: string,
  timeZone: string,
): Times | null {
  if (event.allDay) {
    return moveAllDay(event, daysBetween(utcDateKey(event.startsAt), day));
  }
  const first = zonedDateKey(event.startsAt, timeZone);
  return moveTimed(
    event,
    { days: daysBetween(first, day), minutes: 0 },
    timeZone,
    true,
  );
}

export type Nudge = "earlier" | "later" | "previousDay" | "nextDay";

/** Alt + arrows: 15 minutes or a day (RF-64). All-day events only change day. */
export function nudge(
  event: Times,
  direction: Nudge,
  timeZone: string,
): Times | null {
  const days =
    direction === "nextDay" ? 1 : direction === "previousDay" ? -1 : 0;
  if (event.allDay) return days ? moveAllDay(event, days) : null;
  const minutes =
    direction === "later" ? STEP : direction === "earlier" ? -STEP : 0;
  return moveTimed(event, { days, minutes }, timeZone, true);
}

/** "martes, 3 de noviembre, 10:00–11:00" for the dragged block and screen readers (RF-8). */
export function describeTimes(event: Times, timeZone: string): string {
  if (event.allDay) {
    return `${formatDayHeading(utcDateKey(event.startsAt))}, todo el día`;
  }
  const day = formatDayHeading(zonedDateKey(event.startsAt, timeZone));
  return `${day}, ${formatTime(event.startsAt, timeZone)}–${formatTime(event.endsAt, timeZone)}`;
}
