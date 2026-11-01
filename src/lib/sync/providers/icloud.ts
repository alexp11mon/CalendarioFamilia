import {
  calendarQuery,
  davRequest,
  makeCalendar,
  propfind,
  type DAVResponse,
} from "tsdav";
import type { SyncedEventRow } from "../event-row";
import { parseCredential, type IcloudCredential } from "../icloud-credentials";
import {
  expandObject,
  newEventIcs,
  patchIcs,
  removeOccurrence,
  splitExternalId,
} from "../icloud-ics";
import {
  ProviderError,
  type FailureKind,
  type ProviderAccess,
  type ProviderCalendar,
  type ProviderEvents,
  type ProviderSession,
} from "./types";

// Server-only: iCloud over CalDAV with tsdav (spec 018 plan D1, D5, D8, D10,
// D11). The only module that imports tsdav.

const ROOT = "https://caldav.icloud.com/";
/** Per request; a whole write also has the 9 s limit of write-event (D12). */
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;

type Props = DAVResponse["props"];

/** Only Apple's CalDAV servers, over https (plan D10). */
export function isIcloudUrl(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    (url.hostname === "caldav.icloud.com" ||
      /^p\d+-caldav\.icloud\.com$/.test(url.hostname))
  );
}

/** An error answer, with its status for the move fallback (plan D9, D11). */
export class IcloudHttpError extends ProviderError {
  constructor(
    kind: FailureKind,
    readonly status: number,
  ) {
    super(kind, `iCloud answered ${status}`);
  }
}

/** Plan D11: what each answer means for the engine and the writes. */
function failureOf(status: number): FailureKind | null {
  if (status === 401) return "revoked";
  if (status === 404 || status === 410) return "missing";
  if (status === 429 || status >= 500) return "transient";
  if (status >= 400) return "rejected";
  return null;
}

/**
 * The fetch tsdav uses: Basic auth only to Apple's hosts, redirects followed
 * by hand inside them, a timeout, and HTTP errors as ProviderError (D10, D11).
 */
export function icloudFetch(
  credential: IcloudCredential,
  fetchFn: typeof fetch = fetch,
): typeof fetch {
  const auth = `Basic ${Buffer.from(`${credential.username}:${credential.password}`).toString("base64")}`;

  return async (input, init) => {
    let url = new URL(input instanceof Request ? input.url : String(input));
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!isIcloudUrl(url)) {
        throw new ProviderError("transient", `Not an iCloud host: ${url.host}`);
      }
      const headers = new Headers(init?.headers);
      headers.set("Authorization", auth);
      let response: Response;
      try {
        response = await fetchFn(url, {
          ...init,
          headers,
          redirect: "manual",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        throw new ProviderError(
          "transient",
          `iCloud did not answer: ${(error as Error).message}`,
        );
      }
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        url = new URL(location, url);
        continue;
      }
      const failure = failureOf(response.status);
      if (failure) throw new IcloudHttpError(failure, response.status);
      return response;
    }
    throw new ProviderError("transient", "Too many redirects");
  };
}

/** tsdav gives text nodes as strings or as `{ _text }` / `{ _cdata }`. */
function text(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const node = value as { _text?: unknown; _cdata?: unknown };
    return text(node._text ?? node._cdata);
  }
  return null;
}

function hrefOf(value: unknown): string | null {
  return value && typeof value === "object" && "href" in value
    ? text(value.href)
    : null;
}

/** An absolute iCloud URL from a href, or a transient failure (D10). */
function icloudUrl(href: string | null, base: string): string {
  if (!href) throw new ProviderError("transient", "iCloud gave no address");
  const url = new URL(href, base);
  if (!isIcloudUrl(url)) {
    throw new ProviderError("transient", `Not an iCloud host: ${url.host}`);
  }
  url.port = "";
  return url.href;
}

function firstProps(responses: DAVResponse[]): Props {
  return responses.find((r) => r.ok)?.props ?? {};
}

function typesOf(props: Props): string[] {
  return Object.keys((props?.resourcetype as object | undefined) ?? {});
}

function componentsOf(props: Props): string[] {
  const set = props?.supportedCalendarComponentSet as
    { comp?: unknown } | undefined;
  const list = Array.isArray(set?.comp)
    ? set.comp
    : set?.comp
      ? [set.comp]
      : [];
  return list
    .map((c) => (c as { _attributes?: { name?: string } })._attributes?.name)
    .filter((name): name is string => Boolean(name));
}

