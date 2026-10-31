import type { SupabaseClient } from "@supabase/supabase-js";
import { authorLabel } from "@/lib/account/author-label";
import { parseEventId } from "@/lib/recurrence/occurrence-id";
import { getMembers } from "@/lib/sharing/queries";
import type { Database } from "@/types/database";
import { COMMENTS_PAGE } from "./limits";

type Client = SupabaseClient<Database>;

export interface CommentView {
  id: string;
  /** Name, "Cuenta borrada" or "un antiguo miembro"; never an email (RF-3, RF-24). */
  author: string;
  /** For the tint of the avatar. */
  authorId: string | null;
  body: string;
  /** As Postgres returns it: the cursors need its microseconds. */
  createdAt: string;
  edited: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface CommentPage {
  comments: CommentView[];
  hasOlder: boolean;
}

/** A comment's place in the list: created_at, then id. */
export interface CommentCursor {
  createdAt: string;
  id: string;
}

export interface ListOptions {
  /** The page before this comment (RF-6). */
  before?: CommentCursor;
  /** Everything from this comment on, to see edits and deletions too (plan D3). */
  since?: CommentCursor;
}

/**
 * Row that holds the comments of an event id from the URL: the event, or the
 * exception of an occurrence. Undefined when the occurrence has no row yet;
 * null when the user cannot see the event (RF-22).
 */
export async function commentRowFor(
  supabase: Client,
  eventId: string,
): Promise<{ id: string; calendarId: string } | null | undefined> {
  const parsed = parseEventId(eventId);
  if (!parsed) return null;
  if (parsed.kind === "event") {
    const { data, error } = await supabase
      .from("events")
      .select("id, calendar_id")
      .eq("id", parsed.id)
      .maybeSingle();
    if (error) throw error;
    return data && { id: data.id, calendarId: data.calendar_id };
  }
  const { data, error } = await supabase
    .from("events")
    .select("id, calendar_id, series_id, original_start")
    .or(
      `id.eq.${parsed.seriesId},and(series_id.eq.${parsed.seriesId},original_start.eq.${parsed.originalStart})`,
    );
  if (error) throw error;
  const rows = data ?? [];
  const exception = rows.find((row) => row.series_id === parsed.seriesId);
  if (exception) return { id: exception.id, calendarId: exception.calendar_id };
  return rows.length > 0 ? undefined : null;
}

const after = (c: CommentCursor) =>
  `created_at.gt.${c.createdAt},and(created_at.eq.${c.createdAt},id.gte.${c.id})`;
const beforeFilter = (c: CommentCursor) =>
  `created_at.lt.${c.createdAt},and(created_at.eq.${c.createdAt},id.lt.${c.id})`;

/**
 * Comments of an event in chronological order (RF-1): the 50 most recent, the
 * page before a comment or everything since one. Null when the event is gone
 * or no longer visible (RF-22). RLS decides again on every write.
 */
export async function listComments(
  supabase: Client,
  eventId: string,
  userId: string,
  options: ListOptions = {},
): Promise<CommentPage | null> {
  const row = await commentRowFor(supabase, eventId);
  if (row === null) return null;
  // An occurrence without its own row has no comments yet (RF-28).
  if (row === undefined) return { comments: [], hasOlder: false };

  const columns = "id, author_id, body, created_at, edited_at";
  let rows;
  let hasOlder: boolean;
  if (options.since) {
    const [page, older] = await Promise.all([
      supabase
        .from("event_comments")
        .select(columns)
        .eq("event_id", row.id)
        .or(after(options.since))
        .order("created_at")
        .order("id"),
      supabase
        .from("event_comments")
        .select("id")
        .eq("event_id", row.id)
        .or(beforeFilter(options.since))
        .limit(1),
    ]);
    if (page.error) throw page.error;
    if (older.error) throw older.error;
    rows = page.data ?? [];
    hasOlder = (older.data ?? []).length > 0;
  } else {
    let query = supabase
      .from("event_comments")
      .select(columns)
      .eq("event_id", row.id);
    if (options.before) query = query.or(beforeFilter(options.before));
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(COMMENTS_PAGE + 1);
    if (error) throw error;
    hasOlder = (data ?? []).length > COMMENTS_PAGE;
    rows = (data ?? []).slice(0, COMMENTS_PAGE).reverse();
  }

  const [members, role] = await Promise.all([
    getMembers(supabase, [row.calendarId]),
    supabase
      .from("calendar_members")
      .select("role")
      .eq("calendar_id", row.calendarId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (role.error) throw role.error;
  const owns = role.data?.role === "owner";

  return {
    comments: rows.map((comment) => ({
      id: comment.id,
      author: authorLabel(comment.author_id, members),
      authorId: comment.author_id,
      body: comment.body,
      createdAt: comment.created_at,
      edited: comment.edited_at !== null,
      // RF-14, RF-16, RF-17: the same rules as the policies.
      canEdit: comment.author_id === userId,
      canDelete: comment.author_id === userId || owns,
    })),
    hasOlder,
  };
}
