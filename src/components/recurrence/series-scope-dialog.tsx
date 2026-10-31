"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { Loss } from "@/lib/forms/form-state";
import { RECURRENCE_MESSAGES } from "@/lib/recurrence/error-messages";
import type { SeriesScope } from "@/lib/recurrence/series-write";

const SCOPES: { value: SeriesScope; label: string }[] = [
  { value: "this", label: "Solo este evento" },
  { value: "following", label: "Este y los siguientes" },
  { value: "all", label: "Todos los eventos" },
];

/** "Se perderán 2 cambios y 3 imágenes." (RF-19, RF-24b). */
export function lossText({ exceptions, images, comments = 0 }: Loss): string {
  const parts = [
    exceptions
      ? `${exceptions} ${exceptions === 1 ? "cambio" : "cambios"}`
      : "",
    images ? `${images} ${images === 1 ? "imagen" : "imágenes"}` : "",
    comments
      ? `${comments} ${comments === 1 ? "comentario" : "comentarios"}`
      : "",
  ].filter(Boolean);
  const plural = exceptions + images + comments > 1;
  const list =
    parts.length > 1
      ? `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}`
      : parts[0];
  return `Se ${plural ? "perderán" : "perderá"} ${list}.`;
}

/**
 * Which occurrences a change or a deletion reaches (RF-15, RF-20). It goes
 * inside the form: each button submits it with its `scope`, and the loss step
 * submits the same scope again with `confirmLoss` (RF-19, RF-24b).
 */
export function SeriesScopeDialog({
  open,
  verb,
  allowThis,
  limitReached,
  loss,
  scope,
  pending = false,
  onChoose,
  onCancel,
}: {
  open: boolean;
  verb: "save" | "delete";
  /** False when the calendar changed: an exception stays in its series' (D10). */
  allowThis: boolean;
  /** 100 changes already: no more single ones (RF-32). */
  limitReached: boolean;
  loss: Loss | null;
  /** The scope the losses belong to. */
  scope: SeriesScope | null;
  pending?: boolean;
  onChoose: (scope: SeriesScope) => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    // Closed in the cleanup too: Activity keeps hidden routes (spec 008 R6).
    return () => element.close();
  }, [open]);

  const title =
    verb === "save" ? "Guardar evento repetido" : "Borrar evento repetido";
  const confirmLabel =
    verb === "save" ? "Guardar igualmente" : "Borrar igualmente";

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl glass-float p-6 text-ink backdrop:bg-scrim/50"
    >
      <div className="flex flex-col gap-4">
        <h2 id={titleId} className="text-lg font-bold">
          {title}
        </h2>
        {loss && scope ? (
          <>
            <p>{lossText(loss)}</p>
            <input type="hidden" name="confirmLoss" value="1" />
            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="secondary" onClick={onCancel}>
                Cancelar
              </Button>
              <Button
                type="submit"
                name="scope"
                value={scope}
                variant={verb === "delete" ? "danger" : "primary"}
                disabled={pending}
              >
                {confirmLabel}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {SCOPES.filter((s) => allowThis || s.value !== "this").map(
                (option) => (
                  <Button
                    key={option.value}
                    type="submit"
                    name="scope"
                    value={option.value}
                    variant="secondary"
                    disabled={
                      pending || (option.value === "this" && limitReached)
                    }
                    onClick={() => onChoose(option.value)}
                  >
                    {option.label}
                  </Button>
                ),
              )}
            </div>
            {allowThis && limitReached ? (
              <p className="text-sm text-muted">
                {RECURRENCE_MESSAGES.exceptions}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={onCancel}>
                Cancelar
              </Button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
