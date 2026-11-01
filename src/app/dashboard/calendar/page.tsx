import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarSkeleton } from "@/components/calendar/calendar-skeleton";
import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { ViewToolbar } from "@/components/calendar/view-toolbar";
import { LinkButton } from "@/components/ui/link-button";
import { todayKey } from "@/lib/calendar/format";
import { organizeGroups } from "@/lib/calendar/organize-groups";
import { monthMarks } from "@/lib/calendar/month-marks";
import { nextEventsWindow } from "@/lib/calendar/next-event";
import {
  getCategoriesForCalendars,
  getEventsInRange,
  getLastView,
  getMyCalendars,
  getPeople,
  getGroups,
  getPreferences,
  getProfileTimeZone,
  requireUser,
} from "@/lib/calendar/queries";
import {
  getVisibleRange,
  isCalendarView,
  parseViewParams,
} from "@/lib/calendar/ranges";
import { toViewEvents } from "@/lib/calendar/to-view-events";
import { canWriteEvents } from "@/lib/sync/read-only";
import { createEvent } from "../events/actions";
import { loadAgendaEvents } from "./agenda-actions";
import { loadMonthMarks } from "./mini-month-actions";
import {
  saveLastView,
  saveOrder,
  setCalendarVisibility,
  setPersonVisibility,
} from "./preferences-actions";
import { setGroupVisibility } from "../calendars/group-actions";

export const metadata: Metadata = { title: "Calendario" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// Reads the session and the URL, so it streams behind <Suspense> (cacheComponents).
async function CalendarContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  const { supabase, userId } = await requireUser();
  const [timeZone, lastView] = await Promise.all([
    getProfileTimeZone(supabase, userId),
    getLastView(supabase, userId),
  ]);
  const today = todayKey(timeZone);
  const { view, date } = parseViewParams(query, today, lastView);
  const range = getVisibleRange(view, date, timeZone);
  // The mini month shows the weeks of the month of `date` (spec 005 RF-23).
  const monthRange = getVisibleRange("month", date, timeZone);
  const upcomingWindow = nextEventsWindow();

  const [
    calendars,
    records,
    monthRecords,
    upcoming,
    people,
    preferences,
    userGroups,
  ] = await Promise.all([
    getMyCalendars(supabase, userId),
    getEventsInRange(supabase, range.from, range.to),
    view === "month"
      ? null
      : getEventsInRange(supabase, monthRange.from, monthRange.to),
    getEventsInRange(supabase, upcomingWindow.from, upcomingWindow.to),
    getPeople(supabase),
    getPreferences(supabase, userId),
    getGroups(supabase, userId),
  ]);

  if (calendars.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-paper px-4 py-6 text-center text-ink">
        <p>Todavía no tienes calendarios.</p>
        <LinkButton href="/dashboard/calendars/new">
          Crear calendario
        </LinkButton>
      </div>
    );
  }

  const names = new Map(calendars.map((c) => [c.id, c.name]));
  const events = toViewEvents(records, calendars);
  const canCreate = calendars.some(canWriteEvents);
  const nextEvents = upcoming
    .filter((record) => !record.allDay)
    .map((record) => ({
      id: record.id,
      title: record.title,
      startsAt: record.startsAt,
      endsAt: record.endsAt,
      allDay: record.allDay,
      calendarId: record.calendarId,
      calendarName: names.get(record.calendarId) ?? "",
    }));

  const categories = await getCategoriesForCalendars(
    supabase,
    calendars.map((calendar) => calendar.id),
  );
  // People, calendars and their saved order and visibility (RF-42, RF-45, RF-46).
  // The user's groups come first, as in "Mis calendarios" (spec 007 RF-36).
  const organized = organizeGroups({
    currentUserId: userId,
    people,
    groups: userGroups,
    calendars: calendars.map(({ id, name, ownerId, createdAt, color }) => ({
      id,
      name,
      ownerId,
      createdAt,
      color,
    })),
    ...preferences,
  });
  const groups = [
    ...organized.groups.map((section) => ({
      person: {
        id: section.group.id,
        displayName: section.group.name,
        isMe: false,
      },
      groupId: section.group.id,
      calendars: section.calendars,
    })),
    ...organized.people,
  ];

  return (
    <>
      {/* On a phone the header, the drawer and "+" do this (spec 016 RF-19). */}
      {/* Fixed while scrolling, so the views stay at hand (agenda bug, 2026-11-01). */}
      <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-3xl glass px-4 py-3 max-tab:hidden">
        <ViewToolbar
          view={view}
          date={date}
          today={today}
          saveLastView={saveLastView}
        />
        {/* On a phone "+ Evento" lives in the bottom bar (spec 005 RF-22). */}
        {canCreate ? (
          <div className="hidden lg:block">
            <LinkButton
              href={`/dashboard/events/new?date=${date}`}
              aria-keyshortcuts="N"
            >
              Nuevo evento
            </LinkButton>
          </div>
        ) : null}
      </div>
      <CalendarWorkspace
        view={view}
        date={date}
        days={range.days}
        today={today}
        timeZone={timeZone}
        events={events}
        canCreate={canCreate}
        groups={groups}
        categories={categories}
        setCalendarVisibility={setCalendarVisibility}
        setPersonVisibility={setPersonVisibility}
        setGroupVisibility={setGroupVisibility}
        saveOrder={saveOrder}
        nextEvents={nextEvents}
        loadedAt={upcomingWindow.loadedAt}
        monthMarks={monthMarks(
          monthRecords ?? records,
          monthRange.days,
          timeZone,
        )}
        loadMonthMarks={loadMonthMarks}
        saveLastView={saveLastView}
        loadAgendaEvents={loadAgendaEvents}
        editableCalendars={calendars
          .filter(canWriteEvents)
          .map(({ id, name, color }) => ({ id, name, color }))}
        createAction={createEvent}
      />
    </>
  );
}

// Only the URL, no session: picks the shape of the loading view (spec 008 RF-33).
async function ShapedLoading({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const view = isCalendarView(query.view) ? query.view : "agenda";
  return (
    // No key: moving between periods keeps the current view on screen until the
    // next one is ready (no empty screen either) and keeps the panel's state.
    <Suspense fallback={<CalendarSkeleton view={view} />}>
      <CalendarContent searchParams={searchParams} />
    </Suspense>
  );
}

export default function CalendarPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 max-tab:pt-2 max-tab:pb-0 sm:px-6">
      {/* The phone header already names the month (spec 016 RF-8). */}
      <h1 className="text-2xl font-bold text-ink max-tab:sr-only">
        Calendario
      </h1>
      <Suspense fallback={<CalendarSkeleton view="agenda" />}>
        <ShapedLoading searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
