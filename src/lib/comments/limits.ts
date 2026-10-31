// Limits of the comments (spec 014 RF-6, RF-9, RF-20, plan D2).
export const MAX_COMMENT_LENGTH = 1000;
/** The counter shows from here on. */
export const COMMENT_COUNTER_FROM = 900;
export const COMMENTS_PAGE = 50;
/** Under the 30 s of RF-20. */
export const COMMENTS_POLL_MS = 20_000;

/** "1.000": es-ES does not group four digits by default. */
export function formatCount(value: number): string {
  return new Intl.NumberFormat("es-ES", { useGrouping: "always" }).format(
    value,
  );
}
