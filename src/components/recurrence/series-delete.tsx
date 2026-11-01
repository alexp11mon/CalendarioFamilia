"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import type { UndoToken } from "@/lib/calendar/undo";
import type { ConfirmState, Done, FormAction } from "@/lib/forms/form-state";
import type { SeriesScope } from "@/lib/recurrence/series-write";
import { SeriesScopeDialog } from "./series-scope-dialog";

/** "Borrar evento" of an occurrence: asks the scope first (spec 013 RF-20, RF-24b). */
export function SeriesDelete({
  action,
  limitReached,
  onDone,
}: {
  action: FormAction<ConfirmState>;
  limitReached: boolean;
  onDone?: (done: Done, undo?: UndoToken) => void;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [asking, setAsking] = useState(false);
  const [scope, setScope] = useState<SeriesScope | null>(null);
  const [dismissed, setDismissed] = useState<ConfirmState | null>(null);
  // Losses keep the dialog open to confirm; any other answer closes it.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    setAsking(Boolean(state.loss));
  }

  // Effects run again each time Activity shows the route: handle each result once.
  const handled = useRef<ConfirmState | null>(null);
  useEffect(() => {
    if (!state.done || handled.current === state) return;
    handled.current = state;
    onDone?.(state.done, state.undo);
  }, [state, onDone]);

  return (
    <>
      <Button
        variant="danger"
        onClick={() => setAsking(true)}
        aria-haspopup="dialog"
      >
        Borrar evento
      </Button>
      <form action={formAction} className="contents">
        <SeriesScopeDialog
          open={asking}
          verb="delete"
          allowThis
          limitReached={limitReached}
          loss={dismissed === state ? null : (state.loss ?? null)}
          scope={scope}
          pending={pending}
          onChoose={setScope}
          onCancel={() => {
            setAsking(false);
            setDismissed(state);
          }}
        />
      </form>
      <FormAlert message={state.formError} />
    </>
  );
}
