"use client";

import { useEffect, useRef } from "react";
import type { Nudge } from "@/lib/calendar/drag";
import { isTyping } from "@/lib/calendar/shortcuts";
import { targetAt } from "./use-event-drag";

export type PasteTarget = { day: string; minute?: number };

const NUDGES: Record<string, Nudge> = {
  ArrowUp: "earlier",
  ArrowDown: "later",
  ArrowLeft: "previousDay",
  ArrowRight: "nextDay",
};

/** The day or slot under a press or a focus, to paste on (RF-58). */
function slotOf(element: Element, pointer?: { x: number; y: number }) {
  if (pointer) {
    const target = targetAt(pointer.x, pointer.y);
    if (target) {
      return target.kind === "grid"
        ? { day: target.day, minute: Math.round(target.minute / 15) * 15 }
        : { day: target.day };
    }
  }
  const day = element.closest<HTMLElement>(
    "[data-allday-day], [data-time-col][data-day], [data-testid=day-cell][data-date]",
  );
  if (!day) return null;
  return {
    day: day.dataset.alldayDay ?? day.dataset.day ?? day.dataset.date!,
  };
}

/**
 * Keys on the event focused in a view (spec 017 RF-55, RF-57 to RF-64, plan
 * event-keys): Alt + arrows, Supr/Retroceso and Ctrl/⌘+C on it, and Ctrl/⌘+V
 * anywhere on the calendar. Never while typing or with a window open (RF-63).
 */
export function useEventKeys(handlers: {
  /** The editable state of the focused event, or null if it is not one of the view. */
  find: (id: string) => { editable: boolean } | null;
  nudge: (id: string, direction: Nudge) => void;
  remove: (id: string) => void;
  copy: (id: string) => void;
  paste: (target: PasteTarget | null) => void;
}) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    let last: PasteTarget | null = null;

    const remember = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      const pointer =
        event.type === "pointerdown"
          ? {
              x: (event as PointerEvent).clientX,
              y: (event as PointerEvent).clientY,
            }
          : undefined;
      last = slotOf(event.target, pointer) ?? last;
    };

    const onKeyDown = (key: KeyboardEvent) => {
      if (key.defaultPrevented || isTyping(key.target)) return;
      if (document.querySelector("dialog[open]")) return;
      const command = key.ctrlKey || key.metaKey;
      const { find, nudge, remove, copy, paste } = latest.current;

      if (command && !key.altKey && key.key.toLowerCase() === "v") {
        key.preventDefault();
        paste(last);
        return;
      }
      const element =
        key.target instanceof Element
          ? key.target.closest<HTMLElement>("[data-event-id]")
          : null;
      const id = element?.dataset.eventId;
      const found = id ? find(id) : null;
      if (!id || !found) return;

      if (command && !key.altKey && key.key.toLowerCase() === "c") {
        // Selected text is copied as text, as anywhere else.
        if (window.getSelection()?.toString()) return;
        key.preventDefault();
        copy(id);
        return;
      }
      if (!found.editable || command) return;
      const direction = key.altKey ? NUDGES[key.key] : undefined;
      if (direction) {
        key.preventDefault();
        nudge(id, direction);
      } else if (
        !key.altKey &&
        (key.key === "Delete" || key.key === "Backspace")
      ) {
        key.preventDefault();
        remove(id);
      }
    };

    document.addEventListener("pointerdown", remember, { capture: true });
    document.addEventListener("focusin", remember);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", remember, { capture: true });
      document.removeEventListener("focusin", remember);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}
