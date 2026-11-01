import { describe, expect, it } from "vitest";
import {
  describeTimes,
  minuteDelta,
  moveAllDay,
  moveInMonth,
  moveTimed,
  nudge,
  resizeEnd,
  sameTimes,
  toAllDay,
  toTimed,
  type Times,
} from "@/lib/calendar/drag";

// Spec 017, T2: where a dragged event lands (plan drag-core, D1).
const TZ = "Europe/Madrid";
// Tuesday 3 November 2026, 10:00–11:00 in Madrid (UTC+1).
const TIMED: Times = {
  startsAt: "2026-11-03T09:00:00.000Z",
  endsAt: "2026-11-03T10:00:00.000Z",
  allDay: false,
};
const ALL_DAY: Times = {
  startsAt: "2026-11-03T00:00:00.000Z",
  endsAt: "2026-11-04T00:00:00.000Z",
  allDay: true,
};
const THREE_DAYS: Times = {
  startsAt: "2026-11-03T00:00:00.000Z",
  endsAt: "2026-11-06T00:00:00.000Z",
  allDay: true,
};

describe("minuteDelta", () => {
  it("rounds the pointer movement to quarters (RF-5)", () => {
    expect(minuteDelta(600, 607)).toBe(0);
    expect(minuteDelta(600, 608)).toBe(15);
    expect(minuteDelta(600, 552)).toBe(-45);
  });
});

describe("moveTimed (RF-5, RF-7)", () => {
  it("moves in quarters and keeps the duration", () => {
    expect(moveTimed(TIMED, { days: 0, minutes: 135 }, TZ)).toEqual({
      startsAt: "2026-11-03T11:15:00.000Z",
      endsAt: "2026-11-03T12:15:00.000Z",
      allDay: false,
    });
  });

  it("moves to another day of the week", () => {
    expect(moveTimed(TIMED, { days: 2, minutes: 0 }, TZ)?.startsAt).toBe(
      "2026-11-05T09:00:00.000Z",
    );
  });

  it("snaps a start off the quarter grid once it moves", () => {
    const odd = {
      ...TIMED,
      startsAt: "2026-11-03T09:07:00.000Z",
      endsAt: "2026-11-03T10:07:00.000Z",
    };
    expect(moveTimed(odd, { days: 0, minutes: 15 }, TZ)?.startsAt).toBe(
      "2026-11-03T09:15:00.000Z",
    );
  });

  it("keeps a multi-day timed event whole", () => {
    const long = {
      ...TIMED,
      endsAt: "2026-11-05T10:00:00.000Z",
    };
    expect(moveTimed(long, { days: 1, minutes: 0 }, TZ)).toEqual({
      startsAt: "2026-11-04T09:00:00.000Z",
      endsAt: "2026-11-06T10:00:00.000Z",
      allDay: false,
    });
  });

  it("stays inside the day", () => {
    expect(moveTimed(TIMED, { days: 0, minutes: -900 }, TZ)?.startsAt).toBe(
      "2026-11-02T23:00:00.000Z",
    );
    expect(moveTimed(TIMED, { days: 0, minutes: 900 }, TZ)?.startsAt).toBe(
      "2026-11-03T22:45:00.000Z",
    );
  });

  it("returns null in the same place (RF-19)", () => {
    expect(moveTimed(TIMED, { days: 0, minutes: 0 }, TZ)).toBeNull();
  });

  it("puts a nonexistent spring hour at the first valid one", () => {
    // Sunday 28 March 2027: 02:00 jumps to 03:00 in Madrid.
    const saturday = {
      startsAt: "2027-03-27T01:30:00.000Z", // 02:30 on Saturday
      endsAt: "2027-03-27T02:30:00.000Z",
      allDay: false,
    };
    const moved = moveTimed(saturday, { days: 1, minutes: 0 }, TZ);
    expect(moved?.startsAt).toBe("2027-03-28T01:00:00.000Z"); // 03:00
  });
});

