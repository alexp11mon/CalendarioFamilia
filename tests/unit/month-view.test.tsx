import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EventInteractionsProvider,
  useEventInteractionsState,
} from "@/components/calendar/event-interactions";
import { MonthView } from "@/components/calendar/month-view";
import { ToastProvider } from "@/components/ui/toast";
import type { CalendarEventItem } from "@/lib/calendar/layout";
import { getVisibleRange } from "@/lib/calendar/ranges";

const h = vi.hoisted(() => ({ quickChange: vi.fn() }));

vi.mock("@/app/dashboard/events/quick-actions", () => ({
  quickChange: h.quickChange,
  deleteForUndo: vi.fn(),
  undoAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const TZ = "Europe/Madrid";
const TODAY = "2026-10-21";
const DAYS = getVisibleRange("month", "2026-10-21", TZ).days;

function event(
  id: string,
  startsAt: string,
  endsAt: string,
  extra: Partial<CalendarEventItem> = {},
): CalendarEventItem {
  return {
    id,
    title: id,
    startsAt,
    endsAt,
    allDay: false,
    color: "#A0C4FF",
    calendarId: "cal",
    categoryId: null,
    ...extra,
  };
}

function renderMonth(events: CalendarEventItem[] = []) {
  render(
    <MonthView
      date="2026-10-21"
      days={DAYS}
      events={events}
      timeZone={TZ}
      today={TODAY}
    />,
  );
}

// Each events row measures `height` px: 2 lanes of 18 px and a 2 px gap fit in 40.
function observeRows(height: number) {
  window.ResizeObserver = class {
    constructor(private callback: ResizeObserverCallback) {}
    observe() {
      this.callback(
        [{ contentRect: { height } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

afterEach(() => {
  // @ts-expect-error jsdom has none; each test sets its own.
  delete window.ResizeObserver;
});

function cell(date: string) {
  return screen
    .getAllByTestId("day-cell")
    .find((el) => el.getAttribute("data-date") === date)!;
}

describe("MonthView (spec 016 RF-30..RF-37)", () => {
  it("shows full weeks starting on Monday, with the initials on top (RF-30)", () => {
    renderMonth();

    const cells = screen.getAllByTestId("day-cell");
    expect(cells).toHaveLength(35);
    expect(cells[0]).toHaveAttribute("data-date", "2026-09-28");
    expect(cells.at(-1)).toHaveAttribute("data-date", "2026-11-01");
    const initials = screen.getByTestId("weekday-initials");
    expect(initials).toHaveTextContent("LMXJVSD");
  });

  it("marks today's initial in the accent and its number in a circle (RF-31, RF-32)", () => {
    renderMonth();

    const initials = screen.getByTestId("weekday-initials").children;
    expect(initials[2]).toHaveClass("text-accent-ink");
    expect(initials[3]).not.toHaveClass("text-accent-ink");
    const number = within(cell("2026-10-21")).getByRole("link", {
      name: "miércoles, 21 de octubre de 2026",
    });
    expect(number).toHaveAttribute("aria-current", "date");
    expect(number).toHaveClass("bg-accent", "rounded-full");
    expect(
      within(cell("2026-10-22")).getByRole("link").getAttribute("aria-current"),
    ).toBeNull();
  });

  it("greys the numbers of the days of other months (RF-33)", () => {
    renderMonth();

    expect(within(cell("2026-09-28")).getByRole("link")).toHaveClass(
      "text-muted",
    );
    expect(within(cell("2026-10-14")).getByRole("link")).toHaveClass(
      "text-ink",
    );
  });

  it("marks the events with images, timed and all-day (spec 012 RF-12)", () => {
    renderMonth([
      event("Fotos", "2026-10-21T09:00:00Z", "2026-10-21T10:00:00Z", {
        imageCount: 1,
      }),
      event("Fiesta", "2026-10-22T00:00:00Z", "2026-10-23T00:00:00Z", {
        allDay: true,
        imageCount: 3,
      }),
      event("Nada", "2026-10-21T11:00:00Z", "2026-10-21T12:00:00Z"),
    ]);
    expect(screen.getByRole("link", { name: /Fotos/ })).toHaveTextContent(
      "Con imágenes",
    );
    expect(screen.getByRole("link", { name: /Fiesta/ })).toHaveTextContent(
      "Con imágenes",
    );
    expect(screen.getByRole("link", { name: /Nada/ })).not.toHaveTextContent(
      "Con imágenes",
    );
  });

  it("opens the day view when a day is pressed", () => {
    renderMonth();

    expect(
      within(cell("2026-10-14")).getByRole("link", {
        name: "miércoles, 14 de octubre de 2026",
      }),
    ).toHaveAttribute("href", "/dashboard/calendar?view=day&date=2026-10-14");
  });

  it("shows a timed event as a filled block of one line, the time only for screen readers (RF-34)", () => {
    renderMonth([
      event("Clase", "2026-10-14T06:00:00Z", "2026-10-14T07:00:00Z"),
    ]);

    const block = screen.getByRole("link", { name: /Clase/ });
    expect(block).toHaveAttribute("href", "/dashboard/events/Clase");
    expect(block).toHaveStyle({ backgroundColor: "#A0C4FF" });
    expect(block).toHaveClass("truncate");
    expect(within(block).getByText("08:00,")).toHaveClass("sr-only");
    expect(block).toHaveStyle({ gridColumn: "3 / span 1" });
  });

  it("draws a three-day event as one block across its days (RF-35)", () => {
    renderMonth([
      event("Viaje", "2026-10-20T00:00:00Z", "2026-10-23T00:00:00Z", {
        allDay: true,
      }),
    ]);

    const blocks = screen.getAllByRole("link", { name: /Viaje/ });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toHaveStyle({ gridColumn: "2 / span 3" });
  });

  it("shows what fits and +N, which opens the day view (RF-36, RF-37)", () => {
    observeRows(40);
    const events = [1, 2, 3, 4].map((n) =>
      event(`E${n}`, `2026-10-14T0${n}:00:00Z`, `2026-10-14T0${n}:30:00Z`),
    );
    renderMonth(events);

    expect(screen.getAllByRole("link", { name: /E\d/ })).toHaveLength(1);
    const more = screen.getByRole("link", { name: /^\+3/ });
    expect(more).toHaveAttribute(
      "href",
      "/dashboard/calendar?view=day&date=2026-10-14",
    );
    expect(more).toHaveAccessibleName(
      "+3 más, miércoles, 14 de octubre de 2026",
    );
  });

  it("fits three lanes before measuring", () => {
    const events = [1, 2, 3, 4, 5].map((n) =>
      event(`E${n}`, `2026-10-14T0${n}:00:00Z`, `2026-10-14T0${n}:30:00Z`),
    );
    renderMonth(events);

    expect(screen.getAllByRole("link", { name: /E\d/ })).toHaveLength(2);
    expect(screen.getByRole("link", { name: /^\+3/ })).toBeInTheDocument();
  });

  it("says there are no events when the period is empty (RF-38)", () => {
    renderMonth();

    expect(screen.getByText("No hay eventos")).toBeInTheDocument();
  });

  it("does not say it when there are events", () => {
    renderMonth([event("A", "2026-10-14T06:00:00Z", "2026-10-14T07:00:00Z")]);

    expect(screen.queryByText("No hay eventos")).not.toBeInTheDocument();
  });
});

// Spec 008, T15: creating from an empty day of the month (RF-19, RF-21, RF-22, RF-40).
describe("MonthView: creating", () => {
  it("makes the empty space of each day a button, reachable by keyboard (RF-19, RF-22)", async () => {
    const onCreate = vi.fn();
    render(
      <MonthView
        date="2026-10-21"
        days={DAYS}
        events={[]}
        timeZone={TZ}
        today={TODAY}
        onCreate={onCreate}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: "Crear evento el jueves, 22 de octubre de 2026",
      }),
    );

    expect(onCreate).toHaveBeenCalledWith(
      "2026-10-22",
      expect.objectContaining({ left: expect.any(Number) }),
    );
  });

  it("keeps the day number as a link to the day view (RF-21)", () => {
    render(
      <MonthView
        date="2026-10-21"
        days={DAYS}
        events={[]}
        timeZone={TZ}
        today={TODAY}
        onCreate={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("link", { name: "jueves, 22 de octubre de 2026" }),
    ).toHaveAttribute("href", "/dashboard/calendar?view=day&date=2026-10-22");
  });

  it("offers no buttons without permission to create (RF-36)", () => {
    renderMonth();

    expect(
      screen.queryByRole("button", { name: /Crear evento el/ }),
    ).toBeNull();
  });

  it("draws the provisional event in its day (RF-40)", () => {
    const { rerender } = render(
      <MonthView
        date="2026-10-21"
        days={DAYS}
        events={[]}
        timeZone={TZ}
        today={TODAY}
        onCreate={vi.fn()}
        draft={{ day: "2026-10-22", title: "" }}
      />,
    );
    const cell = screen
      .getAllByTestId("day-cell")
      .find((element) => element.dataset.date === "2026-10-22")!;
    expect(within(cell).getByText("(Sin título)")).toBeVisible();

    rerender(
      <MonthView
        date="2026-10-21"
        days={DAYS}
        events={[]}
        timeZone={TZ}
        today={TODAY}
        onCreate={vi.fn()}
        draft={{ day: "2026-10-22", title: "Cena" }}
      />,
    );
    expect(within(cell).getByText("Cena")).toBeVisible();
  });
});

// Spec 017, T9: moving events to another day of the month (RF-16, RF-17).
describe("MonthView dragging", () => {
  // 10:00–11:00 in Madrid on the 21st (UTC+2 in October).
  const DINNER = event("Cena", "2026-10-21T08:00:00Z", "2026-10-21T09:00:00Z", {
    calendarId: "mine",
  });
  const TRIP = event("Viaje", "2026-10-13T00:00:00Z", "2026-10-16T00:00:00Z", {
    allDay: true,
    calendarId: "mine",
  });
  const THEIRS = event("Ajeno", "2026-10-22T08:00:00Z", "2026-10-22T09:00:00Z");
  const EVENTS = [DINNER, TRIP, THEIRS];
  const EDITABLE = new Set(["mine"]);
  const COLORS = new Map<string, string>();

  function Harness() {
    const state = useEventInteractionsState({
      events: EVENTS,
      editableCalendarIds: EDITABLE,
      calendarColors: COLORS,
      timeZone: TZ,
    });
    return (
      <EventInteractionsProvider value={state.api}>
        <MonthView
          date="2026-10-21"
          days={DAYS}
          events={state.events}
          timeZone={TZ}
          today={TODAY}
          onCreate={vi.fn()}
        />
        {state.dialog}
      </EventInteractionsProvider>
    );
  }

  // Each cell is 100 × 100 px: column by x, week by y.
  const point = (date: string) => {
    const index = DAYS.indexOf(date);
    return {
      clientX: (index % 7) * 100 + 50,
      clientY: Math.floor(index / 7) * 100 + 50,
    };
  };

  function setup() {
    h.quickChange.mockReset();
    h.quickChange.mockResolvedValue({ ok: true, id: "x" });
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    document.elementsFromPoint = (x: number, y: number) => {
      const day = DAYS[Math.floor(y / 100) * 7 + Math.floor(x / 100)];
      return day ? [cell(day)] : [];
    };
  }

  async function drag(title: string, from: string, to: string) {
    const link = screen.getByRole("link", { name: new RegExp(title) });
    fireEvent.pointerDown(link, {
      ...point(from),
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
    });
    fireEvent.pointerMove(window, { ...point(to), pointerId: 1 });
    await act(async () => {
      fireEvent.pointerUp(window, { ...point(to), pointerId: 1 });
    });
  }

  it("a timed event keeps its hour and duration on another day (RF-16)", async () => {
    setup();
    await drag("Cena", "2026-10-21", "2026-10-29");
    expect(h.quickChange).toHaveBeenCalledWith(
      DINNER.id,
      {
        kind: "times",
        // Madrid changes to UTC+1 on the 25th: the same 10:00 on the wall.
        startsAt: "2026-10-29T09:00:00.000Z",
        endsAt: "2026-10-29T10:00:00.000Z",
        allDay: false,
      },
      {},
    );
  });

  it("an event of several days moves its first day and keeps its days (RF-17)", async () => {
    setup();
    await drag("Viaje", "2026-10-14", "2026-10-20");
    expect(h.quickChange).toHaveBeenCalledWith(
      TRIP.id,
      {
        kind: "times",
        startsAt: "2026-10-20T00:00:00.000Z",
        endsAt: "2026-10-23T00:00:00.000Z",
        allDay: true,
      },
      {},
    );
  });

  it("a finger moves it after holding it 500 ms (RF-16)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    setup();
    const link = screen.getByRole("link", { name: /Cena/ });
    const finger = { pointerId: 1, pointerType: "touch", button: 0 };
    fireEvent.pointerDown(link, { ...point("2026-10-21"), ...finger });
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerMove(window, { ...point("2026-10-23"), ...finger });
    await act(async () => {
      fireEvent.pointerUp(window, { ...point("2026-10-23"), ...finger });
    });
    vi.useRealTimers();
    expect(h.quickChange).toHaveBeenCalledWith(
      DINNER.id,
      expect.objectContaining({ startsAt: "2026-10-23T08:00:00.000Z" }),
      {},
    );
  });

  it("an event the user cannot write to does not lift", async () => {
    setup();
    await drag("Ajeno", "2026-10-22", "2026-10-28");
    expect(h.quickChange).not.toHaveBeenCalled();
  });

  it("the empty space still creates and +N still opens the day", async () => {
    setup();
    expect(
      screen.getByRole("button", { name: /Crear evento el .*21 de octubre/ }),
    ).toBeVisible();
    await drag("Cena", "2026-10-21", "2026-10-21");
    expect(h.quickChange).not.toHaveBeenCalled();
  });
});
