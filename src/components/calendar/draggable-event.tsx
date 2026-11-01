"use client";

import type { ComponentProps } from "react";
import type { DragMode } from "@/lib/hooks/use-event-drag";
import { formatTime } from "@/lib/calendar/time-zone";
import { EventBlock } from "./event-block";
import { useEventInteractions } from "./event-interactions";

/**
 * An event the user can drag to another time or day, and stretch from its
 * bottom edge (spec 017 RF-5, RF-7, RF-8, RF-10). Outside the calendar, or
 * without permission to write, it is the plain block (RF-2).
 */
export function DraggableEvent({
  mode,
  resizable = false,
  ...block
}: ComponentProps<typeof EventBlock> & {
  mode: DragMode;
  /** The bottom edge changes the end: only where the event ends. */
  resizable?: boolean;
}) {
  const api = useEventInteractions();
  const { event, timeZone } = block;
  if (!api?.canEdit(event)) return <EventBlock {...block} />;

  const lifted = api.draggingId === event.id;
  return (
    <EventBlock
      {...block}
      className={`${block.className ?? ""} touch-manipulation select-none ${lifted ? "z-30 shadow-float ring-2 ring-ink" : ""}`}
      anchor={{
        draggable: false,
        onPointerDown: (pointer) => api.startDrag(event, pointer, { mode }),
      }}
    >
      {lifted && mode === "grid" && !event.allDay ? (
        // The new hours on the block itself (RF-8).
        <span aria-hidden="true" className="block font-semibold tabular-nums">
          {formatTime(event.startsAt, timeZone)} –{" "}
          {formatTime(event.endsAt, timeZone)}
        </span>
      ) : null}
      {resizable ? (
        <span
          aria-hidden="true"
          data-resize=""
          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
          onPointerDown={(pointer) => {
            // The handle stretches; it never moves the whole block (RF-10).
            pointer.stopPropagation();
            api.startDrag(event, pointer, { mode, resize: true });
          }}
        />
      ) : null}
    </EventBlock>
  );
}
