import type { GoogleEvent } from "../google-events";
import { MAX_FETCHED_EVENTS } from "../limits";
import { GOOGLE_SCOPES } from "../scopes";
import {
  ProviderError,
  type FailureKind,
  type ProviderAccess,
  type ProviderCalendar,
} from "./types";

// Google OAuth and Calendar API with plain fetch (spec 007; plan D8 to D10).
// `fetch` comes in as a parameter so tests run without the network.

type Fetch = typeof fetch;

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";

// Shared with iCloud since spec 018 (plan D1); re-exported for existing callers.
export {
  ProviderError,
  type FailureKind,
  type ProviderCalendar,
} from "./types";

export interface ClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

// Google answers usage limits with 403 or 429: wait and retry (spec 009 RF-22).
const RATE_LIMITS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "quotaExceeded",
]);

function kindOf(status: number, error?: string, reason?: string): FailureKind {
  if (error === "invalid_grant" || status === 401) return "revoked";
  if (status === 404 || status === 410) return "missing";
  if (status === 403 && reason && RATE_LIMITS.has(reason)) return "transient";
  // A refused write: no permission, invalid data, someone else's event (RF-24).
  if (status === 400 || status === 403) return "rejected";
  return "transient";
}

async function call(fetchFn: Fetch, url: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch {
    throw new ProviderError("transient", "Google did not answer");
  }
  if (response.ok) return response;

  // OAuth errors are a string; Calendar API errors an object with reasons.
  const body = (await response.json().catch(() => ({}))) as {
    error?: string | { errors?: { reason?: unknown }[] };
  };
  const error = typeof body.error === "string" ? body.error : undefined;
  const reason =
    typeof body.error === "object"
      ? body.error?.errors?.[0]?.reason
      : undefined;
  throw new ProviderError(
    kindOf(
      response.status,
      error,
      typeof reason === "string" ? reason : undefined,
    ),
    `Google answered ${response.status}${error ? ` (${error})` : ""}`,
  );
}

async function postForm(
  fetchFn: Fetch,
  url: string,
  form: Record<string, string>,
) {
  return call(fetchFn, url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
}

/** Where the user authorizes CaFam (RF-1). `prompt=consent` always returns a refresh token. */
export function authorizationUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  }).toString();
  return url.toString();
}

/**
 * The id_token arrives straight from Google's token endpoint over TLS, so its
 * claims can be read without checking the signature (OpenID Connect 3.1.3.7).
 */
function claimsOf(idToken: unknown): { sub?: string; email?: string } {
  if (typeof idToken !== "string") return {};
  try {
    return JSON.parse(
      Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8"),
    );
  } catch {
    return {};
  }
}

export async function exchangeCode(
  params: ClientConfig & { code: string; codeVerifier: string },
  fetchFn: Fetch = fetch,
) {
  const response = await postForm(fetchFn, TOKEN_URL, {
    grant_type: "authorization_code",
    code: params.code,
    code_verifier: params.codeVerifier,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
  });
  const body = (await response.json()) as Record<string, unknown>;
  const { sub, email } = claimsOf(body.id_token);
  const scope = typeof body.scope === "string" ? body.scope : "";
  if (
    typeof body.access_token !== "string" ||
    typeof body.refresh_token !== "string" ||
    !sub ||
    !email
  ) {
    throw new ProviderError("transient", "Incomplete token response");
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    subject: sub,
    email,
    /** Granted permissions; fewer than asked keeps the account read-only (spec 009 RF-5). */
    scope,
  };
}

