import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGridZoom } from "@/lib/hooks/use-grid-zoom";

// Spec 017, T15: pinching and Ctrl + wheel on the hour grid (RF-49 to RF-53).
function Grid() {
  const ref = useRef<HTMLDivElement>(null);
  const hourPx = useGridZoom(ref);
  return (
    <div ref={ref} data-testid="grid">
      <div data-grid-scroll="" data-testid="scroller">
        <p data-testid="px">{hourPx}</p>
      </div>
    </div>
  );
}

function setup() {
  render(<Grid />);
  const scroller = screen.getByTestId("scroller");
  vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({
    top: 100,
    left: 0,
    width: 400,
    height: 600,
    right: 400,
    bottom: 700,
    x: 0,
    y: 100,
    toJSON: () => ({}),
  });
  return { grid: screen.getByTestId("grid"), scroller };
}

const px = () => Number(screen.getByTestId("px").textContent);

function finger(
  type: "pointerDown" | "pointerMove" | "pointerUp",
  target: Element,
  id: number,
  y: number,
) {
  fireEvent[type](target, {
    pointerId: id,
    pointerType: "touch",
    clientX: 100,
    clientY: y,
    button: 0,
  });
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useGridZoom", () => {
  it("starts at 48 px, or at the height remembered on this device (RF-53)", () => {
    localStorage.setItem("cafam-hour-px", "72");
    setup();
    expect(px()).toBe(72);
  });

  it("uses 48 px when the storage fails or holds rubbish", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setup();
    expect(px()).toBe(48);
  });

  it("two fingers moving apart make the hours taller, and it is remembered (RF-49)", () => {
    const { grid } = setup();
    finger("pointerDown", grid, 1, 300);
    finger("pointerDown", grid, 2, 400);
    act(() => finger("pointerMove", grid, 2, 500));
    expect(px()).toBe(96);
    finger("pointerUp", grid, 1, 300);
    finger("pointerUp", grid, 2, 500);
    expect(localStorage.getItem("cafam-hour-px")).toBe("96");
  });

  it("Ctrl + wheel changes the height and keeps the page from zooming (RF-50)", () => {
    const { grid } = setup();
    const event = new WheelEvent("wheel", {
      deltaY: -200,
      ctrlKey: true,
      clientY: 200,
      cancelable: true,
      bubbles: true,
    });
    act(() => {
      grid.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(px()).toBeGreaterThan(48);
  });

  it("the wheel alone scrolls", () => {
    const { grid } = setup();
    const event = new WheelEvent("wheel", {
      deltaY: -200,
      cancelable: true,
      bubbles: true,
    });
    grid.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(px()).toBe(48);
  });
});
