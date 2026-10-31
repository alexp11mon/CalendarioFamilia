"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { TextArea } from "@/components/ui/text-area";
import {
  COMMENT_COUNTER_FROM,
  MAX_COMMENT_LENGTH,
  formatCount,
} from "@/lib/comments/limits";
import { commentBodySchema } from "@/lib/comments/schemas";

type Outcome = { ok: boolean; error?: string; fieldError?: string };

/** Field and "Comentar" for any member, viewers included (RF-7 to RF-10, RF-12). */
export function CommentForm({
  onSend,
}: {
  onSend: (body: string, clientId: string) => Promise<Outcome>;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ field?: string; form?: string }>({});
  // A retry of the same text keeps its id, so a send that did arrive is not
  // saved twice (plan D8); a different text is a different comment.
  const sent = useRef<{ text: string; clientId: string } | null>(null);
  const busy = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const parsed = commentBodySchema.safeParse(text);
    if (!parsed.success) {
      setError({ field: parsed.error.issues[0].message });
      return;
    }
    if (sent.current?.text !== text) {
      sent.current = { text, clientId: crypto.randomUUID() };
    }
    busy.current = true;
    setPending(true);
    const result = await onSend(text, sent.current.clientId);
    busy.current = false;
    setPending(false);
    if (result.ok) {
      setText("");
      setError({});
      sent.current = null;
    } else {
      setError(
        result.fieldError
          ? { field: result.fieldError }
          : { form: result.error },
      );
    }
  }

  function sendWithShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const length = [...text].length;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <TextArea
        label="Escribe un comentario"
        name="body"
        rows={2}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={sendWithShortcut}
        error={error.field}
      />
      <FormAlert message={error.form} />
      <div className="flex items-center justify-end gap-3">
        {length >= COMMENT_COUNTER_FROM ? (
          <span className="text-sm text-muted tabular-nums">
            {formatCount(length)} / {formatCount(MAX_COMMENT_LENGTH)}
          </span>
        ) : null}
        <Button type="submit" disabled={pending}>
          Comentar
        </Button>
      </div>
    </form>
  );
}
