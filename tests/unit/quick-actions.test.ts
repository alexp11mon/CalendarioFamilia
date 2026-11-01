// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventRecord } from "@/lib/calendar/queries";

// Spec 017, T3 and T4: the quick actions (plan quick-actions, D5, D6, D8).
const EVENT_ID = "5b8f6c2e-3f0a-4d8e-9a51-2a8f1d7c9e10";
const SERIES_ID = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const CALENDAR_ID = "0d7e1c6a-8b2f-4c3d-9e4f-5a6b7c8d9e0f";
const UPDATED = "2026-11-01T10:00:00.123456+00:00";

const h = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  writeEvent: vi.fn(),
  event: null as EventRecord | null,
  rows: [] as { id: string }[],
  updates: [] as Record<string, unknown>[],
  rpc: vi.fn(),
  updatedAt: "",
  canSee: true,
}));

vi.mock("@/lib/sync/write-event", () => ({ writeEvent: h.writeEvent }));
vi.mock("@/lib/sync/engine", () => ({ writeEngineDeps: () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));

const supabase = {
  from: (table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data:
            table === "synced_calendars" ? null : { updated_at: h.updatedAt },
          error: null,
        }),
      }),
    }),
    update: (row: Record<string, unknown>) => {
      h.updates.push(row);
      return {
        eq: () => ({ select: async () => ({ data: h.rows, error: null }) }),
      };
    },
  }),
  rpc: h.rpc,
};

vi.mock("@/lib/calendar/queries", () => ({
  requireActionUser: async () => ({ supabase, userId: "u1" }),
  getProfileTimeZone: async () => "Europe/Madrid",
  getEvent: async () => h.event,
  canSeeEvent: async () => h.canSee,
}));

const { quickChange } = await import("@/app/dashboard/events/quick-actions");

const SINGLE: EventRecord = {
  id: EVENT_ID,
  rowId: EVENT_ID,
  calendarId: CALENDAR_ID,
  title: "Cena",
  description: null,
  location: "Casa",
  startsAt: "2026-11-03T09:00:00+00:00",
  endsAt: "2026-11-03T10:00:00+00:00",
  allDay: false,
  color: null,
  categoryId: null,
  createdBy: "u2",
  series: null,
};

const OCCURRENCE: EventRecord = {
  ...SINGLE,
  id: `${SERIES_ID}_20261110T090000Z`,
  rowId: null,
  startsAt: "2026-11-10T09:00:00+00:00",
  endsAt: "2026-11-10T10:00:00+00:00",
  series: {
    id: SERIES_ID,
    recurrence: "FREQ=WEEKLY;INTERVAL=1;BYDAY=TU",
    recurrenceTz: "Europe/Madrid",
    summary: "Cada semana el martes",
    originalStart: "2026-11-10T09:00:00+00:00",
    changed: false,
    exceptions: 0,
    startsAt: "2026-11-03T09:00:00+00:00",
    endsAt: "2026-11-03T10:00:00+00:00",
    allDay: false,
  },
};

const LATER = {
  kind: "times" as const,
  startsAt: "2026-11-03T11:15:00.000Z",
  endsAt: "2026-11-03T12:15:00.000Z",
  allDay: false,
};

beforeEach(() => {
  h.revalidatePath.mockClear();
  h.writeEvent.mockReset();
  h.writeEvent.mockResolvedValue({ status: "normal" });
  h.rpc.mockReset();
  h.rpc.mockResolvedValue({ data: EVENT_ID, error: null });
  h.event = SINGLE;
  h.rows = [{ id: EVENT_ID }];
  h.updates = [];
  h.updatedAt = UPDATED;
  h.canSee = true;
});

