// Read access for the spec 002 pages. Everything goes through RLS: a user only
// ever gets rows of calendars they belong to (P3).
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_ACCENT, isAccent, type AccentId } from "@/lib/theme/accents";
import { parseTheme, type ThemeId } from "@/lib/theme/theme";
import type { CalendarPreference, Person, PersonPreference } from "./grouping";
import type { CalendarGroup } from "./organize-groups";
import { accessOf } from "@/lib/sync/providers/google";
import type { SyncedInfo } from "@/lib/sync/read-only";
import type { Database } from "@/types/database";
import { occurrenceId, parseEventId } from "@/lib/recurrence/occurrence-id";
import {
  expandRows,
  findOccurrence,
  isChanged,
} from "@/lib/recurrence/read-series";
import { fromRRule } from "@/lib/recurrence/rule";
import { summarizeRule } from "@/lib/recurrence/summary";

type Client = Awaited<ReturnType<typeof createClient>>;
type CalendarRole = Database["public"]["Enums"]["calendar_role"];

export interface CalendarRecord {
  id: string;
  name: string;
  description: string | null;
  color: string;
  // null for a calendar without owner (spec 006 RF-21); it is listed in the "Sin propietario" group.
  ownerId: string | null;
  createdAt: string;
  role: CalendarRole;
  /** Brought from a connected account: read-only (spec 007 RF-20, RF-26). */
  synced: SyncedInfo | null;
}

/** Session for a Server Action or Route Handler; no session means login. */
export async function requireActionUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect("/login");
  return { supabase, userId };
}

/** Session for a Server Component: Supabase reads Date.now(), so render per request. */
export async function requireUser() {
  await connection();
  return requireActionUser();
}

const CALENDAR_SELECT =
  "role, calendars(id, name, description, color, owner_id, created_at, synced_calendars(last_synced_at, connection_id, google_access, can_write, calendar_connections(account_email)))";

type CalendarRow = {
  role: CalendarRole;
  calendars: {
    id: string;
    name: string;
    description: string | null;
    color: string;
    owner_id: string | null;
    created_at: string;
    synced_calendars: {
      last_synced_at: string | null;
      connection_id: string;
      google_access: string | null;
      can_write: boolean | null;
      calendar_connections: { account_email: string } | null;
    } | null;
  } | null;
};

function toRecord({ role, calendars }: CalendarRow): CalendarRecord[] {
  return calendars
    ? [
        {
          id: calendars.id,
          name: calendars.name,
          description: calendars.description,
          color: calendars.color,
          ownerId: calendars.owner_id,
          createdAt: calendars.created_at,
          role,
          synced: calendars.synced_calendars
            ? {
                lastSyncedAt: calendars.synced_calendars.last_synced_at,
                accountEmail:
                  calendars.synced_calendars.calendar_connections
                    ?.account_email ?? null,
                connectionId: calendars.synced_calendars.connection_id,
                canWrite: calendars.synced_calendars.can_write === true,
                googleAccess: accessOf(
                  calendars.synced_calendars.google_access,
                ),
              }
            : null,
        },
      ]
    : [];
}

/** Calendars the user belongs to, with their role (RF-13). */
export async function getMyCalendars(
  supabase: Client,
  userId: string,
): Promise<CalendarRecord[]> {
  // RLS returns every member of my calendars; filtering by user_id keeps my role.
  const { data, error } = await supabase
    .from("calendar_members")
    .select(CALENDAR_SELECT)
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).flatMap(toRecord);
}

/** One calendar of the user, or null if it does not exist, is not theirs or the id is malformed. */
export async function getCalendar(
  supabase: Client,
  userId: string,
  id: string,
): Promise<CalendarRecord | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await supabase
    .from("calendar_members")
    .select(CALENDAR_SELECT)
    .eq("user_id", userId)
    .eq("calendar_id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? (toRecord(data)[0] ?? null) : null;
}

/** Whether RLS lets the user see the calendar: tells "gone" apart from "not yours". */
export async function canSeeCalendar(
  supabase: Client,
  id: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("calendars")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  return Boolean(data);
}

export interface CategoryRecord {
  id: string;
  name: string;
}

