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
  synced: false,
  deletes: 0,
  inserts: [] as Record<string, unknown>[],
  calendar: null as Record<string, unknown> | null,
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
            table === "synced_calendars"
              ? h.synced
                ? { calendar_id: CALENDAR_ID }
                : null
              : { updated_at: h.updatedAt, calendar_id: CALENDAR_ID },
          error: null,
        }),
      }),
    }),
    insert: (row: Record<string, unknown>) => {
      h.inserts.push(row);
      return {
        select: () => ({
          single: async () => ({ data: { id: "new-id" }, error: null }),
        }),
      };
    },
    delete: () => {
      h.deletes += 1;
      return {
        eq: () => ({ select: async () => ({ data: h.rows, error: null }) }),
      };
    },
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
  getCalendar: async () => h.calendar,
}));

const { quickChange, deleteForUndo, undoAction, pasteEvent } =
  await import("@/app/dashboard/events/quick-actions");

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
  h.synced = false;
  h.deletes = 0;
  h.inserts = [];
  h.calendar = { id: CALENDAR_ID, role: "editor", synced: null };
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

const TRASH_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

function rpcs(handlers: Record<string, unknown>) {
  h.rpc.mockImplementation(async (fn: string) =>
    fn in handlers
      ? (handlers[fn] as object)
      : { data: null, error: { code: "XXXXX" } },
  );
}

describe("deleteForUndo (RF-25, RF-31, RF-40, RF-55)", () => {
  it("keeps a snapshot and deletes the usual way", async () => {
    rpcs({ snapshot_event: { data: TRASH_ID, error: null } });
    const result = await deleteForUndo(EVENT_ID);

    expect(h.rpc).toHaveBeenCalledWith("snapshot_event", {
      p_event_id: EVENT_ID,
    });
    expect(h.deletes).toBe(1);
    expect(result).toEqual({
      ok: true,
      id: EVENT_ID,
      undo: { kind: "restore", trashId: TRASH_ID },
    });
  });

  it("a synced event is deleted in Google first", async () => {
    rpcs({ snapshot_event: { data: TRASH_ID, error: null } });
    h.writeEvent.mockResolvedValue({ status: "done", eventId: EVENT_ID });
    const result = await deleteForUndo(EVENT_ID);
    expect(h.writeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ op: "delete", eventId: EVENT_ID }),
      expect.anything(),
    );
    expect(result.ok).toBe(true);
  });

  it("no undo when the delete fails", async () => {
    rpcs({ snapshot_event: { data: TRASH_ID, error: null } });
    h.writeEvent.mockResolvedValue({ status: "failed", failure: "transient" });
    const result = await deleteForUndo(EVENT_ID);
    expect(result).toMatchObject({ ok: false });
    expect(result).not.toHaveProperty("undo");
  });

  it("a deleted event in Google is gone", async () => {
    rpcs({ snapshot_event: { data: TRASH_ID, error: null } });
    h.writeEvent.mockResolvedValue({ status: "gone" });
    expect(await deleteForUndo(EVENT_ID)).toMatchObject({
      ok: false,
      gone: true,
    });
  });

  it("a viewer cannot snapshot nor delete", async () => {
    rpcs({ snapshot_event: { data: null, error: { code: "42501" } } });
    expect(await deleteForUndo(EVENT_ID)).toEqual({
      ok: false,
      error: "No tienes permiso para hacer esto.",
    });
    expect(h.deletes).toBe(0);
  });

  it("an occurrence asks for a scope and only 'this' can be undone", async () => {
    h.event = OCCURRENCE;
    rpcs({
      snapshot_event: { data: TRASH_ID, error: null },
      series_loss: {
        data: [{ exceptions: 0, images: 0, comments: 0 }],
        error: null,
      },
      delete_occurrences: { data: null, error: null },
    });
    expect((await deleteForUndo(OCCURRENCE.id)).ok).toBe(false);

    const only = await deleteForUndo(OCCURRENCE.id, { scope: "this" });
    expect(h.rpc).toHaveBeenCalledWith("snapshot_event", {
      p_event_id: SERIES_ID,
      p_original_start: OCCURRENCE.series!.originalStart,
    });
    expect(only).toMatchObject({
      ok: true,
      undo: { kind: "restore", trashId: TRASH_ID },
    });

    const all = await deleteForUndo(OCCURRENCE.id, { scope: "all" });
    expect(all).toEqual({ ok: true, id: OCCURRENCE.id });
  });

  it("asks to confirm what an occurrence would lose", async () => {
    h.event = OCCURRENCE;
    rpcs({
      series_loss: {
        data: [{ exceptions: 1, images: 2, comments: 0 }],
        error: null,
      },
    });
    expect(await deleteForUndo(OCCURRENCE.id, { scope: "following" })).toEqual({
      ok: false,
      error: "",
      loss: { exceptions: 1, images: 2, comments: 0 },
    });
  });
});

