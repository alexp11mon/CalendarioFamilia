import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventDetailData } from "@/components/calendar/event-detail";
import type { EventFormValues } from "@/components/calendar/event-form";
import { EventModal } from "@/components/calendar/event-modal";
import { EventPanel } from "@/components/calendar/event-panel";
import { ToastProvider } from "@/components/ui/toast";
import type { ConfirmState } from "@/lib/forms/form-state";

// Spec 008, T6: the event detail with Editar, Duplicar and Borrar (RF-2, RF-3, RF-35, RF-36).
const router = vi.hoisted(() => ({ back: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// Spec 014: the comments section loads through its actions.
const comments = vi.hoisted(() => ({
  loadComments: vi.fn(async () => ({
    ok: true,
    page: { comments: [], hasOlder: false },
  })),
}));
vi.mock("@/app/dashboard/events/comment-actions", () => comments);

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

beforeEach(() => {
  router.back.mockClear();
  router.refresh.mockClear();
});

const DETAIL: EventDetailData = {
  id: "ev-1",
  title: "Cena familiar",
  startsAt: "2026-10-23T19:00:00Z",
  endsAt: "2026-10-23T20:00:00Z",
  allDay: false,
  description: null,
  location: "Casa",
  color: null,
  calendarName: "Familia",
  calendarColor: "#A0C4FF",
  categoryName: null,
  author: "Ana",
};

const EDIT: EventFormValues = {
  title: "Cena familiar",
  calendarId: "cal-a",
  allDay: "",
  startDate: "2026-10-23",
  startTime: "21:00",
  endDate: "2026-10-23",
  endTime: "22:00",
  description: "",
  location: "Casa",
  color: "",
  categoryId: "",
  repeat: "none",
};

function setup({
  canAttach = false,
  canEdit = true,
  deleteAction = vi.fn(async (): Promise<ConfirmState> => ({})),
  inWindow = false,
} = {}) {
  const panel = (
    <EventPanel
      detail={DETAIL}
      timeZone="Europe/Madrid"
      canEdit={canEdit}
      canAttach={canAttach}
      editInitial={EDIT}
      calendars={[{ id: "cal-a", name: "Familia", color: "#A0C4FF" }]}
      categories={[]}
      updateAction={vi.fn(async () => ({ values: EDIT }))}
      deleteAction={deleteAction}
    />
  );
  render(
    <ToastProvider>
      {inWindow ? (
        <EventModal title="Cena familiar">{panel}</EventModal>
      ) : (
        panel
      )}
    </ToastProvider>,
  );
  return { deleteAction };
}

describe("EventPanel", () => {
  it("offers Editar, Duplicar and Borrar to whoever can write", () => {
    setup();

    expect(screen.getByRole("button", { name: "Editar" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Duplicar" })).toHaveAttribute(
      "href",
      "/dashboard/events/new?from=ev-1",
    );
    expect(screen.getByRole("button", { name: "Borrar evento" })).toBeVisible();
  });

  it("offers none of them to a reader (RF-36)", () => {
    setup({ canEdit: false });

    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Duplicar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Borrar evento" })).toBeNull();
    expect(screen.getByText("Cena familiar")).toBeVisible();
  });

  it("switches to the form in the same place and back (RF-3)", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByLabelText("Título")).toHaveValue("Cena familiar");
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: "Volver al detalle" }),
    );
    expect(screen.queryByLabelText("Título")).toBeNull();
  });

  it("closes the window and says so after deleting there", async () => {
    setup({
      inWindow: true,
      deleteAction: vi.fn(async (): Promise<ConfirmState> => ({
        done: "deleted",
        undo: { kind: "restore", trashId: "t1" },
      })),
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Borrar evento" }),
    );

    // Spec 017 RF-25, RF-31: no confirmation, and "Deshacer" in the notice.
    expect(await screen.findByText("Evento borrado")).toBeVisible();
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeVisible();
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  // Spec 012, T9: any member adds images, readers included (RF-1, RF-4).
  it("offers Añadir imágenes to a reader who can attach", () => {
    setup({ canEdit: false, canAttach: true });
    expect(
      screen.getByRole("button", { name: "Añadir imágenes" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
  });

  it("offers no Añadir imágenes without canAttach", () => {
    setup();
    expect(
      screen.queryByRole("button", { name: "Añadir imágenes" }),
    ).toBeNull();
  });

  it("shows the comments in the window and on the page, also to viewers (spec 014 RF-1, RF-7)", async () => {
    setup({ canEdit: false, inWindow: true });
    expect(
      await screen.findByRole("heading", { name: "Comentarios" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByLabelText("Escribe un comentario"),
    ).toBeInTheDocument();
    expect(comments.loadComments).toHaveBeenCalledWith("ev-1");
  });

  it("shows the comments on the full page", async () => {
    setup({ canEdit: false });
    expect(
      await screen.findByRole("heading", { name: "Comentarios" }),
    ).toBeInTheDocument();
  });
});
