import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SlotLayer } from "@/components/calendar/slot-layer";

// Spec 008, T16: click and drag on the hour grid (RF-20, RF-22, RF-40, RF-42..RF-45).
const HOUR = 48;
const DAY_PX = 24 * HOUR;

function setup() {
  const onCreate = vi.fn();
  render(
    <div style={{ position: "relative", height: DAY_PX }}>
      <SlotLayer
        day="2026-10-21"
        dayLabel="miércoles, 21 de octubre de 2026"
        onCreate={onCreate}
      />
    </div>,
  );
  const layer = screen.getByTestId("slot-layer");
  // jsdom has no layout: the column is 1152 px tall from the top of the page.
  vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({
    top: 0,
    left: 100,
    width: 120,
    height: DAY_PX,
    right: 220,
    bottom: DAY_PX,
    x: 100,
    y: 0,
    toJSON: () => ({}),
  });
  return { onCreate, layer };
}

const at = (hours: number) => hours * HOUR;

function pointer(
  type: "pointerDown" | "pointerMove" | "pointerUp",
  layer: HTMLElement,
  hours: number,
  pointerType = "mouse",
) {
  fireEvent[type](layer, {
    clientY: at(hours),
    clientX: 150,
    button: 0,
    pointerId: 1,
    pointerType,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("SlotLayer", () => {
  it("a click opens the half hour pressed and one hour (RF-20)", () => {
    const { onCreate, layer } = setup();

    pointer("pointerDown", layer, 10.2);
    pointer("pointerUp", layer, 10.2);

    expect(onCreate).toHaveBeenCalledWith(
      "2026-10-21",
      { start: 600, end: 660 },
      expect.objectContaining({ top: at(10), height: HOUR }),
    );
  });

  it("a mouse drag draws the block in quarters and opens with that interval (RF-42)", () => {
    const { onCreate, layer } = setup();

    pointer("pointerDown", layer, 16);
    pointer("pointerMove", layer, 17.5);
    expect(screen.getByText("(Sin título)")).toBeVisible();
    expect(screen.getByText("16:00 – 17:30")).toBeVisible();
    pointer("pointerUp", layer, 17.5);

    expect(onCreate).toHaveBeenCalledWith(
      "2026-10-21",
      { start: 960, end: 1050 },
      expect.objectContaining({ top: at(16), height: 1.5 * HOUR }),
    );
    expect(screen.queryByText("(Sin título)")).toBeNull();
  });

  it("an upward drag works too (RF-43)", () => {
    const { onCreate, layer } = setup();

    pointer("pointerDown", layer, 18);
    pointer("pointerMove", layer, 16.5);
    pointer("pointerUp", layer, 16.5);

    expect(onCreate).toHaveBeenCalledWith(
      "2026-10-21",
      { start: 990, end: 1080 },
      expect.anything(),
    );
  });

  it("Escape cancels a drag without opening anything (RF-44)", () => {
    const { onCreate, layer } = setup();

    pointer("pointerDown", layer, 16);
    pointer("pointerMove", layer, 17);
    fireEvent.keyDown(window, { key: "Escape" });
    pointer("pointerUp", layer, 17);

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.queryByText("(Sin título)")).toBeNull();
  });

  it("a finger never drags: a tap acts as a click (RF-45)", () => {
    const { onCreate, layer } = setup();

    pointer("pointerDown", layer, 9.1, "touch");
    pointer("pointerMove", layer, 9.15, "touch");
    expect(screen.queryByText("(Sin título)")).toBeNull();
    pointer("pointerUp", layer, 9.15, "touch");
    // Opened by the click after it, which would otherwise close the new window (spec 017).
    expect(onCreate).not.toHaveBeenCalled();
    fireEvent.click(layer);

    expect(onCreate).toHaveBeenCalledWith(
      "2026-10-21",
      { start: 540, end: 600 },
      expect.anything(),
    );
  });

  it("a finger that scrolls creates nothing (RF-45)", () => {
    const { onCreate, layer } = setup();

    pointer("pointerDown", layer, 9, "touch");
    fireEvent.pointerCancel(layer, { pointerId: 1, pointerType: "touch" });

    expect(onCreate).not.toHaveBeenCalled();
  });

  it("a pinch creates nothing (spec 017 RF-49)", () => {
    const { onCreate, layer } = setup();

    pointer("pointerDown", layer, 9, "touch");
    fireEvent.pointerDown(layer, {
      clientY: at(11),
      clientX: 150,
      button: 0,
      pointerId: 2,
      pointerType: "touch",
    });
    pointer("pointerMove", layer, 8, "touch");
    pointer("pointerUp", layer, 8, "touch");

    expect(onCreate).not.toHaveBeenCalled();
  });

  it("a finger that moves without scrolling creates nothing", () => {
    const { onCreate, layer } = setup();

    pointer("pointerDown", layer, 9, "touch");
    pointer("pointerMove", layer, 10, "touch");
    pointer("pointerUp", layer, 10, "touch");

    expect(onCreate).not.toHaveBeenCalled();
  });

  it("can be reached with the keyboard (RF-22)", async () => {
    const { onCreate } = setup();

    await userEvent.tab();
    expect(
      screen.getByRole("button", {
        name: "Crear evento el miércoles, 21 de octubre de 2026",
      }),
    ).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    expect(onCreate).toHaveBeenCalledWith(
      "2026-10-21",
      { start: 540, end: 600 },
      expect.anything(),
    );
  });
});
