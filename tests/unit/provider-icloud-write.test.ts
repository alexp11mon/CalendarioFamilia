// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WritableEvent } from "@/lib/sync/google-payload";
import { serializeCredential } from "@/lib/sync/icloud-credentials";
import { icloudSession } from "@/lib/sync/providers/icloud";

// Spec 018, T9: writing to iCloud with a fake server (plan D7, D9, D14;
// RF-37, RF-41, RF-45, RF-47 to RF-49, RF-52, RF-54, RF-59).
const ROOT = "https://caldav.icloud.com/";
const PRINCIPAL = "https://caldav.icloud.com/123456/principal/";
const HOME = "https://p42-caldav.icloud.com/123456/calendars/";
const CALENDAR = `${HOME}home/`;
const OTHER = `${HOME}work/`;
const HREF = "/123456/calendars/home/one.ics";
const CREDENTIAL = serializeCredential({
  username: "ana@icloud.com",
  password: "abcd-efgh-ijkl-mnop",
});
const XML = { "Content-Type": "application/xml; charset=utf-8" };

const EVENT: WritableEvent = {
  title: "Dentista",
  description: null,
  location: null,
  starts_at: "2026-11-05T09:00:00.000Z",
  ends_at: "2026-11-05T10:00:00.000Z",
  all_day: false,
};

const STORED = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:one",
  "DTSTAMP:20261001T000000Z",
  "SUMMARY:Dentista",
  "DTSTART:20261105T090000Z",
  "DTEND:20261105T100000Z",
  "RRULE:FREQ=WEEKLY;COUNT=3",
  "BEGIN:VALARM",
  "ACTION:DISPLAY",
  "TRIGGER:-PT15M",
  "DESCRIPTION:Aviso",
  "END:VALARM",
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

const SINGLE = STORED.replace("RRULE:FREQ=WEEKLY;COUNT=3\r\n", "");

function multistatus(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">${body}</multistatus>`;
}

type Handler = (request: Request) => Response | Promise<Response>;
let routes: Map<string, Handler[]>;
let calls: { method: string; url: string; headers: Headers; body: string }[];
let fetchFn: typeof fetch;

/** Each call to a route takes the next handler; the last one repeats. */
function route(method: string, url: string, ...handlers: Handler[]) {
  routes.set(`${method} ${url}`, handlers);
}

const ok =
  (status = 201, headers: Record<string, string> = {}) =>
  () =>
    new Response(null, { status, headers });
const ics = (body: string, etag: string) => () =>
  new Response(body, {
    status: 200,
    headers: { ETag: etag, "Content-Type": "text/calendar" },
  });

beforeEach(() => {
  routes = new Map();
  calls = [];
  fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    calls.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: await request.clone().text(),
    });
    const handlers = routes.get(`${request.method} ${request.url}`);
    if (!handlers) return new Response("", { status: 404 });
    const handler = handlers.length > 1 ? handlers.shift()! : handlers[0];
    return handler(request);
  }) as typeof fetch;

  route(
    "PROPFIND",
    ROOT,
    () =>
      new Response(
        multistatus(
          "<response><href>/</href><propstat><prop><current-user-principal><href>/123456/principal/</href></current-user-principal></prop><status>HTTP/1.1 200 OK</status></propstat></response>",
        ),
        { status: 207, headers: XML },
      ),
  );
  route(
    "PROPFIND",
    PRINCIPAL,
    () =>
      new Response(
        multistatus(
          `<response><href>/123456/principal/</href><propstat><prop><C:calendar-home-set><href>${HOME}</href></C:calendar-home-set></prop><status>HTTP/1.1 200 OK</status></propstat></response>`,
        ),
        { status: 207, headers: XML },
      ),
  );
});

const session = () => icloudSession(CREDENTIAL, fetchFn);
const writes = () => calls.filter((c) => c.method !== "PROPFIND");

describe("insertEvent (RF-37)", () => {
  it("puts a new resource only if it does not exist and returns its href", async () => {
    fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      calls.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: await request.text(),
      });
      return new Response(null, { status: 201 });
    }) as typeof fetch;

    const id = await session().insertEvent(CALENDAR, EVENT);

    const [put] = calls;
    expect(put.method).toBe("PUT");
    expect(put.url).toMatch(
      /^https:\/\/p42-caldav\.icloud\.com\/123456\/calendars\/home\/[0-9a-f-]{36}\.ics$/,
    );
    expect(put.headers.get("if-none-match")).toBe("*");
    expect(put.headers.get("content-type")).toMatch(/^text\/calendar/);
    expect(put.body).toContain("SUMMARY:Dentista");
    expect(id).toBe(new URL(put.url).pathname);
  });
});

