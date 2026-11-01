import type { Database } from "@/types/database";
import { providerName } from "./provider-labels";
import type { ProviderAccess, ProviderName } from "./providers/types";

// What the screens offer in synced calendars; the database decides anyway
// (spec 007 T2, spec 009 T3). Since spec 009 they are writable when the
// account can write (RF-6 to RF-9, RF-20).

export interface SyncedInfo {
  lastSyncedAt: string | null;
  /** Account it comes from; RLS shows it only to the owner (RF-26 of 007). */
  accountEmail: string | null;
  /** Calendars of one account share it: events only move among them (RF-19). */
  connectionId: string;
  /** The database's can_write_synced (plan D11). */
  canWrite: boolean;
  /** The access in the provider (Google or iCloud), from google_access (spec 018 D8). */
  googleAccess: ProviderAccess | null;
  /** Google or iCloud: names the provider in the texts (spec 018). */
  provider: ProviderName;
}

interface CalendarAccess {
  role: Database["public"]["Enums"]["calendar_role"];
  synced: SyncedInfo | null;
}

/** Can create, edit or delete events in it (RF-6, RF-7, RF-9). */
export function canWriteEvents(calendar: CalendarAccess): boolean {
  return (
    calendar.role !== "viewer" && (!calendar.synced || calendar.synced.canWrite)
  );
}

/** Can be merged: owned and not synced (RF-45 of 007, RF-53 of spec 002). */
export function canMerge(calendar: CalendarAccess): boolean {
  return calendar.role === "owner" && !calendar.synced;
}

/** Where an event of `source` may go: same kind and, if synced, same account (RF-19, RF-20). */
export function moveTargets<T extends CalendarAccess>(
  source: CalendarAccess,
  calendars: T[],
): T[] {
  return calendars.filter(
    (calendar) =>
      canWriteEvents(calendar) &&
      (source.synced
        ? calendar.synced?.connectionId === source.synced.connectionId
        : !calendar.synced),
  );
}

/**
 * Why a synced calendar is read-only: its provider allows only reading, or the
 * account must reconnect (RF-3, RF-8; spec 018 RF-20).
 */
export function readOnlyReason(
  synced: SyncedInfo | null,
): "provider" | "reconnect" | null {
  if (!synced || synced.canWrite) return null;
  return synced.googleAccess === "reader" ? "provider" : "reconnect";
}

export type ReadOnlyReason = NonNullable<ReturnType<typeof readOnlyReason>>;

/** Why the detail of an event has no buttons (spec 009 RF-8, spec 018 RF-20). */
export function readOnlyEventText(
  reason: ReadOnlyReason,
  provider: ProviderName,
): string {
  const name = providerName(provider);
  return reason === "provider"
    ? `La cuenta de ${name} solo puede ver este calendario, así que este evento solo se puede cambiar en ${name}.`
    : `Este evento viene de ${name}. Para cambiarlo desde CaFam, el propietario tiene que volver a conectar la cuenta.`;
}

/** Why an event cannot be pasted in a synced calendar (spec 017). */
export function readOnlyPasteText(
  reason: ReadOnlyReason,
  provider: ProviderName,
): string {
  const name = providerName(provider);
  return reason === "provider"
    ? `La cuenta de ${name} solo puede ver este calendario, así que no se puede pegar en él.`
    : `Para pegar en este calendario, el propietario tiene que volver a conectar la cuenta de ${name}.`;
}
