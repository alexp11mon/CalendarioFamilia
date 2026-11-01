"use client";

import Link from "next/link";
import { formatDateKeyFull } from "@/lib/calendar/format";
import {
  dayEvents,
  isBanner,
  layoutTimedDay,
  type CalendarEventItem,
} from "@/lib/calendar/layout";
import { layoutMonthWeek } from "@/lib/calendar/month-lanes";
import type { Box } from "@/lib/calendar/popover";
import { calendarHref } from "@/lib/calendar/ranges";
import type { MinuteRange } from "@/lib/calendar/slots";
import { fromMinutes } from "@/lib/calendar/time-options";
import {
  utcToZonedParts,
  weekdayIndex,
  zonedDateKey,
} from "@/lib/calendar/time-zone";
import { useNow } from "@/lib/hooks/use-now";
import { DraggableEvent } from "./draggable-event";
import { ScrollOnMount } from "./scroll-on-mount";
import { SlotLayer } from "./slot-layer";

/** The event being created, drawn at its hours (spec 008 RF-40). */
export interface GridDraft {
  day: string;
  startMinute: number;
  endMinute: number;
  title: string;
}

export type CreateInGrid = (
  day: string,
  range: MinuteRange,
  anchor: Box,
) => void;

const HOUR_PX = 48;
const MIN_SLOT_PX = 22;
const FIRST_VISIBLE_HOUR = 7;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const INITIALS = ["L", "M", "X", "J", "V", "S", "D"];

const percent = (value: number) => `${Number(value.toFixed(4))}%`;

function minuteOfDay(instant: number, timeZone: string) {
  const { hour, minute } = utcToZonedParts(instant, timeZone);
  return hour * 60 + minute;
}

/**
 * Hour grid shared by the week and day views, as Google: a fixed header with
 * the initial and a big number, a strip of one-line blocks for all-day and
 * multi-day events, filled blocks side by side and the now line (spec 016
 * RF-38..RF-46). Creating on a slot is kept (spec 008 RF-20, RF-36).
 */
