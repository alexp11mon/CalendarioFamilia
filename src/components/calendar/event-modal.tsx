"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CloseIcon, ExpandIcon } from "@/components/shell/icons";
import { Button } from "@/components/ui/button";
import { sheetAfterDrag, type SheetState } from "@/lib/calendar/sheet";
import type { UndoToken } from "@/lib/calendar/undo";
import { useIsPhone } from "@/lib/hooks/use-is-phone";
import type { Done } from "@/lib/forms/form-state";
import { goneText } from "@/lib/sync/write-errors";
import { useUndoToast } from "./use-undo-toast";

const ICON_BUTTON =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-stone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export const DONE_MESSAGES: Record<Done, string> = {
  created: "Evento creado",
  updated: "Cambios guardados",
  deleted: "Evento borrado",
  gone: goneText("gone"),
  goneIcloud: goneText("goneIcloud"),
};

interface EventModalApi {
  /** A form inside has unsaved changes: closing asks first (RF-7). */
  setDirty: (dirty: boolean) => void;
  /** Close as the user asked, with the unsaved-changes check. */
  requestClose: () => void;
  /** A save or delete succeeded: close, refresh the calendar and say so (RF-8, RF-32), with "Deshacer" after a deletion (spec 017 RF-25). */
  finish: (done: Done, undo?: UndoToken) => void;
  /** The sheet fills the screen, e.g. to edit (spec 017 RF-47); nothing elsewhere. */
  expand: () => void;
}

const EventModalContext = createContext<EventModalApi | null>(null);

/** The window around a form, or null on a full page. */
export function useEventModal() {
  return useContext(EventModalContext);
}

/**
 * Window of an intercepted event route over the calendar (spec 008 RF-4..RF-8,
 * RF-12, RF-29, plan D1). Native modal <dialog>: focus trap and dimmed backdrop
 * come for free. Closing goes back in history, which unmounts the route.
 */
