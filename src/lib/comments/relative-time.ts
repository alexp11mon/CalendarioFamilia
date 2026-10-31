import { addDays, formatTime, zonedDateKey } from "@/lib/calendar/time-zone";

// When a comment was written, in the profile's time zone (RF-2).

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function shortDay(instant: string, timeZone: string, withYear: boolean) {
  const parts = new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone,
  }).formatToParts(new Date(instant));
  // "20 oct" and "31 dic 2025": no dots or "de".
  return parts
    .filter((part) => part.type !== "literal")
    .map((part) => part.value.replace(".", ""))
    .join(" ");
}

/** "ahora", "hace 5 min", "hace 2 h", "ayer a las 18:30", "20 oct a las 10:05" or "31 dic 2025". */
export function relativeTime(
  instant: string,
  now: Date,
  timeZone: string,
): string {
  const elapsed = now.getTime() - Date.parse(instant);
  // A clock ahead of the database's says "ahora", never "en 5 s".
  if (elapsed < MINUTE) return "ahora";
  if (elapsed < HOUR) return `hace ${Math.floor(elapsed / MINUTE)} min`;

  const day = zonedDateKey(instant, timeZone);
  const today = zonedDateKey(now, timeZone);
  const time = formatTime(instant, timeZone);
  if (day === today) return `hace ${Math.floor(elapsed / HOUR)} h`;
  if (day === addDays(today, -1)) return `ayer a las ${time}`;
  if (day.slice(0, 4) === today.slice(0, 4)) {
    return `${shortDay(instant, timeZone, false)} a las ${time}`;
  }
  return shortDay(instant, timeZone, true);
}

/** "lunes, 2 de noviembre de 2026, 18:30": the accessible full date (RF-2). */
export function fullDateTime(instant: string, timeZone: string): string {
  const date = new Intl.DateTimeFormat("es-ES", {
    dateStyle: "full",
    timeZone,
  }).format(new Date(instant));
  return `${date}, ${formatTime(instant, timeZone)}`;
}
