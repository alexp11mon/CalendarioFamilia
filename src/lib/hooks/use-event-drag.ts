"use client";

import { useEffect, useState, type PointerEvent } from "react";
import {
  minuteDelta,
  moveAllDay,
  moveInMonth,
  moveTimed,
  resizeEnd,
  sameTimes,
  toAllDay,
  toTimed,
  type Times,
} from "@/lib/calendar/drag";
import type { CalendarEventItem } from "@/lib/calendar/layout";
import { daysBetween } from "@/lib/calendar/ranges";

// The gesture of moving and resizing events (spec 017 RF-5 to RF-23, plan
// drag-hook, D1 to D4). It lives with the calendar, not in the block: the
// block is drawn again in another column while it moves, so the listeners go
// on `window` and the session in a ref.

/** Grid of hours, all-day strip, or month. */
export type DragMode = "grid" | "strip" | "month";

export type DragTarget =
  | { kind: "grid"; day: string; minute: number }
  | { kind: "allday"; day: string }
  | { kind: "month"; day: string };

// Below this many pixels a mouse press is still a click (as SlotLayer).
const MOUSE_THRESHOLD = 4;
// A finger has to stay this long, and this still, to lift an event (RF-6, RF-22).
export const LONG_PRESS_MS = 500;
const TOUCH_SLOP = 8;
// Near the top or bottom of the grid it scrolls by itself (RF-9).
const EDGE_PX = 48;
const SCROLL_STEP = 10;
const DAY_MINUTES = 24 * 60;

/** What is under the pointer: a column of hours, a day of the strip or of the month (plan D3). */
export function targetAt(x: number, y: number): DragTarget | null {
  for (const element of document.elementsFromPoint(x, y)) {
    if (!(element instanceof HTMLElement)) continue;
    if (element.dataset.timeCol !== undefined && element.dataset.day) {
      const rect = element.getBoundingClientRect();
      const minute = Math.min(
        Math.max(((y - rect.top) / rect.height) * DAY_MINUTES, 0),
        DAY_MINUTES,
      );
      return { kind: "grid", day: element.dataset.day, minute };
    }
    if (element.dataset.alldayDay) {
      return { kind: "allday", day: element.dataset.alldayDay };
    }
    if (element.dataset.date && element.dataset.testid === "day-cell") {
      return { kind: "month", day: element.dataset.date };
    }
  }
  return null;
}

/** Where the event lands for a target, or null when nothing changes or it cannot go there. */
export function resultFor(
  event: Times,
  mode: DragMode,
  resize: boolean,
  grab: DragTarget | null,
  target: DragTarget | null,
  timeZone: string,
): Times | null {
  if (!target) return null;
  if (mode === "month") {
    return target.kind === "month"
      ? moveInMonth(event, target.day, timeZone)
      : null;
  }
  if (target.kind === "month") return null;
  if (resize) {
    return target.kind === "grid"
      ? resizeEnd(event, target.minute, timeZone)
      : null;
  }
  if (target.kind === "allday") {
    // A timed event dropped on the strip turns all day (RF-13, RF-15).
    if (!event.allDay) return toAllDay(event, target.day);
    if (!grab) return null;
    return moveAllDay(event, daysBetween(grab.day, target.day));
  }
  if (event.allDay) return toTimed(event, target.day, target.minute, timeZone);
  if (!grab) return null;
  return moveTimed(
    event,
    {
      days: daysBetween(grab.day, target.day),
      minutes:
        grab.kind === "grid" ? minuteDelta(grab.minute, target.minute) : 0,
    },
    timeZone,
  );
}

interface Session {
  event: CalendarEventItem;
  mode: DragMode;
  resize: boolean;
  pointerId: number;
  touch: boolean;
  startX: number;
  startY: number;
  x: number;
  y: number;
  grab: DragTarget | null;
  active: boolean;
  result: Times | null;
  scroller: HTMLElement | null;
  timer: ReturnType<typeof setTimeout> | null;
  frame: number | null;
}

export interface DragCallbacks {
  timeZone: string;
  /** The event drawn at its new place while it moves, or back (null). */
  preview: (event: CalendarEventItem, times: Times | null) => void;
  /** It was dropped somewhere new (RF-18). */
  drop: (event: CalendarEventItem, times: Times, resized: boolean) => void;
  setDragging: (event: CalendarEventItem | null) => void;
}

