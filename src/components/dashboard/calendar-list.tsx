import Link from "next/link";
import { ConfirmDialog } from "@/components/calendar/confirm-dialog";
import { formatWhen } from "@/components/connections/sync-status";
import { AssignGroupSelect } from "@/components/groups/assign-group-select";
import { LinkButton } from "@/components/ui/link-button";
import type { ConfirmState } from "@/lib/forms/form-state";
import { providerName } from "@/lib/sync/provider-labels";
import type { SyncedInfo } from "@/lib/sync/read-only";
import type { Database } from "@/types/database";

type CalendarRole = Database["public"]["Enums"]["calendar_role"];

export interface CalendarListItem {
  id: string;
  name: string;
  color: string;
  role: CalendarRole;
  synced: SyncedInfo | null;
  /** Without owner, shown inside one of the user's groups (spec 007 RF-46). */
  orphan?: boolean;
  groupId?: string | null;
  /** Own, normal and with an account that writes (spec 009 RF-34, RF-38). */
  canUpload?: boolean;
}

const ROLE_LABELS: Record<CalendarRole, string> = {
  owner: "Propietario",
  editor: "Editor",
  viewer: "Lector",
};

const ACTION_LINK =
  "inline-flex min-h-11 items-center text-sm font-semibold text-ink underline decoration-control underline-offset-4 hover:decoration-ink";

/** Calendars the user belongs to, in the order received (RF-13, RF-41, RF-45). */
export function CalendarList({
  calendars,
  timeZone,
  leaveAction,
  groups,
  assignAction,
}: {
  calendars: CalendarListItem[];
  timeZone: string;
  /** The user's groups, to move each calendar to one (spec 007 RF-36). */
  groups?: { id: string; name: string }[];
  assignAction?: (
    calendarId: string,
    groupId: string | null,
  ) => Promise<{ error?: string }>;
  /** Leaves a calendar that belongs to someone else (RF-27, RF-34). */
  leaveAction: (calendarId: string) => Promise<ConfirmState>;
}) {
  if (calendars.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-paper px-4 py-6 text-center text-ink">
        <p>Todavía no tienes calendarios.</p>
        <LinkButton href="/dashboard/calendars/new">
          Crear calendario
        </LinkButton>
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {calendars.map((calendar) => (
        <li
          key={calendar.id}
          className="flex min-w-0 flex-col gap-2 rounded-3xl bg-paper p-4"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              data-testid="calendar-color"
              aria-hidden="true"
              className="size-4 shrink-0 rounded-full ring-1 ring-pastel-ink/20"
              style={{ backgroundColor: calendar.color }}
            />
            <span
              data-testid="calendar-name"
              className="min-w-0 flex-1 truncate font-semibold text-ink"
            >
              {calendar.name}
            </span>
            {calendar.orphan ? (
              <span className="shrink-0 rounded-full bg-stone px-2.5 py-0.5 text-sm font-medium text-ink">
                Sin propietario
              </span>
            ) : null}
            <span className="shrink-0 rounded-full bg-stone px-2.5 py-0.5 text-sm font-medium text-ink">
              {ROLE_LABELS[calendar.role]}
            </span>
          </div>
          {calendar.synced ? (
            // Every member sees the last update; only the owner the account (spec 007 RF-26).
            <p className="text-sm text-muted tabular-nums">
              {calendar.synced.lastSyncedAt
                ? `Traído de ${providerName(calendar.synced.provider)}, actualizado el ${formatWhen(calendar.synced.lastSyncedAt, timeZone)}.`
                : `Traído de ${providerName(calendar.synced.provider)}, todavía no se ha actualizado.`}
              {calendar.synced.accountEmail
                ? ` Cuenta: ${calendar.synced.accountEmail}.`
                : null}
            </p>
          ) : null}
          {groups && groups.length > 0 && assignAction ? (
            <AssignGroupSelect
              calendarName={calendar.name}
              groupId={calendar.groupId ?? null}
              groups={groups}
              action={assignAction.bind(null, calendar.id)}
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-x-4">
            {calendar.role === "owner" ? (
              <Link
                href={`/dashboard/calendars/${calendar.id}/edit`}
                aria-label={`Editar ${calendar.name}`}
                className={ACTION_LINK}
              >
                Editar
              </Link>
            ) : null}
            {calendar.canUpload ? (
              <Link
                href={`/dashboard/calendars/${calendar.id}/upload`}
                aria-label={`Subir ${calendar.name} a Google o iCloud`}
                className={ACTION_LINK}
              >
                Subir a Google o iCloud
              </Link>
            ) : null}
            {calendar.role !== "viewer" ? (
              <Link
                href={`/dashboard/calendars/${calendar.id}/categories`}
                aria-label={`Categorías de ${calendar.name}`}
                className={ACTION_LINK}
              >
                Categorías
              </Link>
            ) : null}
            {calendar.role === "owner" ? (
              <Link
                href={`/dashboard/calendars/${calendar.id}/share`}
                aria-label={`Compartir y miembros de ${calendar.name}`}
                className={ACTION_LINK}
              >
                Compartir y miembros
              </Link>
            ) : (
              <>
                <Link
                  href={`/dashboard/calendars/${calendar.id}/members`}
                  aria-label={`Miembros de ${calendar.name}`}
                  className={ACTION_LINK}
                >
                  Miembros
                </Link>
                <ConfirmDialog
                  triggerLabel="Salir"
                  triggerAriaLabel={`Salir de ${calendar.name}`}
                  title={`¿Salir de «${calendar.name}»?`}
                  description="Dejarás de verlo. Los eventos que creaste se quedan, y solo podrás volver con una invitación nueva."
                  confirmLabel="Sí, salir"
                  action={leaveAction.bind(null, calendar.id)}
                />
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
