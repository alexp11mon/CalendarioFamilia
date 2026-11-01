// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { serializeCredential } from "@/lib/sync/icloud-credentials";
import { icloudSession, verifyIcloud } from "@/lib/sync/providers/icloud";
import { ProviderError } from "@/lib/sync/providers/types";

// Spec 018, T8: reading iCloud over CalDAV with a fake server (plan D8, D10,
// D11; RF-5, RF-6, RF-8, RF-13, RF-14, RF-17, RF-19 to RF-21, RF-61, RF-63).
// Synthetic XML in the shape iCloud answers; never real data.
const ROOT = "https://caldav.icloud.com/";
const PRINCIPAL = "https://caldav.icloud.com/123456/principal/";
const HOME = "https://p42-caldav.icloud.com/123456/calendars/";
const CALENDAR = `${HOME}home/`;
const CREDENTIAL = serializeCredential({
  username: "ana@icloud.com",
  password: "abcd-efgh-ijkl-mnop",
});
const BASIC = `Basic ${Buffer.from("ana@icloud.com:abcd-efgh-ijkl-mnop").toString("base64")}`;

function multistatus(...responses: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CS="http://calendarserver.org/ns/" xmlns:A="http://apple.com/ns/ical/">${responses.join("")}</multistatus>`;
}

function response(href: string, props: string): string {
  return `<response><href>${href}</href><propstat><prop>${props}</prop><status>HTTP/1.1 200 OK</status></propstat></response>`;
}

const WRITE = "<privilege><read/></privilege><privilege><write/></privilege>";
const READ =
  "<privilege><read/></privilege><privilege><read-current-user-privilege-set/></privilege>";

function calendarProps(opts: {
  name: string;
  color?: string;
  comps: string[];
  privileges: string;
  shared?: boolean;
}): string {
  return [
    `<resourcetype><collection/><C:calendar/>${opts.shared ? "<CS:shared/>" : ""}</resourcetype>`,
    `<displayname>${opts.name}</displayname>`,
    opts.color ? `<A:calendar-color>${opts.color}</A:calendar-color>` : "",
    `<C:supported-calendar-component-set>${opts.comps.map((c) => `<C:comp name="${c}"/>`).join("")}</C:supported-calendar-component-set>`,
    `<current-user-privilege-set>${opts.privileges}</current-user-privilege-set>`,
  ].join("");
}

const HOME_LISTING = multistatus(
  response("/123456/calendars/", "<resourcetype><collection/></resourcetype>"),
  response(
    "/123456/calendars/home/",
    calendarProps({
      name: "Casa",
      color: "#FF2968FF",
      comps: ["VEVENT"],
      privileges: WRITE,
    }),
  ),
  response(
    "/123456/calendars/tasks/",
    calendarProps({
      name: "Recordatorios",
      comps: ["VTODO"],
      privileges: WRITE,
    }),
  ),
  response(
    "/123456/calendars/inbox/",
    "<resourcetype><collection/><C:schedule-inbox/></resourcetype>",
  ),
  response(
    "/123456/calendars/shared1/",
    calendarProps({
      name: "Familia",
      color: "#1BADF8",
      comps: ["VEVENT", "VTODO"],
      privileges: READ,
      shared: true,
    }),
  ),
  response(
    "/123456/calendars/shared2/",
    calendarProps({
      name: "Trabajo",
      comps: ["VEVENT"],
      privileges: WRITE,
      shared: true,
    }),
  ),
);

const EVENT_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:one",
  "DTSTAMP:20261001T000000Z",
  "SUMMARY:Dentista &amp; revisión",
  "DTSTART:20261105T090000Z",
  "DTEND:20261105T100000Z",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const BROKEN_ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:two",
  "DTSTART:20261105T090000Z",
  "DTEND:20261105T080000Z",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const XML = { "Content-Type": "application/xml; charset=utf-8" };

type Handler = (request: Request) => Response | Promise<Response>;
let routes: Map<string, Handler>;
let calls: Request[];
let fetchFn: typeof fetch;

function route(method: string, url: string, handler: Handler | string) {
  routes.set(
    `${method} ${url}`,
    typeof handler === "string"
      ? () => new Response(handler, { status: 207, headers: XML })
      : handler,
  );
}

beforeEach(() => {
  routes = new Map();
  calls = [];
  fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    calls.push(request);
    const handler = routes.get(`${request.method} ${request.url}`);
    return handler
      ? handler(request)
      : new Response("not found", { status: 404 });
  }) as typeof fetch;

  route(
    "PROPFIND",
    ROOT,
    multistatus(
      response(
        "/",
        "<current-user-principal><href>/123456/principal/</href></current-user-principal>",
      ),
    ),
  );
  route(
    "PROPFIND",
    PRINCIPAL,
    multistatus(
      response(
        "/123456/principal/",
        "<C:calendar-home-set><href>https://p42-caldav.icloud.com:443/123456/calendars/</href></C:calendar-home-set>",
      ),
    ),
  );
  route("PROPFIND", HOME, HOME_LISTING);
});

function session() {
  return icloudSession(CREDENTIAL, fetchFn);
}

describe("listCalendars (RF-13, RF-14, RF-20)", () => {
  it("finds the calendars through the principal and the home set, with Basic auth", async () => {
    const calendars = await session().listCalendars();

    expect(calendars).toEqual([
      { id: CALENDAR, name: "Casa", color: "#FF2968", access: "owner" },
      {
        id: `${HOME}shared1/`,
        name: "Familia",
        color: "#1BADF8",
        access: "reader",
      },
      {
        id: `${HOME}shared2/`,
        name: "Trabajo",
        color: null,
        access: "writer",
      },
    ]);
    expect(calls.every((c) => c.headers.get("authorization") === BASIC)).toBe(
      true,
    );
  });
});

describe("listEvents (RF-17, RF-19, RF-21)", () => {
  const RANGE = {
    from: new Date("2026-10-01T00:00:00Z"),
    to: new Date("2027-10-01T00:00:00Z"),
  };

  beforeEach(() => {
    route(
      "PROPFIND",
      CALENDAR,
      multistatus(
        response(
          "/123456/calendars/home/",
          calendarProps({ name: "Casa", comps: ["VEVENT"], privileges: WRITE }),
        ),
      ),
    );
    route(
      "REPORT",
      CALENDAR,
      multistatus(
        response(
          "/123456/calendars/home/one.ics",
          `<getetag>"e1"</getetag><C:calendar-data>${EVENT_ICS}</C:calendar-data>`,
        ),
        response(
          "/123456/calendars/home/two.ics",
          `<getetag>"e2"</getetag><C:calendar-data>${BROKEN_ICS}</C:calendar-data>`,
        ),
      ),
    );
  });

  it("asks for the window and converts each resource", async () => {
    const result = await session().listEvents(CALENDAR, RANGE);

    expect(result).toEqual({
      access: "owner",
      skipped: 1,
      events: [
        {
          external_id: "/123456/calendars/home/one.ics",
          title: "Dentista & revisión",
          description: null,
          location: null,
          starts_at: "2026-11-05T09:00:00.000Z",
          ends_at: "2026-11-05T10:00:00.000Z",
          all_day: false,
        },
      ],
    });
    const report = calls.find((c) => c.method === "REPORT")!;
    const body = await report.text();
    expect(body).toContain('start="20261001T000000Z"');
    expect(body).toContain('end="20271001T000000Z"');
    expect(body).not.toContain("expand");
    expect(report.headers.get("depth")).toBe("1");
  });

  it("a calendar that is gone is missing (RF-19)", async () => {
    routes.delete(`PROPFIND ${CALENDAR}`);
    await expect(session().listEvents(CALENDAR, RANGE)).rejects.toMatchObject({
      kind: "missing",
    });
  });
});

describe("errors (plan D11)", () => {
  it.each([
    [401, "revoked"],
    [403, "rejected"],
    [404, "missing"],
    [429, "transient"],
    [503, "transient"],
  ])("%i is %s", async (status, kind) => {
    route("PROPFIND", ROOT, () => new Response("", { status }));
    await expect(session().listCalendars()).rejects.toMatchObject({ kind });
  });

  it("a network failure is transient (RF-63)", async () => {
    route("PROPFIND", ROOT, () => {
      throw new TypeError("fetch failed");
    });
    await expect(session().listCalendars()).rejects.toMatchObject({
      kind: "transient",
    });
  });

  it("a stored secret that is not a credential is a withdrawn permission", () => {
    expect(() => icloudSession("1//google", fetchFn)).toThrow(ProviderError);
  });
});

describe("only Apple's servers (plan D10)", () => {
  it("never follows a href or a redirect out of iCloud, nor sends the password there", async () => {
    route(
      "PROPFIND",
      PRINCIPAL,
      multistatus(
        response(
          "/123456/principal/",
          "<C:calendar-home-set><href>https://evil.example/calendars/</href></C:calendar-home-set>",
        ),
      ),
    );
    await expect(session().listCalendars()).rejects.toMatchObject({
      kind: "transient",
    });
    expect(calls.some((c) => c.url.startsWith("https://evil.example"))).toBe(
      false,
    );
  });

  it("follows a redirect inside iCloud and refuses one outside", async () => {
    route(
      "PROPFIND",
      ROOT,
      () =>
        new Response(null, {
          status: 301,
          headers: { Location: "https://p01-caldav.icloud.com/" },
        }),
    );
    route(
      "PROPFIND",
      "https://p01-caldav.icloud.com/",
      () =>
        new Response(null, {
          status: 302,
          headers: { Location: "http://169.254.169.254/" },
        }),
    );
    await expect(session().listCalendars()).rejects.toMatchObject({
      kind: "transient",
    });
    expect(calls.map((c) => c.url)).toEqual([
      ROOT,
      "https://p01-caldav.icloud.com/",
    ]);
  });
});

describe("verifyIcloud (RF-5, RF-6, RF-8)", () => {
  const credential = {
    username: "ana@icloud.com",
    password: "abcd-efgh-ijkl-mnop",
  };

  it("passes when the account is found", async () => {
    await expect(verifyIcloud(credential, fetchFn)).resolves.toBeUndefined();
  });

  it("a refused password is revoked", async () => {
    route("PROPFIND", ROOT, () => new Response("", { status: 401 }));
    await expect(verifyIcloud(credential, fetchFn)).rejects.toMatchObject({
      kind: "revoked",
    });
  });
});
