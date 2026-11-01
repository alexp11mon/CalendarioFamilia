// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Spec 007, T9: saving the selection and "Actualizar ahora" (plan D5; RF-10,
// RF-11, RF-14, RF-23, RF-24).
const {
  rpc,
  rows,
  syncConnection,
  revokeConnection,
  revalidatePath,
  redirect,
  createSyncedCalendar,
} = vi.hoisted(() => ({
  createSyncedCalendar: vi.fn(),
  rpc: vi.fn(),
  rows: {} as Record<string, unknown[]>,
  syncConnection: vi.fn(),
  revokeConnection: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

function query(table: string) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: rows[table]?.[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => void) =>
      resolve({ data: rows[table] ?? [], error: null }),
  };
  return chain;
}

vi.mock("@/lib/calendar/queries", () => ({
  requireActionUser: async () => ({
    supabase: { from: query, rpc },
    userId: "user-1",
  }),
  getProfileTimeZone: async () => "Europe/Madrid",
}));
vi.mock("@/lib/sync/engine", () => ({
  syncConnection,
  revokeConnection,
  writeEngineDeps: () => ({}),
}));
vi.mock("@/lib/sync/write-calendar", () => ({ createSyncedCalendar }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));

import {
  createGoogleCalendar,
  disconnectAccount,
  saveSelection,
  syncNow,
} from "@/app/dashboard/connections/actions";

const CONNECTION = "6f1c2a9e-1f0e-4c38-9d43-2a3b5c6d7e8f";

function form(
  calendars: { id: string; name: string; color: string | null }[],
  extra: Record<string, string> = {},
) {
  const data = new FormData();
  data.set("connectionId", CONNECTION);
  for (const calendar of calendars)
    data.append("calendar", JSON.stringify(calendar));
  for (const [key, value] of Object.entries(extra)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  rows.calendar_connections = [{ id: CONNECTION, provider: "google" }];
  rows.synced_calendars = [];
  rpc.mockResolvedValue({ data: [], error: null });
  syncConnection.mockResolvedValue({
    status: "ok",
    results: [
      { calendarId: "x", summary: { added: 4, changed: 0, removed: 0 } },
    ],
  });
});

const rpcCalls = (fn: string) => rpc.mock.calls.filter(([name]) => name === fn);

describe("saveSelection (RF-10, RF-11, RF-14)", () => {
  it("rejects malformed data without touching the database", async () => {
    const data = form([]);
    data.set("connectionId", "nope");
    const state = await saveSelection({}, data);

    expect(state.formError).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects another user's connection (RLS hides it)", async () => {
    rows.calendar_connections = [];
    const state = await saveSelection(
      {},
      form([{ id: "g1", name: "A", color: null }]),
    );

    expect(state.formError).toMatch(/ya no existe/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects more than 20 calendars", async () => {
    const many = Array.from({ length: 21 }, (_, i) => ({
      id: `g${i}`,
      name: `C${i}`,
      color: null,
    }));
    const state = await saveSelection({}, form(many));
    expect(state.formError).toMatch(/20/);
  });

  it("creates the new calendars with the nearest palette color and updates them", async () => {
    const state = await saveSelection(
      {},
      form([{ id: "g1", name: "Trabajo", color: "#ff0000" }]),
    );

    expect(rpcCalls("select_synced_calendars")[0][1]).toEqual({
      p_connection_id: CONNECTION,
      p_calendars: [
        { external_id: "g1", name: "Trabajo", color: "#FFADAD", access: null },
      ],
    });
    expect(syncConnection).toHaveBeenCalledWith(CONNECTION, false);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
    expect(state.message).toMatch(/4 añadidos/);
  });

  it("asks what to do with unchecked calendars and applies the choice", async () => {
    rows.synced_calendars = [{ calendar_id: "cal-1", external_id: "g1" }];

    const missing = await saveSelection({}, form([]));
    expect(missing.fieldErrors?.decision).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();

    await saveSelection({}, form([], { decision: "keep" }));
    expect(rpcCalls("detach_synced_calendars")[0][1]).toEqual({
      p_connection_id: CONNECTION,
      p_calendar_ids: ["cal-1"],
      p_delete: false,
    });
    expect(rpcCalls("select_synced_calendars")).toHaveLength(0);
  });

  it("explains the limit of 20 when the database refuses (CF429)", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "CF429" } });
    const state = await saveSelection(
      {},
      form([{ id: "g1", name: "A", color: null }]),
    );
    expect(state.formError).toMatch(/20/);
  });
});

