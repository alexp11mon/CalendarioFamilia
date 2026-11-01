import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EventInteractionsProvider,
  useEventInteractionsState,
} from "@/components/calendar/event-interactions";
import { TimeGrid } from "@/components/calendar/time-grid";
import { ToastProvider } from "@/components/ui/toast";
import type { CalendarEventItem } from "@/lib/calendar/layout";

// Spec 017, T7: moving and resizing with the mouse in the week and the day
// (RF-2, RF-5, RF-7, RF-8, RF-9, RF-10, RF-12, RF-19, RF-20, RF-21, RF-23).
const h = vi.hoisted(() => ({ quickChange: vi.fn(), refresh: vi.fn() }));

vi.mock("@/app/dashboard/events/quick-actions", () => ({
  quickChange: h.quickChange,
  deleteForUndo: vi.fn(),
  undoAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: h.refresh }),
}));

const TZ = "Europe/Madrid";
const DAYS = ["2026-11-03", "2026-11-04"];
const HOUR = 48;
const COLUMN = { left: 100, width: 100 };

// 10:00–11:00 in Madrid (UTC+1 in November).
const MINE: CalendarEventItem = {
  id: "e1",
  title: "Cena",
  startsAt: "2026-11-03T09:00:00.000Z",
  endsAt: "2026-11-03T10:00:00.000Z",
  allDay: false,
  calendarId: "mine",
  categoryId: null,
  color: "#FFADAD",
};
const THEIRS: CalendarEventItem = {
  ...MINE,
  id: "e2",
  title: "Ajeno",
  calendarId: "theirs",
  startsAt: "2026-11-04T09:00:00.000Z",
  endsAt: "2026-11-04T10:00:00.000Z",
};

const EVENTS = [MINE, THEIRS];
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
      <TimeGrid
        days={DAYS}
        events={state.events}
        timeZone={TZ}
        today="2026-11-01"
        linkDays
      />
      {state.dialog}
    </EventInteractionsProvider>
  );
}

function rect(left: number, top: number, width: number, height: number) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

let columns: HTMLElement[] = [];
let scroller: HTMLElement;

function setup() {
  render(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  );
  columns = DAYS.map((day) =>
    document.querySelector<HTMLElement>(`[data-time-col][data-day="${day}"]`)!,
  );
  // jsdom has no layout: each column is 1152 px tall, side by side.
  columns.forEach((column, index) =>
    vi
      .spyOn(column, "getBoundingClientRect")
      .mockReturnValue(
        rect(COLUMN.left + index * COLUMN.width, 0, COLUMN.width, 24 * HOUR),
      ),
  );
  scroller = document.querySelector<HTMLElement>("[data-grid-scroll]")!;
  vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(
    rect(0, 0, 400, 1000),
  );
  document.elementsFromPoint = (x: number) =>
    columns.filter((column) => {
      const box = column.getBoundingClientRect();
      return x >= box.left && x < box.right;
    });
}

const at = (hours: number) => hours * HOUR;
const block = (title: string) =>
  screen.getByRole("link", { name: new RegExp(title) });

function down(target: Element, hours: number, x = 150) {
  fireEvent.pointerDown(target, {
    clientX: x,
    clientY: at(hours),
    button: 0,
    pointerId: 1,
    pointerType: "mouse",
  });
}
function move(hours: number, x = 150) {
  fireEvent.pointerMove(window, {
    clientX: x,
    clientY: at(hours),
    pointerId: 1,
  });
}
function up(hours: number, x = 150) {
  fireEvent.pointerUp(window, { clientX: x, clientY: at(hours), pointerId: 1 });
}

beforeEach(() => {
  h.quickChange.mockReset();
  h.quickChange.mockResolvedValue({ ok: true, id: "e1" });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("DraggableEvent", () => {
  it("lifts after 4 px, shows its new hours and saves where it is dropped (RF-5, RF-8, RF-18)", async () => {
    setup();
    down(block("Cena"), 10.25);
    move(10.3);
    expect(block("Cena")).not.toHaveClass("ring-2");

    move(12.25);
    expect(block("Cena")).toHaveClass("ring-2");
    expect(block("Cena")).toHaveTextContent("12:00 – 13:00");
    expect(screen.getByText(/12:00–13:00/)).toHaveClass("sr-only");

    await act(async () => up(12.25));
    expect(h.quickChange).toHaveBeenCalledWith(
      "e1",
      {
        kind: "times",
        startsAt: "2026-11-03T11:00:00.000Z",
        endsAt: "2026-11-03T12:00:00.000Z",
        allDay: false,
      },
      {},
    );
    expect(await screen.findByText("Evento movido")).toBeVisible();
  });

  it("goes to another day of the week (RF-7)", async () => {
    setup();
    down(block("Cena"), 10.25);
    move(10.25, 250);
    await act(async () => up(10.25, 250));
    expect(h.quickChange).toHaveBeenCalledWith(
      "e1",
      expect.objectContaining({
        startsAt: "2026-11-04T09:00:00.000Z",
        endsAt: "2026-11-04T10:00:00.000Z",
      }),
      {},
    );
  });

  it("dropped where it was, or outside the grid, saves nothing (RF-19)", async () => {
    setup();
    down(block("Cena"), 10.25);
    move(11);
    await act(async () => up(10.3));
    expect(h.quickChange).not.toHaveBeenCalled();

    down(block("Cena"), 10.25);
    move(12, 900);
    await act(async () => up(12, 900));
    expect(h.quickChange).not.toHaveBeenCalled();
    expect(block("Cena")).not.toHaveClass("ring-2");
  });

  it("Escape puts it back (RF-20)", async () => {
    setup();
    down(block("Cena"), 10.25);
    move(14);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(block("Cena")).not.toHaveClass("ring-2");
    await act(async () => up(14));
    expect(h.quickChange).not.toHaveBeenCalled();
  });

  it("the bottom edge changes the end, never under 15 minutes (RF-10, RF-12)", async () => {
    setup();
    const handle = block("Cena").querySelector("[data-resize]")!;
    down(handle, 11);
    move(12.5);
    await act(async () => up(12.5));
    expect(h.quickChange).toHaveBeenCalledWith(
      "e1",
      expect.objectContaining({
        startsAt: "2026-11-03T09:00:00.000Z",
        endsAt: "2026-11-03T11:30:00.000Z",
      }),
      {},
    );
    expect(await screen.findByText("Duración cambiada")).toBeVisible();
  });

  it("the click after a drag does not open the event (RF-23)", async () => {
    setup();
    down(block("Cena"), 10.25);
    move(12);
    await act(async () => up(12));
    expect(fireEvent.click(block("Cena"))).toBe(false);
    expect(fireEvent.click(block("Cena"))).toBe(true);
  });

  it("an event the user cannot write to is a plain link (RF-2)", async () => {
    setup();
    const theirs = block("Ajeno");
    expect(theirs.querySelector("[data-resize]")).toBeNull();
    down(theirs, 10.25, 250);
    move(13, 250);
    await act(async () => up(13, 250));
    expect(theirs).not.toHaveClass("ring-2");
    expect(h.quickChange).not.toHaveBeenCalled();
  });

  it("scrolls the grid near its bottom edge (RF-9)", async () => {
    setup();
    down(block("Cena"), 10.25);
    move(990 / HOUR);
    await vi.waitFor(() => expect(scroller.scrollTop).toBeGreaterThan(0));
    fireEvent.keyDown(window, { key: "Escape" });
  });
});
