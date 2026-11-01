"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  deleteForUndo,
  quickChange,
} from "@/app/dashboard/events/quick-actions";
import type {
  QuickResult,
  ScopeOptions,
} from "@/app/dashboard/events/quick-writes";
import {
  SeriesScopeChoice,
  type ScopeAnswer,
  type ScopeRequest,
} from "@/components/recurrence/series-scope-choice";
import { useToast } from "@/components/ui/toast";
import { describeTimes, type Times } from "@/lib/calendar/drag";
import type { CalendarEventItem } from "@/lib/calendar/layout";
import { DEFAULT_CALENDAR_COLOR } from "@/lib/calendar/palette";
import { UNDO_NOTICES, type Change } from "@/lib/calendar/undo";
import { useEventDrag, type DragMode } from "@/lib/hooks/use-event-drag";
import { useUndoToast } from "./use-undo-toast";

export type ChangeNotice = "moved" | "resized" | "color";

export interface EventInteractionsApi {
  timeZone: string;
  /** Owner or editor of its calendar, and Google lets it write (RF-1, RF-2). */
  canEdit: (event: CalendarEventItem) => boolean;
  /** A drag is on: no swiping and no quick window (RF-21). */
  dragging: boolean;
  setDragging: (value: boolean) => void;
  /** The event being dragged, drawn lifted (RF-8). */
  draggingId: string | null;
  /** Left lifted by a finger: shows its end handle until a tap elsewhere (RF-11). */
  liftedId: string | null;
  /** Presses an event: a drag starts once it moves (RF-5, RF-10). */
  startDrag: (
    event: CalendarEventItem,
    pointer: PointerEvent,
    options: { mode: DragMode; resize?: boolean; lifted?: boolean },
  ) => void;
  change: (
    event: CalendarEventItem,
    change: Change,
    notice: ChangeNotice,
  ) => Promise<void>;
  remove: (event: CalendarEventItem) => Promise<void>;
}

const EventInteractionsContext = createContext<EventInteractionsApi | null>(
  null,
);

/** The interactions of the calendar's events, or null outside the calendar. */
export function useEventInteractions() {
  return useContext(EventInteractionsContext);
}

export const EventInteractionsProvider = EventInteractionsContext;

type Override = { change: Change | "deleted"; pending: boolean };

function applyOverride<T extends CalendarEventItem>(
  event: T,
  change: Change,
  calendarColor: string | undefined,
): T {
  if (change.kind === "times") {
    const { startsAt, endsAt, allDay } = change;
    return { ...event, startsAt, endsAt, allDay };
  }
  return {
    ...event,
    color: change.color ?? calendarColor ?? DEFAULT_CALENDAR_COLOR,
  };
}

/**
 * Changes made without the form (spec 017 plan workspace-interactions): the
 * event moves at once, the action saves it and, if it fails, it goes back
 * with the reason (RF-4, RF-18). An occurrence asks its scope first (D10).
 */