export function EventModal({
  title,
  variant = "window",
  children,
}: {
  title: string;
  /** The detail: on a phone, a sheet from the bottom (spec 017 RF-44 to RF-48). */
  variant?: "window" | "sheet";
  children: ReactNode;
}) {
  const router = useRouter();
  const show = useUndoToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [fullscreen, setFullscreen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const dirty = useRef(false);
  // Changes on every closing, so the next opening mounts the content afresh.
  const [opening, setOpening] = useState(0);
  const phone = useIsPhone();
  const [sheetState, setSheetState] = useState<SheetState>("half");
  const sheet = variant === "sheet" && phone ? sheetState : null;
  // The finger on the handle: where and when it started (plan bottom-sheet).
  const grab = useRef<{ y: number; time: number } | null>(null);
  // A drag of the handle is not a press: the click after it is ignored.
  const dragged = useRef(false);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    // Whatever had the focus opened the window: it gets it back on close (RF-6).
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const element = dialog.current;
    element?.showModal();
    // showModal focuses the first button; a form can ask for its title instead (RF-28).
    element?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      // Next keeps a left route hidden in the DOM (Activity): a modal <dialog> left
      // open there would keep the page behind it inert.
      element?.close();
      opener?.focus();
      // Next shows this same hidden instance when the URL is opened again: drop
      // its old state (an edit form, a typed title) so it opens afresh.
      dirty.current = false;
      setConfirming(false);
      setSheetState("half");
      setOpening((count) => count + 1);
    };
  }, []);

  const requestClose = useCallback(() => {
    if (dirty.current) setConfirming(true);
    else router.back();
  }, [router]);

  const api = useMemo<EventModalApi>(
    () => ({
      setDirty: (value) => {
        dirty.current = value;
      },
      requestClose,
      expand: () => setSheetState("full"),
      finish: (done, undo) => {
        dirty.current = false;
        show(DONE_MESSAGES[done], undo);
        router.back();
        // The router cache may still hold the calendar without the change (plan R2).
        router.refresh();
      },
    }),
    [requestClose, router, show],
  );

  const endDrag = (clientY: number) => {
    const start = grab.current;
    grab.current = null;
    setOffset(0);
    if (!start || !sheet) return;
    const dy = clientY - start.y;
    dragged.current = Math.abs(dy) > 8;
    const next = sheetAfterDrag(
      sheet,
      dy,
      dy / Math.max(1, performance.now() - start.time),
    );
    if (next === "close") requestClose();
    else setSheetState(next);
  };

  const windowClasses = `max-[48.0625rem]:m-0 max-[48.0625rem]:h-full max-[48.0625rem]:max-h-none max-[48.0625rem]:w-full max-[48.0625rem]:max-w-none max-[48.0625rem]:rounded-none ${fullscreen ? "m-0 h-full max-h-none w-full max-w-none rounded-none" : "m-auto max-h-[calc(100dvh-4rem)] w-[calc(100%-2rem)] max-w-2xl rounded-3xl"}`;
  // Anchored at the bottom, the calendar still visible above at half (RF-44).
  const sheetClasses = `mx-0 mt-auto mb-0 w-full max-w-none max-h-none rounded-t-3xl backdrop:bg-scrim/20 transition-[height] duration-(--motion-base) ${sheet === "full" ? "h-dvh rounded-t-none" : "h-[55dvh]"}`;

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      data-fullscreen={fullscreen}
      data-sheet={sheet ?? undefined}
      style={offset ? { translate: `0 ${Math.max(offset, -40)}px` } : undefined}
      // A press on the backdrop reaches the dialog itself: it closes the sheet (RF-46).
      onClick={(event) => {
        if (sheet && event.target === event.currentTarget) requestClose();
      }}
      onCancel={(event) => {
        // Escape: leave through history like "Cerrar", not by closing the element.
        event.preventDefault();
        if (confirming) setConfirming(false);
        else requestClose();
      }}
      // Up to 768 px the window is always full screen (RF-29), the detail a sheet.
      className={`flex-col overflow-hidden glass-float p-0 text-ink backdrop:bg-scrim/40 open:flex ${sheet ? sheetClasses : windowClasses}`}
    >
      {sheet ? (
        // The handle: drag it up to fill the screen, down to close (RF-45, RF-46).
        <button
          type="button"
          aria-label={sheet === "half" ? "Ampliar" : "Reducir"}
          onClick={() => {
            if (dragged.current) dragged.current = false;
            else setSheetState(sheet === "half" ? "full" : "half");
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            grab.current = { y: event.clientY, time: performance.now() };
          }}
          onPointerMove={(event) => {
            if (grab.current) setOffset(event.clientY - grab.current.y);
          }}
          onPointerUp={(event) => endDrag(event.clientY)}
          onPointerCancel={() => {
            grab.current = null;
            setOffset(0);
          }}
          className="flex h-6 w-full shrink-0 touch-none items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
        >
          <span
            aria-hidden="true"
            className="h-1 w-10 rounded-full bg-control"
          />
        </button>
      ) : null}
      <header className="flex items-center gap-2 border-b border-line px-4 py-2 sm:px-6">
        <h2
          id={titleId}
          className="min-w-0 flex-1 truncate text-lg font-bold text-ink"
        >
          {title}
        </h2>
        <button
          type="button"
          aria-pressed={fullscreen}
          aria-label="Pantalla completa"
          onClick={() => setFullscreen((value) => !value)}
          className={`${ICON_BUTTON} max-[48.0625rem]:hidden`}
        >
          <ExpandIcon expanded={fullscreen} />
        </button>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={requestClose}
          className={ICON_BUTTON}
        >
          <CloseIcon />
        </button>
      </header>
      {confirming ? (
        <div
          role="alertdialog"
          aria-labelledby={`${titleId}-discard`}
          className="flex flex-wrap items-center gap-3 border-b border-line bg-stone px-4 py-3 sm:px-6"
        >
          <p id={`${titleId}-discard`} className="flex-1 font-semibold">
            ¿Descartar los cambios?
          </p>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Seguir editando
          </Button>
          <Button variant="danger" onClick={() => router.back()}>
            Descartar cambios
          </Button>
        </div>
      ) : null}
      <div
        className={`flex-1 overflow-y-auto px-4 py-5 sm:px-6 ${fullscreen ? "mx-auto w-full max-w-2xl" : ""}`}
      >
        <EventModalContext value={api}>
          <Fragment key={opening}>{children}</Fragment>
        </EventModalContext>
      </div>
    </dialog>
  );
}
