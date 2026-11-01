import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgendaView,
  requestAgendaToday,
  type AgendaEvent,
} from "@/components/calendar/agenda-view";
import { getVisibleRange } from "@/lib/calendar/ranges";

// Spec 016, T10: the continuous agenda (RF-47..RF-60).
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const TZ = "Europe/Madrid";
const TODAY = "2026-11-02";
// 19 October to 13 December: 14 days before and 42 after (plan, flow 7.1).
const DAYS = getVisibleRange("agenda", TODAY, TZ).days;

function event(
  id: string,
  startsAt: string,
  endsAt: string,
  extra: Partial<AgendaEvent> = {},
): AgendaEvent {
  return {
    id,
    title: id,
    startsAt,
    endsAt,
    allDay: false,
    color: "#FFADAD",
    calendarId: "cal",
    categoryId: null,
    location: null,
    calendarName: "Casa",
    ...extra,
  };
}

// A stand-in IntersectionObserver that the test fires by hand.
let observers: {
  callback: IntersectionObserverCallback;
  targets: Set<Element>;
}[] = [];

function intersect(target: Element) {
  act(() => {
    for (const observer of observers) {
      if (observer.targets.has(target)) {
        observer.callback(
          [
            {
              target,
              isIntersecting: true,
              boundingClientRect: { top: 0 } as DOMRectReadOnly,
            } as IntersectionObserverEntry,
          ],
          {} as IntersectionObserver,
        );
      }
    }
  });
}

const scrolled: Element[] = [];

beforeEach(() => {
  observers = [];
  scrolled.length = 0;
  push.mockClear();
  window.IntersectionObserver = class {
    entry = {
      callback: (() => {}) as IntersectionObserverCallback,
      targets: new Set<Element>(),
    };
    constructor(callback: IntersectionObserverCallback) {
      this.entry.callback = callback;
      observers.push(this.entry);
    }
    observe(target: Element) {
      this.entry.targets.add(target);
    }
    unobserve(target: Element) {
      this.entry.targets.delete(target);
    }
    disconnect() {
      this.entry.targets.clear();
    }
  } as unknown as typeof IntersectionObserver;
  HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
    scrolled.push(this);
  };
});

afterEach(() => {
  // @ts-expect-error jsdom has none; each test sets its own.
  delete window.IntersectionObserver;
});

function renderAgenda(
  events: AgendaEvent[] = [],
  extra: Partial<Parameters<typeof AgendaView>[0]> = {},
) {
  return render(
    <AgendaView
      days={DAYS}
      events={events}
      timeZone={TZ}
      today={TODAY}
      {...extra}
    />,
  );
}

