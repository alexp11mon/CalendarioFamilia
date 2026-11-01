import ICAL from "ical.js";
import { convertOccurrences, instantOf } from "@/lib/ics/convert-events";
import {
  isCancelled,
  occurrenceOf,
  toTime,
  zoneOf,
  type IcsOccurrence,
} from "@/lib/ics/parse-ics";
import type { ConvertResult, SyncedEventRow } from "./event-row";

// Server-only: iCloud's .ics resources to and from CaFam rows (spec 018 plan
// D5 to D7). CaFam expands series itself with ical.js, as the import does.

/** Floating times have no zone; read them in the default profile zone (spec 001). */
const FLOATING_ZONE = "Europe/Madrid";

export interface Window {
  from: Date;
  to: Date;
}

/** `20261102T080000Z` for a time, `20261015` for a date (plan D6). */
function recurrenceKey(time: ICAL.Time, master: ICAL.Component): string | null {
  if (time.isDate) {
    return `${time.year}${pad(time.month)}${pad(time.day)}`;
  }
  const zone = zoneOf(master, "dtstart") ?? { kind: "floating" };
  const instant = instantOf(toTime(time, zone), FLOATING_ZONE);
  if (instant === null) return null;
  return new Date(instant).toISOString().replace(/[-:]|\.\d{3}/g, "");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** The id of a repetition in CaFam: the resource and its RECURRENCE-ID (plan D6). */
export function occurrenceExternalId(href: string, key: string): string {
  return `${href}#${key}`;
}

/** Splits an external id back into the resource and the repetition, if any. */
export function splitExternalId(id: string): {
  href: string;
  recurrenceId: string | null;
} {
  const hash = id.lastIndexOf("#");
  return hash === -1
    ? { href: id, recurrenceId: null }
    : { href: id.slice(0, hash), recurrenceId: id.slice(hash + 1) };
}

function toRow(
  occurrence: IcsOccurrence,
  externalId: string,
): SyncedEventRow | null {
  const { events } = convertOccurrences([occurrence], FLOATING_ZONE);
  return events[0] ? { ...events[0], external_id: externalId } : null;
}

function overlaps(row: SyncedEventRow, window: Window): boolean {
  return (
    Date.parse(row.ends_at) >= window.from.getTime() &&
    Date.parse(row.starts_at) < window.to.getTime()
  );
}

export function parseResource(ics: string): ICAL.Component | null {
  try {
    const root = new ICAL.Component(ICAL.parse(ics));
    return root.name === "vcalendar" ? root : null;
  } catch {
    return null;
  }
}

/**
 * One iCloud resource as CaFam rows: a single event keeps the href as its id;
 * a series expands in the window with EXDATE, modified and cancelled
 * repetitions (RF-21 to RF-25). What cannot be placed is counted in `skipped`.
 */
export function expandObject(
  href: string,
  ics: string,
  window: Window,
): ConvertResult {
  const result: ConvertResult = { events: [], skipped: 0 };
  const root = parseResource(ics);
  if (!root) return { events: [], skipped: 1 };

  const vevents = root
    .getAllSubcomponents("vevent")
    .filter((c) => c.hasProperty("dtstart"));
  const master = vevents.find((c) => !c.hasProperty("recurrence-id"));
  const exceptions = vevents.filter((c) => c.hasProperty("recurrence-id"));

  const push = (row: SyncedEventRow | null) => {
    if (!row) result.skipped++;
    else if (overlaps(row, window)) result.events.push(row);
  };

  if (!master) {
    // Modified repetitions whose series is not in the resource stand on their own.
    for (const exception of exceptions) {
      if (isCancelled(exception)) continue;
      const event = new ICAL.Event(exception);
      const key = recurrenceKey(event.recurrenceId, exception);
      push(
        key === null
          ? null
          : toRow(
              occurrenceOf(exception, event.startDate, event.endDate),
              occurrenceExternalId(href, key),
            ),
      );
    }
    return result;
  }

  if (isCancelled(master)) return result;
  const event = new ICAL.Event(master);
  if (!event.isRecurring()) {
    push(toRow(occurrenceOf(master, event.startDate, event.endDate), href));
    return result;
  }

  for (const exception of exceptions) {
    event.relateException(new ICAL.Event(exception));
  }
  const iterator = event.iterator();
  let next: ICAL.Time | null | undefined;
  while ((next = iterator.next())) {
    const key = recurrenceKey(next, master);
    if (key === null) {
      result.skipped++;
      break;
    }
    const details = event.getOccurrenceDetails(next);
    const item = details.item.component;
    if (isCancelled(item)) continue;
    const row = toRow(
      occurrenceOf(item, details.startDate, details.endDate),
      occurrenceExternalId(href, key),
    );
    if (row && Date.parse(row.starts_at) >= window.to.getTime()) break;
    push(row);
  }
  return result;
}
