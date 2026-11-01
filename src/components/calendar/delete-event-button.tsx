"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import type { UndoToken } from "@/lib/calendar/undo";
import type { ConfirmState, Done, FormAction } from "@/lib/forms/form-state";

/**
 * "Borrar evento" of a single event: deletes at once, because the notice
 * offers "Deshacer" (spec 017 RF-25, RF-31, plan D17).
 */
export function DeleteEventButton({
  action,
  onDone,
}: {
  action: FormAction<ConfirmState>;
  onDone?: (done: Done, undo?: UndoToken) => void;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  // Effects run again each time Activity shows the route: handle each result once.
  const handled = useRef<ConfirmState | null>(null);
  useEffect(() => {
    if (!state.done || handled.current === state) return;
    handled.current = state;
    onDone?.(state.done, state.undo);
  }, [state, onDone]);

  return (
    <form action={formAction} className="contents">
      <Button
        type="submit"
        variant="danger"
        disabled={pending}
        // Supr in the detail presses it (spec 017 RF-55).
        data-delete-event=""
      >
        Borrar evento
      </Button>
      <FormAlert message={state.formError} />
    </form>
  );
}