describe("AgendaView layout", () => {
  it("opens each month with its band and each week with its range (RF-50, RF-51)", () => {
    renderAgenda();

    expect(
      screen.getByRole("heading", { level: 2, name: "noviembre" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "octubre" })).toHaveClass(
      "bg-agenda-band",
    );
    expect(screen.getByText("2–8 de noviembre")).toBeInTheDocument();
    expect(screen.getByText("26–31 de octubre")).toBeInTheDocument();
  });

  it("says Sin eventos under an empty week and lists only days with events (RF-47, RF-57)", () => {
    renderAgenda([
      event("Reunión", "2026-11-04T11:00:00Z", "2026-11-04T12:00:00Z"),
    ]);

    // 10 weeks from 19 October to 13 December, cut at the end of each
    // month, one with an event.
    expect(screen.getAllByText("Sin eventos")).toHaveLength(9);
    expect(screen.getAllByTestId("agenda-day")).toHaveLength(1);
  });

  it("shows the weekday and the number of each day, today in a circle (RF-52, RF-53)", () => {
    renderAgenda([
      event("Hoy", "2026-11-02T11:00:00Z", "2026-11-02T12:00:00Z"),
      event("Otro", "2026-11-04T11:00:00Z", "2026-11-04T12:00:00Z"),
    ]);

    const today = screen.getByRole("region", {
      name: "lunes, 2 de noviembre de 2026, hoy",
    });
    expect(within(today).getByText("2")).toHaveClass(
      "bg-accent",
      "rounded-full",
    );
    expect(within(today).getByText("lun")).toHaveClass("text-accent-ink");
    const other = screen.getByRole("region", {
      name: "miércoles, 4 de noviembre de 2026",
    });
    expect(within(other).getByText("4")).not.toHaveClass("bg-accent");
  });

  it("draws each event as a card with its line (RF-54, RF-55, RF-56)", () => {
    renderAgenda([
      event("Clase", "2026-11-04T10:15:00Z", "2026-11-04T13:15:00Z", {
        location: "Academia",
      }),
      event("Fiesta", "2026-11-05T00:00:00Z", "2026-11-06T00:00:00Z", {
        allDay: true,
      }),
    ]);

    const card = screen.getByRole("link", { name: /Clase/ });
    expect(card).toHaveAttribute("href", "/dashboard/events/Clase");
    expect(card).toHaveStyle({ backgroundColor: "#FFADAD" });
    expect(within(card).getByText("A las 11:15–14:15 en Academia")).toHaveClass(
      "truncate",
    );
    expect(screen.getByRole("link", { name: /Fiesta/ })).toHaveTextContent(
      /^Fiesta$/,
    );
  });

  it("applies the visibility filter (plan agenda-view)", () => {
    renderAgenda(
      [
        event("Visible", "2026-11-04T11:00:00Z", "2026-11-04T12:00:00Z"),
        event("Oculto", "2026-11-04T13:00:00Z", "2026-11-04T14:00:00Z", {
          calendarId: "hidden",
        }),
      ],
      { isShown: (item) => item.calendarId !== "hidden" },
    );

    expect(screen.getByRole("link", { name: /Visible/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Oculto/ })).toBeNull();
  });
});

describe("AgendaView loading", () => {
  it("loads the next 28 days at the end of the list (RF-48)", async () => {
    const loadEvents = vi.fn(async () => ({
      events: [
        event("Lejano", "2026-12-20T11:00:00Z", "2026-12-20T12:00:00Z"),
        event("Filtrado", "2026-12-21T11:00:00Z", "2026-12-21T12:00:00Z", {
          calendarId: "hidden",
        }),
      ],
    }));
    renderAgenda([], {
      loadEvents,
      isShown: (item) => item.calendarId !== "hidden",
    });

    intersect(screen.getByTestId("agenda-end"));

    expect(loadEvents).toHaveBeenCalledWith("2026-12-14", "2027-01-10");
    expect(
      await screen.findByRole("link", { name: /Lejano/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Filtrado/ })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "enero de 2027" }),
    ).toBeInTheDocument();
  });

  it("loads the 28 days before at the start of the list (RF-49)", async () => {
    const loadEvents = vi.fn(async () => ({
      events: [event("Antes", "2026-09-25T10:00:00Z", "2026-09-25T11:00:00Z")],
    }));
    renderAgenda([], { loadEvents });

    intersect(screen.getByTestId("agenda-start"));

    expect(loadEvents).toHaveBeenCalledWith("2026-09-21", "2026-10-18");
    expect(
      await screen.findByRole("link", { name: /Antes/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "septiembre" }),
    ).toBeInTheDocument();
  });

  it("keeps the rows on screen in place when the first week is cut by the list start (RF-49)", async () => {
    // Without layout in jsdom: each row is 50 px below the one before.
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const rows = [...document.querySelectorAll("[data-day], [data-week]")];
        return { top: rows.indexOf(this) * 50 } as DOMRect;
      });
    const scrollBy = vi.fn();
    window.scrollBy = scrollBy;
    const loadEvents = vi.fn(async () => ({ events: [] }));
    // Starts on a Tuesday: its first week is keyed by that day, which the
    // chunk before swallows into the week of Monday 19 October.
    render(
      <AgendaView
        days={DAYS.slice(1)}
        events={[]}
        timeZone={TZ}
        today={TODAY}
        loadEvents={loadEvents}
      />,
    );

    intersect(screen.getByTestId("agenda-start"));

    expect(
      await screen.findByRole("heading", { name: "septiembre" }),
    ).toBeInTheDocument();
    expect(scrollBy).toHaveBeenCalledWith(0, expect.any(Number));
    expect(scrollBy.mock.calls[0]![1]).toBeGreaterThan(0);
    rect.mockRestore();
  });

  it("keeps at most 120 days, letting go of the other end (plan D9)", async () => {
    const loadEvents = vi.fn(async () => ({ events: [] }));
    renderAgenda([], { loadEvents });

    for (const month of ["enero", "febrero", "marzo"]) {
      // Let the observer of the new window replace the old one first.
      await act(async () => {});
      intersect(screen.getByTestId("agenda-end"));
      expect(
        await screen.findByRole("heading", { name: `${month} de 2027` }),
      ).toBeInTheDocument();
    }

    // 56 + 3 × 28 = 140 days: the first 56 go.
    expect(screen.queryByRole("heading", { name: "octubre" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "noviembre" })).toBeNull();
  });

  it("says when a chunk could not be loaded and lets retry", async () => {
    const loadEvents = vi
      .fn()
      .mockResolvedValueOnce({ error: "No se ha podido conectar." })
      .mockResolvedValueOnce({ events: [] });
    renderAgenda([], { loadEvents });

    intersect(screen.getByTestId("agenda-end"));
    expect(
      await screen.findByText("No se ha podido conectar."),
    ).toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "Reintentar" }).click());
    intersect(screen.getByTestId("agenda-end"));
    await vi.waitFor(() => expect(loadEvents).toHaveBeenCalledTimes(2));
  });
});

