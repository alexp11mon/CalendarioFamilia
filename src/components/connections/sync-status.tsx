import type { SyncedCalendarView } from "@/lib/sync/queries";
import { summaryText, syncErrorText } from "@/lib/sync/summary";
import type { ProviderName } from "@/lib/sync/providers/types";

export function formatWhen(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/** State of each synced calendar: last good update, failure or gone (RF-13, RF-26, RF-33). */
export function SyncStatus({
  calendars,
  timeZone,
  provider = "google",
}: {
  calendars: SyncedCalendarView[];
  timeZone: string;
  provider?: ProviderName;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {calendars.map((calendar) => (
        <li
          key={calendar.calendarId}
          className="flex flex-col gap-1 rounded-2xl bg-paper p-3 text-sm text-ink"
        >
          <span className="font-semibold">{calendar.name}</span>
          {calendar.state === "missing" ? (
            <span className="text-danger">
              {syncErrorText("missing", provider)}
            </span>
          ) : (
            <>
              <span className="tabular-nums">
                {calendar.lastSyncedAt
                  ? `Última actualización correcta: ${formatWhen(calendar.lastSyncedAt, timeZone)}.`
                  : "Todavía no se ha actualizado correctamente."}
              </span>
              {calendar.lastError && calendar.lastError !== "missing" ? (
                <span className="text-danger">
                  {syncErrorText(
                    calendar.lastError === "revoked" ? "revoked" : "transient",
                    provider,
                  )}
                </span>
              ) : calendar.lastSummary ? (
                <span className="text-muted">
                  {summaryText(calendar.lastSummary)}
                </span>
              ) : null}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