/** A new access token; `refreshToken` is set only if Google rotated it (plan R3). */
export async function refreshAccessToken(
  params: Omit<ClientConfig, "redirectUri"> & { refreshToken: string },
  fetchFn: Fetch = fetch,
) {
  const response = await postForm(fetchFn, TOKEN_URL, {
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
    client_id: params.clientId,
    client_secret: params.clientSecret,
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (typeof body.access_token !== "string") {
    throw new ProviderError("transient", "Incomplete token response");
  }
  return {
    accessToken: body.access_token,
    refreshToken:
      typeof body.refresh_token === "string" ? body.refresh_token : null,
  };
}

async function getJson(fetchFn: Fetch, url: URL, accessToken: string) {
  const response = await call(fetchFn, url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return (await response.json()) as {
    items?: unknown[];
    nextPageToken?: string;
    accessRole?: string;
  };
}

/** The calendars of the account, read again on every visit (RF-9, RF-12). */
export async function listCalendars(
  accessToken: string,
  fetchFn: Fetch = fetch,
): Promise<ProviderCalendar[]> {
  const calendars: ProviderCalendar[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${API}/users/me/calendarList`);
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const page = await getJson(fetchFn, url, accessToken);
    for (const item of (page.items ?? []) as Record<string, string>[]) {
      calendars.push({
        id: item.id,
        name: item.summaryOverride ?? item.summary ?? "",
        color: item.backgroundColor ?? null,
        access: accessOf(item.accessRole),
      });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return calendars;
}

/** What the account may do in a calendar; only owner and writer write (spec 009 RF-8). */
export type GoogleAccess = ProviderAccess;

/** freeBusyReader sees less than a reader: both are read-only in CaFam. */
export function accessOf(role: unknown): GoogleAccess | null {
  if (role === "owner" || role === "writer") return role;
  if (role === "reader" || role === "freeBusyReader") return "reader";
  return null;
}

/**
 * Events of the window, one per repetition, up to 10,000, and the access of
 * the account over the calendar (RF-15, RF-16, plan D17; spec 009 D10).
 */
export async function listEvents(
  accessToken: string,
  calendarId: string,
  range: { from: Date; to: Date },
  fetchFn: Fetch = fetch,
): Promise<{ events: GoogleEvent[]; accessRole: GoogleAccess | null }> {
  const events: GoogleEvent[] = [];
  let accessRole: GoogleAccess | null = null;
  let pageToken: string | undefined;
  do {
    const url = new URL(
      `${API}/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    url.search = new URLSearchParams({
      singleEvents: "true",
      timeMin: range.from.toISOString(),
      timeMax: range.to.toISOString(),
      maxResults: "2500",
    }).toString();
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const page = await getJson(fetchFn, url, accessToken);
    events.push(...((page.items ?? []) as GoogleEvent[]));
    accessRole ??= accessOf(page.accessRole);
    pageToken = page.nextPageToken;
  } while (pageToken && events.length < MAX_FETCHED_EVENTS);
  return { events: events.slice(0, MAX_FETCHED_EVENTS), accessRole };
}

/** Withdraws CaFam's access in Google (RF-30). */
export async function revokeToken(
  token: string,
  fetchFn: Fetch = fetch,
): Promise<void> {
  await postForm(fetchFn, REVOKE_URL, { token });
}

// Writes (spec 009, plan "Contratos"). No If-Match: the last change wins (RF-27).

async function send(
  fetchFn: Fetch,
  accessToken: string,
  method: string,
  url: string,
  body?: unknown,
) {
  return call(fetchFn, url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const eventsUrl = (calendarId: string) =>
  `${API}/calendars/${encodeURIComponent(calendarId)}/events`;
const eventUrl = (calendarId: string, eventId: string) =>
  `${eventsUrl(calendarId)}/${encodeURIComponent(eventId)}`;
const calendarUrl = (calendarId: string) =>
  `${API}/calendars/${encodeURIComponent(calendarId)}`;

async function idOf(response: Response): Promise<string> {
  const body = (await response.json()) as { id?: unknown };
  if (typeof body.id !== "string") {
    throw new ProviderError("transient", "Google sent no id");
  }
  return body.id;
}

/** Creates an event and returns its Google id (RF-10). */
export async function insertEvent(
  accessToken: string,
  calendarId: string,
  body: object,
  fetchFn: Fetch = fetch,
): Promise<string> {
  return idOf(
    await send(fetchFn, accessToken, "POST", eventsUrl(calendarId), body),
  );
}

/** Changes only the given fields; a repetition's id changes only it (RF-11, RF-14, RF-17). */
export async function patchEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  patch: object,
  fetchFn: Fetch = fetch,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await send(
    fetchFn,
    accessToken,
    "PATCH",
    eventUrl(calendarId, eventId),
    patch,
  );
}

/** Moves an event to another calendar of the same account (RF-19). */
export async function moveEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  destination: string,
  fetchFn: Fetch = fetch,
): Promise<void> {
  const url = `${eventUrl(calendarId, eventId)}/move?destination=${encodeURIComponent(destination)}`;
  await send(fetchFn, accessToken, "POST", url);
}

/** Deletes an event, or only that repetition (RF-12, RF-17). */
export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  fetchFn: Fetch = fetch,
): Promise<void> {
  await send(fetchFn, accessToken, "DELETE", eventUrl(calendarId, eventId));
}

/** Creates a calendar in the account and returns its id (RF-32, RF-34). */
export async function insertCalendar(
  accessToken: string,
  calendar: { summary: string; timeZone?: string },
  fetchFn: Fetch = fetch,
): Promise<string> {
  return idOf(
    await send(fetchFn, accessToken, "POST", `${API}/calendars`, calendar),
  );
}

/** Renames a calendar; color and description stay in CaFam (RF-29, RF-31). */
export async function patchCalendar(
  accessToken: string,
  calendarId: string,
  summary: string,
  fetchFn: Fetch = fetch,
): Promise<void> {
  await send(fetchFn, accessToken, "PATCH", calendarUrl(calendarId), {
    summary,
  });
}

/** Only to undo a calendar CaFam has just created (RF-37, plan D15). */
export async function deleteCalendar(
  accessToken: string,
  calendarId: string,
  fetchFn: Fetch = fetch,
): Promise<void> {
  await send(fetchFn, accessToken, "DELETE", calendarUrl(calendarId));
}
