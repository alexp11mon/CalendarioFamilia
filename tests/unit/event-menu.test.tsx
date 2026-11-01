import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EventInteractionsProvider,
  useEventInteractionsState,
} from "@/components/calendar/event-interactions";
import { TimeGrid } from "@/components/calendar/time-grid";
import { ToastProvider } from "@/components/ui/toast";
import type { CalendarEventItem } from "@/lib/calendar/layout";

// Spec 017, T11: the context menu of an event (RF-32 to RF-43, plan D12, D13).
const h = vi.hoisted(() => ({
  quickChange: vi.fn(),
  deleteForUndo: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/app/dashboard/events/quick-actions", () => ({
  quickChange: h.quickChange,
  deleteForUndo: h.deleteForUndo,
  undoAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: h.push }),
}));

beforeAll(() => {
  // jsdom has no layout: a press finds nothing under the pointer.
  document.elementsFromPoint = () => [];
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

const TZ = "Europe/Madrid";
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
const PLAIN: CalendarEventItem = {
  ...MINE,
  id: "e3",
  title: "Liso",
  startsAt: "2026-11-03T13:00:00.000Z",
  endsAt: "2026-11-03T14:00:00.000Z",
  color: "#A0C4FF",
};
const OCCURRENCE: CalendarEventItem = {
  ...MINE,
  id: "s1_20261103T160000Z",
  title: "Clase",
  startsAt: "2026-11-03T16:00:00.000Z",
  endsAt: "2026-11-03T17:00:00.000Z",
  seriesId: "s1",
};
const THEIRS: CalendarEventItem = {
  ...MINE,
  id: "e2",
  title: "Ajeno",
  calendarId: "theirs",
  startsAt: "2026-11-04T09:00:00.000Z",
  endsAt: "2026-11-04T10:00:00.000Z",
};
const EVENTS = [MINE, PLAIN, OCCURRENCE, THEIRS];
const EDITABLE = new Set(["mine"]);
const COLORS = new Map([["mine", "#A0C4FF"]]);

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
        days={["2026-11-03", "2026-11-04"]}
        events={state.events}
        timeZone={TZ}
        today="2026-11-01"
        linkDays
      />
      {state.dialog}
    </EventInteractionsProvider>
  );
}

function setup() {
  render(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  );
}

const block = (title: string) =>
  screen.getByRole("link", { name: new RegExp(title) });

function rightClick(target: Element) {
  fireEvent.pointerDown(target, { button: 2, pointerType: "mouse" });
  return fireEvent.contextMenu(target, { clientX: 300, clientY: 200 });
}

beforeEach(() => {
  h.quickChange.mockReset();
  h.quickChange.mockResolvedValue({ ok: true, id: "e1" });
  h.deleteForUndo.mockReset();
  h.deleteForUndo.mockResolvedValue({ ok: true, id: "e1" });
  h.push.mockReset();
});

describe("EventMenu", () => {
  it("a right click opens it by the pointer instead of the browser's (RF-32)", () => {
    setup();
    expect(rightClick(block("Cena"))).toBe(false);
    const menu = screen.getByRole("menu", { name: "Cena" });
    expect(menu).toHaveStyle({ left: "300px", top: "200px" });
  });

  it("an event the user cannot edit keeps the browser's menu (RF-41)", () => {
    setup();
    expect(rightClick(block("Ajeno"))).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("a finger never opens it (RF-43)", () => {
    setup();
    fireEvent.pointerDown(block("Cena"), {
      button: 0,
      pointerId: 1,
      pointerType: "touch",
    });
    fireEvent.contextMenu(block("Cena"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("the Menu key and Shift+F10 open it by the event (RF-33)", async () => {
    setup();
    block("Cena").focus();
    await userEvent.keyboard("{ContextMenu}");
    expect(screen.getByRole("menu", { name: "Cena" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(block("Cena")).toHaveFocus();

    await userEvent.keyboard("{Shift>}{F10}{/Shift}");
    expect(screen.getByRole("menu", { name: "Cena" })).toBeVisible();
  });

  it("shows the 13 colors with a check on the current one, then the calendar's, Duplicar and Borrar (RF-34, RF-35)", () => {
    setup();
    rightClick(block("Cena"));
    const colors = screen.getAllByRole("menuitemradio");
    expect(colors).toHaveLength(14);
    const coral = screen.getByRole("menuitemradio", { name: "Coral" });
    expect(coral).toHaveAttribute("aria-checked", "true");
    expect(coral.querySelector("svg")).not.toBeNull();
    expect(
      screen.getByRole("menuitemradio", { name: "Color del calendario" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("menuitem", { name: "Duplicar" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Borrar" })).toBeVisible();
  });

  it("without its own color, the calendar's is checked", () => {
    setup();
    rightClick(block("Liso"));
    expect(
      screen.getByRole("menuitemradio", { name: "Color del calendario" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("goes through with the arrows, Home and End, and chooses with Enter (RF-42)", async () => {
    setup();
    rightClick(block("Cena"));
    expect(screen.getByRole("menuitemradio", { name: "Coral" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("menuitemradio", { name: "Melocotón" }),
    ).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Borrar" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("menuitemradio", { name: "Coral" })).toHaveFocus();
    await userEvent.keyboard("{End}{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Duplicar" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(h.push).toHaveBeenCalledWith("/dashboard/events/new?from=e1");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes with a click outside (RF-42)", async () => {
    setup();
    rightClick(block("Cena"));
    await userEvent.click(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("choosing a color applies it and closes (RF-36)", async () => {
    setup();
    rightClick(block("Cena"));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Menta" }));
    expect(h.quickChange).toHaveBeenCalledWith(
      "e1",
      { kind: "color", color: "#CAFFBF" },
      {},
    );
    expect(screen.queryByRole("menu")).toBeNull();
    expect(await screen.findByText("Color cambiado")).toBeVisible();
  });

  it("the calendar's color sends null (RF-37)", async () => {
    setup();
    rightClick(block("Cena"));
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: "Color del calendario" }),
    );
    expect(h.quickChange).toHaveBeenCalledWith(
      "e1",
      { kind: "color", color: null },
      {},
    );
  });

  it("Borrar deletes with Deshacer (RF-40)", async () => {
    setup();
    rightClick(block("Cena"));
    await act(async () => {
      await userEvent.click(screen.getByRole("menuitem", { name: "Borrar" }));
    });
    expect(h.deleteForUndo).toHaveBeenCalledWith("e1", {});
    expect(screen.queryByRole("link", { name: /Cena/ })).toBeNull();
  });

  it("on an occurrence, the color asks its scope first (plan D10)", async () => {
    setup();
    rightClick(block("Clase"));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Menta" }));
    expect(
      screen.getByRole("dialog", { name: "Guardar evento repetido" }),
    ).toBeVisible();
    expect(h.quickChange).not.toHaveBeenCalled();
  });
});