describe("undoAction (RF-27 to RF-29)", () => {
  const change = {
    kind: "change" as const,
    id: EVENT_ID,
    before: {
      kind: "times" as const,
      startsAt: "2026-11-03T08:00:00.000Z",
      endsAt: "2026-11-03T09:00:00.000Z",
      allDay: false,
    },
    updatedAt: UPDATED,
    series: false,
  };

  it("writes the values of before when nothing changed meanwhile", async () => {
    expect(await undoAction(change)).toEqual({ ok: true });
    expect(h.updates[0]).toMatchObject({
      starts_at: "2026-11-03T08:00:00.000Z",
    });
  });

  it("refuses when the event changed meanwhile", async () => {
    h.updatedAt = "2026-11-01T10:00:05+00:00";
    expect(await undoAction(change)).toEqual({
      ok: false,
      error: "Este evento ha cambiado entretanto; no se ha deshecho.",
    });
    expect(h.updates).toEqual([]);
  });

  it("restores a deleted event from its snapshot", async () => {
    rpcs({
      trash_row: {
        data: { id: EVENT_ID, calendar_id: CALENDAR_ID },
        error: null,
      },
      restore_event: { data: EVENT_ID, error: null },
    });
    expect(await undoAction({ kind: "restore", trashId: TRASH_ID })).toEqual({
      ok: true,
    });
    expect(h.rpc).toHaveBeenCalledWith("restore_event", {
      p_trash_id: TRASH_ID,
    });
  });

  it("a synced event is created again in Google and then restored on it", async () => {
    h.synced = true;
    rpcs({
      trash_row: {
        data: {
          id: EVENT_ID,
          calendar_id: CALENDAR_ID,
          title: "Cena",
          description: null,
          location: null,
          starts_at: "2026-11-03T09:00:00+00:00",
          ends_at: "2026-11-03T10:00:00+00:00",
          all_day: false,
          color: null,
          category_id: null,
        },
        error: null,
      },
      restore_event: { data: "g-new", error: null },
    });
    h.writeEvent.mockResolvedValue({ status: "done", eventId: "g-new" });

    expect(await undoAction({ kind: "restore", trashId: TRASH_ID })).toEqual({
      ok: true,
    });
    expect(h.writeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        op: "create",
        row: expect.objectContaining({
          title: "Cena",
          calendar_id: CALENDAR_ID,
        }),
      }),
      expect.anything(),
    );
    expect(h.rpc).toHaveBeenCalledWith("restore_event", {
      p_trash_id: TRASH_ID,
      p_event_id: "g-new",
    });
  });

  it("says why when Google refuses", async () => {
    h.synced = true;
    rpcs({
      trash_row: {
        data: { id: EVENT_ID, calendar_id: CALENDAR_ID },
        error: null,
      },
    });
    h.writeEvent.mockResolvedValue({ status: "failed", failure: "rejected" });
    expect(await undoAction({ kind: "restore", trashId: TRASH_ID })).toEqual({
      ok: false,
      error: "Google no ha permitido el cambio, así que no se ha guardado.",
    });
  });

  it("an expired snapshot cannot be undone", async () => {
    rpcs({
      trash_row: { data: null, error: null },
      restore_event: { data: null, error: { code: "CF404" } },
    });
    expect(await undoAction({ kind: "restore", trashId: TRASH_ID })).toEqual({
      ok: false,
      error: "Ya no se puede deshacer.",
    });
  });

  it("an id taken again means the event changed", async () => {
    rpcs({
      trash_row: { data: null, error: null },
      restore_event: { data: null, error: { code: "23505" } },
    });
    expect(await undoAction({ kind: "restore", trashId: TRASH_ID })).toEqual({
      ok: false,
      error: "Este evento ha cambiado entretanto; no se ha deshecho.",
    });
  });

  it("undoing a paste deletes the copy", async () => {
    expect(await undoAction({ kind: "unpaste", id: EVENT_ID })).toEqual({
      ok: true,
    });
    expect(h.deletes).toBe(1);
  });

  it("refuses a malformed token", async () => {
    expect(
      (await undoAction({ kind: "restore", trashId: "x" } as never)).ok,
    ).toBe(false);
  });
});

