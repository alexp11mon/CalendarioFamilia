"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  addTransitionType,
  startTransition,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  ViewTransition,
} from "react";
import { createPortal } from "react-dom";
import {
  useCalendarHeader,
  usePublishCalendarHeader,
} from "@/components/shell/calendar-header";
import { FormAlert } from "@/components/ui/form-alert";
import { monthLabel } from "@/lib/calendar/agenda-feed";
import { requestAgendaToday } from "@/lib/calendar/agenda-today";
import type { Draft } from "@/lib/calendar/draft";
import type { Box } from "@/lib/calendar/popover";
import type { FormAction, FormState } from "@/lib/forms/form-state";
import { useCalendarShortcuts } from "@/lib/hooks/use-calendar-shortcuts";
import { useIsPhone } from "@/lib/hooks/use-is-phone";
import { useSwipe } from "@/lib/hooks/use-swipe";
import { useRefreshOnFocus } from "@/lib/hooks/use-refresh-on-focus";
import { CALENDAR_MESSAGES } from "@/lib/calendar/error-messages";
import {
  ORPHAN_GROUP_ID,
  type GroupableCalendar,
  type PersonGroup,
} from "@/lib/calendar/grouping";
import {
  calendarHref,
  navigate,
  type CalendarView,
} from "@/lib/calendar/ranges";
import {
  CAL_FILTER,
  CAL_VIEW,
  periodType,
  todayType,
  typesOf,
  VIEW_MOTION,
} from "@/lib/calendar/transition-types";
import { AgendaView, type AgendaEvent } from "./agenda-view";
import type { MonthMarks } from "@/lib/calendar/month-marks";
import { CalendarFilters, type FilterCategory } from "./calendar-filters";
import { DayView } from "./day-view";
import {
  EventInteractionsProvider,
  useEventInteractionsState,
} from "./event-interactions";
import { Fab } from "./fab";
import type { CalendarOption, EventFormValues } from "./event-form";
import { GoToDateDialog } from "./go-to-date-dialog";
import { MiniMonth } from "./mini-month";
import { ShortcutsHelp } from "./shortcuts-help";
import { MonthStrip } from "./month-strip";
import { MonthView } from "./month-view";
import { NextEventCard, type NextEventItem } from "./next-event-card";
import { QuickCreate } from "./quick-create";
import { WeekView } from "./week-view";

export interface PanelCalendar extends GroupableCalendar {
  color: string;
}

/** A person, the group without owner, or one of the user's groups (`groupId`, spec 007 RF-36). */
export type FilterSection = PersonGroup<PanelCalendar> & { groupId?: string };
type Group = FilterSection;
type Result = { error?: string };
type Direction = "up" | "down";

export interface SavedOrder {
  people: string[];
  groups: string[];
  calendars: Record<string, string[]>;
}

function orderOf(groups: Group[]): SavedOrder {
  return {
    // The group without owner is not a person: its position is never saved (spec 006 RF-22).
    people: groups
      .filter((group) => !group.groupId)
      .map((group) => group.person.id)
      .filter((id) => id !== ORPHAN_GROUP_ID),
    groups: groups.flatMap((group) => (group.groupId ? [group.groupId] : [])),
    calendars: Object.fromEntries(
      groups.map((group) => [
        group.person.id,
        group.calendars.map((calendar) => calendar.id),
      ]),
    ),
  };
}