export function useEventInteractionsState<T extends CalendarEventItem>({
  events,
  editableCalendarIds,
  calendarColors,
  timeZone,
}: {
  events: T[];
  editableCalendarIds: ReadonlySet<string>;
  calendarColors: ReadonlyMap<string, string>;
  timeZone: string;
}): { api: EventInteractionsApi; events: T[]; dialog: ReactNode } {
  const router = useRouter();
  const { show } = useToast();
  const showUndo = useUndoToast();
  const [dragging, setDragging] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [liftedId, setLiftedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; times: Times } | null>(
    null,
  );
  const [overrides, setOverrides] = useState<ReadonlyMap<string, Override>>(
    () => new Map(),
  );
  const [scopeRequest, setScopeRequest] = useState<ScopeRequest | null>(null);
  const answer = useRef<((value: ScopeAnswer) => void) | null>(null);

  // Fresh server data replaces the changes already saved (plan R4).
  const [seen, setSeen] = useState(events);
  if (seen !== events) {
    setSeen(events);
    setOverrides(
      (current) =>
        new Map([...current].filter(([, override]) => override.pending)),
    );
  }

  const setOverride = useCallback((id: string, override: Override | null) => {
    setOverrides((current) => {
      const next = new Map(current);
      if (override) next.set(id, override);
      else next.delete(id);
      return next;
    });
  }, []);

  const askScope = useCallback(
    (request: ScopeRequest) =>
      new Promise<ScopeAnswer>((resolve) => {
        answer.current = resolve;
        setScopeRequest(request);
      }),
    [],
  );

  /** Runs the action, asking the scope and confirming losses for an occurrence. */
  const run = useCallback(
    async (
      event: CalendarEventItem,
      verb: ScopeRequest["verb"],
      call: (options: ScopeOptions) => Promise<QuickResult>,
    ): Promise<QuickResult | null> => {
      if (!event.seriesId) return call({});
      const chosen = await askScope({ verb, loss: null, scope: null });
      if (!chosen) return null;
      let result = await call({ scope: chosen.scope });
      if (!result.ok && result.loss) {
        const confirmed = await askScope({
          verb,
          loss: result.loss,
          scope: chosen.scope,
        });
        if (!confirmed) return null;
        result = await call({ scope: chosen.scope, confirmLoss: true });
      }
      return result;
    },
    [askScope],
  );

  const settle = useCallback(
    (event: CalendarEventItem, result: QuickResult | null, notice: string) => {
      if (!result || !result.ok) {
        // Back to its place, with the reason (RF-4); cancelled says nothing.
        setOverride(event.id, null);
        if (result) show(result.error);
        if (result && !result.ok && result.gone) router.refresh();
        return;
      }
      setOverrides((current) => {
        const next = new Map(current);
        const override = next.get(event.id);
        if (override) next.set(event.id, { ...override, pending: false });
        return next;
      });
      showUndo(notice, result.undo);
      router.refresh();
    },
    [router, setOverride, show, showUndo],
  );

  const change = useCallback(
    async (event: CalendarEventItem, change: Change, notice: ChangeNotice) => {
      setOverride(event.id, { change, pending: true });
      const result = await run(event, "save", (options) =>
        quickChange(event.id, change, options),
      );
      settle(event, result, UNDO_NOTICES[notice]);
    },
    [run, setOverride, settle],
  );

  const drag = useEventDrag({
    timeZone,
    preview: (event, times) =>
      setPreview(times ? { id: event.id, times } : null),
    drop: (event, times, resized) => {
      setPreview(null);
      void change(
        event,
        { kind: "times", ...times },
        resized ? "resized" : "moved",
      );
    },
    setDragging: (event) => {
      setDragging(event !== null);
      setDraggingId(event?.id ?? null);
    },
    lift: (event) => setLiftedId(event.id),
  });

  // A press anywhere but on the lifted event puts it down (RF-11).
  useEffect(() => {
    if (!liftedId) return;
    const putDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest?.(`[data-lifted]`)) setLiftedId(null);
    };
    window.addEventListener("pointerdown", putDown, { capture: true });
    return () =>
      window.removeEventListener("pointerdown", putDown, { capture: true });
  }, [liftedId]);

  const api = useMemo<EventInteractionsApi>(
    () => ({
      timeZone,
      canEdit: (event) => editableCalendarIds.has(event.calendarId),
      dragging,
      setDragging,
      draggingId,
      liftedId,
      startDrag: drag.start,
      change,
      remove: async (event) => {
        setOverride(event.id, { change: "deleted", pending: true });
        const result = await run(event, "delete", (options) =>
          deleteForUndo(event.id, options),
        );
        settle(event, result, UNDO_NOTICES.deleted);
      },
    }),
    [
      change,
      drag.start,
      dragging,
      draggingId,
      editableCalendarIds,
      liftedId,
      run,
      setOverride,
      settle,
      timeZone,
    ],
  );

  const shown = useMemo(
    () =>
      events.flatMap((event) => {
        if (preview?.id === event.id) return [{ ...event, ...preview.times }];
        const override = overrides.get(event.id);
        if (!override) return [event];
        if (override.change === "deleted") return [];
        return [
          applyOverride(
            event,
            override.change,
            calendarColors.get(event.calendarId),
          ),
        ];
      }),
    [calendarColors, events, overrides, preview],
  );

  const dialog = (
    <>
      {/* The new hours of a dragged event, read as they change (plan D2). */}
      <p role="status" aria-live="polite" className="sr-only">
        {preview ? describeTimes(preview.times, timeZone) : ""}
      </p>
      {/* Mounted only while asking: the dialog opens on mount and closes on unmount. */}
      {scopeRequest ? (
        <SeriesScopeChoice
          request={scopeRequest}
          onAnswer={(value) => {
            setScopeRequest(null);
            answer.current?.(value);
            answer.current = null;
          }}
        />
      ) : null}
    </>
  );

  return { api, events: shown, dialog };
}
