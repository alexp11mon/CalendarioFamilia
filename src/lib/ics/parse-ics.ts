import ICAL from "ical.js";
import { COUNT_CAP, HORIZON_MONTHS } from "./limits";

// The only module that imports `ical.js` (plan D1). It reads the .ics and
// expands repetitions, but does not convert time zones: `ical.js` leaves events
// with a TZID as wall-clock times (checked in the plan), so each occurrence
// keeps its wall time and its zone name for `convert-events` (plan D2).

export type IcsZone =
  { kind: "utc" } | { kind: "floating" } | { kind: "tzid"; tzid: string };

export interface IcsTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  allDay: boolean;
  zone: IcsZone;
}

export interface IcsOccurrence {
  uid: string;
  summary: string;
  description: string;
  location: string;
  start: IcsTime;
  /** Null when the event gives neither DTEND nor DURATION. */
  end: IcsTime | null;
}

export type ParseIcsResult =
  | {
      ok: true;
      calendarName: string | null;
      occurrences: IcsOccurrence[];
      /** Open-ended series that had repetitions after the horizon (RF-23). */
      cutSeries: number;
      /** Events and series left out for being cancelled (RF-20). */
      cancelled: number;
      /** Events without a start date, which cannot be placed (RF-29). */
      unreadable: number;
      /** Expansion stopped at the counting cap (plan D8). */
      capped: boolean;
    }
  | { ok: false; error: "not-ics" | "no-events" };

export interface ParseIcsOptions {
  today: { year: number; month: number; day: number };
  horizonMonths?: number;
  cap?: number;
}

export function isCancelled(component: ICAL.Component): boolean {
  const status = component.getFirstPropertyValue("status");
  return typeof status === "string" && status.toUpperCase() === "CANCELLED";
}

export function zoneOf(
  component: ICAL.Component,
  name: "dtstart" | "dtend" | "recurrence-id",
): IcsZone | undefined {
  const property = component.getFirstProperty(name);
  if (!property) return undefined;
  const tzid = property.getParameter("tzid");
  if (typeof tzid === "string" && tzid !== "") return { kind: "tzid", tzid };
  const value = property.getFirstValue();
  if (
    value instanceof ICAL.Time &&
    !value.isDate &&
    value.zone?.tzid === "UTC"
  ) {
    return { kind: "utc" };
  }
  return { kind: "floating" };
}

export function toTime(time: ICAL.Time, zone: IcsZone): IcsTime {
  return {
    year: time.year,
    month: time.month,
    day: time.day,
    hour: time.hour,
    minute: time.minute,
    second: time.second,
    allDay: time.isDate,
    // A date has no time zone: it keeps the day it names (spec 002 convention).
    zone: time.isDate ? { kind: "floating" } : zone,
  };
}

export function occurrenceOf(
  component: ICAL.Component,
  start: ICAL.Time,
  end: ICAL.Time,
): IcsOccurrence {
  const event = new ICAL.Event(component);
  const startZone = zoneOf(component, "dtstart") ?? { kind: "floating" };
  const hasEnd =
    component.hasProperty("dtend") || component.hasProperty("duration");
  return {
    uid: String(component.getFirstPropertyValue("uid") ?? ""),
    summary: event.summary ?? "",
    description: event.description ?? "",
    location: event.location ?? "",
    start: toTime(start, startZone),
    end: hasEnd ? toTime(end, zoneOf(component, "dtend") ?? startZone) : null,
  };
}

function horizonEnd(
  today: ParseIcsOptions["today"],
  months: number,
): ICAL.Time {
  const date = new Date(
    Date.UTC(today.year, today.month - 1 + months, today.day),
  );
  return ICAL.Time.fromData({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: 23,
    minute: 59,
    second: 59,
    isDate: false,
  });
}

/**
 * Reads an .ics: events, repetitions (one occurrence each, up to one year
 * after `today`), exclusions, modified repetitions and cancelled events
 * (RF-13, RF-20, RF-22..RF-25, RF-28).
 */
export function parseIcs(
  text: string,
  options: ParseIcsOptions,
): ParseIcsResult {
  const cap = options.cap ?? COUNT_CAP;
  const limit = horizonEnd(
    options.today,
    options.horizonMonths ?? HORIZON_MONTHS,
  );

  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch {
    return { ok: false, error: "not-ics" };
  }
  if (root.name !== "vcalendar") return { ok: false, error: "not-ics" };

  const groups = new Map<
    string,
    { masters: ICAL.Component[]; exceptions: ICAL.Component[] }
  >();
  let unreadable = 0;
  root.getAllSubcomponents("vevent").forEach((component, index) => {
    if (!component.hasProperty("dtstart")) {
      unreadable++;
      return;
    }
    const uid = String(
      component.getFirstPropertyValue("uid") ?? `no-uid-${index}`,
    );
    const group = groups.get(uid) ?? { masters: [], exceptions: [] };
    groups.set(uid, group);
    (component.hasProperty("recurrence-id")
      ? group.exceptions
      : group.masters
    ).push(component);
  });

  const occurrences: IcsOccurrence[] = [];
  let cancelled = 0;
  let cutSeries = 0;
  let capped = false;

  for (const { masters, exceptions } of groups.values()) {
    if (capped) break;

    // Modified repetitions whose series is not in the file stand on their own.
    if (masters.length === 0) {
      for (const component of exceptions) {
        if (isCancelled(component)) {
          cancelled++;
          continue;
        }
        const event = new ICAL.Event(component);
        occurrences.push(
          occurrenceOf(component, event.startDate, event.endDate),
        );
      }
      continue;
    }

    for (const master of masters) {
      if (isCancelled(master)) {
        cancelled++;
        continue;
      }
      const event = new ICAL.Event(master);
      if (!event.isRecurring()) {
        occurrences.push(occurrenceOf(master, event.startDate, event.endDate));
        continue;
      }

      for (const exception of exceptions) {
        event.relateException(new ICAL.Event(exception));
      }
      const iterator = event.iterator();
      let next: ICAL.Time | null | undefined;
      while ((next = iterator.next())) {
        if (next.compare(limit) > 0) {
          cutSeries++;
          break;
        }
        const details = event.getOccurrenceDetails(next);
        const item = details.item.component;
        if (isCancelled(item)) continue;
        occurrences.push(
          occurrenceOf(item, details.startDate, details.endDate),
        );
        if (occurrences.length > cap) {
          capped = true;
          break;
        }
      }
      if (capped) break;
    }
  }

  if (occurrences.length === 0) return { ok: false, error: "no-events" };
  const name = root.getFirstPropertyValue("x-wr-calname");
  return {
    ok: true,
    calendarName:
      typeof name === "string" && name.trim() !== "" ? name.trim() : null,
    occurrences,
    cutSeries,
    cancelled,
    unreadable,
    capped,
  };
}
