"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { SHORTCUTS } from "@/lib/calendar/shortcuts";

/** ?: every shortcut, read from the same table as the keys (spec 017 RF-62, plan D16). */
export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl glass-float p-6 text-ink backdrop:bg-scrim/50"
    >
      <h2 id={titleId} className="text-lg font-bold">
        Atajos de teclado
      </h2>
      <dl className="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.keys} className="contents">
            <dt className="justify-self-start rounded-md bg-stone px-2 py-0.5 font-semibold tabular-nums">
              {shortcut.keys}
            </dt>
            <dd>{shortcut.description}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex justify-end">
        <Button variant="secondary" onClick={() => dialog.current?.close()}>
          Cerrar
        </Button>
      </div>
    </dialog>
  );
}