/** Swaps a section with the next one of its own kind: groups move among groups, people among people. */
function swapSection(
  sections: Group[],
  index: number,
  direction: Direction,
): Group[] {
  const sameKind = (section: Group) =>
    Boolean(section.groupId) === Boolean(sections[index]?.groupId) &&
    section.person.id !== ORPHAN_GROUP_ID;
  const step = direction === "up" ? -1 : 1;
  let target = index + step;
  while (
    target >= 0 &&
    target < sections.length &&
    !sameKind(sections[target]!)
  )
    target += step;
  if (target < 0 || target >= sections.length) return sections;
  const next = [...sections];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

const DRAWER_VIEWS: { view: CalendarView; label: string }[] = [
  { view: "agenda", label: "Agenda" },
  { view: "day", label: "Día" },
  { view: "week", label: "Semana" },
  { view: "month", label: "Mes" },
];

const DRAWER_ROW =
  "flex min-h-12 w-full items-center rounded-xl px-3 text-base font-medium text-ink hover:bg-stone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink aria-[current=page]:border aria-[current=page]:border-accent-edge aria-[current=page]:bg-accent aria-[current=page]:text-on-accent";

/** The views at the top of the phone drawer, the current one as the selection (spec 016 RF-13). */
function DrawerViews({
  view,
  date,
  saveLastView,
}: {
  view: CalendarView;
  date: string;
  saveLastView?: (view: CalendarView) => Promise<{ error?: string }>;
}) {
  return (
    <ul aria-label="Vistas" className="flex flex-col gap-1">
      {DRAWER_VIEWS.map((item) => (
        <li key={item.view}>
          <Link
            href={calendarHref(item.view, date)}
            transitionTypes={[CAL_VIEW]}
            aria-current={item.view === view ? "page" : undefined}
            onClick={() => void saveLastView?.(item.view)}
            className={DRAWER_ROW}
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function swap<T>(items: T[], index: number, direction: Direction): T[] {
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/**
 * The calendar page below the toolbar: filter panel plus the chosen view. Visibility
 * and order change at once in the browser and are saved in the background; if saving
 * fails the change is undone and the error shown (RF-32, RF-33, RF-43..RF-46).
 */
export function CalendarWorkspace({
  view,
  date,
  days,
  today,
  timeZone,
  events,
  canCreate = false,
  groups: initialGroups,
  categories,
  setCalendarVisibility,
  setPersonVisibility,
  setGroupVisibility: setUserGroupVisibility,
  saveOrder,
  nextEvents,
  loadedAt,
  monthMarks,
  loadMonthMarks,
  saveLastView,
  loadAgendaEvents,
  editableCalendars = [],
  createAction,
}: {
  view: CalendarView;
  date: string;
  days: string[];
  today: string;
  timeZone: string;
  events: AgendaEvent[];
  /** At least one calendar the user can add events to (spec 005 RF-38). */
  canCreate?: boolean;
  groups: Group[];
  categories: FilterCategory[];
  setCalendarVisibility: (id: string, visible: boolean) => Promise<Result>;
  setPersonVisibility: (id: string, visible: boolean) => Promise<Result>;
  /** Shows or hides every calendar of one of the user's groups (spec 007 RF-39). */
  setGroupVisibility?: (id: string, visible: boolean) => Promise<Result>;
  saveOrder: (order: SavedOrder) => Promise<Result>;
  /** Timed events of the next 48 h and when they were read (spec 005 RF-45, plan D12). */
  nextEvents?: NextEventItem[];
  loadedAt?: number;
  /** Dots of the month of `date` and how to read another month (spec 005 RF-24, RF-26). */
  monthMarks?: MonthMarks;
  loadMonthMarks?: (
    month: string,
  ) => Promise<{ marks: MonthMarks } | { error: string }>;
  /** Remembers a view chosen with a shortcut (spec 008 RF-25). */
  saveLastView?: (view: CalendarView) => Promise<{ error?: string }>;
  /** More days for the continuous agenda (spec 016 RF-48, RF-49). */
  loadAgendaEvents?: (
    from: string,
    to: string,
  ) => Promise<{ events: AgendaEvent[] } | { error: string }>;
  /** Calendars the user can write to, for the quick window (spec 008 RF-37). */
  editableCalendars?: CalendarOption[];
  createAction?: FormAction<FormState<keyof EventFormValues>>;
}) {
  const [keyDialog, setKeyDialog] = useState<"goto" | "help" | null>(null);
  useCalendarShortcuts({
    view,
    date,
    today,
    canCreate,
    saveLastView,
    onGoTo: () => setKeyDialog("goto"),
    onHelp: () => setKeyDialog("help"),
  });
  useRefreshOnFocus(loadedAt);
  const [groups, setGroups] = useState(initialGroups);
  const [hiddenCategories, setHiddenCategories] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [error, setError] = useState<string>();
  const [panelOpen, setPanelOpen] = useState(false);
  const panelId = useId();
  // The event being created from an empty slot (spec 008 RF-37, RF-40).
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [anchor, setAnchor] = useState<Box | null>(null);
  const closeDraft = useCallback(() => setDraft(null), []);

  // The phone header and drawer (spec 016 RF-8, RF-10, RF-13, RF-20, RF-23, plan D3, D15).
  const router = useRouter();
  const isPhone = useIsPhone();
  const onCalendarPage = usePathname() === "/dashboard/calendar";
  const { drawerSlot, pickerOpen, setPickerOpen } = useCalendarHeader();
  // In the agenda the title follows the month at the top (RF-59).
  const [agendaMonth, setAgendaMonth] = useState<{
    date: string;
    month: string;
  } | null>(null);
  const onAgendaMonth = useCallback(
    (month: string) => setAgendaMonth({ date, month }),
    [date],
  );
  const titleMonth =
    view === "agenda" && agendaMonth?.date === date
      ? agendaMonth.month
      : date.slice(0, 7);
  usePublishCalendarHeader({
    title: monthLabel(titleMonth, today),
    today,
    onToday: () =>
      view === "agenda"
        ? requestAgendaToday()
        : router.push(calendarHref(view, today), {
            transitionTypes: typesOf(todayType(date, today)),
          }),
    picker: view === "month" ? "months" : "mini",
  });
  // Moving, recoloring and deleting without the form (spec 017 plan workspace-interactions).
  const editableIds = useMemo(
    () => new Set(editableCalendars.map((calendar) => calendar.id)),
    [editableCalendars],
  );
  const calendarColors = useMemo(
    () =>
      new Map(
        initialGroups.flatMap((group) =>
          group.calendars.map((c) => [c.id, c.color] as const),
        ),
      ),
    [initialGroups],
  );
  const interactive = useEventInteractionsState({
    events,
    editableCalendarIds: editableIds,
    calendarColors,
    timeZone,
    date,
  });
  const { dragging } = interactive.api;

  // Sliding a finger changes the period of the month, the week and the day
  // (RF-25..RF-29), never during a drag (spec 017 RF-21).
  const swipe = useSwipe({
    enabled: view !== "agenda" && draft === null && !dragging,
    onSwipe: (direction) => {
      const delta = direction === "next" ? 1 : -1;
      router.push(calendarHref(view, navigate(view, date, delta)), {
        transitionTypes: typesOf(periodType(delta)),
      });
    },
  });
  const filtersInDrawer = isPhone && onCalendarPage ? drawerSlot : null;
  const quickCreate = canCreate && createAction && editableCalendars.length > 0;

  function openDraft(next: Draft, at: Box) {
    if (dragging) return;
    setDraftTitle("");
    setAnchor(at);
    setDraft(next);
  }
  const panel = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);

  // Adopt fresh server data (after a revalidation) as the new starting point.
  const [seen, setSeen] = useState(initialGroups);
  if (seen !== initialGroups) {
    setSeen(initialGroups);
    setGroups(initialGroups);
  }

  // After a move the button may have been re-created or disabled: give the focus back.
  useEffect(() => {
    const request = pendingFocus.current;
    if (!request) return;
    pendingFocus.current = null;
    const [kind, id, direction] = request.split(":") as [
      string,
      string,
      Direction,
    ];
    const find = (dir: Direction) =>
      panel.current?.querySelector<HTMLButtonElement>(
        `button[data-move="${kind}:${id}:${dir}"]:not(:disabled)`,
      );
    (find(direction) ?? find(direction === "up" ? "down" : "up"))?.focus();
  }, [groups]);

  // Showing or hiding fades the events in and out (spec 011 RF-19, plan D8).
  function fadeFilters(update: () => void) {
    startTransition(() => {
      addTransitionType(CAL_FILTER);
      update();
    });
  }

  async function apply(
    next: Group[],
    persist: () => Promise<Result>,
    fade = false,
  ) {
    const previous = groups;
    if (fade) fadeFilters(() => setGroups(next));
    else setGroups(next);
    setError(undefined);
    let result: Result;
    try {
      result = await persist();
    } catch {
      result = { error: CALENDAR_MESSAGES.connection };
    }
    if (result.error) {
      setGroups(previous);
      setError(result.error);
    }
  }

  function toggleCalendar(calendarId: string, visible: boolean) {
    void apply(
      groups.map((group) => ({
        ...group,
        calendars: group.calendars.map((calendar) =>
          calendar.id === calendarId ? { ...calendar, visible } : calendar,
        ),
      })),
      () => setCalendarVisibility(calendarId, visible),
      true,
    );
  }

  function togglePerson(personId: string, visible: boolean) {
    const groupId = groups.find(
      (group) => group.person.id === personId,
    )?.groupId;
    void apply(
      groups.map((group) =>
        group.person.id === personId
          ? {
              ...group,
              calendars: group.calendars.map((calendar) => ({
                ...calendar,
                visible,
              })),
            }
          : group,
      ),
      groupId && setUserGroupVisibility
        ? () => setUserGroupVisibility(groupId, visible)
        : personId === ORPHAN_GROUP_ID
          ? () => setOrphanVisibility(personId, visible)
          : () => setPersonVisibility(personId, visible),
      true,
    );
  }

  // The group without owner has no person to filter by: save each calendar (spec 006 RF-22).
  async function setOrphanVisibility(
    groupId: string,
    visible: boolean,
  ): Promise<Result> {
    const ids =
      groups
        .find((group) => group.person.id === groupId)
        ?.calendars.map((calendar) => calendar.id) ?? [];
    const results = await Promise.all(
      ids.map((id) => setCalendarVisibility(id, visible)),
    );
    return results.find((result) => result.error) ?? {};
  }

  function toggleCategory(categoryId: string, visible: boolean) {
    fadeFilters(() =>
      setHiddenCategories((current) => {
        const next = new Set(current);
        if (visible) next.delete(categoryId);
        else next.add(categoryId);
        return next;
      }),
    );
  }

  function move(kind: "person" | "calendar", id: string, direction: Direction) {
    const next =
      kind === "person"
        ? swapSection(
            groups,
            groups.findIndex((group) => group.person.id === id),
            direction,
          )
        : groups.map((group) => {
            const index = group.calendars.findIndex((c) => c.id === id);
            return index === -1
              ? group
              : {
                  ...group,
                  calendars: swap(group.calendars, index, direction),
                };
          });
    pendingFocus.current = `${kind}:${id}:${direction}`;
    void apply(next, () => saveOrder(orderOf(next)));
  }

  const visibleCalendars = new Set(
    groups.flatMap((group) =>
      group.calendars.filter((c) => c.visible).map((c) => c.id),
    ),
  );
  const isShown = (event: AgendaEvent) =>
    visibleCalendars.has(event.calendarId) &&
    !(event.categoryId && hiddenCategories.has(event.categoryId));
  const shown = interactive.events.filter(isShown);

  const colors = Object.fromEntries(
    groups.flatMap((group) => group.calendars.map((c) => [c.id, c.color])),
  );

  // New events go to the first visible calendar of the panel the user can write
  // to, or to the first writable one (plan workspace).
  const panelOrder = groups.flatMap((group) => group.calendars);
  const defaultCalendarId =
    panelOrder.find(
      (c) => c.visible && editableCalendars.some((e) => e.id === c.id),
    )?.id ?? editableCalendars[0]?.id;
  const draftMark = draft ? { day: draft.day, title: draftTitle } : null;
  const gridDraft =
    draft && !draft.allDay ? { ...draft, title: draftTitle } : null;
  // A slot of the week or the day creates at those hours (spec 008 RF-20, RF-42).
  const createInGrid = quickCreate
    ? (day: string, range: { start: number; end: number }, at: Box) =>
        openDraft(
          {
            day,
            allDay: false,
            startMinute: range.start,
            endMinute: range.end,
          },
          at,
        )
    : undefined;

  const filters = (
    <>
      <FormAlert message={error} />
      <CalendarFilters
        groups={groups}
        categories={categories}
        hiddenCategories={hiddenCategories}
        onToggleCalendar={toggleCalendar}
        onTogglePerson={togglePerson}
        onToggleCategory={toggleCategory}
        onMove={move}
      />
    </>
  );

  return (
    <EventInteractionsProvider value={interactive.api}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8">
        {filtersInDrawer
          ? createPortal(
              <div className="flex flex-col gap-3">
                <DrawerViews
                  view={view}
                  date={date}
                  saveLastView={saveLastView}
                />
                {filters}
              </div>,
              filtersInDrawer,
            )
          : null}
        {pickerOpen ? (
          // Under the phone header; a day of the mini month folds it (RF-20, RF-23, RF-24).
          <div
            className="-mx-4 -mt-2 tab:hidden"
            onClick={(event) => {
              if ((event.target as Element).closest("a") && view !== "month")
                setPickerOpen(false);
            }}
          >
            {view === "month" ? (
              <MonthStrip month={date.slice(0, 7)} />
            ) : monthMarks && loadMonthMarks ? (
              <div className="px-4">
                <MiniMonth
                  key={date.slice(0, 7)}
                  month={date.slice(0, 7)}
                  today={today}
                  view={view}
                  initialMarks={monthMarks}
                  colors={colors}
                  visibleCalendarIds={visibleCalendars}
                  loadMonthMarks={loadMonthMarks}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        {/* On a phone the drawer and the header take the panel's place (RF-19). */}
        <div className="flex flex-col gap-3 max-tab:hidden lg:sticky lg:top-6 lg:w-84 lg:shrink-0">
          {nextEvents && loadedAt !== undefined ? (
            <NextEventCard
              events={nextEvents}
              visibleCalendarIds={visibleCalendars}
              timeZone={timeZone}
              loadedAt={loadedAt}
            />
          ) : null}
          <button
            type="button"
            aria-expanded={panelOpen}
            aria-controls={panelId}
            onClick={() => setPanelOpen((open) => !open)}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-control bg-paper px-4 text-base font-semibold text-ink transition-colors hover:bg-stone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:hidden"
          >
            Calendarios y filtros
          </button>
          <div
            id={panelId}
            ref={panel}
            className={`${panelOpen ? "flex" : "hidden"} flex-col gap-3 lg:flex`}
          >
            {monthMarks && loadMonthMarks ? (
              <MiniMonth
                // A new month in the main view starts the mini month there again.
                key={date.slice(0, 7)}
                month={date.slice(0, 7)}
                today={today}
                view={view}
                initialMarks={monthMarks}
                colors={colors}
                visibleCalendarIds={visibleCalendars}
                loadMonthMarks={loadMonthMarks}
              />
            ) : null}
            {filtersInDrawer ? null : filters}
          </div>
        </div>
        {/* A new view or date exits the old area and enters the new one in the
          sense of the change (spec 011 RF-17, RF-18; plan D8). */}
        <ViewTransition
          key={`${view}-${date}`}
          enter={VIEW_MOTION}
          exit={VIEW_MOTION}
          update={{ [CAL_FILTER]: CAL_FILTER, default: "none" }}
          default="none"
        >
          <div
            className={`min-w-0 flex-1 ${view === "agenda" ? "" : "touch-pan-y"}`}
            {...swipe}
          >
            {view === "agenda" ? (
              <AgendaView
                days={days}
                events={interactive.events}
                isShown={isShown}
                timeZone={timeZone}
                today={today}
                loadEvents={loadAgendaEvents}
                onMonthChange={onAgendaMonth}
              />
            ) : view === "month" ? (
              <MonthView
                date={date}
                days={days}
                events={shown}
                timeZone={timeZone}
                today={today}
                // A day of the month creates an all-day event (spec 008 RF-19).
                onCreate={
                  quickCreate
                    ? (day, at) =>
                        openDraft(
                          {
                            day,
                            allDay: true,
                            startMinute: 540,
                            endMinute: 600,
                          },
                          at,
                        )
                    : undefined
                }
                draft={draftMark}
              />
            ) : view === "week" ? (
              <WeekView
                days={days}
                events={shown}
                timeZone={timeZone}
                today={today}
                onCreate={createInGrid}
                draft={gridDraft}
              />
            ) : (
              <DayView
                day={date}
                events={shown}
                timeZone={timeZone}
                today={today}
                onCreate={createInGrid}
                draft={gridDraft}
              />
            )}
          </div>
        </ViewTransition>
        {canCreate ? <Fab href={`/dashboard/events/new?date=${date}`} /> : null}
        {draft && quickCreate && defaultCalendarId ? (
          <QuickCreate
            // A new slot starts a new window.
            key={`${draft.day}-${draft.allDay}-${draft.startMinute}-${draft.endMinute}`}
            draft={draft}
            anchor={anchor}
            calendars={editableCalendars}
            defaultCalendarId={defaultCalendarId}
            action={createAction}
            onClose={closeDraft}
            onTitleChange={setDraftTitle}
          />
        ) : null}
        {interactive.dialog}
        {keyDialog === "goto" ? (
          <GoToDateDialog
            date={date}
            // `close` arrives later: never close a dialog opened since (G then ?).
            onClose={() =>
              setKeyDialog((open) => (open === "goto" ? null : open))
            }
            onGo={(next) => {
              setKeyDialog(null);
              router.push(calendarHref(view, next));
            }}
          />
        ) : keyDialog === "help" ? (
          <ShortcutsHelp
            onClose={() =>
              setKeyDialog((open) => (open === "help" ? null : open))
            }
          />
        ) : null}
      </div>
    </EventInteractionsProvider>
  );
}
