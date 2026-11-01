import { z } from "zod";
import {
  isAppPassword,
  normalizeAppleId,
  normalizeAppPassword,
} from "./icloud-credentials";
import { MAX_CALENDARS_PER_ACCOUNT } from "./limits";

// Validation of the connection actions (spec 007; RF-9, RF-11, RF-14, RF-27).

export const connectionIdSchema = z.uuid();

/** One checked calendar, as the picker sends it. The color comes from Google. */
const pickedCalendar = z.object({
  id: z.string().min(1).max(1024),
  name: z.string().max(200),
  color: z.string().nullable(),
  access: z.enum(["owner", "writer", "reader"]).nullable().optional(),
});

export const selectionSchema = z.object({
  connectionId: connectionIdSchema,
  calendars: z
    .array(pickedCalendar)
    .max(
      MAX_CALENDARS_PER_ACCOUNT,
      `Puedes traer como máximo ${MAX_CALENDARS_PER_ACCOUNT} calendarios por cuenta.`,
    ),
  decision: z.enum(["keep", "delete"]).optional(),
});

/** Connecting iCloud: Apple ID and app-specific password (spec 018 RF-5 to RF-7). */
export const icloudConnectSchema = z.object({
  appleId: z
    .string()
    .transform(normalizeAppleId)
    .pipe(
      z.email("Escribe tu Apple ID, el correo con el que entras en iCloud."),
    ),
  password: z
    .string()
    .transform(normalizeAppPassword)
    .refine(
      isAppPassword,
      "Escribe la contraseña específica de app que creaste en account.apple.com: 16 letras, como abcd-efgh-ijkl-mnop.",
    ),
});
