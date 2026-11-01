// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncDeps } from "@/lib/sync/run-sync";
import { writeEvent, type EventRowInput } from "@/lib/sync/write-event";

// Spec 009, T7: the write engine with fake Google and a fake rpc (plan D4, D6,
// D7, D9, D12; RF-10 to RF-12, RF-14, RF-17, RF-19, RF-21 to RF-25, RF-27).
type Call = { fn: string; args: Record<string, unknown> };
let calls: Call[];
let handlers: Record<
  string,
  (args: Record<string, unknown>) => { data?: unknown; error?: unknown }
>;

const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
  calls.push({ fn, args });
  const result = handlers[fn]?.(args) ?? {};
  return { data: result.data ?? null, error: result.error ?? null };
});

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;
let google: (url: string, init?: RequestInit) => Response | Promise<Response>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function deps(extra: Partial<SyncDeps> = {}): SyncDeps {
  return {
    supabase: { rpc } as unknown as SyncDeps["supabase"],
    secret: "s3cret",
    clientId: "id",
    clientSecret: "secret",
    fetchFn,
    ...extra,
  };
}

const context = {
  synced: true,
  connection_id: "conn-1",
  calendar_external_id: "a@group",
  target_external_id: "a@group",
  event_external_id: "g-1",
};

const row: EventRowInput = {
  calendar_id: "cal-a",
  title: "Cita",
  description: null,
  location: null,
  starts_at: "2026-11-03T09:00:00.000Z",
  ends_at: "2026-11-03T10:00:00.000Z",
  all_day: false,
  color: "#FFADAD",
  category_id: null,
};

const googleCalls = () =>
  fetchFn.mock.calls
    .map(([url, init]) => ({ url: String(url), method: init?.method }))
    .filter((c) => c.url !== TOKEN_URL);
const named = (fn: string) => calls.filter((c) => c.fn === fn);

beforeEach(() => {
  calls = [];
  handlers = {
    sync_write_context: () => ({ data: context }),
    sync_get_token: () => ({ data: "rt" }),
    sync_commit_event: () => ({ data: "ev-1" }),
  };
  google = () => json({ id: "g-new" });
  fetchFn = vi.fn<typeof fetch>(async (input, init) =>
    String(input) === TOKEN_URL
      ? json({ access_token: "at" })
      : google(String(input), init),
  );
  rpc.mockClear();
});

