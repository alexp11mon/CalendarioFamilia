import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MiniMonth } from "@/components/calendar/mini-month";
import type { MonthMarks } from "@/lib/calendar/month-marks";

// Spec 005, T9: the mini month of the calendar panel
// (RF-5, RF-23, RF-24, RF-25, RF-26; plan D10).
const COLORS = {
  home: "#FFADAD",
  work: "#A0C4FF",
  gym: "#CAFFBF",
  club: "#BDB2FF",
};

type Load = (
  month: string,
) => Promise<{ marks: MonthMarks } | { error: string }>;

function renderMini({
  marks = {},
  visible = ["home", "work", "gym", "club"],
  load = vi.fn<Load>(async () => ({ marks: {} })),
  view = "agenda" as const,
} = {}) {
  render(
    <MiniMonth
      month="2026-10"
      today="2026-10-22"
      view={view}
      initialMarks={marks}
      colors={COLORS}
      visibleCalendarIds={new Set(visible)}
      loadMonthMarks={load}
    />,
  );
  return {
    load,
    mini: screen.getByRole("region", { name: "Mini calendario" }),
  };
}

function dayLink(name: RegExp) {
  return screen.getByRole("link", { name });
}

describe("MiniMonth (RF-23)", () => {
  it("shows the month with weeks starting on Monday", () => {
    const { mini } = renderMini();

    expect(within(mini).getByText("octubre de 2026")).toBeInTheDocument();
    expect(
      within(mini)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["L", "M", "X", "J", "V", "S", "D"]);
    // 1 October 2026 is a Thursday: the grid opens on Monday 28 September.
    expect(within(mini).getAllByRole("link")[0]).toHaveAccessibleName(
      "lunes, 28 de septiembre de 2026",
    );
  });

  it("marks today with the accent fill, in bold and as the current date (RF-5)", () => {
    renderMini();

    const today = dayLink(/^jueves, 22 de octubre de 2026, hoy/);
    expect(today).toHaveAttribute("aria-current", "date");
    expect(today.className).toMatch(/bg-accent/);
    expect(today.className).toMatch(/font-extrabold/);
  });

  it("goes to that date in the current view (RF-25)", () => {
    renderMini({ view: "agenda" });

    expect(dayLink(/^martes, 13 de octubre/)).toHaveAttribute(
      "href",
      "/dashboard/calendar?view=agenda&date=2026-10-13",
    );
  });
});

describe("MiniMonth dots (RF-24)", () => {
  it("draws up to three dots of visible calendars in their colors", () => {
    renderMini({
      marks: { "2026-10-13": ["home", "hidden", "work", "gym", "club"] },
      visible: ["home", "work", "gym", "club"],
    });

    const dots = dayLink(/^martes, 13 de octubre/).querySelectorAll(
      "[data-dot]",
    );
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveStyle({ backgroundColor: COLORS.home });
    expect(dayLink(/^martes, 13 de octubre/)).toHaveAccessibleName(
      /con eventos/,
    );
  });

  it("follows fresh marks of its month after a change (spec 017)", () => {
    const props = {
      month: "2026-10",
      today: "2026-10-22",
      view: "agenda" as const,
      colors: COLORS,
      visibleCalendarIds: new Set(["home"]),
      loadMonthMarks: vi.fn<Load>(),
    };
    const { rerender } = render(
      <MiniMonth {...props} initialMarks={{ "2026-10-13": ["home"] }} />,
    );
    rerender(
      <MiniMonth {...props} initialMarks={{ "2026-10-20": ["home"] }} />,
    );

    expect(
      dayLink(/^martes, 13 de octubre/).querySelectorAll("[data-dot]"),
    ).toHaveLength(0);
    expect(
      dayLink(/^martes, 20 de octubre/).querySelectorAll("[data-dot]"),
    ).toHaveLength(1);
  });

  it("draws no dot for a hidden calendar", () => {
    renderMini({ marks: { "2026-10-14": ["home"] }, visible: ["work"] });

    expect(
      dayLink(/^miércoles, 14 de octubre/).querySelectorAll("[data-dot]"),
    ).toHaveLength(0);
  });
});

describe("MiniMonth months (RF-26)", () => {
  it("loads the marks of another month without leaving the view", async () => {
    const load = vi.fn<Load>(async () => ({
      marks: { "2026-11-05": ["work"] },
    }));
    renderMini({ load });

    await userEvent.click(
      screen.getByRole("button", { name: "Mostrar mes siguiente" }),
    );

    expect(load).toHaveBeenCalledWith("2026-11");
    expect(await screen.findByText("noviembre de 2026")).toBeInTheDocument();
    expect(
      dayLink(/^jueves, 5 de noviembre/).querySelectorAll("[data-dot]"),
    ).toHaveLength(1);
  });

  it("stays on the month it was showing if the marks cannot be loaded", async () => {
    const load = vi.fn<Load>(async () => ({ error: "Sin conexión" }));
    renderMini({ load });

    await userEvent.click(
      screen.getByRole("button", { name: "Mostrar mes anterior" }),
    );

    expect(load).toHaveBeenCalledWith("2026-09");
    expect(await screen.findByRole("alert")).toHaveTextContent("Sin conexión");
    expect(screen.getByText("octubre de 2026")).toBeInTheDocument();
  });
});
