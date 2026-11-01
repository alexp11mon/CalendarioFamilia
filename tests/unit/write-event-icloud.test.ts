// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncDeps } from "@/lib/sync/run-sync";
import {
  ProviderError,
  type ProviderSession,
} from "@/lib/sync/providers/types";
import { uploadCalendar } from "@/lib/sync/upload-calendar";
import {
  createSyncedCalendar,
  renameSyncedCalendar,
} from "@/lib/sync/write-calendar";
import { writeEvent, type EventRowInput } from "@/lib/sync/write-event";

// Spec 018, T11: the writes of spec 009 with an iCloud double (plan D1, D7,
// D9, D14; RF-34 to RF-37, RF-41, RF-42, RF-45, RF-48, RF-52 to RF-60).
const session = {
  listCalendars: vi.fn(),
  listEvents: vi.fn(),
  insertEvent: vi.fn(),
  updateEvent: vi.fn(),
  moveEvent: vi.fn(),
  deleteEvent: vi.fn(),
  insertCalendar: vi.fn(),
  renameCalendar: vi.fn(),
  deleteCalendar: vi.fn(),
} satisfies Record<keyof ProviderSession, unknown>;

vi.mock("@/lib/sync/providers/icloud", () => ({
  icloudSession: vi.fn(() => session),
}));

type Call = { fn: string; args: Record<string, unknown> };
let calls: Call[];
let rpcResults: Record<string, { data?: unknown; error?: unknown }>;
let tables: Record<string, unknown>;

const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
  calls.push({ fn, args });
  const result = rpcResults[fn] ?? {};
  return { data: result.data ?? null, error: result.error ?? null };
});

const from = (table: string) => {
  const builder = {
    select: (_columns: string, options?: { head?: boolean }) =>
      options?.head ? { eq: async () => ({ count: 1, error: null }) } : builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: tables[table] ?? null, error: null }),
  };
  return builder;
};

const fetchFn = vi.fn<typeof fetch>();

function deps(): SyncDeps {
  return {
    supabase: { rpc, from } as unknown as SyncDeps["supabase"],
    secret: "s3cret",
    clientId: "id",
    clientSecret: "secret",
    fetchFn,
  };
}

const HOME = "https://p42-caldav.icloud.com/123/calendars/home/";
const WORK = "https://p42-caldav.icloud.com/123/calendars/work/";
const HREF = "/123/calendars/home/one.ics";

const context = (extra: Record<string, unknown> = {}) => ({
  data: {
    synced: true,
    provider: "icloud",
    connection_id: "conn-i",
    calendar_external_id: HOME,
    target_external_id: HOME,
    event_external_id: HREF,
    ...extra,
  },
});

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

const named = (fn: string) => calls.filter((c) => c.fn === fn);

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  rpcResults = {
    sync_write_context: context(),
    sync_get_token: { data: '{"v":1,"username":"a","password":"b"}' },
    sync_commit_event: { data: "ev-1" },
  };
  tables = {};
  for (const fn of Object.values(session)) fn.mockResolvedValue(undefined);
});

