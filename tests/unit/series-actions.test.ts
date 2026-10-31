// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Spec 013, T10: creating series from the event form (RF-1, RF-6, RF-7, RF-8,
// RF-29, RF-31).
const EVENT_ID = "5b8f6c2e-3f0a-4d8e-9a51-2a8f1d7c9e10";
const CALENDAR_ID = "0d7e1c6a-8b2f-4c3d-9e4f-5a6b7c8d9e0f";

const h = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
  insertError: null as { code: string; message: string } | null,
  synced: null as { calendar_id: string } | null,
  writeEvent: vi.fn(),
  event: null as Record<string, unknown> | null,
  rpc: vi.fn(),
  imageCount: 0,
  updates: [] as { row: Record<string, unknown>; id: string }[],
  deleted: [] as string[],
}));

vi.mock("@/lib/calendar/queries", async (actual) => ({
  ...(await actual<typeof import("@/lib/calendar/queries")>()),
  getEvent: async () => h.event,
}));

vi.mock("@/lib/sync/write-event", () => ({ writeEvent: h.writeEvent }));
vi.mock("@/lib/sync/engine", () => ({ writeEngineDeps: () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "u1" } } }) },
    rpc: h.rpc,
    from: (table: string) => ({
      update: (row: Record<string, unknown>) => ({
        eq: async (_column: string, id: string) => {
          h.updates.push({ row, id });
          return { error: null };
        },
      }),
      delete: () => ({
        eq: async (_column: string, id: string) => {
          h.deleted.push(id);
          return { error: null };
        },
      }),
      select: () => ({
        eq: () => ({
          count: table === "event_images" ? h.imageCount : null,
          error: null,
          maybeSingle: async () => ({
            data:
              table === "profiles"
                ? { time_zone: "Europe/Madrid" }
                : table === "synced_calendars"
                  ? h.synced
                  : null,
            error: null,
          }),
        }),
      }),
      insert: (row: Record<string, unknown>) => {
        h.inserted.push(row);
        return {
          select: () => ({
            single: async () =>
              h.insertError
                ? { data: null, error: h.insertError }
                : { data: { id: EVENT_ID }, error: null },
          }),
        };
      },
    }),
  }),
}));

const { createEvent, deleteEvent, updateEvent } =
  await import("@/app/dashboard/events/actions");

const EMPTY = {
  values: {
    title: "",
    calendarId: "",
    allDay: "",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    description: "",
    location: "",
    color: "",
    categoryId: "",
    repeat: "none",
  },
};

function form(fields: Record<string, string>) {
  const data = new FormData();
  const all = {
    mode: "modal",
    title: "Extraescolar",
    calendarId: CALENDAR_ID,
    // Wednesday 7 October 2026, 18:00 in Madrid.
    startDate: "2026-10-07",
    startTime: "18:00",
    endDate: "2026-10-07",
    endTime: "19:30",
    ...fields,
  };
  for (const [key, value] of Object.entries(all)) data.append(key, value);
  return data;
}

beforeEach(() => {
  h.inserted = [];
  h.insertError = null;
  h.synced = null;
  h.event = null;
  h.imageCount = 0;
  h.updates = [];
  h.deleted = [];
  h.rpc.mockReset();
  h.rpc.mockResolvedValue({
    data: [{ exceptions: 0, images: 0 }],
    error: null,
  });
  h.writeEvent.mockReset();
  h.writeEvent.mockResolvedValue({ status: "normal" });
});

