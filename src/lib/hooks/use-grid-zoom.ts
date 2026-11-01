"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type RefObject,
} from "react";
import {
  DEFAULT_HOUR_PX,
  clampHourPx,
  scrollForZoom,
  wheelZoom,
} from "@/lib/calendar/zoom";

// On this device only, as the spec asks (RF-53, plan D15).
const KEY = "cafam-hour-px";
const listeners = new Set<() => void>();
// The height while a pinch goes on, or when it could not be stored.
let live: number | null = null;

function read(): number {
  if (live !== null) return live;
  let stored = NaN;
  try {
    stored = Number(localStorage.getItem(KEY));
  } catch {
    // Blocked storage (private mode): the default height.
  }
  return stored ? clampHourPx(stored) : DEFAULT_HOUR_PX;
}

function write(px: number, save: boolean) {
  live = px;
  if (save) {
    try {
      localStorage.setItem(KEY, String(px));
      live = null;
    } catch {
      // Not remembered, still applied.
    }
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Pinching with two fingers or Ctrl + wheel over `container` changes the
 * height of an hour, keeping the hour under the gesture in place (spec 017
 * RF-49 to RF-53). The grid that scrolls is its `[data-grid-scroll]`.
 */
export function useGridZoom(container: RefObject<HTMLElement | null>): number {
  const hourPx = useSyncExternalStore(subscribe, read, () => DEFAULT_HOUR_PX);
  // The scroll to apply once the taller or shorter grid is drawn.
  const pending = useRef<number | null>(null);

  useLayoutEffect(() => {
    const scroller =
      container.current?.querySelector<HTMLElement>("[data-grid-scroll]");
    if (scroller && pending.current !== null) {
      scroller.scrollTop = pending.current;
    }
    pending.current = null;
  }, [hourPx, container]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const scroller = () =>
      element.querySelector<HTMLElement>("[data-grid-scroll]");

    const zoomTo = (to: number, clientY: number, save: boolean) => {
      const from = read();
      if (to === from) return;
      const box = scroller();
      if (box) {
        pending.current = scrollForZoom({
          scrollTop: box.scrollTop,
          anchor: clientY - box.getBoundingClientRect().top,
          from,
          to,
        });
      }
      write(to, save);
    };

    const onWheel = (wheel: WheelEvent) => {
      // The wheel alone scrolls; with Ctrl (or a trackpad pinch) it zooms the hours, not the page.
      if (!wheel.ctrlKey) return;
      wheel.preventDefault();
      zoomTo(wheelZoom(read(), wheel.deltaY), wheel.clientY, true);
    };

    const fingers = new Map<number, number>();
    let pinch: { distance: number; px: number } | null = null;
    const spread = () => {
      const [a, b] = [...fingers.values()];
      return Math.abs((a ?? 0) - (b ?? 0));
    };
    const middle = () => {
      const [a, b] = [...fingers.values()];
      return ((a ?? 0) + (b ?? 0)) / 2;
    };

    const onDown = (pointer: PointerEvent) => {
      if (pointer.pointerType !== "touch") return;
      fingers.set(pointer.pointerId, pointer.clientY);
      if (fingers.size === 2) pinch = { distance: spread(), px: read() };
    };
    const onMove = (pointer: PointerEvent) => {
      if (!fingers.has(pointer.pointerId)) return;
      fingers.set(pointer.pointerId, pointer.clientY);
      if (!pinch || fingers.size !== 2 || pinch.distance < 10) return;
      zoomTo(
        clampHourPx((pinch.px * spread()) / pinch.distance),
        middle(),
        false,
      );
    };
    const onUp = (pointer: PointerEvent) => {
      if (!fingers.delete(pointer.pointerId)) return;
      if (pinch && fingers.size < 2) {
        pinch = null;
        write(read(), true);
      }
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("pointerdown", onDown);
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerup", onUp);
    element.addEventListener("pointercancel", onUp);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerup", onUp);
      element.removeEventListener("pointercancel", onUp);
    };
  }, [container]);

  return hourPx;
}
