"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { anchorDay, buildAgendaFeed } from "@/lib/calendar/agenda-feed";
import { AGENDA_TODAY_EVENT } from "@/lib/calendar/agenda-today";
import { calendarHref, daysBetween } from "@/lib/calendar/ranges";
import { addDays } from "@/lib/calendar/time-zone";
import type { AgendaEvent } from "@/lib/calendar/to-view-events";
import { todayType, typesOf } from "@/lib/calendar/transition-types";
import { EventBlock } from "./event-block";

export type { AgendaEvent } from "@/lib/calendar/to-view-events";

/** Days of each chunk loaded while scrolling, and the most kept at once (plan D8, D9). */
const CHUNK_DAYS = 28;
const MAX_DAYS = 120;
// Ask for more before the end is on screen.
const PRELOAD_MARGIN = "600px 0px";
// The phone header's height: what sits just under it names the month (RF-59).
const HEADER_PX = 72;

export { requestAgendaToday } from "@/lib/calendar/agenda-today";

type LoadEvents = (
  from: string,
  to: string,
) => Promise<{ events: AgendaEvent[] } | { error: string }>;

/** A run of days and its events; `events` null for the server's, read from props. */
interface Chunk {
  first: string;
  last: string;
  events: AgendaEvent[] | null;
}

const lengthOf = (chunk: Chunk) => daysBetween(chunk.first, chunk.last) + 1;

function trim(chunks: Chunk[], from: "start" | "end"): Chunk[] {
  const next = [...chunks];
  let total = next.reduce((sum, chunk) => sum + lengthOf(chunk), 0);
  while (total > MAX_DAYS && next.length > 1) {
    total -= lengthOf(from === "start" ? next.shift()! : next.pop()!);
  }
  return next;
}

function listDays(first: string, last: string) {
  return Array.from({ length: daysBetween(first, last) + 1 }, (_, index) =>
    addDays(first, index),
  );
}

/**
 * The agenda as Google: a continuous list of the days with events, a band per
 * month, a separator per week, and more days loaded at both ends (spec 016
 * RF-47..RF-60, plan agenda-view).
 */
