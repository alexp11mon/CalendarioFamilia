import { describe, expect, it } from "vitest";
import { toViewEvents } from "@/lib/calendar/to-view-events";

const RECORD = {
  id: "s1_20261103T170000Z",
  calendarId: "c1",
  title: "Extraescolar",
  startsAt: "2026-11-03T17:00:00.000Z",
  endsAt: "2026-11-03T18:00:00.000Z",
  allDay: false,
  color: null,
  categoryId: null,
  location: null,
  imageCount: 0,
  commentCount: 2,
  seriesId: "s1",
};

describe("toViewEvents (spec 013 RF-10)", () => {
  it("keeps the series of an occurrence for the repeat mark", () => {
    const [event] = toViewEvents(
      [RECORD],
      [{ id: "c1", name: "Familia", color: "#A0C4FF" }],
    );
    expect(event).toMatchObject({
      id: "s1_20261103T170000Z",
      seriesId: "s1",
      color: "#A0C4FF",
      calendarName: "Familia",
      // Spec 014 RF-5.
      commentCount: 2,
    });
  });

  it("a single event has no series", () => {
    const [event] = toViewEvents([{ ...RECORD, id: "e1", seriesId: null }], []);
    expect(event!.seriesId).toBeNull();
  });
});
