"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const DURATION_MS = 4000;
// "Deshacer" stays this long (spec 017 RF-26).
const UNDO_MS = 10_000;
// The last part of it fades the notice out (spec 011 RF-20, plan overlay-motion).
const LEAVING_MS = 200;
const UNDONE = "Deshecho";

export interface ToastOptions {
  /** Undoes the action; resolves to null when undone or to why it could not be. */
  undo?: () => Promise<string | null>;
}

type Show = (text: string, options?: ToastOptions) => void;

const ToastContext = createContext<{ show: Show }>({ show: () => {} });

/** Shows a short notice from anywhere inside the app frame (spec 008 RF-32, plan D8). */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  // A new id restarts the countdown even when the text repeats. A new notice
  // replaces the last one and its "Deshacer": only the last action (RF-30).
  const [toast, setToast] = useState<{
    id: number;
    text: string;
    undo?: ToastOptions["undo"];
    leaving?: boolean;
  } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const show = useCallback<Show>(
    (text, options) => setToast({ id: Date.now(), text, undo: options?.undo }),
    [],
  );
  const id = toast?.id;
  const duration = toast?.undo ? UNDO_MS : DURATION_MS;
  const value = useMemo(() => ({ show }), [show]);

  useEffect(() => {
    if (id === undefined) return;
    const leave = setTimeout(
      () => setToast((current) => current && { ...current, leaving: true }),
      duration - LEAVING_MS,
    );
    const remove = setTimeout(() => setToast(null), duration);
    return () => {
      clearTimeout(leave);
      clearTimeout(remove);
    };
  }, [id, duration]);

  async function runUndo(undo: NonNullable<ToastOptions["undo"]>) {
    setUndoing(true);
    try {
      show((await undo()) ?? UNDONE);
    } finally {
      setUndoing(false);
    }
  }

  return (
    <ToastContext value={value}>
      {children}
      {/* Always in the DOM so screen readers hear every new message. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-28 z-50 flex justify-center lg:bottom-6"
      >
        {toast ? (
          <p
            key={toast.id}
            data-toast=""
            data-leaving={toast.leaving ? "" : undefined}
            className={`flex items-center gap-3 rounded-full glass-float text-sm font-semibold text-ink ${toast.undo ? "py-1 pr-1 pl-5" : "px-5 py-3"}`}
          >
            {toast.text}
            {toast.undo ? (
              <button
                type="button"
                disabled={undoing}
                onClick={() => runUndo(toast.undo!)}
                className="press pointer-events-auto min-h-11 rounded-full px-4 font-semibold text-accent-ink hover:bg-stone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
              >
                Deshacer
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
    </ToastContext>
  );
}
