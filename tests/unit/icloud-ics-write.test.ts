// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  expandObject,
  newEventIcs,
  patchIcs,
  removeOccurrence,
} from "@/lib/sync/icloud-ics";
import type { WritableEvent } from "@/lib/sync/google-payload";

// Spec 018, T7: CaFam writes iCloud's .ics keeping what it does not show
// (plan D7; RF-38, RF-39, RF-40, RF-44).
const HREF = "/123/calendars/home/ABC.ics";
const WINDOW = {
  from: new Date("2026-10-01T00:00:00Z"),
  to: new Date("2027-10-01T00:00:00Z"),
};

const TIMED: WritableEvent = {
  title: "Dentista",
  description: "Revisión",
  location: "Calle Mayor 1",
  starts_at: "2026-11-05T09:00:00.000Z",
  ends_at: "2026-11-05T10:00:00.000Z",
  all_day: false,
};

const ALL_DAY: WritableEvent = {
  title: "Cumpleaños",
  description: null,
  location: null,
  starts_at: "2026-11-10T00:00:00.000Z",
  ends_at: "2026-11-11T00:00:00.000Z",
  all_day: true,
};

function rows(ics: string) {
  return expandObject(HREF, ics, WINDOW).events.map(
    ({ external_id, ...row }) => ({ external_id, ...row }),
  );
}

const RICH = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Apple Inc.//iPhone OS 18.0//EN",
  "BEGIN:VEVENT",
  "UID:rich",
  "DTSTAMP:20261001T000000Z",
  "SUMMARY:Dentista",
  "DESCRIPTION:Revisión",
  "LOCATION:Calle Mayor 1",
  "URL:https://example.test/cita",
  "ATTENDEE;CN=Ana:mailto:ana@example.test",
  "ATTACH:https://example.test/receta.pdf",
  "X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC",
  "DTSTART;TZID=Europe/Madrid:20261105T100000",
  "DTEND;TZID=Europe/Madrid:20261105T110000",
  "BEGIN:VALARM",
  "ACTION:DISPLAY",
  "TRIGGER:-PT15M",
  "DESCRIPTION:Aviso",
  "END:VALARM",
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

const SERIES = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:series",
  "DTSTAMP:20261001T000000Z",
  "SUMMARY:Natación",
  "DTSTART;TZID=Europe/Madrid:20261102T090000",
  "DTEND;TZID=Europe/Madrid:20261102T100000",
  "RRULE:FREQ=WEEKLY;COUNT=3",
  "BEGIN:VALARM",
  "ACTION:DISPLAY",
  "TRIGGER:-PT15M",
  "DESCRIPTION:Aviso",
  "END:VALARM",
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

describe("newEventIcs (RF-38)", () => {
  it("writes a timed event in UTC that reads back the same", () => {
    const ics = newEventIcs("uid-1", TIMED);
    expect(ics).toContain("UID:uid-1");
    expect(ics).toContain("DTSTART:20261105T090000Z");
    expect(rows(ics)).toEqual([{ external_id: HREF, ...TIMED }]);
  });

  it("writes an all-day event as dates with an exclusive end", () => {
    const ics = newEventIcs("uid-2", ALL_DAY);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261110");
    expect(ics).toContain("DTEND;VALUE=DATE:20261111");
    expect(ics).not.toMatch(/DESCRIPTION|LOCATION/);
    expect(rows(ics)).toEqual([{ external_id: HREF, ...ALL_DAY }]);
  });

  it("never writes color or category (RF-44)", () => {
    expect(newEventIcs("uid-3", TIMED)).not.toMatch(/COLOR|CATEGORIES/);
  });
});

