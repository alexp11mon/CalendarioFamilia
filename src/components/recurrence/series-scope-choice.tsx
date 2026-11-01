"use client";

import { useState } from "react";
import type { Loss } from "@/lib/forms/form-state";
import type { SeriesScope } from "@/lib/recurrence/series-write";
import { SeriesScopeDialog } from "./series-scope-dialog";

export interface ScopeRequest {
  verb: "save" | "delete";
  /** What the chosen scope would lose, to confirm it (spec 013 RF-24b). */
  loss: Loss | null;
  scope: SeriesScope | null;
}

export type ScopeAnswer = { scope: SeriesScope; confirmLoss: boolean } | null;

/**
 * The scope dialog of spec 013 outside a form: dragging, the menu and the
 * keyboard ask which occurrences a change reaches (spec 017 plan D10).
 * Cancelling answers null.
 */
export function SeriesScopeChoice({
  request,
  onAnswer,
}: {
  request: ScopeRequest | null;
  onAnswer: (answer: ScopeAnswer) => void;
}) {
  const [chosen, setChosen] = useState<SeriesScope | null>(null);

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const scope = (submitter?.getAttribute("value") ??
          chosen) as SeriesScope | null;
        if (scope) onAnswer({ scope, confirmLoss: Boolean(request?.loss) });
      }}
    >
      <SeriesScopeDialog
        open={request !== null}
        verb={request?.verb ?? "save"}
        allowThis
        // The database refuses the 101st change with its own message (spec 013 RF-32).
        limitReached={false}
        loss={request?.loss ?? null}
        scope={request?.scope ?? null}
        onChoose={setChosen}
        onCancel={() => onAnswer(null)}
      />
    </form>
  );
}
