// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncDeps } from "@/lib/sync/run-sync";
import { uploadCalendar, type UploadEvent } from "@/lib/sync/upload-calendar";

// Spec 009, T11: uploading a CaFam calendar to Google (plan D14; RF-33 to
// RF-37, RF-42).
type Call = { fn: string; args: Record<string, unknown> };
let calls: Call[];
let rpcResults: Record<string, { data?: unknown; error?: unknown }>;
let tables: Record<string, unknown>;
let count: number;

const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
  calls.push({ fn, args });
  const result = rpcResults[fn] ?? {};
  return { data: result.data ?? null, error: result.error ?? null };
});

const from = (table: string) => {
  const builder = {
    select: (_columns: string, options?: { head?: boolean }) =>
      options?.head ? { eq: async () => ({ count, error: null }) } : builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: tables[table] ?? null, error: null }),
  };
  return builder;
};

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;
let insertedEvents: number;
let onEvent: (n: number) => Response;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function deps(extra: Partial<SyncDeps> = {}): SyncDeps {
  return {
    supabase: { rpc, from } as unknown as SyncDeps["supabase"],
    secret: "s3cret",
    clientId: "id",
    clientSecret: "secret",
    fetchFn,
    now: () => new Date("2026-10-29T12:00:00Z"),
    ...extra,
  };
}

const event = (id: string, day: string): UploadEvent => ({
  id,
  title: id,
  description: null,
  location: null,
  starts_at: `${day}T10:00:00.000Z`,
  ends_at: `${day}T11:00:00.000Z`,
  all_day: false,
});

const methods = () =>
  fetchFn.mock.calls
    .filter(([url]) => String(url) !== TOKEN_URL)
    .map(([url, init]) => `${init?.method} ${String(url)}`);

beforeEach(() => {
  calls = [];
  rpcResults = { sync_get_token: { data: "rt" } };
  tables = { calendar_connections: { status: "active", can_write: true } };
  count = 2;
  insertedEvents = 0;
  onEvent = (n) => json({ id: `g-${n}` });
  fetchFn = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url === TOKEN_URL) return json({ access_token: "at" });
    if (url === `${API}/calendars` && init?.method === "POST") {
      return json({ id: "up@group" });
    }
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    return onEvent(++insertedEvents);
  });
});

const upload = (events: UploadEvent[], extra: Partial<SyncDeps> = {}) =>
  uploadCalendar(deps(extra), {
    calendarId: "cal-1",
    connectionId: "conn-1",
    name: "Familia",
    timeZone: "Europe/Madrid",
    events,
  });

describe("uploadCalendar", () => {
  it("uploads series as their occurrences and sends the mapping v2 (spec 013 RF-30)", async () => {
    const result = await upload([
      event("in-1", "2026-11-02"),
      {
        ...event("s1", "2026-11-02"),
        recurrence: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;COUNT=2",
        recurrence_tz: "Europe/Madrid",
        exdates: [],
      },
    ]);
    expect(result).toEqual({ status: "done" });
    expect(methods().filter((m) => m.includes("/events"))).toHaveLength(3);
    const attach = calls.find((c) => c.fn === "sync_attach_uploaded")!.args;
    const mapping = attach.p_mapping as Record<string, string>[];
    expect(mapping.filter((m) => m.event_id).map((m) => m.event_id)).toEqual([
      "in-1",
    ]);
    expect(
      mapping
        .filter((m) => m.series_id)
        .map(({ series_id, starts_at, ends_at }) => ({
          series_id,
          starts_at,
          ends_at,
        }))
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    ).toEqual([
      {
        series_id: "s1",
        starts_at: "2026-11-02T10:00:00.000Z",
        ends_at: "2026-11-02T11:00:00.000Z",
      },
      {
        series_id: "s1",
        starts_at: "2026-11-09T10:00:00.000Z",
        ends_at: "2026-11-09T11:00:00.000Z",
      },
    ]);
  });

  it("creates the calendar, copies only the events of the window and converts it (RF-34, RF-35, RF-42)", async () => {
    const result = await upload([
      event("in-1", "2026-11-02"),
      event("old", "2020-01-01"),
      event("in-2", "2026-12-24"),
    ]);

    expect(result).toEqual({ status: "done" });
    expect(methods().filter((m) => m.startsWith("POST"))).toHaveLength(3);
    const attach = calls.find((c) => c.fn === "sync_attach_uploaded")!.args;
    expect(attach).toMatchObject({
      p_calendar_id: "cal-1",
      p_connection_id: "conn-1",
      p_external_id: "up@group",
    });
    const mapping = attach.p_mapping as { event_id: string }[];
    expect(mapping.map((m) => m.event_id).sort()).toEqual(["in-1", "in-2"]);
  });

  it("stops before Google at 20 calendars (RF-33)", async () => {
    count = 20;
    expect(await upload([])).toEqual({ status: "limit" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("retries when Google asks to wait", async () => {
    let first = true;
    onEvent = (n) => {
      if (first) {
        first = false;
        return json(
          { error: { code: 403, errors: [{ reason: "rateLimitExceeded" }] } },
          403,
        );
      }
      return json({ id: `g-${n}` });
    };
    const sleep = vi.fn(async () => {});
    const result = await uploadCalendar(
      { ...deps(), sleep } as SyncDeps & { sleep: typeof sleep },
      {
        calendarId: "cal-1",
        connectionId: "conn-1",
        name: "Familia",
        timeZone: "Europe/Madrid",
        events: [event("in-1", "2026-11-02")],
      },
    );
    expect(result).toEqual({ status: "done" });
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("removes what it created in Google and leaves CaFam as it was when a copy fails (RF-37)", async () => {
    onEvent = () =>
      json({ error: { code: 400, errors: [{ reason: "invalid" }] } }, 400);
    const result = await upload([event("in-1", "2026-11-02")]);

    expect(result).toEqual({
      status: "failed",
      failure: "rejected",
      provider: "google",
    });
    expect(methods()).toContain(`DELETE ${API}/calendars/up%40group`);
    expect(calls.some((c) => c.fn === "sync_attach_uploaded")).toBe(false);
  });

  it("removes the Google calendar when CaFam refuses the conversion (RF-37, RF-38)", async () => {
    rpcResults.sync_attach_uploaded = { error: { code: "CF404" } };
    const result = await upload([event("in-1", "2026-11-02")]);

    expect(result).toEqual({ status: "notFound" });
    expect(methods()).toContain(`DELETE ${API}/calendars/up%40group`);
  });

  it("gives up and cleans up when it runs out of time (plan D14)", async () => {
    let elapsed = 0;
    const result = await upload(
      Array.from({ length: 10 }, (_, i) => event(`e${i}`, "2026-11-02")),
      { elapsedMs: () => (elapsed += 100_000) },
    );
    expect(result).toEqual({
      status: "failed",
      failure: "transient",
      provider: "google",
    });
    expect(methods()).toContain(`DELETE ${API}/calendars/up%40group`);
  });
});
