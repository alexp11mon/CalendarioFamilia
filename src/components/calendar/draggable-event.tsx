"use client";

import { useRef, type ComponentProps } from "react";
import type { DragMode } from "@/lib/hooks/use-event-drag";
import { formatTime } from "@/lib/calendar/time-zone";
import { EventBlock } from "./event-block";
import { useEventInteractions } from "./event-interactions";

/**
 * An event the user can drag to another time or day, and stretch from its
 * bottom edge (spec 017 RF-5, RF-7, RF-8, RF-10). A finger lifts it after
 * holding it still and leaves it lifted, with a handle for its end (RF-6,
 * RF-11). Outside the calendar, or without permission to write, it is the
 * plain block (RF-2).
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
  const touched = useRef(false);
  const { event, timeZone } = block;
  if (!api?.canEdit(event)) return <EventBlock {...block} />;

  const dragging = api.draggingId === event.id;
  const lifted = api.liftedId === event.id;
  return (
    <EventBlock
      {...block}
      // No callout or text selection on a long press; held, the page does not pan (plan D4).
      className={`${block.className ?? ""} touch-manipulation select-none [-webkit-touch-callout:none] ${dragging || lifted ? "z-30 shadow-float ring-2 ring-ink" : ""} ${lifted ? "touch-none" : ""}`}
      anchor={{
        draggable: false,
        "data-lifted": lifted ? "" : undefined,
        onPointerDown: (pointer) => {
          touched.current = pointer.pointerType === "touch";
          api.startDrag(event, pointer, { mode, lifted });
        },
        // A finger held on an event lifts it; the system menu never opens (RF-6).
        onContextMenu: (menu) => {
          if (touched.current) menu.preventDefault();
        },
      }}
    >
      {dragging && mode === "grid" && !event.allDay ? (
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
          className={`absolute inset-x-0 bottom-0 flex cursor-ns-resize justify-center ${lifted ? "h-6 items-end pb-0.5" : "h-2"}`}
          onPointerDown={(pointer) => {
            // The handle stretches; it never moves the whole block (RF-10).
            pointer.stopPropagation();
            touched.current = pointer.pointerType === "touch";
            // With a finger it only works once the event is lifted (RF-11).
            if (touched.current && !lifted) {
              api.startDrag(event, pointer, { mode });
              return;
            }
            api.startDrag(event, pointer, { mode, resize: true, lifted });
          }}
        >
          {lifted ? (
            <span
              data-handle=""
              className="size-3 rounded-full border-2 border-ink bg-paper"
            />
          ) : null}
        </span>
      ) : null}
    </EventBlock>
  );
}
