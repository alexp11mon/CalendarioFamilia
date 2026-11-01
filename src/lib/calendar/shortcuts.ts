import type { CalendarView } from "./ranges";

export type Shortcut =
  "new" | "today" | "previous" | "next" | "goto" | "help" | CalendarView;

export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  target: EventTarget | null;
  /** A window (event, sheet, confirmation) is open: keys belong to it. */
  dialogOpen: boolean;
}

/**
 * Every shortcut, as the help lists it (spec 017 RF-62, plan D16). The ones
 * with `press` are the calendar's and are detected from here; the rest work
 * on a focused event or in its detail (use-event-keys, EventPanel).
 */
export const SHORTCUTS: readonly {
  keys: string;
  description: string;
  press?: readonly string[];
  shortcut?: Shortcut;
}[] = [
  { keys: "N", description: "Nuevo evento", press: ["n"], shortcut: "new" },
  { keys: "T", description: "Ir a hoy", press: ["t"], shortcut: "today" },
  {
    keys: "←",
    description: "Periodo anterior",
    press: ["arrowleft"],
    shortcut: "previous",
  },
  {
    keys: "→",
    description: "Periodo siguiente",
    press: ["arrowright"],
    shortcut: "next",
  },
  { keys: "A", description: "Vista agenda", press: ["a"], shortcut: "agenda" },
  { keys: "M", description: "Vista mes", press: ["m"], shortcut: "month" },
  { keys: "S", description: "Vista semana", press: ["s"], shortcut: "week" },
  { keys: "D", description: "Vista día", press: ["d"], shortcut: "day" },
  {
    keys: "G",
    description: "Ir a una fecha",
    press: ["g"],
    shortcut: "goto",
  },
  {
    keys: "?",
    description: "Ver los atajos",
    press: ["?"],
    shortcut: "help",
  },
  { keys: "Alt + ↑ ↓", description: "Mover el evento 15 minutos" },
  { keys: "Alt + ← →", description: "Mover el evento un día" },
  { keys: "Supr", description: "Borrar el evento" },
  { keys: "Ctrl + C", description: "Copiar el evento" },
  { keys: "Ctrl + V", description: "Pegar el evento copiado" },
  { keys: "Menú o Mayús + F10", description: "Abrir el menú del evento" },
  { keys: "E", description: "Editar el evento con su detalle abierto" },
];

const KEYS: Record<string, Shortcut> = Object.fromEntries(
  SHORTCUTS.flatMap(({ press, shortcut }) =>
    shortcut ? (press ?? []).map((key) => [key, shortcut]) : [],
  ),
);

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