describe("resizeEnd (RF-10, RF-12)", () => {
  it("changes the end in quarters and keeps the start", () => {
    expect(resizeEnd(TIMED, 12 * 60 + 15, TZ)).toEqual({
      ...TIMED,
      endsAt: "2026-11-03T11:15:00.000Z",
    });
  });

  it("never leaves less than 15 minutes", () => {
    expect(resizeEnd(TIMED, 9 * 60, TZ)?.endsAt).toBe(
      "2026-11-03T09:15:00.000Z",
    );
  });

  it("an overnight event ends on its first day", () => {
    const night = {
      startsAt: "2026-11-03T21:00:00.000Z", // 22:00
      endsAt: "2026-11-04T01:00:00.000Z", // 02:00 next day
      allDay: false,
    };
    expect(resizeEnd(night, 23 * 60 + 30, TZ)?.endsAt).toBe(
      "2026-11-03T22:30:00.000Z",
    );
    expect(resizeEnd(night, 24 * 60, TZ)?.endsAt).toBe(
      "2026-11-03T23:00:00.000Z",
    );
  });

  it("returns null when the end does not change", () => {
    expect(resizeEnd(TIMED, 11 * 60, TZ)).toBeNull();
  });
});

describe("conversions (RF-13, RF-14, RF-15)", () => {
  it("a timed event dropped on the strip is all day", () => {
    expect(toAllDay(TIMED, "2026-11-05")).toEqual({
      startsAt: "2026-11-05T00:00:00.000Z",
      endsAt: "2026-11-06T00:00:00.000Z",
      allDay: true,
    });
  });

  it("a one-day all-day event dropped on the grid lasts 1 h", () => {
    expect(toTimed(ALL_DAY, "2026-11-04", 9 * 60 + 30, TZ)).toEqual({
      startsAt: "2026-11-04T08:30:00.000Z",
      endsAt: "2026-11-04T09:30:00.000Z",
      allDay: false,
    });
  });

  it("only one-day all-day events turn into timed ones", () => {
    expect(toTimed(THREE_DAYS, "2026-11-04", 600, TZ)).toBeNull();
  });

  it("an all-day event keeps its days when it moves", () => {
    expect(moveAllDay(THREE_DAYS, 2)).toEqual({
      startsAt: "2026-11-05T00:00:00.000Z",
      endsAt: "2026-11-08T00:00:00.000Z",
      allDay: true,
    });
    expect(moveAllDay(THREE_DAYS, 0)).toBeNull();
  });
});

describe("moveInMonth (RF-16, RF-17)", () => {
  it("keeps the hour and the duration of a timed event", () => {
    expect(moveInMonth(TIMED, "2026-11-20", TZ)).toEqual({
      startsAt: "2026-11-20T09:00:00.000Z",
      endsAt: "2026-11-20T10:00:00.000Z",
      allDay: false,
    });
  });

  it("puts the first day of a multi-day event where it is dropped", () => {
    expect(moveInMonth(THREE_DAYS, "2026-11-10", TZ)).toEqual({
      startsAt: "2026-11-10T00:00:00.000Z",
      endsAt: "2026-11-13T00:00:00.000Z",
      allDay: true,
    });
  });

  it("returns null on the same day", () => {
    expect(moveInMonth(TIMED, "2026-11-03", TZ)).toBeNull();
  });
});

describe("nudge (RF-64)", () => {
  it("moves a timed event 15 minutes or a day", () => {
    expect(nudge(TIMED, "later", TZ)?.startsAt).toBe(
      "2026-11-03T09:15:00.000Z",
    );
    expect(nudge(TIMED, "earlier", TZ)?.startsAt).toBe(
      "2026-11-03T08:45:00.000Z",
    );
    expect(nudge(TIMED, "nextDay", TZ)?.startsAt).toBe(
      "2026-11-04T09:00:00.000Z",
    );
    expect(nudge(TIMED, "previousDay", TZ)?.startsAt).toBe(
      "2026-11-02T09:00:00.000Z",
    );
  });

  it("an all-day event only changes day", () => {
    expect(nudge(ALL_DAY, "later", TZ)).toBeNull();
    expect(nudge(ALL_DAY, "nextDay", TZ)?.startsAt).toBe(
      "2026-11-04T00:00:00.000Z",
    );
  });
});

describe("describeTimes and sameTimes (RF-8)", () => {
  it("says the day and the hours", () => {
    expect(describeTimes(TIMED, TZ)).toBe(
      "martes, 3 de noviembre, 10:00–11:00",
    );
    expect(describeTimes(THREE_DAYS, TZ)).toBe(
      "martes, 3 de noviembre, todo el día",
    );
  });

  it("compares instants, not strings", () => {
    expect(
      sameTimes(TIMED, {
        ...TIMED,
        startsAt: "2026-11-03T09:00:00+00:00",
      }),
    ).toBe(true);
    expect(sameTimes(TIMED, ALL_DAY)).toBe(false);
  });
});
