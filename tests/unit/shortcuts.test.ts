import { describe, expect, it } from "vitest";
import {
  SHORTCUTS,
  shortcutFor,
  type KeyPress,
} from "@/lib/calendar/shortcuts";

// Spec 008, T12: keyboard shortcuts of the calendar (RF-31, RF-36, RF-46).
function press(key: string, extra: Partial<KeyPress> = {}): KeyPress {
  return {
    key,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    target: document.body,
    dialogOpen: false,
    ...extra,
  };
}

function element(html: string): Element {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.firstElementChild!;
}

describe("shortcutFor", () => {
  it.each([
    ["n", "new"],
    ["N", "new"],
    ["t", "today"],
    ["ArrowLeft", "previous"],
    ["ArrowRight", "next"],
    ["a", "agenda"],
    ["m", "month"],
    ["s", "week"],
    ["d", "day"],
    ["g", "goto"],
    ["?", "help"],
  ])("maps %j to %j", (key, shortcut) => {
    expect(shortcutFor(press(key), true)).toBe(shortcut);
  });

  it("ignores other keys", () => {
    expect(shortcutFor(press("x"), true)).toBeNull();
    expect(shortcutFor(press("Enter"), true)).toBeNull();
  });

  it("ignores keys with Ctrl, Alt or Meta (browser shortcuts)", () => {
    expect(shortcutFor(press("t", { ctrlKey: true }), true)).toBeNull();
    expect(shortcutFor(press("d", { altKey: true }), true)).toBeNull();
    expect(shortcutFor(press("n", { metaKey: true }), true)).toBeNull();
  });

  it.each([
    '<input type="text" />',
    '<input type="time" />',
    "<input />",
    "<textarea></textarea>",
    "<select></select>",
    '<div contenteditable="true"></div>',
    '<input role="combobox" />',
  ])("ignores keys typed in %s", (html) => {
    expect(shortcutFor(press("m", { target: element(html) }), true)).toBeNull();
  });

  it("works from a checkbox or a button of the panel", () => {
    expect(
      shortcutFor(
        press("m", { target: element('<input type="checkbox" />') }),
        true,
      ),
    ).toBe("month");
    expect(
      shortcutFor(press("m", { target: element("<button></button>") }), true),
    ).toBe("month");
  });

  it("does nothing while a window is open", () => {
    expect(shortcutFor(press("m", { dialogOpen: true }), true)).toBeNull();
  });

  it("offers no N to whoever cannot create events (RF-36)", () => {
    expect(shortcutFor(press("n"), false)).toBeNull();
    expect(shortcutFor(press("t"), false)).toBe("today");
  });
});

// Spec 017, T13: one table for the detection and the help (RF-62, plan D16).
describe("SHORTCUTS", () => {
  it("lists every key with what it does", () => {
    const keys = SHORTCUTS.map((shortcut) => shortcut.keys);
    for (const key of ["N", "T", "A", "M", "S", "D", "G", "?", "E", "Supr"]) {
      expect(keys.join(" ")).toContain(key);
    }
    expect(keys.some((key) => key.includes("Alt"))).toBe(true);
    expect(keys.some((key) => key.includes("Ctrl"))).toBe(true);
    for (const shortcut of SHORTCUTS) {
      expect(shortcut.description).toMatch(/^[A-ZÁÉÍÓÚ]/);
    }
  });

  it("detects only the calendar keys of the table: E is for the detail", () => {
    expect(shortcutFor(press("e"), true)).toBeNull();
    expect(shortcutFor(press("Delete"), true)).toBeNull();
  });
});