describe("createEvent with Repetir", () => {
  it("'No se repite' creates a single event, as before (RF-1)", async () => {
    const state = await createEvent(EMPTY, form({ repeat: "none" }));
    expect(state.done).toBe("created");
    expect(h.inserted[0]).not.toHaveProperty("recurrence");
  });

  it("a quick option saves the rule, the profile's zone and no end (RF-6, RF-12)", async () => {
    const state = await createEvent(EMPTY, form({ repeat: "weekly" }));
    expect(state.done).toBe("created");
    expect(h.inserted[0]).toMatchObject({
      recurrence: "FREQ=WEEKLY;INTERVAL=1;BYDAY=WE",
      recurrence_tz: "Europe/Madrid",
      recurrence_until: null,
      starts_at: "2026-10-07T16:00:00.000Z",
      ends_at: "2026-10-07T17:30:00.000Z",
      created_by: "u1",
    });
    expect(h.writeEvent).not.toHaveBeenCalled();
  });

  it("moves the start to the first occurrence of a custom rule (casos límite)", async () => {
    await createEvent(
      EMPTY,
      form({ repeat: "custom:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;COUNT=2" }),
    );
    expect(h.inserted[0]).toMatchObject({
      recurrence: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;COUNT=2",
      starts_at: "2026-10-12T16:00:00.000Z",
      ends_at: "2026-10-12T17:30:00.000Z",
      recurrence_until: "2026-10-19T17:30:00.000Z",
    });
  });

  it("all-day series have no zone (RF-6, RF-14)", async () => {
    await createEvent(
      EMPTY,
      form({ allDay: "on", repeat: "yearly", endDate: "2026-10-07" }),
    );
    expect(h.inserted[0]).toMatchObject({
      recurrence: "FREQ=YEARLY;INTERVAL=1;BYMONTH=10;BYMONTHDAY=7",
      recurrence_tz: null,
      all_day: true,
      starts_at: "2026-10-07T00:00:00.000Z",
    });
  });

  it("a rule without occurrences is not saved (RF-8)", async () => {
    const state = await createEvent(
      EMPTY,
      form({
        repeat: "custom:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;UNTIL=20261011T235959",
      }),
    );
    expect(state.fieldErrors?.repeat).toBe(
      "Con este final la serie no tiene ninguna repetición.",
    );
    expect(state.values.repeat).toBe(
      "custom:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;UNTIL=20261011T235959",
    );
    expect(h.inserted).toEqual([]);
  });

  it("an invalid value is refused next to the field", async () => {
    const state = await createEvent(
      EMPTY,
      form({ repeat: "custom:FREQ=HOURLY" }),
    );
    expect(state.fieldErrors?.repeat).toBe("Elige una repetición válida.");
    expect(h.inserted).toEqual([]);
  });

  it("no series in a calendar of Google (RF-29)", async () => {
    h.synced = { calendar_id: CALENDAR_ID };
    const state = await createEvent(EMPTY, form({ repeat: "daily" }));
    expect(state.fieldErrors?.repeat).toBe(
      "Los calendarios de Google no admiten repeticiones en CaFam.",
    );
    expect(h.writeEvent).not.toHaveBeenCalled();
    expect(h.inserted).toEqual([]);
  });

  it("explains the limit of 500 series (RF-31)", async () => {
    h.insertError = { code: "CF429", message: "series" };
    const state = await createEvent(EMPTY, form({ repeat: "daily" }));
    expect(state.formError).toBe(
      "Este calendario ya tiene 500 series. Borra alguna para crear otra.",
    );
  });
});

// Spec 013, T12: saving changes to an occurrence in the chosen scope (RF-15 to
// RF-19, RF-21, RF-23, RF-24b, RF-32).
const SERIES_ID = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const SINGLE = {
  id: EVENT_ID,
  rowId: EVENT_ID,
  calendarId: CALENDAR_ID,
  title: "Extraescolar",
  description: null,
  location: null,
  startsAt: "2026-10-07T16:00:00.000Z",
  endsAt: "2026-10-07T17:30:00.000Z",
  allDay: false,
  color: null,
  categoryId: null,
  createdBy: "u2",
  series: null,
};
// The occurrence of 14 October of "every Wednesday at 18:00".
const OCCURRENCE = {
  ...SINGLE,
  id: `${SERIES_ID}_20261014T160000Z`,
  rowId: null,
  startsAt: "2026-10-14T16:00:00.000Z",
  endsAt: "2026-10-14T17:30:00.000Z",
  series: {
    id: SERIES_ID,
    recurrence: "FREQ=WEEKLY;INTERVAL=1;BYDAY=WE",
    recurrenceTz: "Europe/Madrid",
    summary: "Cada semana el miércoles",
    originalStart: "2026-10-14T16:00:00.000Z",
    changed: false,
    exceptions: 0,
    startsAt: "2026-10-07T16:00:00.000Z",
    endsAt: "2026-10-07T17:30:00.000Z",
    allDay: false,
  },
};
const SAME = "custom:FREQ=WEEKLY;INTERVAL=1;BYDAY=WE";

function occurrenceForm(fields: Record<string, string>) {
  return form({
    startDate: "2026-10-14",
    endDate: "2026-10-14",
    repeat: SAME,
    ...fields,
  });
}

