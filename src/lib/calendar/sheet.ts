// Where the detail sheet goes when the finger lets go (spec 017 RF-45,
// RF-46, plan bottom-sheet): far enough, or fast enough, moves one step.

export type SheetState = "half" | "full";

// Pixels of drag, or pixels per millisecond of a flick.
const DISTANCE = 60;
const SPEED = 0.5;

/** `dy` > 0 is down; `velocity` in px/ms, with the same sign. */
export function sheetAfterDrag(
  state: SheetState,
  dy: number,
  velocity: number,
): SheetState | "close" {
  const down = dy > DISTANCE || velocity > SPEED;
  const up = dy < -DISTANCE || velocity < -SPEED;
  if (down) return state === "full" ? "half" : "close";
  if (up) return "full";
  return state;
}
