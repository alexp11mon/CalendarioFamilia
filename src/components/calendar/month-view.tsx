"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatDateKeyFull } from "@/lib/calendar/format";
import type { CalendarEventItem } from "@/lib/calendar/layout";
import { fitWeek, layoutMonthWeek } from "@/lib/calendar/month-lanes";
import { boxOf, type Box } from "@/lib/calendar/popover";
import { calendarHref } from "@/lib/calendar/ranges";
import { weekdayIndex } from "@/lib/calendar/time-zone";
import { DraggableEvent } from "./draggable-event";

const INITIALS = ["L", "M", "X", "J", "V", "S", "D"];
// A lane is an 18 px block and a 2 px gap (EventBlock "line", gap-y-0.5).
const LANE_PX = 20;
// Before measuring (server, first paint) three lanes, as the month had until spec 016.
const DEFAULT_LANES = 3;

/** How many lanes fit in the events area of a week, measured on resize (plan D7). */
function useLanes() {
  const area = useRef<HTMLDivElement>(null);
  const [lanes, setLanes] = useState(DEFAULT_LANES);
  useEffect(() => {
    const element = area.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setLanes(
        Math.max(1, Math.floor((entry.contentRect.height + 2) / LANE_PX)),
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [area, lanes] as const;
}

/**
 * Month grid at full height, Monday first, each week in lanes so a multi-day
 * event is one block, "+N" when a day does not fit (spec 016 RF-30..RF-37,
 * plan D6, D7). Creating from an empty day is kept (spec 008 RF-19, RF-46).
 */
export function MonthView({
  date,
  days,
  events,
  timeZone,
  today,
  onCreate,
  draft,
}: {
  /** Reference date: days of other months are greyed. */
  date: string;
  days: string[];
  events: CalendarEventItem[];
  timeZone: string;
  today: string;
  /** Opens the quick window on an empty day; absent for readers (spec 008 RF-19, RF-36). */
  onCreate?: (day: string, anchor: Box) => void;
  /** The event being created, shown in its day (spec 008 RF-40). */
  draft?: { day: string; title: string } | null;
}) {
  const [area, lanes] = useLanes();
  const month = date.slice(0, 7);
  const weeks = Array.from({ length: days.length / 7 }, (_, index) => {
    const weekDays = days.slice(index * 7, index * 7 + 7);
    return {
      days: weekDays,
      ...fitWeek(layoutMonthWeek(events, weekDays, timeZone), lanes),
    };
  });
  const todayColumn = days.includes(today) ? weekdayIndex(today) : -1;

  return (
    // Fills the screen under the header: the rows grow, never the cells (RF-30, RF-36).
    <div className="flex h-[calc(100dvh-4.5rem-env(safe-area-inset-top))] flex-col gap-2 tab:h-[max(32rem,calc(100dvh-14rem))]">
      <div
        aria-hidden="true"
        data-testid="weekday-initials"
        className="grid grid-cols-7 text-center text-xs font-semibold"
      >
        {INITIALS.map((initial, column) => (
          <span
            key={initial}
            className={
              column === todayColumn ? "text-accent-ink" : "text-muted"
            }
          >
            {initial}
          </span>
        ))}
      </div>
      <ol className="flex min-h-0 flex-1 flex-col gap-px overflow-hidden rounded-3xl bg-line max-tab:-mx-4 max-tab:rounded-none">
        {weeks.map((week, index) => (
          <li
            key={week.days[0]}
            className="relative grid min-h-0 flex-1 grid-cols-7 gap-px"
          >
            {week.days.map((day) => (
              <div
                key={day}
                data-testid="day-cell"
                data-date={day}
                className="relative flex min-w-0 flex-col items-center bg-paper pt-1"
              >
                {onCreate ? (
                  // The whole empty space creates; the number and the events sit above it (spec 008 RF-19, RF-22).
                  <button
                    type="button"
                    aria-label={`Crear evento el ${formatDateKeyFull(day)}`}
                    onClick={(event) =>
                      onCreate(day, boxOf(event.currentTarget))
                    }
                    className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
                  />
                ) : null}
                <Link
                  href={calendarHref("day", day)}
                  aria-label={formatDateKeyFull(day)}
                  aria-current={day === today ? "date" : undefined}
                  className={`relative inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${day === today ? "border border-accent-edge bg-accent text-on-accent" : day.slice(0, 7) === month ? "text-ink" : "text-muted"}`}
                >
                  {Number(day.slice(8))}
                </Link>
                {draft?.day === day ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0.5 bottom-0.5 z-10 truncate rounded-md border border-dashed border-ink bg-paper px-1 text-xs font-semibold text-ink"
                  >
                    {draft.title || "(Sin título)"}
                  </span>
                ) : null}
              </div>
            ))}
            {/* Events over the cells; the gaps still reach the create buttons (RF-34, RF-35). */}
            <div
              ref={index === 0 ? area : undefined}
              className="pointer-events-none absolute inset-x-0 top-8 bottom-0.5 grid auto-rows-[18px] grid-cols-7 content-start gap-y-0.5 overflow-hidden"
            >
              {week.visible.map(({ event, start, span, lane }) => (
                <DraggableEvent
                  key={event.id}
                  mode="month"
                  event={event}
                  timeZone={timeZone}
                  shape="line"
                  icons={false}
                  className="pointer-events-auto mx-0.5 min-w-0"
                  style={{
                    gridColumn: `${start + 1} / span ${span}`,
                    gridRow: lane + 1,
                  }}
                />
              ))}
              {week.hidden.map((count, column) =>
                count > 0 ? (
                  <Link
                    key={column}
                    href={calendarHref("day", week.days[column]!)}
                    aria-label={`+${count} más, ${formatDateKeyFull(week.days[column]!)}`}
                    style={{ gridColumn: column + 1, gridRow: lanes }}
                    className="pointer-events-auto mx-0.5 truncate rounded-md px-1 text-xs leading-[18px] font-semibold text-ink hover:bg-stone focus-visible:outline-2 focus-visible:outline-ink"
                  >
                    +{count}
                  </Link>
                ) : null,
              )}
            </div>
          </li>
        ))}
      </ol>
      {events.length === 0 ? <p className="sr-only">No hay eventos</p> : null}
    </div>
  );
}