function rpcCalls(name: string) {
  return h.rpc.mock.calls.filter(([fn]) => fn === name);
}

describe("updateEvent on an occurrence", () => {
  beforeEach(() => {
    h.event = OCCURRENCE;
    h.rpc.mockImplementation(async (fn: string) =>
      fn === "series_loss"
        ? { data: [{ exceptions: 0, images: 0, comments: 0 }], error: null }
        : { data: "new-id", error: null },
    );
  });

  it("accepts the id of an occurrence and asks for the scope (RF-15)", async () => {
    const state = await updateEvent(OCCURRENCE.id, EMPTY, occurrenceForm({}));
    expect(state.formError).toBe("Elige a qué eventos se aplica.");
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("'Solo este evento' calls update_occurrence (RF-16)", async () => {
    const state = await updateEvent(
      OCCURRENCE.id,
      EMPTY,
      occurrenceForm({ scope: "this", title: "Natación" }),
    );
    expect(state.done).toBe("updated");
    expect(rpcCalls("update_occurrence")[0]![1]).toMatchObject({
      p_series_id: SERIES_ID,
      p_original_start: "2026-10-14T16:00:00.000Z",
      p_fields: { title: "Natación" },
    });
    expect(h.writeEvent).not.toHaveBeenCalled();
  });

  it("'Este y los siguientes' calls split_series (RF-17)", async () => {
    await updateEvent(
      OCCURRENCE.id,
      EMPTY,
      occurrenceForm({ scope: "following", title: "Natación" }),
    );
    expect(rpcCalls("split_series")[0]![1]).toMatchObject({
      p_series_id: SERIES_ID,
      p_keep_exceptions: true,
    });
  });

  it("'Todos los eventos' calls update_series and may move the series (RF-18, RF-23)", async () => {
    const other = "1e2f3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b";
    await updateEvent(
      OCCURRENCE.id,
      EMPTY,
      occurrenceForm({ scope: "all", calendarId: other }),
    );
    expect(rpcCalls("update_series")[0]![1]).toMatchObject({
      p_series_id: SERIES_ID,
      p_fields: { calendar_id: other },
      p_drop_exceptions: false,
    });
  });

  it("returns what would be lost and saves nothing until confirmed (RF-19, RF-24b)", async () => {
    h.rpc.mockImplementation(async (fn: string) =>
      fn === "series_loss"
        ? { data: [{ exceptions: 2, images: 3, comments: 4 }], error: null }
        : { data: "new-id", error: null },
    );
    const state = await updateEvent(
      OCCURRENCE.id,
      EMPTY,
      occurrenceForm({ scope: "all", repeat: "daily" }),
    );
    expect(state.loss).toEqual({ exceptions: 2, images: 3, comments: 4 });
    expect(state.done).toBeUndefined();
    expect(rpcCalls("update_series")).toEqual([]);

    const confirmed = await updateEvent(
      OCCURRENCE.id,
      EMPTY,
      occurrenceForm({ scope: "all", repeat: "daily", confirmLoss: "1" }),
    );
    expect(confirmed.done).toBe("updated");
    expect(rpcCalls("update_series")[0]![1]).toMatchObject({
      p_drop_exceptions: true,
    });
  });

  it("explains the limit of 100 changes (RF-32)", async () => {
    h.rpc.mockResolvedValue({
      data: null,
      error: { code: "CF429", message: "exceptions" },
    });
    const state = await updateEvent(
      OCCURRENCE.id,
      EMPTY,
      occurrenceForm({ scope: "this", title: "Otra" }),
    );
    expect(state.formError).toBe(
      "Esta serie ya tiene 100 cambios sueltos. Usa «Este y los siguientes».",
    );
  });

  it("refuses moving only this occurrence to another calendar (D10)", async () => {
    const state = await updateEvent(
      OCCURRENCE.id,
      EMPTY,
      occurrenceForm({
        scope: "this",
        calendarId: "1e2f3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b",
      }),
    );
    expect(state.formError).toMatch(/Para cambiar de calendario/);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("an occurrence that no longer exists is explained (R5)", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: "CF404" } });
    const state = await updateEvent(
      OCCURRENCE.id,
      EMPTY,
      occurrenceForm({ scope: "this" }),
    );
    expect(state.formError).toBe("Esta repetición ya no existe.");
  });
});