/** Swallows the click that follows a drag, so the event does not open (plan R8). */
function swallowNextClick() {
  const swallow = (click: MouseEvent) => {
    click.preventDefault();
    click.stopPropagation();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  // A drop outside any element gets no click: forget it soon.
  setTimeout(
    () => window.removeEventListener("click", swallow, { capture: true }),
    400,
  );
}

const preventScroll = (event: TouchEvent) => event.preventDefault();

/** One controller per calendar, created once: its listeners never change. */
function createController(callbacks: DragCallbacks) {
  let session: Session | null = null;
  const latest = { current: callbacks };

  function update() {
    const current = session;
    if (!current?.active) return;
    const result = resultFor(
      current.event,
      current.mode,
      current.resize,
      current.grab,
      targetAt(current.x, current.y),
      latest.current.timeZone,
    );
    const same =
      result === current.result ||
      (result !== null &&
        current.result !== null &&
        sameTimes(result, current.result));
    if (same) return;
    current.result = result;
    latest.current.preview(current.event, result);
  }

  function end(outcome: "drop" | "cancel") {
    const current = session;
    if (!current) return;
    session = null;
    if (current.timer) clearTimeout(current.timer);
    if (current.frame !== null) cancelAnimationFrame(current.frame);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("touchmove", preventScroll);
    if (!current.active) return;
    swallowNextClick();
    latest.current.setDragging(null);
    // Dropped where it was, or outside the view: nothing is saved (RF-19, cases).
    if (outcome === "drop" && current.result) {
      latest.current.drop(current.event, current.result, current.resize);
    } else {
      latest.current.preview(current.event, null);
    }
  }

  // Scrolls the grid while the pointer stays near its edges (RF-9).
  function scrollLoop() {
    const current = session;
    if (!current?.active || !current.scroller) return;
    const rect = current.scroller.getBoundingClientRect();
    const step =
      current.y < rect.top + EDGE_PX
        ? -SCROLL_STEP
        : current.y > rect.bottom - EDGE_PX
          ? SCROLL_STEP
          : 0;
    if (step) {
      current.scroller.scrollTop += step;
      update();
    }
    current.frame = requestAnimationFrame(scrollLoop);
  }

  function activate() {
    const current = session;
    if (!current) return;
    current.active = true;
    current.timer = null;
    if (current.touch) {
      // Lifted: from now on the finger moves the event, not the page (plan D4).
      window.addEventListener("touchmove", preventScroll, { passive: false });
    }
    latest.current.setDragging(current.event);
    current.frame = requestAnimationFrame(scrollLoop);
    update();
  }

  function onMove(event: globalThis.PointerEvent) {
    const current = session;
    if (!current || event.pointerId !== current.pointerId) return;
    current.x = event.clientX;
    current.y = event.clientY;
    const moved = Math.hypot(
      event.clientX - current.startX,
      event.clientY - current.startY,
    );
    if (!current.active) {
      // A finger that moves before 500 ms scrolls or swipes (RF-22).
      if (current.touch) {
        if (moved > TOUCH_SLOP) end("cancel");
        return;
      }
      if (moved >= MOUSE_THRESHOLD) activate();
      return;
    }
    update();
  }

  function onUp(event: globalThis.PointerEvent) {
    const current = session;
    if (!current || event.pointerId !== current.pointerId) return;
    // Where it is released, not where it last moved.
    current.x = event.clientX;
    current.y = event.clientY;
    update();
    end("drop");
  }

  function onCancel(event: globalThis.PointerEvent) {
    if (event.pointerId === session?.pointerId) end("cancel");
  }

  function onKey(event: KeyboardEvent) {
    // Escape drops a mouse drag where it started (RF-20).
    if (event.key === "Escape" && session?.active) end("cancel");
  }

  function start(
    event: CalendarEventItem,
    pointer: PointerEvent,
    options: { mode: DragMode; resize?: boolean },
  ) {
    if (pointer.button !== 0 || session) return;
    const touch = pointer.pointerType === "touch";
    // A mouse press would select text or start the link's own drag.
    if (!touch) pointer.preventDefault();
    session = {
      event,
      mode: options.mode,
      resize: Boolean(options.resize),
      pointerId: pointer.pointerId,
      touch,
      startX: pointer.clientX,
      startY: pointer.clientY,
      x: pointer.clientX,
      y: pointer.clientY,
      grab: targetAt(pointer.clientX, pointer.clientY),
      active: false,
      result: null,
      scroller: (pointer.currentTarget as HTMLElement).closest<HTMLElement>(
        "[data-grid-scroll]",
      ),
      timer: touch ? setTimeout(activate, LONG_PRESS_MS) : null,
      frame: null,
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
  }

  return {
    start,
    cancel: () => end("cancel"),
    setCallbacks: (next: DragCallbacks) => {
      latest.current = next;
    },
  };
}

export function useEventDrag(callbacks: DragCallbacks) {
  const [controller] = useState(() => createController(callbacks));
  useEffect(() => controller.setCallbacks(callbacks));
  // Leaving the calendar (or Activity hiding it) ends any gesture (plan R3).
  useEffect(() => () => controller.cancel(), [controller]);
  return controller;
}
