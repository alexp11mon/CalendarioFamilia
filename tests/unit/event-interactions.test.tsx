import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EventInteractionsProvider,
  useEventInteractions,
  useEventInteractionsState,
} from "@/components/calendar/event-interactions";
import { ToastProvider } from "@/components/ui/toast";
import type { CalendarEventItem } from "@/lib/calendar/layout";

// Spec 017, T6: the calendar applies changes made without the form (plan
// workspace-interactions, D10; RF-1, RF-2, RF-4, RF-18, RF-21).
const h = vi.hoisted(() => ({
  quickChange: vi.fn(),
  deleteForUndo: vi.fn(),
  undoAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/app/dashboard/events/quick-actions", () => ({
  quickChange: h.quickChange,
  deleteForUndo: h.deleteForUndo,
  undoAction: h.undoAction,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: h.refresh }),
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

const SINGLE: CalendarEventItem = {
  id: "e1",
  title: "Cena",
  startsAt: "2026-11-03T09:00:00.000Z",
  endsAt: "2026-11-03T10:00:00.000Z",
  allDay: false,
  calendarId: "mine",
  categoryId: null,
  color: "#FFADAD",
};
const OCCURRENCE: CalendarEventItem = {
  ...SINGLE,
  id: "s1_20261103T090000Z",
  title: "Clase",
  seriesId: "s1",
};
const READ_ONLY: CalendarEventItem = {
  ...SINGLE,
  id: "e2",
  title: "Ajeno",
  calendarId: "theirs",
};
const LATER = {
  kind: "times" as const,
  startsAt: "2026-11-03T11:00:00.000Z",
  endsAt: "2026-11-03T12:00:00.000Z",
  allDay: false,
};

function Probe() {
  const api = useEventInteractions()!;
  return (
    <div>
      <p data-testid="dragging">{String(api.dragging)}</p>
      <p data-testid="editable">
        {[SINGLE, READ_ONLY]
          .filter(api.canEdit)
          .map((e) => e.title)
          .join()}
      </p>
      <button type="button" onClick={() => api.change(SINGLE, LATER, "moved")}>
        Mover
      </button>
      <button
        type="button"
        onClick={() => api.change(OCCURRENCE, LATER, "moved")}
      >
        Mover repetición
      </button>
      <button
        type="button"
        onClick={() =>
          api.change(SINGLE, { kind: "color", color: null }, "color")
        }
      >
        Color
      </button>
      <button type="button" onClick={() => api.remove(SINGLE)}>
        Borrar
      </button>
      <button type="button" onClick={() => api.setDragging(true)}>
        Arrastrar
      </button>
    </div>
  );
}

function Harness({ events }: { events: CalendarEventItem[] }) {
  const state = useEventInteractionsState({
    events,
    editableCalendarIds: new Set(["mine"]),
    calendarColors: new Map([["mine", "#A0C4FF"]]),
    timeZone: "Europe/Madrid",
  });
  return (
    <EventInteractionsProvider value={state.api}>
      <ul>
        {state.events.map((event) => (
          <li key={event.id} data-testid={event.id}>
            {event.startsAt} {event.color}
          </li>
        ))}
      </ul>
      <Probe />
      {state.dialog}
    </EventInteractionsProvider>
  );
}

function setup(events = [SINGLE, OCCURRENCE, READ_ONLY]) {
  const view = render(
    <ToastProvider>
      <Harness events={events} />
    </ToastProvider>,
  );
  return {
    ...view,
    rerenderWith: (next: CalendarEventItem[]) =>
      view.rerender(
        <ToastProvider>
          <Harness events={next} />
        </ToastProvider>,
      ),
  };
}

beforeEach(() => {
  h.quickChange.mockReset();
  h.deleteForUndo.mockReset();
  h.refresh.mockReset();
});

describe("useEventInteractionsState", () => {
  it("only the calendars the user can write to are editable (RF-1, RF-2)", () => {
    setup();
    expect(screen.getByTestId("editable")).toHaveTextContent(/^Cena$/);
  });

  it("moves the event at once and saves it (RF-18)", async () => {
    let finish: (value: unknown) => void = () => {};
    h.quickChange.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Mover" }));

    expect(screen.getByTestId("e1")).toHaveTextContent(LATER.startsAt);
    expect(h.quickChange).toHaveBeenCalledWith("e1", LATER, {});

    await act(async () =>
      finish({
        ok: true,
        id: "e1",
        undo: {
          kind: "change",
          id: "e1",
          before: LATER,
          updatedAt: "x",
          series: false,
        },
      }),
    );
    expect(await screen.findByText("Evento movido")).toBeVisible();
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeVisible();
    expect(h.refresh).toHaveBeenCalled();
  });

  it("goes back to its place with the reason when saving fails (RF-4)", async () => {
    h.quickChange.mockResolvedValue({
      ok: false,
      error: "Google no responde.",
    });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Mover" }));

    expect(await screen.findByText("Google no responde.")).toBeVisible();
    expect(screen.getByTestId("e1")).toHaveTextContent(SINGLE.startsAt);
  });

  it("server data replaces a saved change", async () => {
    h.quickChange.mockResolvedValue({ ok: true, id: "e1" });
    const { rerenderWith } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Mover" }));
    await screen.findByText("Evento movido");

    const fresh = { ...SINGLE, startsAt: "2026-11-03T15:00:00.000Z" };
    rerenderWith([fresh, OCCURRENCE, READ_ONLY]);
    expect(screen.getByTestId("e1")).toHaveTextContent(fresh.startsAt);
  });

  it("the calendar's color comes back with null (RF-37)", async () => {
    h.quickChange.mockReturnValue(new Promise(() => {}));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Color" }));
    expect(screen.getByTestId("e1")).toHaveTextContent("#A0C4FF");
  });

  it("deleting hides it at once and offers Deshacer (RF-25)", async () => {
    h.deleteForUndo.mockResolvedValue({
      ok: true,
      id: "e1",
      undo: { kind: "restore", trashId: "t1" },
    });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Borrar" }));

    expect(screen.queryByTestId("e1")).toBeNull();
    expect(await screen.findByText("Evento borrado")).toBeVisible();
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeVisible();
  });

  it("an occurrence asks the scope; cancelling puts it back (plan D10)", async () => {
    setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Mover repetición" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Guardar evento repetido",
    });
    expect(dialog).toBeVisible();
    expect(screen.getByTestId(OCCURRENCE.id)).toHaveTextContent(LATER.startsAt);

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(h.quickChange).not.toHaveBeenCalled();
    expect(screen.getByTestId(OCCURRENCE.id)).toHaveTextContent(
      OCCURRENCE.startsAt,
    );
  });

  it("an occurrence sends the chosen scope and confirms losses", async () => {
    h.quickChange
      .mockResolvedValueOnce({
        ok: false,
        error: "",
        loss: { exceptions: 2, images: 0, comments: 0 },
      })
      .mockResolvedValueOnce({ ok: true, id: "s1" });
    setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Mover repetición" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Este y los siguientes" }),
    );
    expect(h.quickChange).toHaveBeenLastCalledWith(OCCURRENCE.id, LATER, {
      scope: "following",
    });

    expect(await screen.findByText("Se perderán 2 cambios.")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Guardar igualmente" }),
    );
    await waitFor(() =>
      expect(h.quickChange).toHaveBeenLastCalledWith(OCCURRENCE.id, LATER, {
        scope: "following",
        confirmLoss: true,
      }),
    );
    expect(await screen.findByText("Evento movido")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
  });

  it("tells whether a drag is on (RF-21)", async () => {
    setup();
    expect(screen.getByTestId("dragging")).toHaveTextContent("false");
    await userEvent.click(screen.getByRole("button", { name: "Arrastrar" }));
    expect(screen.getByTestId("dragging")).toHaveTextContent("true");
  });
});