describe("syncNow (RF-23, RF-24)", () => {
  it("says when it can update again", async () => {
    syncConnection.mockResolvedValue({
      status: "too_soon",
      nextAt: new Date(Date.now() + 3 * 60_000 - 1000).toISOString(),
    });

    const state = await syncNow(CONNECTION);

    expect(state.message).toMatch(/dentro de 3 minutos/);
  });

  it("summarises the update", async () => {
    const state = await syncNow(CONNECTION);

    expect(syncConnection).toHaveBeenCalledWith(CONNECTION, true);
    expect(state.message).toMatch(/4 añadidos/);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  });

  it("says which calendars failed", async () => {
    syncConnection.mockResolvedValue({
      status: "ok",
      results: [{ calendarId: "x", error: "transient" }],
    });
    const state = await syncNow(CONNECTION);
    expect(state.message).toMatch(/1 calendario no se ha podido actualizar/);
  });

  it("asks to reconnect when Google withdrew the permission", async () => {
    syncConnection.mockResolvedValue({ status: "needs_reauth" });
    const state = await syncNow(CONNECTION);
    expect(state.formError).toMatch(/vuelve a conectar/i);
  });

  it("does nothing on another user's connection", async () => {
    rows.calendar_connections = [];
    const state = await syncNow(CONNECTION);
    expect(state.formError).toMatch(/ya no existe/i);
    expect(syncConnection).not.toHaveBeenCalled();
  });
});

describe("disconnectAccount (RF-27 to RF-30)", () => {
  function decision(value?: string) {
    const data = new FormData();
    if (value) data.set("decision", value);
    return data;
  }

  it("needs a choice when the account brings calendars", async () => {
    rows.synced_calendars = [{ calendar_id: "cal-1", external_id: "g1" }];
    const state = await disconnectAccount(CONNECTION, {}, decision());

    expect(state.formError).toMatch(/conservas o borras/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("revokes in Google first, then disconnects and goes back to the list", async () => {
    revokeConnection.mockImplementation(async () => {
      expect(rpc).not.toHaveBeenCalled();
    });

    await disconnectAccount(CONNECTION, {}, decision("delete"));

    // Spec 018 T3: the provider says how to revoke (Google) or not (iCloud).
    expect(revokeConnection).toHaveBeenCalledWith(CONNECTION, "google");
    expect(rpcCalls("disconnect_account")[0][1]).toEqual({
      p_connection_id: CONNECTION,
      p_delete: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
    expect(redirect).toHaveBeenCalledWith("/dashboard/connections");
  });

  it("disconnects even if Google's revocation fails", async () => {
    revokeConnection.mockRejectedValue(new Error("down"));

    await disconnectAccount(CONNECTION, {}, decision("keep"));

    expect(rpcCalls("disconnect_account")[0][1]).toMatchObject({
      p_delete: false,
    });
  });

  it("does nothing on another user's connection", async () => {
    rows.calendar_connections = [];
    const state = await disconnectAccount(CONNECTION, {}, decision("keep"));

    expect(state.formError).toMatch(/ya no existe/i);
    expect(revokeConnection).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});

// Spec 009, T10: a new calendar in Google (RF-32, RF-33).
describe("createGoogleCalendar", () => {
  const named = (name: string) => {
    const data = new FormData();
    data.set("name", name);
    return data;
  };
  const empty = { values: { name: "" } };

  it("validates the name before calling Google", async () => {
    const state = await createGoogleCalendar(CONNECTION, empty, named(" "));
    expect(state.fieldErrors?.name).toBeTruthy();
    expect(createSyncedCalendar).not.toHaveBeenCalled();
  });

  it("creates it and opens the account page", async () => {
    createSyncedCalendar.mockResolvedValue({ status: "done", calendarId: "c" });
    await createGoogleCalendar(CONNECTION, empty, named("Cole"));
    expect(createSyncedCalendar.mock.calls[0][1]).toEqual({
      connectionId: CONNECTION,
      name: "Cole",
      timeZone: "Europe/Madrid",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
    expect(redirect).toHaveBeenCalledWith(
      `/dashboard/connections/${CONNECTION}`,
    );
  });

  it.each([
    [{ status: "limit" }, /máximo 20/],
    [{ status: "failed", failure: "transient" }, /Google no responde/],
    [{ status: "failed", failure: "rejected" }, /Google no ha permitido/],
  ])("explains %o and keeps the name", async (result, text) => {
    createSyncedCalendar.mockResolvedValue(result);
    const state = await createGoogleCalendar(CONNECTION, empty, named("Cole"));
    expect(state.formError).toMatch(text);
    expect(state.values.name).toBe("Cole");
    expect(redirect).not.toHaveBeenCalled();
  });
});