export function AgendaView({
  days,
  events,
  timeZone,
  today,
  isShown = () => true,
  loadEvents,
  onMonthChange,
}: {
  /** The days the server read, with their events. */
  days: string[];
  events: AgendaEvent[];
  timeZone: string;
  today: string;
  /** The visibility filter of the workspace, also for loaded chunks. */
  isShown?: (event: AgendaEvent) => boolean;
  loadEvents?: LoadEvents;
  /** The month at the top, for the header title (RF-59). */
  onMonthChange?: (month: string) => void;
}) {
  const router = useRouter();
  const [chunks, setChunks] = useState<Chunk[]>(() => [
    { first: days[0]!, last: days.at(-1)!, events: null },
  ]);
  const [error, setError] = useState<string | null>(null);
  const loading = useRef(false);
  const list = useRef<HTMLDivElement>(null);
  const start = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  // A row on screen and where it was before adding or dropping days, so what
  // is seen stays in place (RF-49).
  const kept = useRef<{ selector: string; top: number } | null>(null);
  // "Hoy" reset the list to the server's days: scroll once it is drawn.
  const anchorPending = useRef(false);

  const first = chunks[0]!.first;
  const last = chunks.at(-1)!.last;
  // A multi-day event comes in every chunk it touches: once by id.
  const all = [
    ...new Map(
      chunks
        .flatMap((chunk) => chunk.events ?? events)
        .map((event) => [event.id, event]),
    ).values(),
  ].filter(isShown);
  const feed = buildAgendaFeed({
    days: listDays(first, last),
    events: all,
    timeZone,
    today,
  });
  const anchor = anchorDay(feed, today);

  function scrollToAnchor() {
    const root = list.current;
    if (!root) return;
    // Without events from today on, the week of today (RF-58).
    const target =
      (anchor ? root.querySelector(`[data-day="${anchor}"]`) : null) ??
      [...root.querySelectorAll<HTMLElement>("[data-week]")]
        .filter((week) => week.dataset.week! <= today)
        .at(-1);
    target?.scrollIntoView({ block: "start" });
  }
  // The listeners below call the latest one.
  const toAnchor = useRef(scrollToAnchor);
  useEffect(() => {
    toAnchor.current = scrollToAnchor;
  });

  // Open on today (RF-58), once.
  useEffect(() => toAnchor.current(), []);
  useEffect(() => {
    if (!anchorPending.current) return;
    anchorPending.current = false;
    toAnchor.current();
  });

  useEffect(() => {
    function onToday() {
      if (first <= today && today <= last) {
        toAnchor.current();
      } else if (days[0]! <= today && today <= days.at(-1)!) {
        // Scrolled far away from the server's days: back to them.
        anchorPending.current = true;
        setChunks([{ first: days[0]!, last: days.at(-1)!, events: null }]);
      } else {
        router.push(calendarHref("agenda", today), {
          transitionTypes: typesOf(todayType(first, today)),
        });
      }
    }
    window.addEventListener(AGENDA_TODAY_EVENT, onToday);
    return () => window.removeEventListener(AGENDA_TODAY_EVENT, onToday);
  }, [days, first, last, today, router]);

  const load = useCallback(
    async (direction: "before" | "after") => {
      if (!loadEvents || loading.current) return;
      loading.current = true;
      const range =
        direction === "after"
          ? { first: addDays(last, 1), last: addDays(last, CHUNK_DAYS) }
          : { first: addDays(first, -CHUNK_DAYS), last: addDays(first, -1) };
      const result = await loadEvents(range.first, range.last);
      loading.current = false;
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const chunk = { ...range, events: result.events };
      const row = [
        ...(list.current?.querySelectorAll<HTMLElement>(
          "[data-day], [data-week]",
        ) ?? []),
      ].find(
        (element) =>
          // The first week is keyed by the list's first day: days loaded
          // before rename it, so it can't be found again to keep in place.
          element.dataset.week !== first &&
          element.getBoundingClientRect().top >= 0,
      );
      kept.current = row
        ? {
            selector: row.dataset.day
              ? `[data-day="${row.dataset.day}"]`
              : `[data-week="${row.dataset.week}"]`,
            top: row.getBoundingClientRect().top,
          }
        : null;
      // A chunk asked for before "Hoy" reset the list no longer touches it.
      setChunks((current) =>
        direction === "after"
          ? addDays(current.at(-1)!.last, 1) === chunk.first
            ? trim([...current, chunk], "start")
            : current
          : addDays(current[0]!.first, -1) === chunk.last
            ? trim([chunk, ...current], "end")
            : current,
      );
    },
    [first, last, loadEvents],
  );

  useLayoutEffect(() => {
    const before = kept.current;
    kept.current = null;
    const row = before && list.current?.querySelector(before.selector);
    if (!before || !row) return;
    const moved = row.getBoundingClientRect().top - before.top;
    if (moved !== 0) window.scrollBy(0, moved);
  });

  // The ends of the list ask for more; a new observer per window re-checks
  // an end that is still on screen after a load (RF-48, RF-49).
  useEffect(() => {
    if (!loadEvents || error || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          void load(entry.target === end.current ? "after" : "before");
        }
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    if (start.current) observer.observe(start.current);
    if (end.current) observer.observe(end.current);
    return () => observer.disconnect();
  }, [first, last, error, load, loadEvents]);

  // When a band, a week or a day crosses the top, the last one above the
  // header's edge names the month (RF-59, plan D10).
  useEffect(() => {
    const root = list.current;
    if (!onMonthChange || !root || typeof IntersectionObserver === "undefined")
      return;
    const observer = new IntersectionObserver(
      () => {
        const rows = [...root.querySelectorAll<HTMLElement>("[data-month]")];
        const top =
          rows
            .filter((row) => row.getBoundingClientRect().top <= HEADER_PX + 8)
            .at(-1) ?? rows[0];
        if (top?.dataset.month) onMonthChange(top.dataset.month);
      },
      { rootMargin: `-${HEADER_PX}px 0px 0px 0px` },
    );
    root
      .querySelectorAll("[data-month]")
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [first, last, onMonthChange]);

  // A refresh (after creating or editing) brings new server events; the loaded
  // chunks are read again so they show the change too.
  const chunksRef = useRef(chunks);
  useEffect(() => {
    chunksRef.current = chunks;
  });
  useEffect(() => {
    if (!loadEvents) return;
    for (const chunk of chunksRef.current) {
      if (chunk.events === null) continue;
      void loadEvents(chunk.first, chunk.last).then((result) => {
        if ("error" in result) return;
        setChunks((current) =>
          current.map((item) =>
            item.first === chunk.first
              ? { ...item, events: result.events }
              : item,
          ),
        );
      });
    }
  }, [events, loadEvents]);

  return (
    <div ref={list} className="flex flex-col max-tab:-mx-4">
      <div
        ref={start}
        data-testid="agenda-start"
        aria-hidden="true"
        className="h-px"
      />
      {feed.map((item) => {
        if (item.kind === "month") {
          return (
            <h2
              key={`month-${item.key}`}
              data-month={item.key}
              className="mt-2 flex h-28 scroll-mt-[calc(4rem+env(safe-area-inset-top))] items-end rounded-3xl bg-agenda-band px-5 pb-4 text-3xl font-bold text-ink first-letter:uppercase max-tab:rounded-none tab:scroll-mt-40"
            >
              {item.label}
            </h2>
          );
        }
        if (item.kind === "week") {
          return (
            <div
              key={`week-${item.key}`}
              data-week={item.key}
              data-month={item.key.slice(0, 7)}
              className="scroll-mt-[calc(4rem+env(safe-area-inset-top))] px-4 pt-5 pb-2 tab:scroll-mt-40"
            >
              <p className="pl-14 text-sm font-semibold text-muted">
                {item.label}
              </p>
              {item.empty ? (
                <p className="pt-2 pl-14 text-sm text-muted">Sin eventos</p>
              ) : null}
            </div>
          );
        }
        return (
          <section
            key={item.key}
            data-testid="agenda-day"
            data-day={item.key}
            data-month={item.key.slice(0, 7)}
            aria-label={item.isToday ? `${item.label}, hoy` : item.label}
            className="flex scroll-mt-[calc(4rem+env(safe-area-inset-top))] gap-3 px-4 py-1.5 tab:scroll-mt-40"
          >
            {/* The day on the left, today in the accent (RF-52, RF-53). */}
            <div
              aria-hidden="true"
              className="flex w-11 shrink-0 flex-col items-center"
            >
              <span
                className={`text-xs font-semibold ${item.isToday ? "text-accent-ink" : "text-muted"}`}
              >
                {item.weekday}
              </span>
              <span
                className={`inline-flex size-9 items-center justify-center rounded-full text-xl font-semibold tabular-nums ${item.isToday ? "border border-accent-edge bg-accent text-on-accent" : "text-ink"}`}
              >
                {item.number}
              </span>
            </div>
            <ul className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
              {item.entries.map((entry) => (
                <li key={entry.event.id}>
                  <EventBlock
                    event={entry.event}
                    timeZone={timeZone}
                    shape="card"
                    line={entry.line}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {error ? (
        <div className="flex flex-col items-center gap-2 py-6">
          <p role="alert" className="text-muted">
            {error}
          </p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="inline-flex min-h-11 items-center rounded-full border border-control bg-paper px-4 font-semibold text-ink press hover:bg-stone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Reintentar
          </button>
        </div>
      ) : null}
      <div
        ref={end}
        data-testid="agenda-end"
        aria-hidden="true"
        className="h-px"
      />
    </div>
  );
}