describe("patchIcs (RF-39)", () => {
  it("changes only the given fields and keeps alarms, guests, links and the unknown", () => {
    const after = { ...TIMED, title: "Dentista (Ana)", location: null };
    const ics = patchIcs(RICH, null, TIMED, after);

    expect(rows(ics)).toEqual([{ external_id: HREF, ...after }]);
    for (const kept of [
      "BEGIN:VALARM",
      "TRIGGER:-PT15M",
      "ATTENDEE;CN=Ana:mailto:ana@example.test",
      "URL:https://example.test/cita",
      "ATTACH:https://example.test/receta.pdf",
      "X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC",
      "DESCRIPTION:Revisión",
      // The times did not change: their zone stays as iCloud wrote it.
      "DTSTART;TZID=Europe/Madrid:20261105T100000",
    ]) {
      expect(ics).toContain(kept);
    }
    expect(ics).not.toContain("LOCATION");
  });

  it("turns a timed event into an all-day one", () => {
    const after = { ...TIMED, ...ALL_DAY, title: TIMED.title };
    const ics = patchIcs(RICH, null, TIMED, after);
    expect(rows(ics)).toMatchObject([
      { all_day: true, starts_at: ALL_DAY.starts_at, ends_at: ALL_DAY.ends_at },
    ]);
    expect(ics).not.toContain("TZID=Europe/Madrid");
  });

  it("changes one repetition in its own VEVENT with RECURRENCE-ID (RF-40)", () => {
    const before: WritableEvent = {
      title: "Natación",
      description: null,
      location: null,
      starts_at: "2026-11-09T08:00:00.000Z",
      ends_at: "2026-11-09T09:00:00.000Z",
      all_day: false,
    };
    const after = {
      ...before,
      title: "Natación (piscina grande)",
      starts_at: "2026-11-09T10:00:00.000Z",
      ends_at: "2026-11-09T11:00:00.000Z",
    };
    const once = patchIcs(SERIES, "20261109T080000Z", before, after);

    expect(
      rows(once).map((r) => [r.external_id, r.title, r.starts_at]),
    ).toEqual([
      [`${HREF}#20261102T080000Z`, "Natación", "2026-11-02T08:00:00.000Z"],
      [
        `${HREF}#20261109T080000Z`,
        "Natación (piscina grande)",
        "2026-11-09T10:00:00.000Z",
      ],
      [`${HREF}#20261116T080000Z`, "Natación", "2026-11-16T08:00:00.000Z"],
    ]);
    // Written like the series' DTSTART, as the iPhone does.
    expect(once).toContain("RECURRENCE-ID;TZID=Europe/Madrid:20261109T090000");
    // The exception keeps the series' alarm, and the series keeps its rule.
    expect(once.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(once.match(/RRULE/g)).toHaveLength(1);

    // Changing it again updates the same VEVENT instead of adding another.
    const twice = patchIcs(once, "20261109T080000Z", after, {
      ...after,
      location: "Piscina municipal",
    });
    expect(twice.match(/RECURRENCE-ID/g)).toHaveLength(1);
    expect(rows(twice)[1]).toMatchObject({
      title: "Natación (piscina grande)",
      location: "Piscina municipal",
    });
  });
});

describe("removeOccurrence (RF-40)", () => {
  it("adds an EXDATE and drops the repetition's own VEVENT", () => {
    const before: WritableEvent = {
      title: "Natación",
      description: null,
      location: null,
      starts_at: "2026-11-09T08:00:00.000Z",
      ends_at: "2026-11-09T09:00:00.000Z",
      all_day: false,
    };
    const changed = patchIcs(SERIES, "20261109T080000Z", before, {
      ...before,
      title: "Cambiada",
    });
    const ics = removeOccurrence(changed, "20261109T080000Z");

    expect(ics).not.toContain("RECURRENCE-ID");
    expect(ics).toContain("EXDATE;TZID=Europe/Madrid:20261109T090000");
    expect(rows(ics).map((r) => r.external_id)).toEqual([
      `${HREF}#20261102T080000Z`,
      `${HREF}#20261116T080000Z`,
    ]);
  });

  it("removes an all-day repetition by its date", () => {
    const monthly = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:monthly",
      "DTSTAMP:20261001T000000Z",
      "SUMMARY:Recibo",
      "DTSTART;VALUE=DATE:20261015",
      "DTEND;VALUE=DATE:20261016",
      "RRULE:FREQ=MONTHLY;COUNT=2",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");
    const ics = removeOccurrence(monthly, "20261015");
    expect(ics).toContain("EXDATE;VALUE=DATE:20261015");
    expect(rows(ics).map((r) => r.external_id)).toEqual([`${HREF}#20261115`]);
  });
});
