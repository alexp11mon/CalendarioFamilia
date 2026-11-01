import type { SyncedEventRow } from "../event-row";
import type { WritableEvent } from "../google-payload";

// What the engine asks of any provider (spec 018 plan D1). Google and iCloud
// implement it; the engine, the writes and the upload do not know which.

/** `rejected`: the provider refused a write (spec 009 RF-24, spec 018 RF-47). */
export type FailureKind = "revoked" | "missing" | "transient" | "rejected";

/** A provider failure, already classified for `sync_fail` (RF-13, RF-31, RF-33). */
export class ProviderError extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export type ProviderName = "google" | "icloud";

export const PROVIDERS: readonly ProviderName[] = ["google", "icloud"];

export function isProvider(value: unknown): value is ProviderName {
  return PROVIDERS.includes(value as ProviderName);
}

/** What the account may do in a calendar; only owner and writer write (spec 009 RF-8). */
export type ProviderAccess = "owner" | "writer" | "reader";

export interface ProviderCalendar {
  id: string;
  name: string;
  color: string | null;
  access: ProviderAccess | null;
}

export interface ProviderEvents {
  events: SyncedEventRow[];
  /** Invalid events left out (RF-18 of 007, RF-25 of 018). */
  skipped: number;
  access: ProviderAccess | null;
}

/** A connection opened with its credential; every call may throw ProviderError. */
export interface ProviderSession {
  listCalendars(): Promise<ProviderCalendar[]>;
  listEvents(
    calendarId: string,
    range: { from: Date; to: Date },
  ): Promise<ProviderEvents>;
  /** Creates an event and returns its id in the provider. */
  insertEvent(calendarId: string, event: WritableEvent): Promise<string>;
  /** Writes only what changed between `before` and `after`. */
  updateEvent(
    calendarId: string,
    eventId: string,
    before: WritableEvent,
    after: WritableEvent,
  ): Promise<void>;
  /** Moves an event to another calendar of the account; returns its id there. */
  moveEvent(
    calendarId: string,
    eventId: string,
    destination: string,
  ): Promise<string>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
  insertCalendar(calendar: { name: string; timeZone: string }): Promise<string>;
  renameCalendar(calendarId: string, name: string): Promise<void>;
  /** Only to undo a calendar CaFam has just created. */
  deleteCalendar(calendarId: string): Promise<void>;
}
