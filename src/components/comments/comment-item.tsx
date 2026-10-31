"use client";

import { useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/calendar/confirm-dialog";
import { Avatar } from "@/components/people/avatar";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { TextArea } from "@/components/ui/text-area";
import type { CommentResult } from "@/app/dashboard/events/comment-actions";
import type { CommentView } from "@/lib/comments/queries";
import { fullDateTime, relativeTime } from "@/lib/comments/relative-time";
import type { ConfirmState } from "@/lib/forms/form-state";
import { CommentText } from "./comment-text";

type Outcome = Pick<CommentResult, "ok"> & {
  error?: string;
  fieldError?: string;
};

/** One comment with its author, time and, by permission, edit and delete (RF-2, RF-4, RF-14 to RF-17). */
export function CommentItem({
  comment,
  tint,
  timeZone,
  now,
  onEdit,
  onDelete,
  onEditingChange,
}: {
  comment: CommentView;
  tint: string;
  timeZone: string;
  now: number;
  onEdit: (id: string, body: string) => Promise<Outcome>;
  onDelete: (id: string) => Promise<Outcome>;
  /** The section closes an edit whose comment disappears (RF-21). */
  onEditingChange?: (editing: boolean) => void;
}) {
  const [editing, setEditingState] = useState(false);
  const setEditing = (value: boolean) => {
    setEditingState(value);
    onEditingChange?.(value);
  };
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ field?: string; form?: string }>({});

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = new FormData(event.currentTarget).get("body");
    setPending(true);
    const result = await onEdit(
      comment.id,
      typeof body === "string" ? body : "",
    );
    setPending(false);
    if (result.ok) {
      setEditing(false);
      setError({});
    } else {
      setError(
        result.fieldError
          ? { field: result.fieldError }
          : { form: result.error },
      );
    }
  }

  async function remove(): Promise<ConfirmState> {
    const result = await onDelete(comment.id);
    return result.ok ? { done: "deleted" } : { formError: result.error };
  }

  const full = fullDateTime(comment.createdAt, timeZone);
  return (
    <li className="flex gap-3">
      <Avatar name={comment.author} tint={tint} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold text-ink">{comment.author}</span>
          <time
            dateTime={comment.createdAt}
            title={full}
            className="text-muted tabular-nums"
          >
            {relativeTime(comment.createdAt, new Date(now), timeZone)}
            <span className="sr-only">, {full}</span>
          </time>
          {comment.edited ? (
            <span className="text-muted">(editado)</span>
          ) : null}
        </p>
        {editing ? (
          <form onSubmit={save} noValidate className="flex flex-col gap-2">
            <TextArea
              label="Editar comentario"
              name="body"
              defaultValue={comment.body}
              error={error.field}
              data-autofocus=""
            />
            <FormAlert message={error.form} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                Guardar
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing(false);
                  setError({});
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <CommentText text={comment.body} />
        )}
        {!editing && (comment.canEdit || comment.canDelete) ? (
          <div className="flex flex-wrap gap-2">
            {comment.canEdit ? (
              <Button
                variant="secondary"
                onClick={() => setEditing(true)}
                aria-label={`Editar el comentario de ${comment.author}`}
              >
                Editar
              </Button>
            ) : null}
            {comment.canDelete ? (
              <ConfirmDialog
                triggerLabel="Borrar"
                triggerAriaLabel={`Borrar el comentario de ${comment.author}`}
                title="¿Borrar este comentario?"
                description="Nadie podrá volver a verlo."
                confirmLabel="Borrar comentario"
                action={remove}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
