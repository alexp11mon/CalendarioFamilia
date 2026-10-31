import Link from "next/link";
import type { CSSProperties } from "react";
import type { CalendarEventItem } from "@/lib/calendar/layout";
import { formatTime } from "@/lib/calendar/time-zone";
import { CommentIcon, ImageIcon, RepeatIcon } from "@/components/shell/icons";

/**
 * Mark of an event with images (spec 012 RF-12). The words always reach
 * screen readers; the icon only where it fits.
 */
export function ImageMark({
  count,
  icon = true,
}: {
  count?: number;
  icon?: boolean;
}) {
  if (!count) return null;
  return (
    <>
      {icon ? (
        <>
          {" "}
          <ImageIcon />
        </>
      ) : null}
      <span className="sr-only"> Con imágenes</span>
    </>
  );
}

/** Mark of an occurrence of a series (spec 013 RF-9), as ImageMark. */
function RepeatMark({ series, icon }: { series: boolean; icon: boolean }) {
  if (!series) return null;
  return (
    <>
      {icon ? (
        <>
          {" "}
          <RepeatIcon />
        </>
      ) : null}
      <span className="sr-only"> Se repite</span>
    </>
  );
}

/** Comments and their number (spec 014 RF-5), as ImageMark. */
function CommentMark({ count, icon }: { count?: number; icon: boolean }) {
  if (!count) return null;
  return (
    <>
      {icon ? (
        <>
          {" "}
          <CommentIcon />
          <span aria-hidden="true" className="tabular-nums">
            {count}
          </span>
        </>
      ) : null}
      <span className="sr-only">
        {" "}
        {count} {count === 1 ? "comentario" : "comentarios"}
      </span>
    </>
  );
}

const SHAPES = {
  // Month and all-day strip: one line, as Google (spec 016 RF-34, RF-40).
  line: "block h-[18px] truncate rounded-md px-1 text-xs leading-[18px]",
  // Week and day: wraps and is cut at the bottom (RF-41, RF-42).
  grid: "block overflow-hidden rounded-md px-1 py-0.5 text-xs leading-tight break-words hyphens-auto",
  // Agenda: title and a line under it, each cut with an ellipsis (RF-54..RF-56).
  card: "flex min-w-0 flex-col rounded-xl px-4 py-2.5 text-base",
} as const;

/**
 * An event as a block filled with its color, the text in ink and the title in
 * bold (spec 016 RF-1..RF-5, plan D12, constitution amendment 4).
 */
export function EventBlock({
  event,
  timeZone,
  shape,
  line,
  icons = true,
  style,
  className = "",
}: {
  event: CalendarEventItem;
  timeZone: string;
  shape: keyof typeof SHAPES;
  /** The agenda's second line ("A las 11:15–14:15 en …"). */
  line?: string | null;
  /** The icons of images, series and comments, where they fit. */
  icons?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  const time = event.allDay ? null : formatTime(event.startsAt, timeZone);

  return (
    <Link
      href={`/dashboard/events/${event.id}`}
      style={{ ...style, backgroundColor: event.color }}
      className={`${SHAPES[shape]} text-pastel-ink ring-1 ring-pastel-ink/15 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink ${className}`}
    >
      {shape !== "card" && time ? (
        <span className="sr-only">{time}, </span>
      ) : null}
      {shape === "card" ? (
        <>
          <span className="truncate">
            <span className="font-bold">{event.title}</span>
            <RepeatMark series={Boolean(event.seriesId)} icon={icons} />
            <ImageMark count={event.imageCount} icon={icons} />
            <CommentMark count={event.commentCount} icon={icons} />
          </span>
          {line ? <span className="truncate">{line}</span> : null}
        </>
      ) : (
        <>
          <span className="font-bold">{event.title}</span>
          <RepeatMark series={Boolean(event.seriesId)} icon={icons} />
          <ImageMark count={event.imageCount} icon={icons} />
          <CommentMark count={event.commentCount} icon={icons} />
          {shape === "grid" && event.location ? (
            <span className="block">{event.location}</span>
          ) : null}
        </>
      )}
    </Link>
  );
}
