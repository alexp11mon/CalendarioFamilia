import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  EventDetail,
  type EventDetailData,
} from "@/components/calendar/event-detail";
import type { ConfirmState } from "@/lib/forms/form-state";

// jsdom does not implement the modal methods of <dialog>.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

const EVENT: EventDetailData = {
  id: "e1",
  title: "Matemáticas",
  startsAt: "2026-11-02T07:00:00Z",
  endsAt: "2026-11-02T08:30:00Z",
  allDay: false,
  description: "Álgebra lineal",
  location: "Aula 3",
  color: null,
  calendarName: "Clases Uni",
  calendarColor: "#A0C4FF",
  categoryName: "Clases de la UNI",
  author: "Ana",
};

function setup(
  overrides: Partial<React.ComponentProps<typeof EventDetail>> = {},
) {
  const remove = vi.fn<
    (prev: ConfirmState, formData: FormData) => Promise<ConfirmState>
  >(async () => ({}));
  render(
    <EventDetail
      event={EVENT}
      timeZone="Europe/Madrid"
      canEdit
      deleteAction={remove}
      {...overrides}
    />,
  );
  return remove;
}

describe("EventDetail (RF-34, RF-36)", () => {
  it("shows title, dates, description, place, category and calendar", () => {
    setup();

    expect(
      screen.getByRole("heading", { name: "Matemáticas" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/lunes, 2 de noviembre de 2026/)).toHaveTextContent(
      "08:00 – 09:30",
    );
    expect(screen.getByText("Álgebra lineal")).toBeInTheDocument();
    expect(screen.getByText("Aula 3")).toBeInTheDocument();
    expect(screen.getByText("Clases de la UNI")).toBeInTheDocument();
    expect(screen.getByText("Clases Uni")).toBeInTheDocument();
  });

  it("shows the times in the zone of the profile (RF-34)", () => {
    setup({ timeZone: "America/New_York" });

    expect(screen.getByText(/lunes, 2 de noviembre de 2026/)).toHaveTextContent(
      "02:00 – 03:30",
    );
  });

  it("shows both days when the event crosses midnight", () => {
    setup({
      event: {
        ...EVENT,
        startsAt: "2026-11-02T22:00:00Z",
        endsAt: "2026-11-03T01:00:00Z",
      },
    });

    const when = screen.getByTestId("event-when");
    expect(when).toHaveTextContent("lunes, 2 de noviembre de 2026");
    expect(when).toHaveTextContent("23:00");
    expect(when).toHaveTextContent("martes, 3 de noviembre de 2026");
    expect(when).toHaveTextContent("02:00");
  });

  it("shows all-day events by date without hours, whatever the zone (RF-20)", () => {
    setup({
      timeZone: "America/New_York",
      event: {
        ...EVENT,
        allDay: true,
        startsAt: "2026-12-24T00:00:00Z",
        endsAt: "2026-12-27T00:00:00Z",
      },
    });

    const when = screen.getByTestId("event-when");
    expect(when).toHaveTextContent("jueves, 24 de diciembre de 2026");
    expect(when).toHaveTextContent("sábado, 26 de diciembre de 2026");
    expect(when).not.toHaveTextContent(/\d{2}:\d{2}/);
  });

  it("omits what the event does not have", () => {
    setup({
      event: {
        ...EVENT,
        description: null,
        location: null,
        categoryName: null,
      },
    });

    expect(screen.queryByText("Aula 3")).not.toBeInTheDocument();
    expect(screen.getByText("Sin categoría")).toBeInTheDocument();
  });

  it("uses the event's own color or else the calendar's (RF-17)", () => {
    const { rerender } = render(
      <EventDetail
        event={EVENT}
        timeZone="Europe/Madrid"
        canEdit={false}
        deleteAction={async () => ({})}
      />,
    );
    const colors = () =>
      screen
        .getAllByTestId("event-color")
        .map((el) => el.style.backgroundColor);
    expect(colors().at(-1)).toBe("rgb(160, 196, 255)");

    rerender(
      <EventDetail
        event={{ ...EVENT, color: "#FFADAD" }}
        timeZone="Europe/Madrid"
        canEdit={false}
        deleteAction={async () => ({})}
      />,
    );
    expect(colors().at(-1)).toBe("rgb(255, 173, 173)");
  });
});

describe("EventDetail permissions and deletion (RF-23, RF-24, RF-26)", () => {
  it("gives viewers no buttons or links", () => {
    setup({ canEdit: false });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("deletes at once, without asking, and hands over the undo (spec 017 RF-31)", async () => {
    const user = userEvent.setup();
    const undo = { kind: "restore" as const, trashId: "t1" };
    const onDeleted = vi.fn();
    const remove = vi.fn(async () => ({ done: "deleted" as const, undo }));
    setup({ deleteAction: remove, onDeleted });

    await user.click(screen.getByRole("button", { name: "Borrar evento" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(onDeleted).toHaveBeenCalledWith("deleted", undo),
    );
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("shows who created the event (spec 006 RF-34)", () => {
    render(
      <EventDetail
        event={EVENT}
        timeZone="Europe/Madrid"
        canEdit={false}
        deleteAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Creado por")).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
  });

  it("shows Cuenta borrada for a deleted account (spec 006 RF-35)", () => {
    render(
      <EventDetail
        event={{ ...EVENT, author: "Cuenta borrada" }}
        timeZone="Europe/Madrid"
        canEdit={false}
        deleteAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Cuenta borrada")).toBeInTheDocument();
  });
});

// Spec 013 RF-10, RF-16: the detail of an occurrence names its rule.
describe("EventDetail of a series", () => {
  it("shows the summary of the rule", () => {
    setup({
      event: {
        ...EVENT,
        repeat: {
          summary: "Cada semana el lunes",
          changed: false,
          limitReached: false,
        },
      },
    });
    expect(screen.getByText("Se repite")).toBeInTheDocument();
    expect(screen.getByText("Cada semana el lunes")).toBeInTheDocument();
    expect(
      screen.queryByText("Cambiado solo en este evento"),
    ).not.toBeInTheDocument();
  });

  it("says when this occurrence was changed on its own", () => {
    setup({
      event: {
        ...EVENT,
        repeat: {
          summary: "Cada semana el lunes",
          changed: true,
          limitReached: false,
        },
      },
    });
    expect(
      screen.getByText("Cambiado solo en este evento"),
    ).toBeInTheDocument();
  });

  it("a single event has no repetition row", () => {
    setup();
    expect(screen.queryByText("Se repite")).not.toBeInTheDocument();
  });
});

// Spec 013, T13: deleting an occurrence asks the scope (RF-20, RF-24b).
describe("EventDetail deleting an occurrence", () => {
  const OCCURRENCE = {
    ...EVENT,
    repeat: {
      summary: "Cada semana el lunes",
      changed: false,
      limitReached: false,
    },
  };

  it("asks the scope and sends it", async () => {
    const user = userEvent.setup();
    const remove = setup({ event: OCCURRENCE });
    await user.click(screen.getByRole("button", { name: "Borrar evento" }));
    expect(
      screen.getByRole("dialog", { name: "Borrar evento repetido" }),
    ).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Este y los siguientes" }),
    );
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls[0]![1].get("scope")).toBe("following");
  });

  it("warns of the images that go before deleting them (RF-24b)", async () => {
    const user = userEvent.setup();
    const remove = setup({ event: OCCURRENCE });
    remove.mockImplementation(async (_prev: ConfirmState, data: FormData) =>
      data.get("confirmLoss") === "1"
        ? { formError: "hecho" }
        : { loss: { exceptions: 0, images: 2 } },
    );
    await user.click(screen.getByRole("button", { name: "Borrar evento" }));
    await user.click(screen.getByRole("button", { name: "Solo este evento" }));
    await screen.findByText("Se perderán 2 imágenes.");
    await user.click(screen.getByRole("button", { name: "Borrar igualmente" }));
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove.mock.calls[1]![1].get("confirmLoss")).toBe("1");
    expect(remove.mock.calls[1]![1].get("scope")).toBe("this");
  });
});
