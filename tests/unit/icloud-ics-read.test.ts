// @vitest-environment node
import { describe, expect, it } from "vitest";
import { expandObject } from "@/lib/sync/icloud-ics";

// Spec 018, T6: an iCloud resource becomes CaFam rows (plan D5, D6; RF-21 to
// RF-25). Synthetic resources in the shape iCloud serves; never real data.
const HREF = "/123/calendars/home/ABC.ics";
const WINDOW = {
  from: new Date("2026-10-01T00:00:00Z"),
  to: new Date("2027-10-01T00:00:00Z"),
};

function ics(...events: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Apple Inc.//iPhone OS 18.0//EN",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

function vevent(...lines: string[]): string {
  return [
    "BEGIN:VEVENT",
    "DTSTAMP:20261001T000000Z",
    ...lines,
    "END:VEVENT",
  ].join("\r\n");
}

describe("expandObject", () => {
  it("reads a timed event in its zone, with the href as its id", () => {
    const result = expandObject(
      HREF,
      ics(
        vevent(
          "UID:one",
          "SUMMARY:Dentista",
          "LOCATION:Calle Mayor 1",
          "DESCRIPTION:Revisión",
          "DTSTART;TZID=Europe/Madrid:20261105T100000",
          "DTEND;TZID=Europe/Madrid:20261105T110000",
        ),
      ),
      WINDOW,
    );
    expect(result).toEqual({
      skipped: 0,
      events: [
        {
          external_id: HREF,
          title: "Dentista",
          description: "Revisión",
          location: "Calle Mayor 1",
          starts_at: "2026-11-05T09:00:00.000Z",
          ends_at: "2026-11-05T10:00:00.000Z",
          all_day: false,
        },
      ],
    });
  });

  it("keeps an all-day event on its day with an exclusive end", () => {
    const { events } = expandObject(
      HREF,
      ics(
        vevent(
          "UID:day",
          "SUMMARY:Cumpleaños",
          "DTSTART;VALUE=DATE:20261110",
          "DTEND;VALUE=DATE:20261111",
        ),
      ),
      WINDOW,
    );
    expect(events).toMatchObject([
      {
        external_id: HREF,
        starts_at: "2026-11-10T00:00:00.000Z",
        ends_at: "2026-11-11T00:00:00.000Z",
        all_day: true,
      },
    ]);
  });

  it("expands a series with EXDATE, a modified and a cancelled repetition (RF-22, RF-23)", () => {
    const { events, skipped } = expandObject(
      HREF,
      ics(
        vevent(
          "UID:series",
          "SUMMARY:Natación",
          "DTSTART;TZID=Europe/Madrid:20261102T090000",
          "DTEND;TZID=Europe/Madrid:20261102T100000",
          "RRULE:FREQ=WEEKLY;COUNT=5",
          "EXDATE;TZID=Europe/Madrid:20261109T090000",
        ),
        vevent(
          "UID:series",
          "RECURRENCE-ID;TZID=Europe/Madrid:20261116T090000",
          "SUMMARY:Natación (piscina grande)",
          "DTSTART;TZID=Europe/Madrid:20261116T110000",
          "DTEND;TZID=Europe/Madrid:20261116T120000",
        ),
        vevent(
          "UID:series",
          "RECURRENCE-ID;TZID=Europe/Madrid:20261123T090000",
          "STATUS:CANCELLED",
          "DTSTART;TZID=Europe/Madrid:20261123T090000",
          "DTEND;TZID=Europe/Madrid:20261123T100000",
        ),
      ),
      WINDOW,
    );
    expect(skipped).toBe(0);
    expect(events.map((e) => [e.external_id, e.title, e.starts_at])).toEqual([
      [`${HREF}#20261102T080000Z`, "Natación", "2026-11-02T08:00:00.000Z"],
      [
        `${HREF}#20261116T080000Z`,
        "Natación (piscina grande)",
        "2026-11-16T10:00:00.000Z",
      ],
      [`${HREF}#20261130T080000Z`, "Natación", "2026-11-30T08:00:00.000Z"],
    ]);
  });

  it("names an all-day repetition by its date and leaves out the ones before the window", () => {
    const { events } = expandObject(
      HREF,
      ics(
        vevent(
          "UID:monthly",
          "SUMMARY:Recibo",
          "DTSTART;VALUE=DATE:20260915",
          "DTEND;VALUE=DATE:20260916",
          "RRULE:FREQ=MONTHLY;COUNT=3",
        ),
      ),
      WINDOW,
    );
    expect(events.map((e) => e.external_id)).toEqual([
      `${HREF}#20261015`,
      `${HREF}#20261115`,
    ]);
  });

  it("stops an endless series at the end of the window", () => {
    const { events } = expandObject(
      HREF,
      ics(
        vevent(
          "UID:yearly",
          "SUMMARY:Aniversario",
          "DTSTART;VALUE=DATE:20261201",
          "DTEND;VALUE=DATE:20261202",
          "RRULE:FREQ=YEARLY",
        ),
      ),
      WINDOW,
    );
    expect(events).toHaveLength(1);
  });

  it("drops a cancelled event and counts what cannot be placed (RF-24, RF-25)", () => {
    // One UID per resource, as CalDAV requires.
    const read = (...lines: string[]) =>
      expandObject(HREF, ics(vevent("UID:x", ...lines)), WINDOW);
    expect(
      read(
        "STATUS:CANCELLED",
        "DTSTART:20261105T100000Z",
        "DTEND:20261105T110000Z",
      ),
    ).toEqual({ events: [], skipped: 0 });
    expect(
      read(
        "DTSTART;TZID=Romance Standard Time:20261105T100000",
        "DTEND;TZID=Romance Standard Time:20261105T110000",
      ),
    ).toEqual({ events: [], skipped: 1 });
    expect(read("DTSTART:20261105T100000Z", "DTEND:20261105T090000Z")).toEqual({
      events: [],
      skipped: 1,
    });
  });

  it("reads what is not a calendar as nothing", () => {
    expect(expandObject(HREF, "not ics", WINDOW)).toEqual({
      events: [],
      skipped: 1,
    });
  });
});
