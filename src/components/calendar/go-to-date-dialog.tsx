"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isDate(value: string) {
  return DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/**
 * G: a date to take the current view to (spec 017 RF-56). Mounted only
 * while open: it opens on mount; Escape, Cancelar or going close it.
 */
export function GoToDateDialog({
  date,
  onGo,
  onClose,
}: {
  date: string;
  onGo: (date: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    element?.querySelector("input")?.focus();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl glass-float p-6 text-ink backdrop:bg-scrim/50"
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const value = String(
            new FormData(event.currentTarget).get("date") ?? "",
          );
          if (!isDate(value)) {
            setError("Escribe una fecha válida.");
            return;
          }
          onGo(value);
        }}
      >
        <h2 id={titleId} className="text-lg font-bold">
          Ir a una fecha
        </h2>
        <TextField
          label="Fecha"
          name="date"
          type="date"
          defaultValue={date}
          error={error}
        />
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={() => dialog.current?.close()}>
            Cancelar
          </Button>
          <Button type="submit">Ir</Button>
        </div>
      </form>
    </dialog>
  );
}