describe("pasteEvent (RF-58 to RF-61)", () => {
  it("creates a copy on the day and minute given, without images", async () => {
    const result = await pasteEvent(EVENT_ID, {
      day: "2026-11-20",
      minute: 16 * 60,
    });
    expect(h.inserts[0]).toMatchObject({
      calendar_id: CALENDAR_ID,
      title: "Cena",
      location: "Casa",
      starts_at: "2026-11-20T15:00:00.000Z",
      ends_at: "2026-11-20T16:00:00.000Z",
      created_by: "u1",
    });
    expect(result).toEqual({
      ok: true,
      id: "new-id",
      undo: { kind: "unpaste", id: "new-id" },
    });
  });

  it("without a minute keeps its hour", async () => {
    await pasteEvent(EVENT_ID, { day: "2026-11-20" });
    expect(h.inserts[0]).toMatchObject({
      starts_at: "2026-11-20T09:00:00.000Z",
    });
  });

  it("an occurrence is pasted as a single event", async () => {
    h.event = OCCURRENCE;
    await pasteEvent(OCCURRENCE.id, { day: "2026-11-20" });
    expect(h.inserts[0]).not.toHaveProperty("recurrence");
    expect(h.inserts[0]).not.toHaveProperty("series_id");
  });

  it("says why it cannot paste in a calendar it cannot write to", async () => {
    h.calendar = { id: CALENDAR_ID, role: "viewer", synced: null };
    expect(await pasteEvent(EVENT_ID, { day: "2026-11-20" })).toEqual({
      ok: false,
      error: "No tienes permiso para hacer esto.",
    });
    h.calendar = {
      id: CALENDAR_ID,
      role: "owner",
      synced: { canWrite: false, googleAccess: "reader" },
    };
    expect(await pasteEvent(EVENT_ID, { day: "2026-11-20" })).toEqual({
      ok: false,
      error:
        "La cuenta de Google solo puede ver este calendario, así que no se puede pegar en él.",
    });
    expect(h.inserts).toEqual([]);
  });

  it("a synced calendar creates the copy in Google", async () => {
    h.writeEvent.mockResolvedValue({ status: "done", eventId: "g-copy" });
    const result = await pasteEvent(EVENT_ID, { day: "2026-11-20" });
    expect(result).toMatchObject({ ok: true, id: "g-copy" });
    expect(h.inserts).toEqual([]);
  });

  it("refuses a bad day", async () => {
    expect((await pasteEvent(EVENT_ID, { day: "mañana" })).ok).toBe(false);
  });
});
