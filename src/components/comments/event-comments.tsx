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

  const since = () => (comments[0] ? cursorOf(comments[0]) : undefined);

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
                  onEdit={async (id, body) =>
                    apply(await editComment(eventId, id, body, since()))
                  }
                  onDelete={async (id) =>
                    apply(await deleteComment(eventId, id, since()))
                  }
                />
              ))}
            </ul>
          )}
          {error && status === "ready" ? <FormAlert message={error} /> : null}
          <CommentForm
            onSend={async (body, clientId) =>
              apply(await addComment(eventId, body, clientId, since()))
            }
          />
        </>
      )}
    </section>
  );
}
