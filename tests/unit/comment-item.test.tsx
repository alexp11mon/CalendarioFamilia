import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CommentItem } from "@/components/comments/comment-item";
import { COMMENT_MESSAGES } from "@/lib/comments/error-messages";
import type { CommentView } from "@/lib/comments/queries";

// Spec 014, T6: one comment (RF-2, RF-4, RF-11, RF-14 to RF-17).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

const NOW = Date.parse("2026-11-03T11:00:00Z");
const COMMENT: CommentView = {
  id: "c1",
  author: "Vic",
  authorId: "u1",
  body: "Llego tarde\nguardadme sitio",
  createdAt: "2026-11-03T10:54:59.123456+00:00",
  edited: false,
  canEdit: false,
  canDelete: false,
};

type Handler = (
  id: string,
  body?: string,
) => Promise<{ ok: boolean; error?: string; fieldError?: string }>;

function renderItem(
  comment: Partial<CommentView> = {},
  handlers: {
    onEdit?: Handler;
    onDelete?: Handler;
  } = {},
) {
  const onEdit =
    handlers.onEdit ?? vi.fn<Handler>().mockResolvedValue({ ok: true });
  const onDelete =
    handlers.onDelete ?? vi.fn<Handler>().mockResolvedValue({ ok: true });
  render(
    <ul>
      <CommentItem
        comment={{ ...COMMENT, ...comment }}
        tint="#C0E5ED"
        timeZone="Europe/Madrid"
        now={NOW}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </ul>,
  );
  return { onEdit, onDelete };
}

describe("CommentItem", () => {
  it("shows the author, the text with its line breaks and the time", () => {
    renderItem();
    const item = screen.getByRole("listitem");
    expect(within(item).getByText("Vic")).toBeInTheDocument();
    expect(within(item).getByText(/Llego tarde/)).toHaveClass(
      "whitespace-pre-wrap",
    );
    const time = item.querySelector("time")!;
    expect(time).toHaveAttribute("datetime", COMMENT.createdAt);
    expect(time).toHaveTextContent("hace 5 min");
    expect(time).toHaveTextContent("martes, 3 de noviembre de 2026, 11:54");
    expect(within(item).queryByText("(editado)")).toBeNull();
  });

  it("marks an edited comment", () => {
    renderItem({ edited: true });
    expect(screen.getByText("(editado)")).toBeInTheDocument();
  });

  it("makes https links clickable in a new tab and never reads HTML", () => {
    renderItem({ body: "Mira https://example.com/a <b>hola</b>" });
    const link = screen.getByRole("link", { name: "https://example.com/a" });
    expect(link).toHaveAttribute("href", "https://example.com/a");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/<b>hola<\/b>/)).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
  });

  it("offers Editar and Borrar only with their permission", () => {
    renderItem();
    expect(screen.queryByRole("button", { name: /Editar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Borrar/ })).toBeNull();
  });

  it("the owner may delete but not edit someone else's comment", () => {
    renderItem({ canDelete: true });
    expect(screen.queryByRole("button", { name: /Editar/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Borrar el comentario de Vic" }),
    ).toBeInTheDocument();
  });

  it("edits in place with the rules of the text", async () => {
    const user = userEvent.setup();
    const onEdit = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        fieldError: COMMENT_MESSAGES.empty,
        error: COMMENT_MESSAGES.empty,
      })
      .mockResolvedValueOnce({ ok: true });
    renderItem({ canEdit: true }, { onEdit });

    await user.click(
      screen.getByRole("button", { name: "Editar el comentario de Vic" }),
    );
    const field = screen.getByLabelText("Editar comentario");
    expect(field).toHaveValue(COMMENT.body);
    await user.clear(field);
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText(COMMENT_MESSAGES.empty)).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-describedby");

    await user.type(field, "Ya llego");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onEdit).toHaveBeenLastCalledWith("c1", "Ya llego");
    expect(await screen.findByText(/Llego tarde/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Editar comentario")).toBeNull();
  });

  it("cancels an edit without saving", async () => {
    const user = userEvent.setup();
    const { onEdit } = renderItem({ canEdit: true });
    await user.click(screen.getByRole("button", { name: /Editar/ }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText(/Llego tarde/)).toBeInTheDocument();
  });

  it("asks before deleting", async () => {
    const user = userEvent.setup();
    const { onDelete } = renderItem({ canDelete: true });
    await user.click(
      screen.getByRole("button", { name: "Borrar el comentario de Vic" }),
    );
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Borrar comentario" }));
    expect(onDelete).toHaveBeenCalledWith("c1");
  });

  it("shows why a delete failed", async () => {
    const user = userEvent.setup();
    const onDelete = vi
      .fn()
      .mockResolvedValue({ ok: false, error: COMMENT_MESSAGES.forbidden });
    renderItem({ canDelete: true }, { onDelete });
    await user.click(screen.getByRole("button", { name: /Borrar el/ }));
    await user.click(screen.getByRole("button", { name: "Borrar comentario" }));
    expect(
      await screen.findByText(COMMENT_MESSAGES.forbidden),
    ).toBeInTheDocument();
  });
});
