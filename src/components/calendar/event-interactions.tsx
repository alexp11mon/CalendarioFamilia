"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
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
import type { CalendarEventItem } from "@/lib/calendar/layout";
import { DEFAULT_CALENDAR_COLOR } from "@/lib/calendar/palette";
import { UNDO_NOTICES, type Change } from "@/lib/calendar/undo";
import { useUndoToast } from "./use-undo-toast";

export type ChangeNotice = "moved" | "resized" | "color";

export interface EventInteractionsApi {
  timeZone: string;
  /** Owner or editor of its calendar, and Google lets it write (RF-1, RF-2). */
  canEdit: (event: CalendarEventItem) => boolean;
  /** A drag is on: no swiping and no quick window (RF-21). */
  dragging: boolean;
  setDragging: (value: boolean) => void;
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

  const api = useMemo<EventInteractionsApi>(
    () => ({
      timeZone,
      canEdit: (event) => editableCalendarIds.has(event.calendarId),
      dragging,
      setDragging,
      change: async (event, change, notice) => {
        setOverride(event.id, { change, pending: true });
        const result = await run(event, "save", (options) =>
          quickChange(event.id, change, options),
        );
        settle(event, result, UNDO_NOTICES[notice]);
      },
      remove: async (event) => {
        setOverride(event.id, { change: "deleted", pending: true });
        const result = await run(event, "delete", (options) =>
          deleteForUndo(event.id, options),
        );
        settle(event, result, UNDO_NOTICES.deleted);
      },
    }),
    [dragging, editableCalendarIds, run, setOverride, settle, timeZone],
  );

  const shown = useMemo(
    () =>
      events.flatMap((event) => {
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
    [calendarColors, events, overrides],
  );

  // Mounted only while asking: the dialog opens on mount and closes on unmount.
  const dialog = scopeRequest ? (
    <SeriesScopeChoice
      request={scopeRequest}
      onAnswer={(value) => {
        setScopeRequest(null);
        answer.current?.(value);
        answer.current = null;
      }}
    />
  ) : null;

  return { api, events: shown, dialog };
}
