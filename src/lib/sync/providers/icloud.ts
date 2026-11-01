import { calendarQuery, propfind, type DAVResponse } from "tsdav";
import type { SyncedEventRow } from "../event-row";
import { parseCredential, type IcloudCredential } from "../icloud-credentials";
import { expandObject } from "../icloud-ics";
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

/** `412`: the resource changed between reading and writing (plan D7). */
export class PreconditionFailed extends ProviderError {
  constructor() {
    super("rejected", "iCloud answered 412");
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
      if (response.status === 412) throw new PreconditionFailed();
      const failure = failureOf(response.status);
      if (failure) {
        throw new ProviderError(failure, `iCloud answered ${response.status}`);
      }
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

/** Checks the Apple ID and password with a real discovery (RF-5, RF-6, RF-8). */
export async function verifyIcloud(
  credential: IcloudCredential,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  await discoverHome(icloudFetch(credential, fetchFn));
}

/** CalDAV time-range values: `20261001T000000Z`. */
function stamp(date: Date): string {
  return `${date.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
}

function notYet(): never {
  throw new ProviderError("rejected", "iCloud writes arrive in spec 018 T9");
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

    insertEvent: notYet,
    updateEvent: notYet,
    moveEvent: notYet,
    deleteEvent: notYet,
    insertCalendar: notYet,
    renameCalendar: notYet,
    deleteCalendar: notYet,
  };
}
