"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ChevronIcon } from "@/components/shell/icons";
import { FormAlert } from "@/components/ui/form-alert";
import { formatDateKeyFull } from "@/lib/calendar/format";
import { visibleMarks, type MonthMarks } from "@/lib/calendar/month-marks";
import {
  calendarHref,
  getVisibleRange,
  type CalendarView,
} from "@/lib/calendar/ranges";
import { parseDateKey } from "@/lib/calendar/time-zone";

type Load = (
  month: string,
) => Promise<{ marks: MonthMarks } | { error: string }>;

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

const monthTitle = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function shiftMonth(month: string, delta: -1 | 1): string {
  const [year, value] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (value - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

// Any time zone gives the same days: only the list of date keys is used.
function gridDays(month: string): string[] {
  return getVisibleRange("month", `${month}-01`, "UTC").days;
}

const NAV_BUTTON =
  "flex size-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-stone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50";

/**
 * Month at a glance with dots for the days with events. Changing month only
 * loads its dots; a day opens that date in the current view (spec 005 RF-23..RF-26).
 */
export function MiniMonth({
  month: initialMonth,
  today,
  view,
  initialMarks,
  colors,
  visibleCalendarIds,
  loadMonthMarks,
}: {
  month: string;
  today: string;
  view: CalendarView;
  initialMarks: MonthMarks;
  colors: Record<string, string>;
  visibleCalendarIds: ReadonlySet<string>;
  loadMonthMarks: Load;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [cache, setCache] = useState<Record<string, MonthMarks>>({
    [initialMonth]: initialMarks,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const titleId = useId();

  async function show(delta: -1 | 1) {
    const next = shiftMonth(month, delta);
    setError(undefined);
    if (cache[next]) {
      setMonth(next);
      return;
    }
    setPending(true);
    let result: Awaited<ReturnType<Load>>;
    try {
      result = await loadMonthMarks(next);
    } catch {
      result = { error: "No se ha podido cargar el mes." };
    }
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setCache((current) => ({ ...current, [next]: result.marks }));
    setMonth(next);
  }

  // The shown month follows the server's refresh after a change (spec 017).
  const marks = visibleMarks(
    (month === initialMonth ? initialMarks : cache[month]) ?? {},
    visibleCalendarIds,
  );
  const days = gridDays(month);
  const weeks = Array.from({ length: days.length / 7 }, (_, index) =>
    days.slice(index * 7, index * 7 + 7),
  );

  return (
    <section
      aria-label="Mini calendario"
      className="flex flex-col gap-2 rounded-3xl glass p-2 sm:p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          id={titleId}
          aria-live="polite"
          className="pl-2 text-base font-bold text-ink first-letter:uppercase"
        >
          {monthTitle.format(new Date(`${month}-01T00:00:00Z`))}
        </h2>
        <div className="flex">
          <button
            type="button"
            onClick={() => void show(-1)}
            disabled={pending}
            className={NAV_BUTTON}
          >
            <ChevronIcon direction="left" />
            <span className="sr-only">Mostrar mes anterior</span>
          </button>
          <button
            type="button"
            onClick={() => void show(1)}
            disabled={pending}
            className={NAV_BUTTON}
          >
            <ChevronIcon direction="right" />
            <span className="sr-only">Mostrar mes siguiente</span>
          </button>
        </div>
      </div>
      <table
        aria-labelledby={titleId}
        className="w-full table-fixed text-center"
      >
        <thead>
          <tr>
            {WEEKDAYS.map((weekday) => (
              <th
                key={weekday}
                scope="col"
                className="pb-1 text-xs font-semibold text-muted"
              >
                {weekday}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((day) => {
                const isToday = day === today;
                const inMonth = day.startsWith(month);
                const dots = marks[day] ?? [];
                const label = `${formatDateKeyFull(day)}${isToday ? ", hoy" : ""}${dots.length > 0 ? ", con eventos" : ""}`;
                return (
                  <td key={day} className="p-0">
                    <Link
                      href={calendarHref(view, day)}
                      aria-label={label}
                      aria-current={isToday ? "date" : undefined}
                      className={`mx-auto flex size-11 flex-col items-center justify-center rounded-xl text-sm tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                        isToday
                          ? "border border-accent-edge bg-accent font-extrabold text-on-accent"
                          : `hover:bg-stone ${inMonth ? "font-medium text-ink" : "text-muted"}`
                      }`}
                    >
                      {parseDateKey(day)?.day}
                      <span aria-hidden="true" className="flex h-1.5 gap-0.5">
                        {dots.map((calendarId) => (
                          <span
                            key={calendarId}
                            data-dot=""
                            className="size-1.5 rounded-full ring-1 ring-pastel-ink/20"
                            style={{ backgroundColor: colors[calendarId] }}
                          />
                        ))}
                      </span>
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <FormAlert message={error} />
    </section>
  );
}
