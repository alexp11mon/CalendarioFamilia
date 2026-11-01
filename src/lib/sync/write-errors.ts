import type { FailureKind, ProviderName } from "./providers/types";

// Why a write to Google failed, in Spanish and never with Google's own text
// (RF-22 to RF-26, RF-30).

export type WriteFailure = "transient" | "revoked" | "rejected" | "gone";

export const WRITE_ERRORS: Record<WriteFailure, string> = {
  transient:
    "Google no responde. No se ha guardado el cambio; vuelve a intentarlo dentro de un momento.",
  revoked:
    "Google ya no deja a CaFam usar esta cuenta. Vuelve a conectarla para guardar cambios.",
  rejected: "Google no ha permitido el cambio, así que no se ha guardado.",
  gone: "Este evento se había borrado en Google y se ha quitado de CaFam.",
};

const ICLOUD_ERRORS: Record<WriteFailure, string> = {
  transient:
    "iCloud no responde. No se ha guardado el cambio; vuelve a intentarlo dentro de un momento.",
  revoked:
    "iCloud ya no acepta la contraseña de esta cuenta. Vuelve a conectarla con una contraseña específica de app nueva.",
  rejected: "iCloud no ha permitido el cambio, así que no se ha guardado.",
  gone: "Este evento se había borrado en iCloud y se ha quitado de CaFam.",
};

/** The text of the window's notice of an event deleted in its provider (spec 018 RF-48). */
export function goneText(done: "gone" | "goneIcloud"): string {
  return done === "goneIcloud" ? ICLOUD_ERRORS.gone : WRITE_ERRORS.gone;
}

/** The text of a failure, naming the provider (spec 018 RF-45 to RF-48, RF-51). */
export function writeErrorText(
  failure: WriteFailure,
  provider: ProviderName,
): string {
  return (provider === "icloud" ? ICLOUD_ERRORS : WRITE_ERRORS)[failure];
}

/** Anything unexpected counts as the provider not answering: the user can retry. */
// By name, not instanceof, so client screens can import the texts without the
// Google client.
export function writeFailureOf(error: unknown): WriteFailure {
  if (!(error instanceof Error) || error.name !== "ProviderError") {
    return "transient";
  }
  const kind = (error as Error & { kind: FailureKind }).kind;
  return kind === "missing" ? "gone" : kind;
}
