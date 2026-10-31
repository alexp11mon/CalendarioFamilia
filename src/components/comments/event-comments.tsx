"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  addComment,
  deleteComment,
  editComment,
  loadComments,
  type CommentResult,
} from "@/app/dashboard/events/comment-actions";
import { useEventModal } from "@/components/calendar/event-modal";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { useToast } from "@/components/ui/toast";
import { COMMENT_MESSAGES } from "@/lib/comments/error-messages";
import { COMMENTS_POLL_MS } from "@/lib/comments/limits";
import type { CommentCursor, CommentView } from "@/lib/comments/queries";
import { useNow } from "@/lib/hooks/use-now";
import { PERSON_TINTS, assignTints } from "@/lib/people/avatar";
import { CommentForm } from "./comment-form";
import { CommentItem } from "./comment-item";
import { CommentsSkeleton } from "./comments-skeleton";

const cursorOf = (comment: CommentView): CommentCursor => ({
  createdAt: comment.createdAt,
  id: comment.id,
});

/**
 * "Comentarios" of an event, in its window and on its full page (RF-1). The
 * comments load after the detail opens, so it never waits for them (plan D4).
 */
export function EventComments({
  eventId,
  timeZone,
}: {
  eventId: string;
  timeZone: string;
}) {
  const router = useRouter();
  const modal = useEventModal();
  const { show } = useToast();
  const now = useNow();
  const headingId = useId();
  const [comments, setComments] = useState<CommentView[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [error, setError] = useState<string>();
  const [loadingOlder, setLoadingOlder] = useState(false);
  // What the polling reads without restarting (RF-20, RF-21).
  const current = useRef<CommentView[]>([]);
  const editingId = useRef<string | null>(null);
  const writes = useRef(0);
  const [announcement, setAnnouncement] = useState("");
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    current.current = comments;
  }, [comments]);

  // The event was deleted or left: back to the calendar (casos límite). In a
  // ref, so loading depends on the event only.
  const closeGone = useRef<(message: string) => void>(() => {});
  useEffect(() => {
    closeGone.current = (message) => {
      show(message);
      if (modal) {
        modal.requestClose();
        router.refresh();
      } else {
        router.replace("/dashboard/calendar");
      }
    };
  }, [modal, router, show]);

  /** Takes a whole list (first load, since or after a write). */
  const apply = useCallback((result: CommentResult) => {
    if (result.ok) {
      setComments(result.page.comments);
      setHasOlder(result.page.hasOlder);
      setStatus("ready");
      setError(undefined);
    } else if (result.gone) {
      closeGone.current(result.error);
    }
    return result;
  }, []);

  const loaded = useCallback(
    (result: CommentResult) => {
      if (!result.ok && !result.gone) {
        setStatus("failed");
        setError(result.error);
      }
      apply(result);
    },
    [apply],
  );

  useEffect(() => {
    let live = true;
    loadComments(eventId).then((result) => {
      if (live) loaded(result);
    });
    return () => {
      live = false;
    };
  }, [eventId, loaded]);

  // Every 20 s with the tab visible, and at once on coming back (plan D2).
  // Everything since the oldest loaded comment, to see edits and deletions
  // too (plan D3). Stops when the section unmounts or Activity hides it.
  useEffect(() => {
    let live = true;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      const oldest = current.current[0];
      const started = writes.current;
      const result = await loadComments(
        eventId,
        oldest ? { since: cursorOf(oldest) } : {},
      );
      // A write since then already brought a newer list.
      if (!live || started !== writes.current) return;
      if (!result.ok) {
        if (result.gone) closeGone.current(result.error);
        return;
      }
      const known = new Set(current.current.map((comment) => comment.id));
      const fresh = result.page.comments.filter(
        (comment) => !known.has(comment.id) && !comment.canEdit,
      );
      if (fresh.length > 0) {
        setAnnouncement(
          fresh
            .map((comment) => `Nuevo comentario de ${comment.author}`)
            .join(". "),
        );
      }
      const editing = editingId.current;
      if (editing && !result.page.comments.some((c) => c.id === editing)) {
        editingId.current = null;
        setNotice(COMMENT_MESSAGES.commentGone);
      }
      apply(result);
    }
    const timer = setInterval(poll, COMMENTS_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [apply, eventId]);

  const since = () => (comments[0] ? cursorOf(comments[0]) : undefined);

  /** A write; a poll that started before it is dropped. */
  async function write(run: () => Promise<CommentResult>) {
    writes.current += 1;
    setNotice(undefined);
    return apply(await run());
  }

  async function loadOlder() {
    setLoadingOlder(true);
    const result = await loadComments(eventId, {
      before: cursorOf(comments[0]!),
    });
    setLoadingOlder(false);
    if (result.ok) {
      setComments((current) => [...result.page.comments, ...current]);
      setHasOlder(result.page.hasOlder);
      setError(undefined);
    } else if (result.gone) {
      closeGone.current(result.error);
    } else {
      setError(result.error);
    }
  }

  const tints = assignTints(
    comments.flatMap((comment) => (comment.authorId ? [comment.authorId] : [])),
  );

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 border-t border-line pt-4"
    >
      <h3 id={headingId} className="text-lg font-bold text-ink">
        Comentarios
      </h3>
      {/* New comments of others are heard without moving the focus (RNF accesibilidad). */}
      <p data-testid="comments-live" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {status === "loading" || now === null ? (
        <CommentsSkeleton />
      ) : status === "failed" ? (
        <div className="flex flex-col items-start gap-3">
          <FormAlert message={error} />
          <Button
            variant="secondary"
            onClick={() => {
              setStatus("loading");
              void loadComments(eventId).then(loaded);
            }}
          >
            Reintentar
          </Button>
        </div>
      ) : (
        <>
          {hasOlder ? (
            <Button
              variant="secondary"
              onClick={loadOlder}
              disabled={loadingOlder}
              className="self-start"
            >
              Ver anteriores
            </Button>
          ) : null}
          {comments.length === 0 ? (
            <p className="text-muted">Aún no hay comentarios.</p>
          ) : (
            <ul aria-labelledby={headingId} className="flex flex-col gap-4">
              {comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  tint={
                    (comment.authorId && tints.get(comment.authorId)) ||
                    PERSON_TINTS[0]
                  }
                  timeZone={timeZone}
                  now={now}
                  onEdit={(id, body) =>
                    write(() => editComment(eventId, id, body, since()))
                  }
                  onDelete={(id) =>
                    write(() => deleteComment(eventId, id, since()))
                  }
                  onEditingChange={(editing) => {
                    editingId.current = editing ? comment.id : null;
                  }}
                />
              ))}
            </ul>
          )}
          {error && status === "ready" ? <FormAlert message={error} /> : null}
          <FormAlert message={notice} />
          <CommentForm
            onSend={(body, clientId) =>
              write(() => addComment(eventId, body, clientId, since()))
            }
          />
        </>
      )}
    </section>
  );
}
