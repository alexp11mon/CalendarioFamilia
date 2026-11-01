import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOUR_PX,
  clampHourPx,
  scrollForZoom,
  wheelZoom,
} from "@/lib/calendar/zoom";

// Spec 017, T15: the height of an hour (RF-49 to RF-52, plan D15).
describe("zoom", () => {
  it("keeps an hour between half and three times 48 px (RF-51)", () => {
    expect(DEFAULT_HOUR_PX).toBe(48);
    expect(clampHourPx(10)).toBe(24);
    expect(clampHourPx(500)).toBe(144);
    expect(clampHourPx(60)).toBe(60);
  });

  it("keeps the hour under the anchor where it was (RF-52)", () => {
    // 10:00 is at 480 px; scrolled 400, it is 80 px from the top.
    const top = scrollForZoom({
      scrollTop: 400,
      anchor: 80,
      from: 48,
      to: 96,
    });
    // At 96 px 10:00 is at 960: still 80 px from the top.
    expect(top).toBe(880);
  });

  it("never scrolls above the top", () => {
    expect(scrollForZoom({ scrollTop: 0, anchor: 10, from: 48, to: 24 })).toBe(
      0,
    );
  });

  it("the wheel up zooms in and down zooms out, within the limits", () => {
    expect(wheelZoom(48, -100)).toBeGreaterThan(48);
    expect(wheelZoom(48, 100)).toBeLessThan(48);
    expect(wheelZoom(140, -1000)).toBe(144);
  });
});