/** Categories of one calendar, alphabetical (RF-13). RLS limits them to members. */
export async function getCategories(
  supabase: Client,
  calendarId: string,
): Promise<CategoryRecord[]> {
  const { data, error } = await supabase
    .from("event_categories")
    .select("id, name")
    .eq("calendar_id", calendarId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

const DEFAULT_TIME_ZONE = "Europe/Madrid";

/** The user's profile zone, in which events are typed and shown (RF-34). */
export async function getProfileTimeZone(
  supabase: Client,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("time_zone")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.time_zone ?? DEFAULT_TIME_ZONE;
}

/** The last view the user chose, or null (spec 008 RF-25, RF-26). */
export async function getLastView(
  supabase: Client,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("last_view")
    .eq("id", userId)
    .maybeSingle();
  return data?.last_view ?? null;
}

/** The user's interface accent; red if the row cannot be read (spec 005 RF-9, RF-10). */
/**
 * The accent, theme and name of the profile, read together for the frame
 * (spec 011 plan theme-boot; the name for the avatar, spec 016 plan D13).
 */
export async function getAppearance(
  supabase: Client,
  userId: string,
): Promise<{ accent: AccentId; theme: ThemeId; displayName: string }> {
  const { data } = await supabase
    .from("profiles")
    .select("accent, theme, display_name")
    .eq("id", userId)
    .maybeSingle();
  return {
    accent: isAccent(data?.accent) ? data.accent : DEFAULT_ACCENT,
    theme: parseTheme(data?.theme),
    displayName: data?.display_name ?? "",
  };
}

export interface CategoryOptionRecord {
  id: string;
  name: string;
  calendarId: string;
}

/** Categories of several calendars at once, for the event form. */
export async function getCategoriesForCalendars(
  supabase: Client,
  calendarIds: string[],
): Promise<CategoryOptionRecord[]> {
  if (calendarIds.length === 0) return [];
  const { data, error } = await supabase
    .from("event_categories")
    .select("id, name, calendar_id")
    .in("calendar_id", calendarIds)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    calendarId: row.calendar_id,
  }));
}

export interface EventRecord {
  /** Id of the URL: the row, or "<series>_<start>" for an occurrence without one. */
  id: string;
  /** Row of this event; null while the occurrence only exists in its rule (spec 013). */
  rowId: string | null;
  calendarId: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  color: string | null;
  categoryId: string | null;
  /** Null once the author deleted the account (spec 006 RF-20). */
  createdBy: string | null;
  /** The series of an occurrence (spec 013 RF-10, RF-16); null for a single event. */
  series: EventSeries | null;
}

export interface EventSeries {
  id: string;
  recurrence: string;
  recurrenceTz: string | null;
  summary: string;
  originalStart: string;
  /** An exception that differs from its series (RF-16, plan D9). */
  changed: boolean;
  /** Exceptions plus deleted occurrences, for the limit of RF-32. */
  exceptions: number;
  /** First occurrence of the series, which "Todos los eventos" edits. */
  startsAt: string;
  endsAt: string;
  allDay: boolean;
}

const EVENT_COLUMNS =
  "id, calendar_id, title, description, location, starts_at, ends_at, all_day, color, category_id, created_by, recurrence, recurrence_tz, exdates, series_id, original_start";