/** Plan D8: shared with the account → writer or reader; its own → owner. */
function accessOf(props: Props): ProviderAccess {
  const privileges = JSON.stringify(props?.currentUserPrivilegeSet ?? {});
  if (!/"(all|write|writeContent)"\s*:/.test(privileges)) return "reader";
  return typesOf(props).includes("shared") ? "writer" : "owner";
}

/** iCloud colors are `#RRGGBBAA`; CaFam keeps `#RRGGBB`. */
function colorOf(value: unknown): string | null {
  const color = text(value)?.trim();
  return color && /^#[0-9a-f]{6}/i.test(color) ? color.slice(0, 7) : null;
}

const CALENDAR_PROPS = {
  "d:resourcetype": {},
  "d:displayname": {},
  "ca:calendar-color": {},
  "c:supported-calendar-component-set": {},
  "d:current-user-privilege-set": {},
};

/** `/.well-known/caldav` lands on the root: principal, then the home set. */
async function discoverHome(davFetch: typeof fetch): Promise<string> {
  const root = await propfind({
    url: ROOT,
    props: { "d:current-user-principal": {} },
    depth: "0",
    fetch: davFetch,
  });
  const principal = icloudUrl(
    hrefOf(firstProps(root)?.currentUserPrincipal),
    ROOT,
  );
  const home = await propfind({
    url: principal,
    props: { "c:calendar-home-set": {} },
    depth: "0",
    fetch: davFetch,
  });
  return icloudUrl(hrefOf(firstProps(home)?.calendarHomeSet), principal);
}

/** One deadline for the whole check when connecting (plan D12, RF-8). */
const VERIFY_DEADLINE_MS = 10_000;

/** Checks the Apple ID and password with a real discovery (RF-5, RF-6, RF-8). */
export async function verifyIcloud(
  credential: IcloudCredential,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_DEADLINE_MS);
  const withDeadline: typeof fetch = (input, init) =>
    fetchFn(input, { ...init, signal: controller.signal });
  try {
    await discoverHome(icloudFetch(credential, withDeadline));
  } finally {
    clearTimeout(timer);
  }
}

