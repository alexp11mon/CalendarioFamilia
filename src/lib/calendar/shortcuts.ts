import type { CalendarView } from "./ranges";

export type Shortcut = "new" | "today" | "previous" | "next" | CalendarView;

export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  target: EventTarget | null;
  /** A window (event, sheet, confirmation) is open: keys belong to it. */
  dialogOpen: boolean;
}

const KEYS: Record<string, Shortcut> = {
  n: "new",
  t: "today",
  arrowleft: "previous",
  arrowright: "next",
  a: "agenda",
  m: "month",
  s: "week",
  d: "day",
};

// Inputs where a letter is never text: the shortcuts keep working on them.
const NOT_TEXT = new Set(["checkbox", "radio", "button", "submit", "reset"]);

export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  if (target.getAttribute("contenteditable") === "true") return true;
  if (target.getAttribute("role") === "combobox") return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !NOT_TEXT.has(target.type);
}

/**
 * The calendar shortcut a key press means, or null: never with Ctrl, Alt or
 * Meta, while typing or with a window open (spec 008 RF-31, RF-46), and no N
 * for whoever cannot create events (RF-36).
 */
export function shortcutFor(
  press: KeyPress,
  canCreate: boolean,
): Shortcut | null {
  if (press.ctrlKey || press.altKey || press.metaKey) return null;
  if (press.dialogOpen || isTyping(press.target)) return null;
  const shortcut = KEYS[press.key.toLowerCase()] ?? null;
  return shortcut === "new" && !canCreate ? null : shortcut;
}
