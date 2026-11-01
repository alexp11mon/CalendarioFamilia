import { describe, expect, it } from "vitest";
import { toGoogleEvent, toGooglePatch } from "@/lib/sync/google-payload";
import {
  canWriteEvents,
  moveTargets,
  readOnlyReason,
  type SyncedInfo,
} from "@/lib/sync/read-only";
import { GOOGLE_SCOPES, missingScopes } from "@/lib/sync/scopes";
import {
  planUpload,
  uploadCounts,
  withOccurrences,
} from "@/lib/sync/upload-plan";
import { WRITE_ERRORS, writeFailureOf } from "@/lib/sync/write-errors";
import { ProviderError } from "@/lib/sync/providers/google";

// Spec 009, T5: scopes, Google bodies, write errors, destinations and the
// upload plan (plan D1, D2, D6, D9, D11; RF-1, RF-5 to RF-9, RF-13 to RF-15,
// RF-20, RF-22 to RF-26, RF-35, RF-42, RF-43).

const API = "https://www.googleapis.com/auth/";

describe("scopes (RF-1, RF-5, D1)", () => {
  it("asks exactly for the write scopes of D1", () => {
    expect(GOOGLE_SCOPES.split(" ")).toEqual([
      "openid",
      "email",
      `${API}calendar.calendarlist.readonly`,
      `${API}calendar.events`,
      `${API}calendar.calendars`,
    ]);
  });

  it("finds each missing permission", () => {
    expect(missingScopes(GOOGLE_SCOPES)).toEqual([]);
    expect(
      missingScopes(`openid email ${API}calendar.calendarlist.readonly`),
    ).toEqual([`${API}calendar.events`, `${API}calendar.calendars`]);
    expect(missingScopes(null)).toHaveLength(3);
  });
});

const timed = {
  title: "Dentista",
  description: "Llevar papeles",
  location: "Centro",
  starts_at: "2026-11-02T09:00:00.000Z",
  ends_at: "2026-11-02T10:00:00.000Z",
  all_day: false,
};

const allDay = {
  ...timed,
  starts_at: "2026-11-02T00:00:00.000Z",
  ends_at: "2026-11-05T00:00:00.000Z",
  all_day: true,
};

describe("toGoogleEvent (RF-13)", () => {
  it("writes a timed event in UTC", () => {
    expect(toGoogleEvent(timed)).toEqual({
      summary: "Dentista",
      description: "Llevar papeles",
      location: "Centro",
      start: { dateTime: "2026-11-02T09:00:00.000Z" },
      end: { dateTime: "2026-11-02T10:00:00.000Z" },
    });
  });

  it("writes all-day and several-day events as dates with exclusive end", () => {
    expect(toGoogleEvent(allDay)).toMatchObject({
      start: { date: "2026-11-02" },
      end: { date: "2026-11-05" },
    });
  });

  it("never sends color or category", () => {
    const body = toGoogleEvent({
      ...timed,
      color: "#FFADAD",
      category_id: "c",
    } as typeof timed);
    expect(Object.keys(body).sort()).toEqual([
      "description",
      "end",
      "location",
      "start",
      "summary",
    ]);
  });
});

describe("toGooglePatch (RF-14, RF-15)", () => {
  it("is empty without changes", () => {
    expect(toGooglePatch(timed, { ...timed })).toEqual({});
  });

  it("sends only the title when only the title changes", () => {
    // A description cut to 2,000 characters is not written back (edge case).
    expect(toGooglePatch(timed, { ...timed, title: "Médico" })).toEqual({
      summary: "Médico",
    });
  });

  it("clears a removed description or location", () => {
    expect(
      toGooglePatch(timed, { ...timed, description: null, location: null }),
    ).toEqual({ description: null, location: null });
  });

  it("sends start and end together when the time changes", () => {
    expect(
      toGooglePatch(timed, { ...timed, ends_at: "2026-11-02T11:00:00.000Z" }),
    ).toEqual({
      start: { dateTime: "2026-11-02T09:00:00.000Z", date: null },
      end: { dateTime: "2026-11-02T11:00:00.000Z", date: null },
    });
  });

  it("switches between all-day and timed clearing the other field", () => {
    expect(toGooglePatch(timed, allDay)).toEqual({
      start: { date: "2026-11-02", dateTime: null },
      end: { date: "2026-11-05", dateTime: null },
    });
    expect(toGooglePatch(allDay, timed)).toEqual({
      start: { dateTime: "2026-11-02T09:00:00.000Z", date: null },
      end: { dateTime: "2026-11-02T10:00:00.000Z", date: null },
    });
  });
});

describe("write errors (RF-22 to RF-26)", () => {
  it("has a Spanish text per kind", () => {
    expect(WRITE_ERRORS.transient).toMatch(/Google no responde/);
    expect(WRITE_ERRORS.revoked).toMatch(/Vuelve a conectarla/);
    expect(WRITE_ERRORS.rejected).toMatch(/Google no ha permitido/);
    expect(WRITE_ERRORS.gone).toMatch(/se había borrado en Google/);
  });

  it("classifies provider errors and never shows Google's message", () => {
    expect(
      writeFailureOf(new ProviderError("missing", "Google answered 404")),
    ).toBe("gone");
    expect(writeFailureOf(new ProviderError("revoked", "x"))).toBe("revoked");
    expect(writeFailureOf(new ProviderError("rejected", "x"))).toBe("rejected");
    expect(writeFailureOf(new ProviderError("transient", "x"))).toBe(
      "transient",
    );
    expect(writeFailureOf(new Error("boom"))).toBe("transient");
    for (const text of Object.values(WRITE_ERRORS)) {
      expect(text).not.toMatch(/answered|Google answered|\d{3}/);
    }
  });
});