/** CalDAV time-range values: `20261001T000000Z`. */
function stamp(date: Date): string {
  return `${date.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
}

const CALENDAR_TYPE = "text/calendar; charset=utf-8";

function statusOf(error: unknown): number | null {
  return error instanceof IcloudHttpError ? error.status : null;
}

/** Reads, changes and writes back with If-Match; a 412 reads again once (D7). */
async function rewrite(
  davFetch: typeof fetch,
  url: string,
  change: (ics: string) => string,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const current = await davFetch(url, { method: "GET" });
    const etag = current.headers.get("etag");
    const body = change(await current.text());
    try {
      await davFetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": CALENDAR_TYPE,
          ...(etag && { "If-Match": etag }),
        },
        body,
      });
      return;
    } catch (error) {
      if (statusOf(error) !== 412 || attempt > 0) throw error;
    }
  }
}

/** The resource of an event inside its calendar, kept on iCloud's hosts. */
function resourceUrl(calendarId: string, href: string): string {
  return icloudUrl(href, icloudUrl(calendarId, ROOT));
}

export function icloudSession(
  storedSecret: string,
  fetchFn: typeof fetch = fetch,
): ProviderSession {
  const credential = parseCredential(storedSecret);
  if (!credential) {
    throw new ProviderError("revoked", "The stored secret is not iCloud's");
  }
  const davFetch = icloudFetch(credential, fetchFn);
  let home: Promise<string> | null = null;
  const homeUrl = () => (home ??= discoverHome(davFetch));

  return {
    async listCalendars() {
      const base = await homeUrl();
      const responses = await propfind({
        url: base,
        props: CALENDAR_PROPS,
        depth: "1",
        fetch: davFetch,
      });
      const calendars: ProviderCalendar[] = [];
      for (const r of responses) {
        const components = componentsOf(r.props);
        if (!r.ok || !typesOf(r.props).includes("calendar")) continue;
        // Reminders lists only hold VTODO (RF-14).
        if (components.length > 0 && !components.includes("VEVENT")) continue;
        calendars.push({
          id: icloudUrl(r.href ?? null, base),
          name: text(r.props?.displayname) ?? "",
          color: colorOf(r.props?.calendarColor),
          access: accessOf(r.props),
        });
      }
      return calendars;
    },

    async listEvents(calendarId, range): Promise<ProviderEvents> {
      const url = icloudUrl(calendarId, ROOT);
      const access = accessOf(
        firstProps(
          await propfind({
            url,
            props: CALENDAR_PROPS,
            depth: "0",
            fetch: davFetch,
          }),
        ),
      );
      // The resources as stored, expanded by CaFam (plan D5).
      const responses = await calendarQuery({
        url,
        props: { "d:getetag": {}, "c:calendar-data": {} },
        filters: {
          "comp-filter": {
            _attributes: { name: "VCALENDAR" },
            "comp-filter": {
              _attributes: { name: "VEVENT" },
              "time-range": {
                _attributes: { start: stamp(range.from), end: stamp(range.to) },
              },
            },
          },
        },
        depth: "1",
        fetch: davFetch,
      });
      const events: SyncedEventRow[] = [];
      let skipped = 0;
      for (const r of responses) {
        const ics = text(r.props?.calendarData);
        if (!r.ok || !r.href || !ics) continue;
        const converted = expandObject(r.href, ics, range);
        events.push(...converted.events);
        skipped += converted.skipped;
      }
      return { events, skipped, access };
    },

    async insertEvent(calendarId, event) {
      const uid = crypto.randomUUID();
      const url = icloudUrl(`${uid}.ics`, icloudUrl(calendarId, ROOT));
      await davFetch(url, {
        method: "PUT",
        headers: { "Content-Type": CALENDAR_TYPE, "If-None-Match": "*" },
        body: newEventIcs(uid, event),
      });
      return new URL(url).pathname;
    },

    async updateEvent(calendarId, eventId, before, after) {
      const { href, recurrenceId } = splitExternalId(eventId);
      await rewrite(davFetch, resourceUrl(calendarId, href), (ics) =>
        patchIcs(ics, recurrenceId, before, after),
      );
    },

    async moveEvent(calendarId, eventId, destination) {
      const { href, recurrenceId } = splitExternalId(eventId);
      if (recurrenceId !== null) {
        // A repetition lives in its series' resource (plan D9).
        throw new ProviderError("rejected", "A repetition cannot move alone");
      }
      const source = resourceUrl(calendarId, href);
      const name = source.slice(source.lastIndexOf("/") + 1);
      const target = icloudUrl(name, icloudUrl(destination, ROOT));
      try {
        await davFetch(source, {
          method: "MOVE",
          headers: { Destination: target, Overwrite: "F" },
        });
      } catch (error) {
        if (![403, 405, 501, 502].includes(statusOf(error) ?? 0)) throw error;
        // iCloud without MOVE: copy, then delete the original (plan D9).
        const ics = await (await davFetch(source, { method: "GET" })).text();
        await davFetch(target, {
          method: "PUT",
          headers: { "Content-Type": CALENDAR_TYPE, "If-None-Match": "*" },
          body: ics,
        });
        await davFetch(source, { method: "DELETE" });
      }
      return new URL(target).pathname;
    },

    async deleteEvent(calendarId, eventId) {
      const { href, recurrenceId } = splitExternalId(eventId);
      const url = resourceUrl(calendarId, href);
      if (recurrenceId === null) {
        await davFetch(url, { method: "DELETE" });
        return;
      }
      await rewrite(davFetch, url, (ics) =>
        removeOccurrence(ics, recurrenceId),
      );
    },

    async insertCalendar({ name }) {
      const url = icloudUrl(`${crypto.randomUUID()}/`, await homeUrl());
      await makeCalendar({
        url,
        props: {
          "d:displayname": name,
          "c:supported-calendar-component-set": {
            "c:comp": { _attributes: { name: "VEVENT" } },
          },
        },
        fetch: davFetch,
      });
      return url;
    },

    // RF-52: iCloud may refuse the new name; the 207 says so per property.
    async renameCalendar(calendarId, name) {
      const responses = await davRequest({
        url: icloudUrl(calendarId, ROOT),
        init: {
          method: "PROPPATCH",
          namespace: "d",
          body: {
            propertyupdate: {
              _attributes: { "xmlns:d": "DAV:" },
              set: { prop: { displayname: name } },
            },
          },
        },
        fetch: davFetch,
      });
      if (responses.some((r) => !r.ok)) {
        throw new ProviderError("rejected", "iCloud refused the new name");
      }
    },

    async deleteCalendar(calendarId) {
      await davFetch(icloudUrl(calendarId, ROOT), { method: "DELETE" });
    },
  };
}
