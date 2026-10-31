import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventBlock } from "@/components/calendar/event-block";
import type { CalendarEventItem } from "@/lib/calendar/layout";

// Spec 016 RF-1..RF-5, RF-41, RF-54..RF-56: every event is a filled block.
const TZ = "Europe/Madrid";

const EVENT: CalendarEventItem = {
  id: "e1",
  title: "Examen de Electrónica",
  startsAt: "2026-11-06T10:15:00Z",
  endsAt: "2026-11-06T13:15:00Z",
  allDay: false,
  color: "#FFADAD",
  calendarId: "cal",
  categoryId: null,
  location: "4D - AULA 1.3",
  imageCount: 2,
};

function link() {
  return screen.getByRole("link");
}

describe("EventBlock", () => {
  it.each(["line", "grid", "card"] as const)(
    "fills the %s block with the event color and links to its detail",
    (shape) => {
      render(<EventBlock event={EVENT} timeZone={TZ} shape={shape} />);

      expect(link()).toHaveAttribute("href", "/dashboard/events/e1");
      expect(link()).toHaveStyle({ backgroundColor: "#FFADAD" });
      expect(link()).toHaveClass("text-pastel-ink");
      expect(screen.getByText("Examen de Electrónica")).toHaveClass(
        "font-bold",
      );
      expect(link()).toHaveTextContent("Con imágenes");
    },
  );

  it("keeps the month line to the title, with the hour only for screen readers", () => {
    render(<EventBlock event={EVENT} timeZone={TZ} shape="line" />);

    expect(link()).toHaveClass("truncate");
    expect(screen.getByText("11:15,")).toHaveClass("sr-only");
    expect(screen.queryByText("4D - AULA 1.3")).not.toBeInTheDocument();
  });

  it("shows the place under the title in the hour grid", () => {
    render(<EventBlock event={EVENT} timeZone={TZ} shape="grid" />);

    expect(screen.getByText("4D - AULA 1.3")).toBeInTheDocument();
    expect(link()).toHaveClass("overflow-hidden");
  });

  it("writes the agenda line and cuts it with an ellipsis", () => {
    render(
      <EventBlock
        event={EVENT}
        timeZone={TZ}
        shape="card"
        line="A las 11:15–14:15 en 4D - AULA 1.3"
      />,
    );

    expect(screen.getByText("A las 11:15–14:15 en 4D - AULA 1.3")).toHaveClass(
      "truncate",
    );
  });

  it("lets the grid hide the image icon in a short block, keeping the words", () => {
    const { container } = render(
      <EventBlock event={EVENT} timeZone={TZ} shape="grid" icons={false} />,
    );

    expect(container.querySelector("svg")).toBeNull();
    expect(link()).toHaveTextContent("Con imágenes");
  });
});

// Spec 013 RF-9: an occurrence of a series says so.
describe("EventBlock of a series", () => {
  const SERIES = { ...EVENT, imageCount: 0, seriesId: "s1" };

  it.each(["line", "grid", "card"] as const)(
    "marks the %s block with the repeat icon and the words",
    (shape) => {
      const { container } = render(
        <EventBlock event={SERIES} timeZone={TZ} shape={shape} />,
      );
      expect(container.querySelector("svg[data-icon=repeat]")).not.toBeNull();
      expect(screen.getByText("Se repite", { exact: false })).toHaveClass(
        "sr-only",
      );
    },
  );

  it("hides the icon where it does not fit, keeping the words", () => {
    const { container } = render(
      <EventBlock event={SERIES} timeZone={TZ} shape="grid" icons={false} />,
    );
    expect(container.querySelector("svg")).toBeNull();
    expect(link()).toHaveTextContent("Se repite");
  });

  it("a single event has no mark", () => {
    render(<EventBlock event={EVENT} timeZone={TZ} shape="card" />);
    expect(link()).not.toHaveTextContent("Se repite");
  });
});

// Spec 014 RF-5: the icon and the number of comments, where they fit.
describe("EventBlock with comments", () => {
  const COMMENTED = { ...EVENT, imageCount: 0, commentCount: 3 };

  it.each(["line", "grid", "card"] as const)(
    "marks the %s block with the comment icon, the number and the words",
    (shape) => {
      const { container } = render(
        <EventBlock event={COMMENTED} timeZone={TZ} shape={shape} />,
      );
      expect(container.querySelector("svg[data-icon=comment]")).not.toBeNull();
      expect(link()).toHaveTextContent("3");
      expect(screen.getByText("3 comentarios", { exact: false })).toHaveClass(
        "sr-only",
      );
    },
  );

  it("says one comment in singular", () => {
    render(
      <EventBlock
        event={{ ...COMMENTED, commentCount: 1 }}
        timeZone={TZ}
        shape="card"
      />,
    );
    expect(link()).toHaveTextContent("1 comentario");
    expect(link()).not.toHaveTextContent("1 comentarios");
  });

  it("hides the icon and the number where they do not fit, keeping the words", () => {
    const { container } = render(
      <EventBlock event={COMMENTED} timeZone={TZ} shape="grid" icons={false} />,
    );
    expect(container.querySelector("svg")).toBeNull();
    expect(link()).toHaveTextContent("3 comentarios");
  });

  it("an event without comments has no mark", () => {
    render(<EventBlock event={EVENT} timeZone={TZ} shape="card" />);
    expect(link()).not.toHaveTextContent("comentario");
  });
});
