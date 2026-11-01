// Spanish messages of spec 013. Pure: the forms may show them too.

export const RECURRENCE_MESSAGES = {
  invalid: "Elige una repetición válida.",
  empty: "Con este final la serie no tiene ninguna repetición.",
  synced:
    "Los calendarios traídos de Google o iCloud no admiten repeticiones en CaFam.",
  series: "Este calendario ya tiene 500 series. Borra alguna para crear otra.",
  exceptions:
    "Esta serie ya tiene 100 cambios sueltos. Usa «Este y los siguientes».",
  calendarThis:
    "Para cambiar de calendario, elige «Todos los eventos» o «Este y los siguientes».",
  ruleThis:
    "Para cambiar la repetición, elige «Todos los eventos» o «Este y los siguientes».",
  gone: "Esta repetición ya no existe.",
  scope: "Elige a qué eventos se aplica.",
} as const;

/** The SQLSTATE of the series rules (enforce_series_rules), or null. */
export function recurrenceErrorMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === "CF429" && message === "series")
    return RECURRENCE_MESSAGES.series;
  if (code === "CF429" && message === "exceptions") {
    return RECURRENCE_MESSAGES.exceptions;
  }
  if (code === "CF404") return RECURRENCE_MESSAGES.gone;
  return null;
}
