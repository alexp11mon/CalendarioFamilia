// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncDeps } from "@/lib/sync/run-sync";
import {
  createSyncedCalendar,
  renameSyncedCalendar,
} from "@/lib/sync/write-calendar";

// Spec 009, T10: renaming synced calendars and creating calendars in Google
// (plan D13, D15; RF-29 to RF-33).
type Call = { fn: string; args: Record<string, unknown> };
let calls: Call[];
let rpcResults: Record<string, { data?: unknown; error?: unknown }>;
let tables: Record<string, unknown>;
let counts: Record<string, number>;

const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
  calls.push({ fn, args });
  const result = rpcResults[fn] ?? {};
  return { data: result.data ?? null, error: result.error ?? null };
});

// The small part of the query builder these functions use.
const from = (table: string) => {
  const builder = {
    select: (_columns: string, options?: { head?: boolean }) => {
      if (options?.head) {
        return {
          eq: async () => ({ count: counts[table] ?? 0, error: null }),
        };
      }
      return builder;
    },
    eq: () => builder,
    maybeSingle: async () => ({ data: tables[table] ?? null, error: null }),
  };
  return builder;
};

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;
let google: (url: string, init?: RequestInit) => Response;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function deps(): SyncDeps {
  return {
    supabase: { rpc, from } as unknown as SyncDeps["supabase"],
    secret: "s3cret",
    clientId: "id",
    clientSecret: "secret",
    fetchFn,
  };
}

const googleCalls = () =>
  fetchFn.mock.calls
    .map(([url, init]) => ({ url: String(url), method: init?.method }))
    .filter((c) => c.url !== TOKEN_URL);

beforeEach(() => {
  calls = [];
  rpcResults = { sync_get_token: { data: "rt" } };
  tables = {
    synced_calendars: {
      connection_id: "conn-1",
      external_id: "a@group",
      can_write: true,
    },
    calendars: { name: "Casa", owner_id: "u1" },
    calendar_connections: { status: "active", can_write: true },
  };
  counts = { synced_calendars: 3 };
  google = () => json({ id: "new@group" });
  fetchFn = vi.fn<typeof fetch>(async (input, init) =>
    String(input) === TOKEN_URL
      ? json({ access_token: "at" })
      : google(String(input), init),
  );
});

const rename = (name = "Hogar") =>
  renameSyncedCalendar(deps(), {
    userId: "u1",
    calendarId: "cal-1",
    name,
    description: "Solo CaFam",
    color: "#CAFFBF",
  });

describe("renameSyncedCalendar (RF-29 to RF-31)", () => {
  it("a normal calendar answers normal", async () => {
    tables.synced_calendars = null;
    expect(await rename()).toEqual({ status: "normal" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("without a new name nothing goes to Google (RF-31)", async () => {
    expect(await rename("Casa")).toEqual({ status: "normal" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("renames in Google first and then in CaFam", async () => {
    expect(await rename()).toEqual({ status: "done" });
    expect(googleCalls()).toEqual([
      { url: `${API}/calendars/a%40group`, method: "PATCH" },
    ]);
    const body = JSON.parse(
      String(
        fetchFn.mock.calls.find(([, i]) => i?.method === "PATCH")![1]!.body,
      ),
    );
    expect(body).toEqual({ summary: "Hogar" });
    expect(calls.find((c) => c.fn === "sync_update_calendar")?.args).toEqual({
      p_secret: "s3cret",
      p_calendar_id: "cal-1",
      p_name: "Hogar",
      p_description: "Solo CaFam",
      p_color: "#CAFFBF",
    });
  });

  it("does not save when Google refuses (RF-30)", async () => {
    google = () =>
      json({ error: { code: 403, errors: [{ reason: "forbidden" }] } }, 403);
    expect(await rename()).toEqual({
      status: "failed",
      failure: "rejected",
      provider: "google",
    });
    expect(calls.some((c) => c.fn === "sync_update_calendar")).toBe(false);
  });

  it("only the owner, and only if the account writes", async () => {
    tables.calendars = { name: "Casa", owner_id: "other" };
    expect(await rename()).toEqual({ status: "forbidden" });
    tables.calendars = { name: "Casa", owner_id: "u1" };
    tables.synced_calendars = {
      connection_id: "conn-1",
      external_id: "a@group",
      can_write: false,
    };
    expect(await rename()).toEqual({ status: "forbidden" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

const create = () =>
  createSyncedCalendar(deps(), {
    connectionId: "conn-1",
    name: "Cole",
    timeZone: "Europe/Madrid",
  });

describe("createSyncedCalendar (RF-32, RF-33, D15)", () => {
  it("creates the calendar in Google and brings it", async () => {
    rpcResults.sync_attach_created = { data: "cal-new" };
    expect(await create()).toEqual({ status: "done", calendarId: "cal-new" });
    expect(googleCalls()).toEqual([
      { url: `${API}/calendars`, method: "POST" },
    ]);
    expect(
      calls.find((c) => c.fn === "sync_attach_created")?.args,
    ).toMatchObject({
      p_connection_id: "conn-1",
      p_external_id: "new@group",
      p_name: "Cole",
    });
  });

  it("stops before Google at 20 calendars (RF-33)", async () => {
    counts.synced_calendars = 20;
    expect(await create()).toEqual({ status: "limit" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses an account that cannot write or is not the user's", async () => {
    tables.calendar_connections = { status: "active", can_write: false };
    expect(await create()).toEqual({ status: "forbidden" });
    tables.calendar_connections = null;
    expect(await create()).toEqual({ status: "notFound" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("deletes the new Google calendar when CaFam cannot bring it", async () => {
    rpcResults.sync_attach_created = { error: { code: "CF429" } };
    expect(await create()).toEqual({ status: "limit" });
    expect(googleCalls()).toEqual([
      { url: `${API}/calendars`, method: "POST" },
      { url: `${API}/calendars/new%40group`, method: "DELETE" },
    ]);
  });

  it("says Google does not answer", async () => {
    google = () => json({ error: { code: 503 } }, 503);
    expect(await create()).toEqual({
      status: "failed",
      failure: "transient",
      provider: "google",
    });
  });
});
