"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionUser } from "@/lib/calendar/queries";
import {
  COMMENT_MESSAGES,
  getCommentErrorMessage,
} from "@/lib/comments/error-messages";
import {
  commentRowFor,
  listComments,
  type CommentCursor,
  type CommentPage,
  type ListOptions,
} from "@/lib/comments/queries";
import { commentBodySchema } from "@/lib/comments/schemas";
import { parseEventId } from "@/lib/recurrence/occurrence-id";
import { materializeOccurrence } from "./image-actions";

// Spec 014, plan "Contratos": the comments section loads and writes through
// these; RLS decides every permission (plan D1). They never redirect: the
// section shows the result in place.

export type CommentResult =
  | { ok: true; page: CommentPage }
  | { ok: false; error: string; gone?: true; fieldError?: string };

const idSchema = z.uuid();
const cursorSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});
const optionsSchema = z
  .object({ before: cursorSchema, since: cursorSchema })
  .partial();

const GONE = {
  ok: false,
  gone: true,
  error: COMMENT_MESSAGES.gone,
} as const;

function failure(error: unknown): CommentResult {
  const message = getCommentErrorMessage(error);
  return message === COMMENT_MESSAGES.gone
    ? GONE
    : { ok: false, error: message };
}

/** Validates the text; the error goes next to the field (RF-10). */
function readBody(body: string): { body: string } | CommentResult {
  const parsed = commentBodySchema.safeParse(body);
  if (parsed.success) return { body: parsed.data };
  const message = parsed.error.issues[0].message;
  return { ok: false, fieldError: message, error: message };
}

/** The comments of an event, a page before a comment or everything since one. */
export async function loadComments(
  eventId: string,
  options: ListOptions = {},
): Promise<CommentResult> {
  if (!parseEventId(eventId)) return GONE;
  const parsed = optionsSchema.safeParse(options);
  if (!parsed.success) return { ok: false, error: COMMENT_MESSAGES.connection };
  try {
    const { supabase, userId } = await requireActionUser();
    const page = await listComments(supabase, eventId, userId, parsed.data);
    return page ? { ok: true, page } : GONE;
  } catch (error) {
    return failure(error);
  }
}

/** After a write, the list as the section shows it: since its oldest comment. */
function reload(eventId: string, since?: CommentCursor) {
  return loadComments(eventId, since ? { since } : {});
}

/**
 * The row that holds the comments of an id: an occurrence without its own row
 * gets one first, as for images (RF-28, plan D5).
 */
async function rowToComment(eventId: string): Promise<string | CommentResult> {
  const parsed = parseEventId(eventId);
  if (!parsed) return GONE;
  if (parsed.kind === "event") return parsed.id;
  const { supabase } = await requireActionUser();
  const row = await commentRowFor(supabase, eventId);
  if (row === null) return GONE;
  if (row) return row.id;
  const created = await materializeOccurrence(eventId);
  return "error" in created ? GONE : created.eventId;
}

/** Saves a comment once per client id: a double send is one comment (D8). */
export async function addComment(
  eventId: string,
  body: string,
  clientId: string,
  since?: CommentCursor,
): Promise<CommentResult> {
  if (!parseEventId(eventId) || !idSchema.safeParse(clientId).success) {
    return GONE;
  }
  const text = readBody(body);
  if ("ok" in text) return text;
  try {
    const row = await rowToComment(eventId);
    if (typeof row !== "string") return row;
    const { supabase } = await requireActionUser();
    const { error } = await supabase
      .from("event_comments")
      .insert({ event_id: row, body: text.body, client_id: clientId });
    if (error && error.code !== "23505") return failure(error);
  } catch (error) {
    return failure(error);
  }
  // The count of the views (RF-5).
  revalidatePath("/dashboard", "layout");
  return reload(eventId, since);
}

/** 0 rows: RLS hides the comment (gone) or refuses the change (RF-17). */
async function explainNoRows(commentId: string): Promise<CommentResult> {
  const { supabase } = await requireActionUser();
  const { data } = await supabase
    .from("event_comments")
    .select("id")
    .eq("id", commentId)
    .maybeSingle();
  return {
    ok: false,
    error: data ? COMMENT_MESSAGES.forbidden : COMMENT_MESSAGES.commentGone,
  };
}

/** Only the author edits (RF-14, RF-17). */
export async function editComment(
  eventId: string,
  commentId: string,
  body: string,
  since?: CommentCursor,
): Promise<CommentResult> {
  if (!parseEventId(eventId) || !idSchema.safeParse(commentId).success) {
    return { ok: false, error: COMMENT_MESSAGES.commentGone };
  }
  const text = readBody(body);
  if ("ok" in text) return text;
  try {
    const { supabase } = await requireActionUser();
    const { data, error } = await supabase
      .from("event_comments")
      .update({ body: text.body })
      .eq("id", commentId)
      .select("id");
    if (error) return failure(error);
    if (!data || data.length === 0) return explainNoRows(commentId);
  } catch (error) {
    return failure(error);
  }
  return reload(eventId, since);
}

/** The author or the calendar's owner deletes (RF-15, RF-16). */
export async function deleteComment(
  eventId: string,
  commentId: string,
  since?: CommentCursor,
): Promise<CommentResult> {
  if (!parseEventId(eventId) || !idSchema.safeParse(commentId).success) {
    return { ok: false, error: COMMENT_MESSAGES.commentGone };
  }
  try {
    const { supabase } = await requireActionUser();
    const { data, error } = await supabase
      .from("event_comments")
      .delete()
      .eq("id", commentId)
      .select("id");
    if (error) return failure(error);
    if (!data || data.length === 0) return explainNoRows(commentId);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/dashboard", "layout");
  return reload(eventId, since);
}