describe("writeEvent with iCloud", () => {
  it("creates in iCloud first and saves its href (RF-37)", async () => {
    session.insertEvent.mockResolvedValue("/123/calendars/home/new.ics");

    const result = await writeEvent({ op: "create", row }, deps());

    expect(result).toEqual({ status: "done", eventId: "ev-1" });
    expect(session.insertEvent).toHaveBeenCalledWith(HOME, row);
    expect(named("sync_commit_event")[0].args).toMatchObject({
      p_op: "insert",
      p_external_id: "/123/calendars/home/new.ics",
    });
    // No Google token is renewed.
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("changes one repetition by its href#RECURRENCE-ID (RF-40)", async () => {
    rpcResults.sync_write_context = context({
      event_external_id: `${HREF}#20261103T090000Z`,
    });
    const before = { ...row, title: "Antes" };

    await writeEvent(
      { op: "update", eventId: "ev-1", calendarId: "cal-a", before, row },
      deps(),
    );

    expect(session.updateEvent).toHaveBeenCalledWith(
      HOME,
      `${HREF}#20261103T090000Z`,
      before,
      row,
    );
    expect(named("sync_commit_event")[0].args.p_op).toBe("update");
  });

  it("saves the new href after moving to another calendar (plan D9)", async () => {
    rpcResults.sync_write_context = context({ target_external_id: WORK });
    session.moveEvent.mockResolvedValue("/123/calendars/work/one.ics");

    await writeEvent(
      {
        op: "update",
        eventId: "ev-1",
        calendarId: "cal-a",
        before: row,
        row: { ...row, calendar_id: "cal-b" },
      },
      deps(),
    );

    expect(session.moveEvent).toHaveBeenCalledWith(HOME, HREF, WORK);
    expect(named("sync_commit_event")[0].args.p_external_id).toBe(
      "/123/calendars/work/one.ics",
    );
  });

  it("deletes in iCloud, then in CaFam (RF-41)", async () => {
    await writeEvent(
      { op: "delete", eventId: "ev-1", calendarId: "cal-a" },
      deps(),
    );
    expect(session.deleteEvent).toHaveBeenCalledWith(HOME, HREF);
    expect(named("sync_commit_event")[0].args.p_op).toBe("delete");
  });

  it("an event deleted in iCloud is removed from CaFam (RF-48)", async () => {
    session.deleteEvent.mockRejectedValue(new ProviderError("missing", "404"));
    const result = await writeEvent(
      { op: "delete", eventId: "ev-1", calendarId: "cal-a" },
      deps(),
    );
    expect(result).toEqual({ status: "gone", provider: "icloud" });
    expect(named("sync_commit_event")[0].args.p_op).toBe("gone");
  });

  it("saves nothing when iCloud refuses or does not answer (RF-45, RF-46, RF-47)", async () => {
    for (const kind of ["rejected", "transient"] as const) {
      calls = [];
      session.updateEvent.mockRejectedValue(new ProviderError(kind, "x"));
      const result = await writeEvent(
        {
          op: "update",
          eventId: "ev-1",
          calendarId: "cal-a",
          before: { ...row, title: "Antes" },
          row,
        },
        deps(),
      );
      expect(result).toEqual({
        status: "failed",
        failure: kind,
        provider: "icloud",
      });
      expect(named("sync_commit_event")).toEqual([]);
    }
  });

  it("a refused password marks the account (RF-61)", async () => {
    session.insertEvent.mockRejectedValue(new ProviderError("revoked", "401"));
    const result = await writeEvent({ op: "create", row }, deps());
    expect(result).toMatchObject({ failure: "revoked", provider: "icloud" });
    expect(named("sync_fail")[0].args).toMatchObject({ p_kind: "revoked" });
  });
});

describe("calendars with iCloud", () => {
  beforeEach(() => {
    tables = {
      synced_calendars: {
        connection_id: "conn-i",
        external_id: HOME,
        can_write: true,
        provider: "icloud",
      },
      calendars: { name: "Casa", owner_id: "u1" },
      calendar_connections: {
        status: "active",
        can_write: true,
        provider: "icloud",
      },
    };
  });

  const rename = () =>
    renameSyncedCalendar(deps(), {
      userId: "u1",
      calendarId: "cal-a",
      name: "Casa nueva",
      description: null,
      color: "#A0C4FF",
    });

  it("renames in iCloud, then in CaFam (RF-52)", async () => {
    expect(await rename()).toEqual({ status: "done" });
    expect(session.renameCalendar).toHaveBeenCalledWith(HOME, "Casa nueva");
    expect(named("sync_update_calendar")).toHaveLength(1);
  });

  it("keeps the old name when iCloud refuses it (RF-52)", async () => {
    session.renameCalendar.mockRejectedValue(
      new ProviderError("rejected", "x"),
    );
    expect(await rename()).toEqual({
      status: "failed",
      failure: "rejected",
      provider: "icloud",
    });
    expect(named("sync_update_calendar")).toEqual([]);
  });

  it("creates a calendar in iCloud and undoes it if CaFam refuses (RF-54)", async () => {
    session.insertCalendar.mockResolvedValue(WORK);
    rpcResults.sync_attach_created = { error: { code: "CF429" } };

    const result = await createSyncedCalendar(deps(), {
      connectionId: "conn-i",
      name: "Trabajo",
      timeZone: "Europe/Madrid",
    });

    expect(result).toEqual({ status: "limit" });
    expect(session.deleteCalendar).toHaveBeenCalledWith(WORK);
  });

  it("uploads to iCloud and removes what it created when a copy fails (RF-59)", async () => {
    session.insertCalendar.mockResolvedValue(WORK);
    session.insertEvent.mockRejectedValue(new ProviderError("rejected", "403"));

    const result = await uploadCalendar(deps(), {
      calendarId: "cal-a",
      connectionId: "conn-i",
      name: "Familia",
      timeZone: "Europe/Madrid",
      events: [
        {
          id: "e1",
          title: "Cena",
          description: null,
          location: null,
          starts_at: "2026-11-05T19:00:00.000Z",
          ends_at: "2026-11-05T21:00:00.000Z",
          all_day: false,
        },
      ],
    });

    expect(result).toEqual({
      status: "failed",
      failure: "rejected",
      provider: "icloud",
    });
    expect(session.deleteCalendar).toHaveBeenCalledWith(WORK);
    expect(named("sync_attach_uploaded")).toEqual([]);
  });
});
