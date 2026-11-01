import { describe, expect, it } from "vitest";
import { sheetAfterDrag } from "@/lib/calendar/sheet";

// Spec 017, T14: where the detail sheet goes after a drag (RF-45, RF-46).
describe("sheetAfterDrag", () => {
  it("up from half fills the screen (RF-45)", () => {
    expect(sheetAfterDrag("half", -80, 0.1)).toBe("full");
  });

  it("down from half closes it (RF-46)", () => {
    expect(sheetAfterDrag("half", 90, 0.1)).toBe("close");
  });

  it("down from full goes back to half", () => {
    expect(sheetAfterDrag("full", 120, 0.1)).toBe("half");
  });

  it("a short slow drag leaves it where it was", () => {
    expect(sheetAfterDrag("half", 20, 0.1)).toBe("half");
    expect(sheetAfterDrag("full", -30, 0.1)).toBe("full");
  });

  it("a short fast flick counts", () => {
    expect(sheetAfterDrag("half", 20, 0.8)).toBe("close");
    expect(sheetAfterDrag("half", -20, -0.8)).toBe("full");
  });
});
