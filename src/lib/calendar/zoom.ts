// The height of an hour in the week and day grid (spec 017 RF-49 to RF-52,
// plan grid-zoom, D15).

export const DEFAULT_HOUR_PX = 48;
// Half and three times the default (RF-51).
const MIN_HOUR_PX = DEFAULT_HOUR_PX / 2;
const MAX_HOUR_PX = DEFAULT_HOUR_PX * 3;

export function clampHourPx(px: number): number {
  return Math.round(Math.min(Math.max(px, MIN_HOUR_PX), MAX_HOUR_PX));
}

/**
 * The scroll that keeps what was `anchor` px below the top of the grid in
 * the same place on screen after the hours change from `from` to `to` (RF-52).
 */
export function scrollForZoom({
  scrollTop,
  anchor,
  from,
  to,
}: {
  scrollTop: number;
  anchor: number;
  from: number;
  to: number;
}): number {
  return Math.max(0, ((scrollTop + anchor) * to) / from - anchor);
}

/** Ctrl + wheel: up makes the hours taller, smoothly with any wheel (RF-50). */
export function wheelZoom(px: number, deltaY: number): number {
  return clampHourPx(px * Math.exp(-deltaY * 0.002));
}