describe("updateEvent turning a single event into a series (RF-21, D7)", () => {
  beforeEach(() => {
    h.event = SINGLE;
  });

  it("without images the row itself becomes the series", async () => {
    const state = await updateEvent(
      EVENT_ID,
      EMPTY,
      form({ repeat: "weekly" }),
    );
    expect(state.done).toBe("updated");
    expect(h.updates).toEqual([
      {
        id: EVENT_ID,
        row: expect.objectContaining({
          recurrence: "FREQ=WEEKLY;INTERVAL=1;BYDAY=WE",
          recurrence_tz: "Europe/Madrid",
        }),
      },
    ]);
    expect(h.inserted).toEqual([]);
  });

  it("with images a new series row takes the event as its first occurrence", async () => {
    h.imageCount = 2;
    await updateEvent(EVENT_ID, EMPTY, form({ repeat: "weekly" }));
    expect(h.inserted[0]).toMatchObject({
      recurrence: "FREQ=WEEKLY;INTERVAL=1;BYDAY=WE",
      created_by: "u2",
    });
    expect(h.updates[0]!.row).toMatchObject({
      series_id: EVENT_ID,
      original_start: "2026-10-07T16:00:00.000Z",
    });
    expect(h.updates[0]!.row).not.toHaveProperty("recurrence");
  });

  it("never in a calendar of Google (RF-29)", async () => {
    h.synced = { calendar_id: CALENDAR_ID };
    const state = await updateEvent(EVENT_ID, EMPTY, form({ repeat: "daily" }));
    expect(state.fieldErrors?.repeat).toMatch(/Google/);
    expect(h.updates).toEqual([]);
  });
});

// Spec 013, T13: deleting occurrences in the chosen scope (RF-20, RF-24b).
describe("deleteEvent on an occurrence", () => {
  function scoped(fields: Record<string, string>) {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.append(key, value);
    return data;
  }

  beforeEach(() => {
    h.event = OCCURRENCE;
    h.rpc.mockImplementation(async (fn: string) =>
      fn === "series_loss"
        ? { data: [{ exceptions: 0, images: 0, comments: 0 }], error: null }
        : { data: null, error: null },
    );
  });

  it("needs the scope", async () => {
    const state = await deleteEvent(OCCURRENCE.id, "modal", {}, scoped({}));
    expect(state.formError).toBe("Elige a qué eventos se aplica.");
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("'Solo este evento' calls delete_occurrences and closes the window", async () => {
    const state = await deleteEvent(
      OCCURRENCE.id,
      "modal",
      {},
      scoped({ scope: "this" }),
    );
    expect(state).toEqual({ done: "deleted" });
    expect(rpcCalls("series_loss")[0]![1]).toEqual({
      p_series_id: SERIES_ID,
      p_only: "2026-10-14T16:00:00.000Z",
    });
    expect(rpcCalls("delete_occurrences")[0]![1]).toMatchObject({
      p_series_id: SERIES_ID,
      p_scope: "this",
    });
    expect(h.writeEvent).not.toHaveBeenCalled();
  });

  it("warns of the images that go and deletes once confirmed (RF-24b)", async () => {
    h.rpc.mockImplementation(async (fn: string) =>
      fn === "series_loss"
        ? { data: [{ exceptions: 1, images: 4, comments: 0 }], error: null }
        : { data: null, error: null },
    );
    const state = await deleteEvent(
      OCCURRENCE.id,
      "modal",
      {},
      scoped({ scope: "all" }),
    );
    expect(state).toEqual({ loss: { exceptions: 1, images: 4, comments: 0 } });
    expect(rpcCalls("delete_occurrences")).toEqual([]);

    await deleteEvent(
      OCCURRENCE.id,
      "modal",
      {},
      scoped({ scope: "all", confirmLoss: "1" }),
    );
    expect(rpcCalls("delete_occurrences")[0]![1]).toMatchObject({
      p_scope: "all",
    });
  });

  it("on the full page it reads the form after the state and redirects", async () => {
    await expect(
      deleteEvent(OCCURRENCE.id, {}, scoped({ scope: "following" })),
    ).rejects.toThrow("REDIRECT:/dashboard/calendar");
    expect(rpcCalls("delete_occurrences")[0]![1]).toMatchObject({
      p_scope: "following",
    });
  });
});
