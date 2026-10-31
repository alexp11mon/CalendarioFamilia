import { CALENDAR_MESSAGES } from "@/lib/calendar/error-messages";
import { MAX_COMMENT_LENGTH } from "./limits";

// Messages of the comments (spec 014, plan "Contratos"). Usable in the
// browser: no server imports.
export const COMMENT_MESSAGES = {
  empty: "Escribe un comentario.",
  tooLong: `El comentario no puede pasar de ${MAX_COMMENT_LENGTH.toLocaleString("es-ES")} caracteres.`,
  length: `El comentario debe tener entre 1 y ${MAX_COMMENT_LENGTH.toLocaleString("es-ES")} caracteres.`,
  gone: "Este evento ya no existe.",
  commentGone: "Este comentario ya no existe.",
  noAccess: "Ya no tienes acceso a este calendario.",
  connection: CALENDAR_MESSAGES.connection,
} as const;

const MESSAGES_BY_CODE: Record<string, string> = {
  // RLS rejects a member who left (casos límite).
  "42501": COMMENT_MESSAGES.noAccess,
  // The event went away while writing.
  "23503": COMMENT_MESSAGES.gone,
  CF404: COMMENT_MESSAGES.gone,
  "23514": COMMENT_MESSAGES.length,
};

/** Unknown codes, network errors and non-objects map to the connection message. */
export function getCommentErrorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return COMMENT_MESSAGES.connection;
  }
  const { code } = error;
  if (typeof code === "string" && code in MESSAGES_BY_CODE) {
    return MESSAGES_BY_CODE[code];
  }
  return COMMENT_MESSAGES.connection;
}