export function TimeGrid({
  days,
  events,
  timeZone,
  today,
  linkDays,
  onCreate,
  draft,
}: {
  days: string[];
  events: CalendarEventItem[];
  timeZone: string;
  today: string;
  /** Header numbers link to the day view; off when the day view is already open. */
  linkDays: boolean;
  /** Click or drag on an empty slot; absent for readers (spec 008 RF-20, RF-36). */
  onCreate?: CreateInGrid;
  draft?: GridDraft | null;
}) {
  const now = useNow();
  const columns = {
    gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))`,
  };
  const banners = layoutMonthWeek(
    events.filter((event) => isBanner(event, timeZone)),
    days,
    timeZone,
  );
  const isEmpty = days.every(
    (day) => dayEvents(events, day, timeZone).length === 0,
  );
  const showsToday = days.includes(today);

  return (
    // The screen height under the header, never under 28 rem on a larger screen.
    <div className="flex h-[calc(100dvh-4.5rem-env(safe-area-inset-top))] flex-col gap-3 tab:h-[max(32rem,calc(100dvh-14rem))]">
      {/* The grid scrolls on its own; the day header and the strip stay on top (RF-38). */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-paper max-tab:-mx-4 max-tab:rounded-none">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="grid border-b border-line" style={columns}>
            <div />
            {days.map((day) => {
              const isToday = day === today;
              const number = `inline-flex size-10 items-center justify-center rounded-full text-2xl font-semibold tabular-nums ${isToday ? "border border-accent-edge bg-accent text-on-accent" : "text-ink"}`;
              return (
                <div
                  key={day}
                  data-testid="day-header"
                  className="flex flex-col items-center py-1"
                >
                  <span
                    className={`text-xs font-semibold ${isToday ? "text-accent-ink" : "text-muted"}`}
                  >
                    {INITIALS[weekdayIndex(day)]}
                  </span>
                  {linkDays ? (
                    <Link
                      href={calendarHref("day", day)}
                      aria-label={formatDateKeyFull(day)}
                      aria-current={isToday ? "date" : undefined}
                      className={`${number} focus-visible:outline-2 focus-visible:outline-ink`}
                    >
                      {Number(day.slice(8))}
                    </Link>
                  ) : (
                    <span
                      aria-label={formatDateKeyFull(day)}
                      aria-current={isToday ? "date" : undefined}
                      className={number}
                    >
                      {Number(day.slice(8))}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {/* One block per event across its days, in lanes as the month (RF-40).
              Always there, as Google: showing it only while dragging would push
              the grid down under the pointer (spec 017 RF-13). */}
          <div
            data-testid="banner-strip"
            className="grid min-h-6 gap-y-0.5 border-b border-line py-0.5"
            style={columns}
          >
            <span className="sr-only">Todo el día</span>
            {days.map((day, index) => (
              // Behind the blocks: where an event lands on the strip (plan D3).
              <div
                key={day}
                data-allday-day={day}
                aria-hidden="true"
                style={{
                  gridColumn: index + 2,
                  gridRow: `1 / span ${Math.max(1, ...banners.map((b) => b.lane + 1))}`,
                }}
              />
            ))}
            {banners.map(({ event, start, span, lane }) => (
              <DraggableEvent
                key={event.id}
                mode="strip"
                event={event}
                timeZone={timeZone}
                shape="line"
                className="mx-0.5 min-w-0"
                style={{
                  gridColumn: `${start + 2} / span ${span}`,
                  gridRow: lane + 1,
                }}
              />
            ))}
          </div>
          <ScrollOnMount
            scrollKey={`${days[0]}|${showsToday}`}
            // The current hour less one with today in view, else the morning (RF-45).
            top={() =>
              showsToday
                ? Math.max(0, minuteOfDay(Date.now(), timeZone) / 60 - 1) *
                  HOUR_PX
                : FIRST_VISIBLE_HOUR * HOUR_PX
            }
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <div data-testid="time-grid" className="grid" style={columns}>
              <div>
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    style={{ height: HOUR_PX }}
                    className="pr-1 text-right text-[11px] text-muted tabular-nums"
                  >
                    {/* "9:00" on its line, as Google; midnight has no label (RF-44). */}
                    {hour > 0 ? (
                      <span className="block -translate-y-1/2">{hour}:00</span>
                    ) : null}
                  </div>
                ))}
              </div>
              {days.map((day) => (
                <div
                  key={day}
                  data-day={day}
                  data-time-col=""
                  className="relative border-l border-line"
                  style={{ height: 24 * HOUR_PX }}
                >
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      aria-hidden="true"
                      style={{ height: HOUR_PX }}
                      className="border-t border-line"
                    />
                  ))}
                  {onCreate ? (
                    <SlotLayer
                      day={day}
                      dayLabel={formatDateKeyFull(day)}
                      onCreate={onCreate}
                    />
                  ) : null}
                  {draft?.day === day ? (
                    <div
                      data-testid="draft-block"
                      aria-hidden="true"
                      style={{
                        top: `${(draft.startMinute / 60) * HOUR_PX}px`,
                        height: `${Math.max(((draft.endMinute - draft.startMinute) / 60) * HOUR_PX, MIN_SLOT_PX)}px`,
                      }}
                      className="pointer-events-none absolute inset-x-0.5 z-10 overflow-hidden rounded-md border border-dashed border-ink bg-paper px-1 text-xs text-ink"
                    >
                      <span className="block font-semibold">
                        {draft.title || "(Sin título)"}
                      </span>
                      <span className="block tabular-nums">
                        {fromMinutes(draft.startMinute)} –{" "}
                        {fromMinutes(draft.endMinute)}
                      </span>
                    </div>
                  ) : null}
                  {layoutTimedDay(events, day, timeZone).map((slot) => {
                    const width = 100 / slot.columns;
                    return (
                      <DraggableEvent
                        key={slot.event.id}
                        mode="grid"
                        // Its bottom edge is where it ends (RF-10).
                        resizable={
                          zonedDateKey(
                            Date.parse(slot.event.endsAt) - 1,
                            timeZone,
                          ) === day
                        }
                        event={slot.event}
                        timeZone={timeZone}
                        shape="grid"
                        // A block under 30 min has no room for it (spec 012 RF-12).
                        icons={slot.endMinute - slot.startMinute >= 30}
                        // A paper edge parts blocks that touch, as Google.
                        className="absolute border border-paper"
                        style={{
                          top: `${(slot.startMinute / 60) * HOUR_PX}px`,
                          height: `${Math.max(((slot.endMinute - slot.startMinute) / 60) * HOUR_PX, MIN_SLOT_PX)}px`,
                          left: percent(slot.column * width),
                          width: percent(width),
                        }}
                      />
                    );
                  })}
                  {day === today && now !== null ? (
                    // The current time: a line with a dot at its start (RF-43).
                    <div
                      data-testid="now-line"
                      aria-hidden="true"
                      style={{
                        top: `${(minuteOfDay(now, timeZone) / 60) * HOUR_PX}px`,
                      }}
                      className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-accent-ink"
                    >
                      <span
                        data-now-dot=""
                        className="absolute -top-[5px] -left-1.5 size-3 rounded-full bg-accent-ink"
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </ScrollOnMount>
        </div>
      </div>
      {isEmpty ? <p className="sr-only">No hay eventos</p> : null}
    </div>
  );
}
