// What a quick change sends and how it is undone (spec 017 RF-24 to RF-30,
// plan undo-core, D8, D9). The token only lives in the client for 10 s.
import { z } from "zod";
import { isPaletteColor } from "./palette";

export type Change =
  | { kind: "times"; startsAt: string; endsAt: string; allDay: boolean }
  /** null = the calendar's color (RF-37). */
  | { kind: "color"; color: string | null };

export type UndoToken =
  /** Write `before` again if the event is still as this change left it (RF-27, RF-29). */
  | {
      kind: "change";
      id: string;
      before: Change;
      updatedAt: string;
      series: boolean;
    }
  /** A deleted event, from its snapshot (RF-28). */
  | { kind: "restore"; trashId: string }
  /** A pasted copy: undoing deletes it (RF-58). */
  | { kind: "unpaste"; id: string };

const DAY_MS = 86_400_000;
const isMidnight = (value: string) => Date.parse(value) % DAY_MS === 0;

export const changeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("times"),
      startsAt: z.iso.datetime({ offset: true }),
      endsAt: z.iso.datetime({ offset: true }),
      allDay: z.boolean(),
    })
    .refine((times) => Date.parse(times.endsAt) >= Date.parse(times.startsAt))
    // All-day events run from 00:00 UTC to 00:00 UTC (spec 002 plan D6).
    .refine(
      (times) =>
        !times.allDay ||
        (isMidnight(times.startsAt) && isMidnight(times.endsAt)),
    ),
  z.object({
    kind: z.literal("color"),
    color: z
      .string()
      .refine(isPaletteColor)
      .transform((value) => value.toUpperCase())
      .nullable(),
  }),
]);

export const undoTokenSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("change"),
    id: z.string(),
    before: changeSchema,
    updatedAt: z.string(),
    series: z.boolean(),
  }),
  z.object({ kind: z.literal("restore"), trashId: z.uuid() }),
  z.object({ kind: z.literal("unpaste"), id: z.uuid() }),
]);

/** The notices of RF-24, RF-25, RF-57 and RF-58. */
export const UNDO_NOTICES = {
  moved: "Evento movido",
  resized: "Duración cambiada",
  color: "Color cambiado",
  deleted: "Evento borrado",
  copied: "Evento copiado",
  pasted: "Evento pegado",
  undone: "Deshecho",
} as const;

export const UNDO_ERRORS = {
  changed: "Este evento ha cambiado entretanto; no se ha deshecho.",
  expired: "Ya no se puede deshacer.",
} as const;
