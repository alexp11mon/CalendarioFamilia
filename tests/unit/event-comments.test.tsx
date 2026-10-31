import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventComments } from "@/components/comments/event-comments";
import { COMMENT_MESSAGES } from "@/lib/comments/error-messages";
import type { CommentPage, CommentView } from "@/lib/comments/queries";

// Spec 014, T8: the "Comentarios" section of the detail (RF-1, RF-6 to RF-8).
const h = vi.hoisted(() => ({
  loadComments: vi.fn(),
  addComment: vi.fn(),
  editComment: vi.fn(),
  deleteComment: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  show: vi.fn(),
  modal: null as null | { requestClose: () => void },
}));

vi.mock("@/app/dashboard/events/comment-actions", () => ({
  loadComments: h.loadComments,
  addComment: h.addComment,
  editComment: h.editComment,
  deleteComment: h.deleteComment,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: h.back, replace: h.replace, refresh: h.refresh }),
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ show: h.show }),
}));
vi.mock("@/components/calendar/event-modal", () => ({
  useEventModal: () => h.modal,
}));

const EVENT = "5b8f6c2e-3f0a-4d8e-9a51-2a8f1d7c9e10";

function comment(n: number, extra: Partial<CommentView> = {}): CommentView {
  return {
    id: `c${n}`,
    author: "Vic",
    authorId: "u1",
    body: `Comentario ${n}`,
    createdAt: `2026-10-31T10:${String(n).padStart(2, "0")}:00+00:00`,
    edited: false,
    canEdit: false,
    canDelete: false,
    ...extra,
  };
}

function page(comments: CommentView[], hasOlder = false) {
  return { ok: true, page: { comments, hasOlder } satisfies CommentPage };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function bodies() {
  return within(screen.getByRole("list", { name: "Comentarios" }))
    .getAllByRole("listitem")
    .map((item) => within(item).getByText(/^Comentario|^Nuevo/).textContent);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.modal = null;
});

describe("EventComments", () => {
  it("shows a skeleton while loading, then the comments in order", async () => {
    const load = deferred<ReturnType<typeof page>>();
    h.loadComments.mockReturnValue(load.promise);
    render(<EventComments eventId={EVENT} timeZone="Europe/Madrid" />);
    expect(
      screen.getByRole("status", { name: "Cargando comentarios…" }),
    ).toBeInTheDocument();
    expect(h.loadComments).toHaveBeenCalledWith(EVENT);

    await act(async () => load.resolve(page([comment(1), comment(2)])));
    expect(bodies()).toEqual(["Comentario 1", "Comentario 2"]);
    expect(
      screen.getByRole("heading", { name: "Comentarios" }),
    ).toBeInTheDocument();
  });

  it("says there are no comments yet", async () => {
    h.loadComments.mockResolvedValue(page([]));
    render(<EventComments eventId={EVENT} timeZone="Europe/Madrid" />);
    expect(await screen.findByText("Aún no hay comentarios.")).toBeVisible();
    expect(screen.getByLabelText("Escribe un comentario")).toBeInTheDocument();
  });

  it("loads the older ones above", async () => {
    const user = userEvent.setup();
    h.loadComments
      .mockResolvedValueOnce(page([comment(3), comment(4)], true))
      .mockResolvedValueOnce(page([comment(1), comment(2)], false));
    render(<EventComments eventId={EVENT} timeZone="Europe/Madrid" />);
    await user.click(
      await screen.findByRole("button", { name: "Ver anteriores" }),
    );
    expect(h.loadComments).toHaveBeenLastCalledWith(EVENT, {
      before: { createdAt: comment(3).createdAt, id: "c3" },
    });
    expect(bodies()).toEqual([
      "Comentario 1",
      "Comentario 2",
      "Comentario 3",
      "Comentario 4",
    ]);
    expect(screen.queryByRole("button", { name: "Ver anteriores" })).toBeNull();
  });

  it("adds a new comment at the end and empties the field", async () => {
    const user = userEvent.setup();
    h.loadComments.mockResolvedValue(page([comment(1)]));
    h.addComment.mockResolvedValue(
      page([comment(1), comment(2, { body: "Nuevo" })]),
    );
    render(<EventComments eventId={EVENT} timeZone="Europe/Madrid" />);
    const field = await screen.findByLabelText("Escribe un comentario");
    await user.type(field, "Nuevo");
    await user.click(screen.getByRole("button", { name: "Comentar" }));
    expect(h.addComment).toHaveBeenCalledWith(
      EVENT,
      "Nuevo",
      expect.any(String),
      { createdAt: comment(1).createdAt, id: "c1" },
    );
    expect(bodies()).toEqual(["Comentario 1", "Nuevo"]);
    expect(field).toHaveValue("");
  });

  it("edits and deletes through the actions with the oldest comment", async () => {
    const user = userEvent.setup();
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
    const mine = comment(1, { canEdit: true, canDelete: true });
    h.loadComments.mockResolvedValue(page([mine, comment(2)]));
    h.deleteComment.mockResolvedValue(page([comment(2)]));
    render(<EventComments eventId={EVENT} timeZone="Europe/Madrid" />);
    await user.click(
      await screen.findByRole("button", {
        name: "Borrar el comentario de Vic",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Borrar comentario" }));
    expect(h.deleteComment).toHaveBeenCalledWith(EVENT, "c1", {
      createdAt: mine.createdAt,
      id: "c1",
    });
    expect(bodies()).toEqual(["Comentario 2"]);
  });

  it("shows a failed load with Reintentar", async () => {
    const user = userEvent.setup();
    h.loadComments
      .mockResolvedValueOnce({ ok: false, error: COMMENT_MESSAGES.connection })
      .mockResolvedValueOnce(page([comment(1)]));
    render(<EventComments eventId={EVENT} timeZone="Europe/Madrid" />);
    expect(
      await screen.findByText(COMMENT_MESSAGES.connection),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Comentario 1")).toBeInTheDocument();
  });

  it("closes the window when the event is gone", async () => {
    h.modal = { requestClose: vi.fn() };
    h.loadComments.mockResolvedValue({
      ok: false,
      gone: true,
      error: COMMENT_MESSAGES.gone,
    });
    render(<EventComments eventId={EVENT} timeZone="Europe/Madrid" />);
    await vi.waitFor(() => expect(h.modal!.requestClose).toHaveBeenCalled());
    expect(h.show).toHaveBeenCalledWith(COMMENT_MESSAGES.gone);
    expect(h.refresh).toHaveBeenCalled();
  });

  it("leaves the full page for the calendar when the event is gone", async () => {
    h.loadComments.mockResolvedValue(page([]));
    h.addComment.mockResolvedValue({
      ok: false,
      gone: true,
      error: COMMENT_MESSAGES.gone,
    });
    const user = userEvent.setup();
    render(<EventComments eventId={EVENT} timeZone="Europe/Madrid" />);
    await user.type(
      await screen.findByLabelText("Escribe un comentario"),
      "Hola",
    );
    await user.click(screen.getByRole("button", { name: "Comentar" }));
    expect(h.replace).toHaveBeenCalledWith("/dashboard/calendar");
    expect(h.show).toHaveBeenCalledWith(COMMENT_MESSAGES.gone);
  });
});