async function eventRow(supabase: Client, id: string) {
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

type EventRow = NonNullable<Awaited<ReturnType<typeof eventRow>>>;

function fromRow(row: EventRow): EventRecord {
  return {
    id: row.id,
    rowId: row.id,
    calendarId: row.calendar_id,
    title: row.title,
    description: row.description,
    location: row.location,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: row.all_day,
    color: row.color,
    categoryId: row.category_id,
    createdBy: row.created_by,
    series: null,
  };
}

async function seriesInfo(
  supabase: Client,
  series: EventRow,
  originalStart: string,
  changed: boolean,
): Promise<EventSeries> {
  const { count, error } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("series_id", series.id);
  if (error) throw error;
  const rule = fromRRule(series.recurrence ?? "");
  return {
    id: series.id,
    recurrence: series.recurrence ?? "",
    recurrenceTz: series.recurrence_tz,
    summary: rule ? summarizeRule(rule) : "Se repite",
    originalStart: new Date(originalStart).toISOString(),
    changed,
    exceptions: (count ?? 0) + series.exdates.length,
    startsAt: series.starts_at,
    endsAt: series.ends_at,
    allDay: series.all_day,
  };
}

async function exceptionRecord(
  supabase: Client,
  row: EventRow,
  series: EventRow,
): Promise<EventRecord> {
  return {
    ...fromRow(row),
    series: await seriesInfo(
      supabase,
      series,
      row.original_start!,
      isChanged(row, series),
    ),
  };
}

/** The occurrence of a series at `originalStart`: its exception, or one built from the rule. */
async function occurrenceRecord(
  supabase: Client,
  series: EventRow,
  originalStart: string,
): Promise<EventRecord | null> {
  const { data: exception, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("series_id", series.id)
    .eq("original_start", originalStart)
    .maybeSingle();
  if (error) throw error;
  if (exception) return exceptionRecord(supabase, exception, series);
  const occurrence = findOccurrence(series, originalStart);
  if (!occurrence) return null;
  return {
    ...fromRow(series),
    id: occurrenceId(series.id, occurrence.originalStart),
    rowId: null,
    startsAt: occurrence.startsAt,
    endsAt: occurrence.endsAt,
    series: await seriesInfo(supabase, series, occurrence.originalStart, false),
  };
}

/**
 * One event or occurrence (spec 013 RF-9), or null if it does not exist, is not
 * visible to the user or the id is malformed. The id of a series row stands for
 * its first occurrence.
 */
export async function getEvent(
  supabase: Client,
  id: string,
): Promise<EventRecord | null> {
  const parsed = parseEventId(id);
  if (!parsed) return null;
  if (parsed.kind === "occurrence") {
    const series = await eventRow(supabase, parsed.seriesId);
    if (!series?.recurrence) return null;
    return occurrenceRecord(supabase, series, parsed.originalStart);
  }
  const row = await eventRow(supabase, parsed.id);
  if (!row) return null;
  if (row.recurrence) return occurrenceRecord(supabase, row, row.starts_at);
  if (row.series_id) {
    const series = await eventRow(supabase, row.series_id);
    if (series) return exceptionRecord(supabase, row, series);
  }
  return fromRow(row);
}

/** Whether RLS lets the user see the event: tells "gone" apart from "not yours". */
export async function canSeeEvent(
  supabase: Client,
  id: string,
): Promise<boolean> {
  const parsed = parseEventId(id);
  if (!parsed) return false;
  const { data } = await supabase
    .from("events")
    .select("id")
    .eq("id", parsed.kind === "event" ? parsed.id : parsed.seriesId)
    .maybeSingle();
  return Boolean(data);
}

export interface CalendarEventRecord {
  /** Row id, or "<series>_<start>" for an occurrence without its own row. */
  id: string;
  calendarId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  color: string | null;
  categoryId: string | null;
  location: string | null;
  /** Ready images, for the mark of the views (spec 012 RF-12, plan D14). */
  imageCount: number;
  /** Comments, for the mark of the views (spec 014 RF-5, plan D11). */
  commentCount: number;
  /** Series of an occurrence, for the repeat mark (spec 013 RF-10). */
  seriesId: string | null;
}

/**
 * Events of every calendar the user belongs to that overlap [from, to) (RF-31),
 * with the occurrences of their series (spec 013 RF-9, RF-11, plan D2).
 * Columns are kept to the minimum the views draw (plan D14); RLS limits the rows.
 */
export async function getEventsInRange(
  supabase: Client,
  from: Date,
  to: Date,
): Promise<CalendarEventRecord[]> {
  const [single, series] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, calendar_id, title, starts_at, ends_at, all_day, color, category_id, location, series_id, event_images(count), event_comments(count)",
      )
      // The uploader also sees their pending images: count the ready ones only.
      .eq("event_images.status", "ready")
      .is("recurrence", null)
      .lt("starts_at", to.toISOString())
      .gte("ends_at", from.toISOString())
      .order("starts_at"),
    supabase
      .from("events")
      .select(
        "id, calendar_id, title, starts_at, ends_at, all_day, color, category_id, location, recurrence, recurrence_tz, exdates",
      )
      .not("recurrence", "is", null)
      .lt("starts_at", to.toISOString())
      .or(
        `recurrence_until.is.null,recurrence_until.gte.${from.toISOString()}`,
      ),
  ]);
  if (single.error) throw single.error;
  if (series.error) throw series.error;

  const records: CalendarEventRecord[] = (single.data ?? []).map((row) => ({
    id: row.id,
    calendarId: row.calendar_id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: row.all_day,
    color: row.color,
    categoryId: row.category_id,
    // The agenda rows show the place (spec 005 RF-35).
    location: row.location,
    imageCount: row.event_images[0]?.count ?? 0,
    commentCount: row.event_comments[0]?.count ?? 0,
    seriesId: row.series_id,
  }));
  const seriesRows = series.data ?? [];
  if (seriesRows.length === 0) return records;

  // Exceptions whose occurrence could overlap the range, wherever they moved
  // to: their original starts are not expanded.
  const longest = Math.max(
    ...seriesRows.map(
      (row) => Date.parse(row.ends_at) - Date.parse(row.starts_at),
    ),
  );
  const { data: keys, error } = await supabase
    .from("events")
    .select("series_id, original_start")
    .not("series_id", "is", null)
    .lt("original_start", to.toISOString())
    .gte(
      "original_start",
      new Date(from.getTime() - longest - 86_400_000).toISOString(),
    );
  if (error) throw error;

  for (const { row, occurrence } of expandRows(
    seriesRows,
    keys ?? [],
    from,
    to,
  )) {
    records.push({
      id: occurrenceId(row.id, occurrence.originalStart),
      calendarId: row.calendar_id,
      title: row.title,
      startsAt: occurrence.startsAt,
      endsAt: occurrence.endsAt,
      allDay: row.all_day,
      color: row.color,
      categoryId: row.category_id,
      location: row.location,
      imageCount: 0,
      // An occurrence without its own row has no comments (RF-28).
      commentCount: 0,
      seriesId: row.id,
    });
  }
  return records.sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );
}