describe("AgendaView position", () => {
  it("reports the month at the top for the header (RF-59)", () => {
    const onMonthChange = vi.fn();
    renderAgenda([], { onMonthChange });

    intersect(screen.getByRole("heading", { name: "diciembre" }));
    expect(onMonthChange).toHaveBeenLastCalledWith("2026-12");
  });

  it("opens on today, or the next day with events when today has none (RF-58)", () => {
    renderAgenda([
      event("Ayer", "2026-11-01T11:00:00Z", "2026-11-01T12:00:00Z"),
      event("Mañana", "2026-11-03T11:00:00Z", "2026-11-03T12:00:00Z"),
    ]);

    expect(scrolled.at(-1)).toHaveAttribute("data-day", "2026-11-03");
  });

  it("goes back there when Hoy is pressed", () => {
    renderAgenda([
      event("Hoy", "2026-11-02T11:00:00Z", "2026-11-02T12:00:00Z"),
    ]);
    scrolled.length = 0;

    act(() => requestAgendaToday());

    expect(scrolled.at(-1)).toHaveAttribute("data-day", "2026-11-02");
    expect(push).not.toHaveBeenCalled();
  });

  it("comes back to the server's days when Hoy is pressed far away", async () => {
    const loadEvents = vi.fn(async () => ({ events: [] }));
    renderAgenda(
      [event("Hoy", "2026-11-02T11:00:00Z", "2026-11-02T12:00:00Z")],
      { loadEvents },
    );
    for (const month of ["enero", "febrero", "marzo"]) {
      await act(async () => {});
      intersect(screen.getByTestId("agenda-end"));
      await screen.findByRole("heading", { name: `${month} de 2027` });
    }
    scrolled.length = 0;

    act(() => requestAgendaToday());

    expect(
      screen.getByRole("heading", { name: "noviembre" }),
    ).toBeInTheDocument();
    expect(scrolled.at(-1)).toHaveAttribute("data-day", "2026-11-02");
    expect(push).not.toHaveBeenCalled();
  });

  it("opens the agenda of today when today is not loaded", () => {
    render(
      <AgendaView
        days={getVisibleRange("agenda", "2027-06-01", TZ).days}
        events={[]}
        timeZone={TZ}
        today={TODAY}
      />,
    );

    act(() => requestAgendaToday());

    expect(push).toHaveBeenCalledWith(
      "/dashboard/calendar?view=agenda&date=2026-11-02",
      expect.anything(),
    );
  });
});