describe("updateEvent (RF-39, RF-49)", () => {
  const url = `https://p42-caldav.icloud.com${HREF}`;
  const after = { ...EVENT, title: "Dentista (Ana)" };

  it("reads the resource and writes it back with If-Match", async () => {
    route("GET", url, ics(SINGLE, '"e1"'));
    route("PUT", url, ok(204));

    await session().updateEvent(CALENDAR, HREF, EVENT, after);

    const put = writes()[1];
    expect(put.headers.get("if-match")).toBe('"e1"');
    expect(put.body).toContain("SUMMARY:Dentista (Ana)");
    expect(put.body).toContain("BEGIN:VALARM");
  });

  it("changes one repetition in the series' resource", async () => {
    route("GET", url, ics(STORED, '"e1"'));
    route("PUT", url, ok(204));
    const before = {
      ...EVENT,
      starts_at: "2026-11-12T09:00:00.000Z",
      ends_at: "2026-11-12T10:00:00.000Z",
    };

    await session().updateEvent(CALENDAR, `${HREF}#20261112T090000Z`, before, {
      ...before,
      title: "Solo esta",
    });

    expect(writes()[1].body).toContain("RECURRENCE-ID:20261112T090000Z");
  });

  it("a 412 reads again once; a second one is refused", async () => {
    route("GET", url, ics(SINGLE, '"e1"'), ics(SINGLE, '"e2"'));
    route("PUT", url, ok(412), ok(204));
    await session().updateEvent(CALENDAR, HREF, EVENT, after);
    expect(writes().map((c) => c.method)).toEqual(["GET", "PUT", "GET", "PUT"]);
    expect(writes()[3].headers.get("if-match")).toBe('"e2"');

    calls = [];
    route("GET", url, ics(SINGLE, '"e3"'));
    route("PUT", url, ok(412));
    await expect(
      session().updateEvent(CALENDAR, HREF, EVENT, after),
    ).rejects.toMatchObject({ kind: "rejected" });
  });

  it("an event deleted in iCloud is missing (RF-48)", async () => {
    await expect(
      session().updateEvent(CALENDAR, HREF, EVENT, after),
    ).rejects.toMatchObject({ kind: "missing" });
  });
});

describe("deleteEvent (RF-40, RF-41)", () => {
  const url = `https://p42-caldav.icloud.com${HREF}`;

  it("deletes a single event", async () => {
    route("DELETE", url, ok(204));
    await session().deleteEvent(CALENDAR, HREF);
    expect(writes().map((c) => [c.method, c.url])).toEqual([["DELETE", url]]);
  });

  it("deletes one repetition with an EXDATE", async () => {
    route("GET", url, ics(STORED, '"e1"'));
    route("PUT", url, ok(204));
    await session().deleteEvent(CALENDAR, `${HREF}#20261112T090000Z`);
    expect(writes()[1].body).toContain("EXDATE:20261112T090000Z");
    expect(writes()[1].headers.get("if-match")).toBe('"e1"');
  });
});

describe("moveEvent (plan D9)", () => {
  const url = `https://p42-caldav.icloud.com${HREF}`;

  it("moves with MOVE and returns the new href", async () => {
    route("MOVE", url, ok(201));
    const id = await session().moveEvent(CALENDAR, HREF, OTHER);
    const move = writes()[0];
    expect(move.headers.get("destination")).toBe(`${OTHER}one.ics`);
    expect(move.headers.get("overwrite")).toBe("F");
    expect(id).toBe("/123456/calendars/work/one.ics");
  });

  it("copies and deletes when iCloud does not allow MOVE", async () => {
    route("MOVE", url, ok(405));
    route("GET", url, ics(SINGLE, '"e1"'));
    route("PUT", `${OTHER}one.ics`, ok(201));
    route("DELETE", url, ok(204));
    const id = await session().moveEvent(CALENDAR, HREF, OTHER);
    expect(writes().map((c) => c.method)).toEqual([
      "MOVE",
      "GET",
      "PUT",
      "DELETE",
    ]);
    expect(writes()[2].headers.get("if-none-match")).toBe("*");
    expect(id).toBe("/123456/calendars/work/one.ics");
  });

  it("refuses to move one repetition alone", async () => {
    await expect(
      session().moveEvent(CALENDAR, `${HREF}#20261112T090000Z`, OTHER),
    ).rejects.toMatchObject({ kind: "rejected" });
    expect(writes()).toEqual([]);
  });
});

describe("calendars (RF-52, RF-54, RF-59)", () => {
  it("creates a calendar of events only in the home set", async () => {
    fetchFn = ((original) =>
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        if (request.method === "MKCALENDAR") {
          calls.push({
            method: request.method,
            url: request.url,
            headers: request.headers,
            body: await request.text(),
          });
          return new Response(null, { status: 201 });
        }
        return original(input, init);
      }))(fetchFn) as typeof fetch;

    const id = await session().insertCalendar({
      name: "Viajes",
      timeZone: "Europe/Madrid",
    });

    const make = writes()[0];
    expect(id).toBe(make.url);
    expect(id).toMatch(
      /^https:\/\/p42-caldav\.icloud\.com\/123456\/calendars\/[0-9a-f-]{36}\/$/,
    );
    expect(make.body).toContain("Viajes");
    expect(make.body).toMatch(/comp name="VEVENT"/);
  });

  it("renames with PROPPATCH and refuses when iCloud does", async () => {
    route(
      "PROPPATCH",
      CALENDAR,
      () =>
        new Response(
          multistatus(
            "<response><href>/123456/calendars/home/</href><propstat><prop><displayname/></prop><status>HTTP/1.1 200 OK</status></propstat></response>",
          ),
          { status: 207, headers: XML },
        ),
      () =>
        new Response(
          multistatus(
            "<response><href>/123456/calendars/home/</href><propstat><prop><displayname/></prop><status>HTTP/1.1 403 Forbidden</status></propstat></response>",
          ),
          { status: 207, headers: XML },
        ),
    );
    await session().renameCalendar(CALENDAR, "Casa nueva");
    expect(writes()[0].body).toContain("Casa nueva");
    await expect(
      session().renameCalendar(CALENDAR, "Otra"),
    ).rejects.toMatchObject({ kind: "rejected" });
  });

  it("deletes a calendar it has just created", async () => {
    route("DELETE", OTHER, ok(204));
    await session().deleteCalendar(OTHER);
    expect(writes().map((c) => [c.method, c.url])).toEqual([["DELETE", OTHER]]);
  });
});
