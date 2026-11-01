"use client";

import { useRef, useState, type PointerEvent } from "react";
import type { Box } from "@/lib/calendar/popover";
import {
  clickRange,
  dragRange,
  minuteAt,
  type MinuteRange,
} from "@/lib/calendar/slots";
import { fromMinutes } from "@/lib/calendar/time-options";

const DAY_MINUTES = 24 * 60;
// Below this many pixels a mouse press is still a click, not a drag.
const DRAG_THRESHOLD = 4;
// A finger trembles: past this it is a gesture, not a tap (as the long press, spec 017).
const TOUCH_SLOP = 8;
const KEYBOARD_RANGE: MinuteRange = { start: 9 * 60, end: 10 * 60 };

interface Gesture {
  pointerId: number;
  touch: boolean;
  y: number;
  dragging: boolean;
}

/**
 * The empty background of one day column of the hour grid: a click opens the
 * quick window on that half hour, a mouse drag draws the interval in quarters
 * (spec 008 RF-20, RF-42..RF-45, plan D6). Events sit above it, so pressing an
 * event still opens it (RF-2).
 */
export function SlotLayer({
  day,
  dayLabel,
  onCreate,
}: {
  day: string;
  /** "miércoles, 21 de octubre de 2026", for the keyboard button. */
  dayLabel: string;
  onCreate: (day: string, range: MinuteRange, anchor: Box) => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  // The slot a finger tapped, opened by the click that follows (see onPointerUp).
  const tap = useRef<MinuteRange | null>(null);
  const [preview, setPreview] = useState<MinuteRange | null>(null);
  // The Escape listener of the current drag, so the same function is removed.
  const escapeListener = useRef<((event: KeyboardEvent) => void) | null>(null);

  function minute(clientY: number, step: 15 | 30) {
    const rect = layer.current!.getBoundingClientRect();
    return minuteAt(clientY - rect.top, rect.height, step);
  }

  // The interval on screen, for the quick window to sit beside it.
  function anchorOf(range: MinuteRange): Box {
    const rect = layer.current!.getBoundingClientRect();
    const scale = rect.height / DAY_MINUTES;
    return {
      left: rect.left,
      top: rect.top + range.start * scale,
      width: rect.width,
      height: (range.end - range.start) * scale,
    };
  }

  function stop() {
    gesture.current = null;
    setPreview(null);
    if (escapeListener.current) {
      window.removeEventListener("keydown", escapeListener.current);
      escapeListener.current = null;
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    // A second finger is a pinch of the hours, not a tap (spec 017 RF-49).
    if (gesture.current) {
      stop();
      return;
    }
    const touch = event.pointerType === "touch";
    gesture.current = {
      pointerId: event.pointerId,
      touch,
      y: event.clientY,
      dragging: false,
    };
    // A finger keeps scrolling the grid: no capture, no drag (RF-45).
    if (!touch) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      // Escape during a drag drops it (RF-44).
      escapeListener.current = (key: KeyboardEvent) => {
        if (key.key === "Escape" && gesture.current?.dragging) stop();
      };
      window.addEventListener("keydown", escapeListener.current);
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    // A finger that moves is not a tap, even where the grid does not scroll.
    if (current.touch) {
      if (Math.abs(event.clientY - current.y) > TOUCH_SLOP) stop();
      return;
    }
    if (
      !current.dragging &&
      Math.abs(event.clientY - current.y) < DRAG_THRESHOLD
    ) {
      return;
    }
    current.dragging = true;
    setPreview(dragRange(minute(current.y, 15), minute(event.clientY, 15)));
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const range = current.dragging
      ? dragRange(minute(current.y, 15), minute(event.clientY, 15))
      : clickRange(minute(current.y, 30));
    stop();
    // A finger's click comes after its pointerup: opening now, that click would
    // land on the new window's backdrop and close it. Its click opens it.
    if (current.touch) tap.current = range;
    else onCreate(day, range, anchorOf(range));
  }

  return (
    <div
      ref={layer}
      data-testid="slot-layer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={stop}
      onClick={() => {
        const range = tap.current;
        tap.current = null;
        if (range) onCreate(day, range, anchorOf(range));
      }}
      className="absolute inset-0 cursor-cell select-none"
    >
      <button
        type="button"
        onClick={(event) => {
          // Pointer presses are handled above; this one is for the keyboard (RF-22).
          event.stopPropagation();
          onCreate(day, KEYBOARD_RANGE, anchorOf(KEYBOARD_RANGE));
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-1 focus:z-20 focus:rounded-full focus:bg-ink focus:px-3 focus:py-1 focus:text-xs focus:font-semibold focus:text-on-ink"
      >
        Crear evento el {dayLabel}
      </button>
      {preview ? (
        <div
          aria-hidden="true"
          style={{
            top: `${(preview.start / DAY_MINUTES) * 100}%`,
            height: `${((preview.end - preview.start) / DAY_MINUTES) * 100}%`,
          }}
          className="pointer-events-none absolute inset-x-0.5 overflow-hidden rounded-md border border-dashed border-ink bg-paper px-1 text-xs text-ink"
        >
          <span className="block font-semibold">(Sin título)</span>
          <span className="block tabular-nums">
            {fromMinutes(preview.start)} – {fromMinutes(preview.end)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