describe("normal calendars", () => {
  it("answers normal and never calls Google", async () => {
    handlers.sync_write_context = () => ({ data: { synced: false } });
    const result = await writeEvent({ op: "create", row }, deps());
    expect(result).toEqual({ status: "normal" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("create (RF-10)", () => {
  it("creates in Google first, then in CaFam with the Google id", async () => {
    const result = await writeEvent({ op: "create", row }, deps());
    expect(result).toEqual({ status: "done", eventId: "ev-1" });
    expect(googleCalls()).toEqual([
      { url: `${API}/calendars/a%40group/events`, method: "POST" },
    ]);
    expect(named("sync_commit_event")[0].args).toMatchObject({
      p_secret: "s3cret",
      p_op: "insert",
      p_calendar_id: "cal-a",
      p_external_id: "g-new",
      p_row: row,
    });
    expect(named("sync_write_context")[0].args).toMatchObject({
      p_calendar_id: "cal-a",
      p_target_calendar_id: "cal-a",
    });
  });

  it("does not save in CaFam when Google fails (RF-21)", async () => {
    google = () => json({ error: { code: 500 } }, 500);
    const result = await writeEvent({ op: "create", row }, deps());
    expect(result).toEqual({ status: "failed", failure: "transient" });
    expect(named("sync_commit_event")).toEqual([]);
  });
});

describe("update (RF-11, RF-14, RF-19)", () => {
  const before = { ...row, title: "Antes" };

  it("sends only what changed to the event's Google id", async () => {
    const result = await writeEvent(
      { op: "update", eventId: "ev-1", calendarId: "cal-a", before, row },
      deps(),
    );
    expect(result).toEqual({ status: "done", eventId: "ev-1" });
    const [patch] = fetchFn.mock.calls.filter(
      ([, init]) => init?.method === "PATCH",
    );
    expect(String(patch[0])).toBe(`${API}/calendars/a%40group/events/g-1`);
    expect(JSON.parse(String(patch[1]?.body))).toEqual({ summary: "Cita" });
    expect(named("sync_commit_event")[0].args).toMatchObject({
      p_op: "update",
      p_event_id: "ev-1",
      p_calendar_id: "cal-a",
    });
  });

  it("a change of color only is saved in CaFam without calling Google (spec 017 RF-38)", async () => {
    const result = await writeEvent(
      {
        op: "update",
        eventId: "ev-1",
        calendarId: "cal-a",
        before: row,
        row: { ...row, color: "#BDB2FF" },
      },
      deps(),
    );
    expect(result).toEqual({ status: "done", eventId: "ev-1" });
    expect(googleCalls()).toEqual([]);
    expect(named("sync_commit_event")[0].args).toMatchObject({
      p_op: "update",
      p_row: expect.objectContaining({ color: "#BDB2FF" }),
    });
  });

  it("patches first and moves after when the calendar changes (D7)", async () => {
    handlers.sync_write_context = () => ({
      data: { ...context, target_external_id: "b@group" },
    });
    await writeEvent(
      {
        op: "update",
        eventId: "ev-1",
        calendarId: "cal-a",
        before,
        row: { ...row, calendar_id: "cal-b" },
      },
      deps(),
    );
    expect(googleCalls()).toEqual([
      { url: `${API}/calendars/a%40group/events/g-1`, method: "PATCH" },
      {
        url: `${API}/calendars/a%40group/events/g-1/move?destination=b%40group`,
        method: "POST",
      },
    ]);
    expect(named("sync_write_context")[0].args).toMatchObject({
      p_target_calendar_id: "cal-b",
    });
  });

  it("an event deleted in Google is removed from CaFam (RF-25)", async () => {
    google = () => json({ error: { code: 404 } }, 404);
    const result = await writeEvent(
      { op: "update", eventId: "ev-1", calendarId: "cal-a", before, row },
      deps(),
    );
    expect(result).toEqual({ status: "gone" });
    expect(named("sync_commit_event")[0].args).toMatchObject({
      p_op: "gone",
      p_event_id: "ev-1",
    });
  });

  it("a revoked account goes to needs_reauth (RF-23)", async () => {
    google = () => json({ error: { code: 401 } }, 401);
    const result = await writeEvent(
      { op: "update", eventId: "ev-1", calendarId: "cal-a", before, row },
      deps(),
    );
    expect(result).toEqual({ status: "failed", failure: "revoked" });
    expect(named("sync_fail")[0].args).toMatchObject({
      p_calendar_id: "cal-a",
      p_kind: "revoked",
    });
    expect(named("sync_commit_event")).toEqual([]);
  });

  it("a refused change is not saved (RF-24)", async () => {
    google = () =>
      json({ error: { code: 403, errors: [{ reason: "forbidden" }] } }, 403);
    const result = await writeEvent(
      { op: "update", eventId: "ev-1", calendarId: "cal-a", before, row },
      deps(),
    );
    expect(result).toEqual({ status: "failed", failure: "rejected" });
    expect(named("sync_commit_event")).toEqual([]);
  });

  it("an event only in CaFam is written only in CaFam (D9)", async () => {
    handlers.sync_write_context = () => ({
      data: { ...context, event_external_id: null },
    });
    const result = await writeEvent(
      { op: "update", eventId: "ev-1", calendarId: "cal-a", before, row },
      deps(),
    );
    expect(result).toEqual({ status: "done", eventId: "ev-1" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("delete (RF-12)", () => {
  it("deletes in Google, then in CaFam", async () => {
    google = () => new Response(null, { status: 204 });
    const result = await writeEvent(
      { op: "delete", eventId: "ev-1", calendarId: "cal-a" },
      deps(),
    );
    expect(result).toEqual({ status: "done", eventId: "ev-1" });
    expect(googleCalls()).toEqual([
      { url: `${API}/calendars/a%40group/events/g-1`, method: "DELETE" },
    ]);
    expect(named("sync_commit_event")[0].args).toMatchObject({
      p_op: "delete",
    });
  });
});

describe("limits and errors", () => {
  it("stops after 9 s and says Google does not answer (RF-22, D12)", async () => {
    vi.useFakeTimers();
    google = (_url, init) =>
      new Promise((_, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("timeout", "TimeoutError")),
        ),
      );
    const pending = writeEvent({ op: "create", row }, deps());
    await vi.advanceTimersByTimeAsync(9_000);
    expect(await pending).toEqual({ status: "failed", failure: "transient" });
    vi.useRealTimers();
  });

  it("passes a database refusal on without calling Google", async () => {
    const error = { code: "42501", message: "no" };
    handlers.sync_write_context = () => ({ error });
    const result = await writeEvent({ op: "create", row }, deps());
    expect(result).toEqual({ status: "dbError", error });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("stores a rotated refresh token before using it", async () => {
    fetchFn.mockImplementation(async (input) =>
      String(input) === TOKEN_URL
        ? json({ access_token: "at", refresh_token: "rt-2" })
        : json({ id: "g-new" }),
    );
    await writeEvent({ op: "create", row }, deps());
    const order = calls.map((c) => c.fn);
    expect(order.indexOf("sync_store_token")).toBeLessThan(
      order.indexOf("sync_commit_event"),
    );
  });
});
