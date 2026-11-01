import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventClipboardProvider } from "@/components/calendar/event-clipboard";
import {
  EventInteractionsProvider,
  useEventInteractionsState,
} from "@/components/calendar/event-interactions";
import { TimeGrid } from "@/components/calendar/time-grid";
import { ToastProvider } from "@/components/ui/toast";
import type { CalendarEventItem } from "@/lib/calendar/layout";

// Spec 017, T12: the events of the views with the keyboard (RF-55, RF-57 to
// RF-61, RF-63, RF-64; plan event-keys, D9, D11).
const h = vi.hoisted(() => ({
  quickChange: vi.fn(),
  deleteForUndo: vi.fn(),
  pasteEvent: vi.fn(),
}));

vi.mock("@/app/dashboard/events/quick-actions", () => ({
  quickChange: h.quickChange,
  deleteForUndo: h.deleteForUndo,
  pasteEvent: h.pasteEvent,
  undoAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const TZ = "Europe/Madrid";
const DAYS = ["2026-11-03", "2026-11-04"];
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
    date: "2026-11-04",
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
      <input aria-label="Buscar" />
      {state.dialog}
    </EventInteractionsProvider>
  );
}

function setup() {
  render(
    <ToastProvider>
      <EventClipboardProvider>
        <Harness />
      </EventClipboardProvider>
    </ToastProvider>,
  );
}

const block = (title: string) =>
  screen.getByRole("link", { name: new RegExp(title) });

function press(target: Element, key: string, extra: object = {}) {
  return fireEvent.keyDown(target, { key, ...extra });
}

beforeEach(() => {
  h.quickChange.mockReset();
  h.quickChange.mockResolvedValue({ ok: true, id: "e1" });
  h.deleteForUndo.mockReset();
  h.deleteForUndo.mockResolvedValue({ ok: true, id: "e1" });
  h.pasteEvent.mockReset();
  h.pasteEvent.mockResolvedValue({
    ok: true,
    id: "e9",
    undo: { kind: "unpaste", id: "e9" },
  });
  document.elementsFromPoint = () => [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useEventKeys", () => {
  it("Alt+arrows move it on screen and save once, 600 ms after the last key (RF-64, D11)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    setup();
    block("Cena").focus();
    press(block("Cena"), "ArrowDown", { altKey: true });
    press(block("Cena"), "ArrowDown", { altKey: true });
    press(block("Cena"), "ArrowRight", { altKey: true });
    expect(block("Cena").closest("[data-day]")).toHaveAttribute(
      "data-day",
      "2026-11-04",
    );
    expect(block("Cena")).toHaveFocus();
    act(() => vi.advanceTimersByTime(599));
    expect(h.quickChange).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(h.quickChange).toHaveBeenCalledTimes(1);
    expect(h.quickChange).toHaveBeenCalledWith(
      "e1",
      {
        kind: "times",
        startsAt: "2026-11-04T09:30:00.000Z",
        endsAt: "2026-11-04T10:30:00.000Z",
        allDay: false,
      },
      {},
    );
  });

  it("Supr and Retroceso delete it with Deshacer (RF-55)", async () => {
    setup();
    block("Cena").focus();
    await act(async () => {
      press(block("Cena"), "Delete");
    });
    expect(h.deleteForUndo).toHaveBeenCalledWith("e1", {});
    expect(await screen.findByText("Evento borrado")).toBeVisible();
  });

  it("Ctrl+C copies, Ctrl+V pastes on the view's date at its hour (RF-57, RF-59)", async () => {
    setup();
    block("Ajeno").focus();
    press(block("Ajeno"), "c", { ctrlKey: true });
    expect(await screen.findByText("Evento copiado")).toBeVisible();

    await act(async () => {
      press(document.body, "v", { metaKey: true });
    });
    expect(h.pasteEvent).toHaveBeenCalledWith("e2", { day: "2026-11-04" });
    expect(await screen.findByText("Evento pegado")).toBeVisible();
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeVisible();
  });

  it("pastes on the last slot pressed (RF-58)", async () => {
    setup();
    block("Cena").focus();
    press(block("Cena"), "c", { ctrlKey: true });
    const column = document.querySelector<HTMLElement>(
      '[data-time-col][data-day="2026-11-03"]',
    )!;
    vi.spyOn(column, "getBoundingClientRect").mockReturnValue({
      top: 0,
      left: 0,
      width: 100,
      height: 1152,
      right: 100,
      bottom: 1152,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    document.elementsFromPoint = () => [column];
    fireEvent.pointerDown(column, { clientX: 50, clientY: 16.5 * 48 });
    await act(async () => {
      press(document.body, "v", { ctrlKey: true });
    });
    expect(h.pasteEvent).toHaveBeenCalledWith("e1", {
      day: "2026-11-03",
      minute: 16.5 * 60,
    });
  });

  it("shows why it cannot paste (RF-60)", async () => {
    h.pasteEvent.mockResolvedValue({
      ok: false,
      error: "No tienes permiso para hacer eso.",
    });
    setup();
    block("Ajeno").focus();
    press(block("Ajeno"), "c", { ctrlKey: true });
    await act(async () => {
      press(document.body, "v", { ctrlKey: true });
    });
    expect(
      await screen.findByText("No tienes permiso para hacer eso."),
    ).toBeVisible();
  });

  it("does nothing on an event it cannot edit, while typing or with a window open (RF-63)", async () => {
    setup();
    block("Ajeno").focus();
    press(block("Ajeno"), "Delete");
    press(block("Ajeno"), "ArrowDown", { altKey: true });
    expect(h.deleteForUndo).not.toHaveBeenCalled();

    const input = screen.getByRole("textbox", { name: "Buscar" });
    input.focus();
    press(input, "v", { ctrlKey: true });
    press(input, "Backspace");

    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);
    block("Cena").focus();
    press(block("Cena"), "Delete");
    dialog.remove();

    expect(h.deleteForUndo).not.toHaveBeenCalled();
    expect(h.pasteEvent).not.toHaveBeenCalled();
    expect(h.quickChange).not.toHaveBeenCalled();
  });

  it("Ctrl+C with text selected copies the text, not the event", () => {
    setup();
    block("Cena").focus();
    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "Cena",
    } as Selection);
    expect(press(block("Cena"), "c", { ctrlKey: true })).toBe(true);
    expect(screen.queryByText("Evento copiado")).toBeNull();
  });
});