const synced = (extra: Partial<SyncedInfo> = {}): SyncedInfo => ({
  provider: "google",
  lastSyncedAt: null,
  accountEmail: null,
  connectionId: "conn-1",
  canWrite: true,
  googleAccess: "owner",
  ...extra,
});

describe("canWriteEvents (RF-6, RF-7, RF-9)", () => {
  it("lets owners and editors write in writable synced calendars", () => {
    expect(canWriteEvents({ role: "owner", synced: synced() })).toBe(true);
    expect(canWriteEvents({ role: "editor", synced: synced() })).toBe(true);
    expect(canWriteEvents({ role: "viewer", synced: synced() })).toBe(false);
    expect(
      canWriteEvents({ role: "owner", synced: synced({ canWrite: false }) }),
    ).toBe(false);
    expect(canWriteEvents({ role: "editor", synced: null })).toBe(true);
  });
});

describe("moveTargets (RF-19, RF-20)", () => {
  const calendars = [
    { id: "n1", role: "owner" as const, synced: null },
    { id: "n2", role: "viewer" as const, synced: null },
    { id: "a", role: "owner" as const, synced: synced() },
    { id: "b", role: "editor" as const, synced: synced() },
    { id: "ro", role: "owner" as const, synced: synced({ canWrite: false }) },
    {
      id: "other",
      role: "owner" as const,
      synced: synced({ connectionId: "conn-2" }),
    },
  ];

  it("a normal event only goes to writable normal calendars", () => {
    expect(moveTargets(calendars[0], calendars).map((c) => c.id)).toEqual([
      "n1",
    ]);
  });

  it("a synced event only goes to writable calendars of the same account", () => {
    expect(moveTargets(calendars[2], calendars).map((c) => c.id)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("readOnlyReason (RF-8)", () => {
  it("tells why a synced calendar cannot be written", () => {
    expect(readOnlyReason(null)).toBeNull();
    expect(readOnlyReason(synced())).toBeNull();
    expect(
      readOnlyReason(synced({ canWrite: false, googleAccess: "reader" })),
      // Spec 018 T4: "google" became "provider".
    ).toBe("provider");
    expect(readOnlyReason(synced({ canWrite: false }))).toBe("reconnect");
  });
});

describe("planUpload (RF-35, RF-42, RF-43)", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  const at = (id: string, day: string) => ({
    id,
    starts_at: `${day}T10:00:00.000Z`,
    ends_at: `${day}T11:00:00.000Z`,
  });

  it("separates events inside and outside the window", () => {
    const plan = planUpload(
      [
        at("past", "2025-01-01"),
        at("in", "2026-11-02"),
        at("far", "2028-01-01"),
      ],
      now,
    );
    expect(plan.toGoogle.map((e) => e.id)).toEqual(["in"]);
    expect(plan.onlyCafam).toBe(2);
  });

  it("an event that overlaps the window edge goes to Google", () => {
    const plan = planUpload(
      [
        {
          id: "edge",
          starts_at: "2026-04-20T00:00:00.000Z",
          ends_at: "2026-05-02T00:00:00.000Z",
        },
      ],
      now,
    );
    expect(plan.toGoogle).toHaveLength(1);
  });

  it("caps at 2,000 events and counts the rest as CaFam only", () => {
    const many = Array.from({ length: 2100 }, (_, i) =>
      at(`e${i}`, "2026-11-02"),
    );
    const plan = planUpload(many, now);
    expect(plan.toGoogle).toHaveLength(2000);
    expect(plan.onlyCafam).toBe(100);
  });
});

// Spec 013, T15: series go up as their occurrences of the window (RF-30).
describe("uploads with series (spec 013 RF-30)", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  const row = (id: string, extra: object = {}) => ({
    id,
    starts_at: "2026-11-02T10:00:00.000Z",
    ends_at: "2026-11-02T11:00:00.000Z",
    all_day: false,
    recurrence: null,
    recurrence_tz: null,
    exdates: [],
    series_id: null,
    original_start: null,
    ...extra,
  });
  // Every Monday for 4 weeks; the second is an exception, the third deleted.
  const SERIES = row("s1", {
    recurrence: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;COUNT=4",
    recurrence_tz: "Europe/Madrid",
    exdates: ["2026-11-16T10:00:00.000Z"],
  });
  const EXCEPTION = row("x1", {
    starts_at: "2026-11-09T12:00:00.000Z",
    ends_at: "2026-11-09T13:00:00.000Z",
    series_id: "s1",
    original_start: "2026-11-09T10:00:00.000Z",
  });

  it("expands each series in the window, without exceptions or deleted dates", () => {
    const { events, series } = withOccurrences(
      [row("single"), SERIES, EXCEPTION],
      now,
    );
    expect(series).toBe(1);
    expect(events.map((e) => [e.id, e.starts_at, e.seriesId])).toEqual([
      ["single", "2026-11-02T10:00:00.000Z", undefined],
      ["x1", "2026-11-09T12:00:00.000Z", undefined],
      ["s1_20261102T100000Z", "2026-11-02T10:00:00.000Z", "s1"],
      ["s1_20261123T100000Z", "2026-11-23T10:00:00.000Z", "s1"],
    ]);
  });

  it("counts each occurrence that goes to Google", () => {
    expect(uploadCounts([row("single"), SERIES, EXCEPTION], now)).toEqual({
      toGoogle: 4,
      onlyCafam: 0,
      series: 1,
      occurrences: 2,
    });
  });
});