/** People whose calendars the user shares, plus the user (RF-42). Names only, no time zone. */
export async function getPeople(supabase: Client): Promise<Person[]> {
  const { data, error } = await supabase.rpc("visible_people");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name,
  }));
}

/** The user's saved visibility and order (RF-46); RLS limits both tables to their own rows. */
export async function getPreferences(
  supabase: Client,
  userId: string,
): Promise<{
  calendarPreferences: CalendarPreference[];
  personPreferences: PersonPreference[];
}> {
  const [calendars, people] = await Promise.all([
    supabase
      .from("calendar_preferences")
      .select("calendar_id, visible, position, group_id")
      .eq("user_id", userId),
    supabase
      .from("person_preferences")
      .select("person_id, position")
      .eq("user_id", userId),
  ]);
  if (calendars.error) throw calendars.error;
  if (people.error) throw people.error;
  return {
    calendarPreferences: (calendars.data ?? []).map((row) => ({
      calendarId: row.calendar_id,
      visible: row.visible,
      position: row.position,
      groupId: row.group_id,
    })),
    personPreferences: (people.data ?? []).map((row) => ({
      personId: row.person_id,
      position: row.position,
    })),
  };
}

/** The user's own calendar groups; RLS shows no one else's (spec 007 RF-42). */
export async function getGroups(
  supabase: Client,
  userId: string,
): Promise<CalendarGroup[]> {
  const { data, error } = await supabase
    .from("calendar_groups")
    .select("id, name, position")
    .eq("user_id", userId);
  if (error) throw error;
  return data;
}

/** Number of events of each calendar, for the merge summary (RF-52). */
export async function getEventCounts(
  supabase: Client,
  calendarIds: string[],
): Promise<Record<string, number>> {
  const entries = await Promise.all(
    calendarIds.map(async (id) => {
      const { count, error } = await supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("calendar_id", id);
      if (error) throw error;
      return [id, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries);
}