describe("quickChange of the times (RF-18, RF-27)", () => {
  it("updates a normal event and returns how to undo it", async () => {
    const result = await quickChange(EVENT_ID, LATER);

    expect(result).toEqual({
      ok: true,
      id: EVENT_ID,
      undo: {
        kind: "change",
        id: EVENT_ID,
        before: {
          kind: "times",
          startsAt: SINGLE.startsAt,
          endsAt: SINGLE.endsAt,
          allDay: false,
        },
        updatedAt: UPDATED,
        series: false,
      },
    });
    expect(h.updates[0]).toMatchObject({
      starts_at: LATER.startsAt,
      ends_at: LATER.endsAt,
      title: "Cena",
      location: "Casa",
    });
    expect(h.revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  });

  it("refuses times that end before they start", async () => {
    const result = await quickChange(EVENT_ID, {
      ...LATER,
      endsAt: "2026-11-03T08:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    expect(h.updates).toEqual([]);
  });

  it("explains a refusal of RLS (RF-1)", async () => {
    h.rows = [];
    const result = await quickChange(EVENT_ID, LATER);
    expect(result).toEqual({
      ok: false,
      error: "No tienes permiso para hacer esto.",
    });
  });

  it("an invalid or missing id is not found", async () => {
    expect((await quickChange("nope", LATER)).ok).toBe(false);
    h.event = null;
    expect(await quickChange(EVENT_ID, LATER)).toEqual({
      ok: false,
      error: "Este elemento ya no existe.",
    });
  });
});

describe("synced calendars (RF-3, RF-4, RF-38)", () => {
  it("writes in Google first", async () => {
    h.writeEvent.mockResolvedValue({ status: "done", eventId: EVENT_ID });
    const result = await quickChange(EVENT_ID, LATER);

    expect(result.ok).toBe(true);
    expect(h.writeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        op: "update",
        row: expect.objectContaining({ starts_at: LATER.startsAt }),
      }),
      expect.anything(),
    );
    expect(h.updates).toEqual([]);
  });

  it("saves nothing when Google refuses", async () => {
    h.writeEvent.mockResolvedValue({ status: "failed", failure: "rejected" });
    expect(await quickChange(EVENT_ID, LATER)).toEqual({
      ok: false,
      error: "Google no ha permitido el cambio, así que no se ha guardado.",
    });
  });

  it("a deleted event in Google is gone", async () => {
    h.writeEvent.mockResolvedValue({ status: "gone" });
    const result = await quickChange(EVENT_ID, LATER);
    expect(result).toMatchObject({ ok: false, gone: true });
  });
});

describe("quickChange of the color (RF-36 to RF-38)", () => {
  it("sets a palette color and undoes to the old one", async () => {
    const result = await quickChange(EVENT_ID, {
      kind: "color",
      color: "#bdb2ff",
    });

    expect(h.updates[0]).toMatchObject({
      color: "#BDB2FF",
      starts_at: SINGLE.startsAt,
    });
    expect(result).toMatchObject({
      ok: true,
      undo: { before: { kind: "color", color: null } },
    });
  });

  it("null goes back to the calendar's color", async () => {
    h.event = { ...SINGLE, color: "#BDB2FF" };
    await quickChange(EVENT_ID, { kind: "color", color: null });
    expect(h.updates[0]).toMatchObject({ color: null });
  });

  it("refuses a color outside the palette", async () => {
    const result = await quickChange(EVENT_ID, {
      kind: "color",
      color: "#123456",
    });
    expect(result.ok).toBe(false);
    expect(h.updates).toEqual([]);
  });

  it("in a synced calendar the color goes through the engine, never as a Google field", async () => {
    h.writeEvent.mockResolvedValue({ status: "done", eventId: EVENT_ID });
    await quickChange(EVENT_ID, { kind: "color", color: "#BDB2FF" });
    const request = h.writeEvent.mock.calls[0]![0];
    expect(request.row.color).toBe("#BDB2FF");
    expect(request.before).not.toHaveProperty("color");
  });
});

describe("occurrences of a series (plan D10)", () => {
  const MOVED = {
    kind: "times" as const,
    startsAt: "2026-11-10T11:00:00.000Z",
    endsAt: "2026-11-10T12:00:00.000Z",
    allDay: false,
  };

  beforeEach(() => {
    h.event = OCCURRENCE;
  });

  it("asks for a scope", async () => {
    expect(await quickChange(OCCURRENCE.id, MOVED)).toEqual({
      ok: false,
      error: "Elige a qué eventos se aplica.",
    });
  });

  it("'this' updates the occurrence and can be undone", async () => {
    h.rpc.mockResolvedValue({ data: EVENT_ID, error: null });
    const result = await quickChange(OCCURRENCE.id, MOVED, { scope: "this" });

    expect(h.rpc).toHaveBeenCalledWith(
      "update_occurrence",
      expect.objectContaining({ p_series_id: SERIES_ID }),
    );
    expect(result).toMatchObject({
      ok: true,
      id: EVENT_ID,
      undo: { kind: "change", id: EVENT_ID, series: true },
    });
  });

  it("'all' updates the series without undo", async () => {
    h.rpc.mockResolvedValue({ data: SERIES_ID, error: null });
    const result = await quickChange(OCCURRENCE.id, MOVED, { scope: "all" });

    expect(h.rpc).toHaveBeenCalledWith("update_series", expect.anything());
    expect(result).toEqual({ ok: true, id: SERIES_ID });
  });

  it("'following' with losses asks to confirm them first", async () => {
    h.rpc.mockImplementation(async (fn: string) =>
      fn === "series_loss"
        ? { data: [{ exceptions: 2, images: 1, comments: 0 }], error: null }
        : { data: SERIES_ID, error: null },
    );
    const result = await quickChange(
      { ...OCCURRENCE }.id,
      {
        ...MOVED,
        startsAt: "2026-11-11T09:00:00.000Z",
        endsAt: "2026-11-11T10:00:00.000Z",
      },
      { scope: "following" },
    );
    expect(result).toEqual({
      ok: false,
      error: "",
      loss: { exceptions: 2, images: 1, comments: 0 },
    });
  });
});
