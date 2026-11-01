"use client";

import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { CheckIcon } from "@/components/shell/icons";
import type { CalendarEventItem } from "@/lib/calendar/layout";
import { CALENDAR_COLORS } from "@/lib/calendar/palette";

export type MenuChoice =
  | { kind: "color"; color: string | null }
  | { kind: "duplicate" }
  | { kind: "delete" };

const MARGIN = 16;
const ITEM =
  "press flex min-h-11 w-full items-center gap-3 rounded-full px-4 text-left text-sm font-semibold hover:bg-stone focus-visible:outline-2 focus-visible:outline-ink";

/**
 * The event's own context menu (spec 017 RF-32 to RF-43, plan D12): the
 * pastel colors and the calendar's as radios with a check, then Duplicar and
 * Borrar. Arrows, Home, End, Enter, Escape and a click outside.
 */
export function EventMenu({
  event,
  at,
  calendarColor,
  onChoose,
  onClose,
}: {
  event: CalendarEventItem;
  /** The pointer, or the event's corner when opened with the keyboard. */
  at: { left: number; top: number };
  calendarColor: string | undefined;
  onChoose: (choice: MenuChoice) => void;
  /** `restoreFocus` is false when a click outside closed it. */
  onClose: (restoreFocus: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ownColor =
    event.color.toUpperCase() === calendarColor?.toUpperCase()
      ? null
      : event.color.toUpperCase();

  // Inside the screen, and the first item focused (ARIA menu pattern).
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const left = Math.min(
      at.left,
      window.innerWidth - MARGIN - menu.offsetWidth,
    );
    const top = Math.min(
      at.top,
      window.innerHeight - MARGIN - menu.offsetHeight,
    );
    menu.style.left = `${Math.max(MARGIN, left)}px`;
    menu.style.top = `${Math.max(MARGIN, top)}px`;
    items(menu)[0]?.focus();
  }, [at]);

  useEffect(() => {
    const outside = (pointer: PointerEvent) => {
      if (!ref.current?.contains(pointer.target as Node)) onClose(false);
    };
    window.addEventListener("pointerdown", outside, { capture: true });
    return () =>
      window.removeEventListener("pointerdown", outside, { capture: true });
  }, [onClose]);

  function onKeyDown(key: KeyboardEvent) {
    const list = items(ref.current!);
    const index = list.indexOf(document.activeElement as HTMLElement);
    const go = (next: number) => {
      key.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    if (key.key === "ArrowDown" || key.key === "ArrowRight") go(index + 1);
    else if (key.key === "ArrowUp" || key.key === "ArrowLeft") go(index - 1);
    else if (key.key === "Home") go(0);
    else if (key.key === "End") go(list.length - 1);
    else if (key.key === "Escape") {
      key.preventDefault();
      onClose(true);
    } else if (key.key === "Tab") onClose(false);
  }

  const choose = (choice: MenuChoice) => {
    onClose(true);
    onChoose(choice);
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={event.title}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      // Placed at the pointer; the layout effect keeps it on screen.
      style={{ left: at.left, top: at.top }}
      className="fixed z-50 flex w-max flex-col gap-1 rounded-3xl glass-float p-2 text-ink"
    >
      <div className="grid grid-cols-7 gap-1 p-1">
        {CALENDAR_COLORS.map((color) => {
          const checked = ownColor === color.value;
          return (
            <button
              key={color.value}
              type="button"
              role="menuitemradio"
              aria-checked={checked}
              aria-label={color.label}
              title={color.label}
              tabIndex={-1}
              onClick={() => choose({ kind: "color", color: color.value })}
              style={{ backgroundColor: color.value }}
              className="press flex size-9 items-center justify-center rounded-full text-pastel-ink ring-1 ring-pastel-ink/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {checked ? <CheckIcon /> : null}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={ownColor === null}
        tabIndex={-1}
        onClick={() => choose({ kind: "color", color: null })}
        className={ITEM}
      >
        <span
          aria-hidden="true"
          style={{ backgroundColor: calendarColor }}
          className="size-4 rounded-full ring-1 ring-pastel-ink/15"
        />
        <span className="flex-1">Color del calendario</span>
        {ownColor === null ? <CheckIcon /> : null}
      </button>
      <div role="separator" className="mx-3 h-px bg-line" />
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        onClick={() => choose({ kind: "duplicate" })}
        className={ITEM}
      >
        Duplicar
      </button>
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        onClick={() => choose({ kind: "delete" })}
        className={`${ITEM} text-danger`}
      >
        Borrar
      </button>
    </div>
  );
}

function items(menu: HTMLElement) {
  return [
    ...menu.querySelectorAll<HTMLElement>(
      '[role="menuitem"], [role="menuitemradio"]',
    ),
  ];
}
