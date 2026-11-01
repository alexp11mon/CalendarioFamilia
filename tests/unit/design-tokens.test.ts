// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Spec 005, T11 and spec 011, T5: the design guard. Every screen uses only the
// tokens of globals.css and none of the devices the constitution bans (P9 and
// amendment 3; spec 005 plan D16, spec 011 RF-12, RF-22, RF-26 and plan D11).
const ROOT = join(process.cwd(), "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx|css)$/.test(name) ? [path] : [];
  });
}

const SOURCES = files(ROOT).map((path) => ({
  file: relative(process.cwd(), path).replaceAll("\\", "/"),
  code: readFileSync(path, "utf8"),
}));

// The floating shadow and glass only on what floats: dialogs, the "Más" sheet, the phone drawer,
// the rail tooltips, the time list, the toast and an event lifted while dragging (spec 017).
const FLOATING = new Set([
  "src/components/calendar/confirm-dialog.tsx",
  "src/components/calendar/draggable-event.tsx",
  "src/components/calendar/event-menu.tsx",
  "src/components/calendar/event-modal.tsx",
  "src/components/calendar/fab.tsx",
  "src/components/calendar/merge-form.tsx",
  "src/components/calendar/quick-create.tsx",
  "src/components/recurrence/recurrence-editor.tsx",
  "src/components/recurrence/series-scope-dialog.tsx",
  "src/components/shell/more-sheet.tsx",
  "src/components/shell/nav-drawer.tsx",
  "src/components/shell/side-rail.tsx",
  "src/components/ui/time-field.tsx",
  "src/components/ui/toast.tsx",
]);

const PALETTE =
  "(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\\d{2,3}";

const RULES: { name: string; pattern: RegExp; allow?: Set<string> }[] = [
  {
    name: "the old brand tokens",
    pattern:
      /\b(?:bg|text|border|ring|outline|fill|stroke|accent|decoration)-brand(?:-soft)?\b/,
  },
  { name: "a loose hex color in a class", pattern: /-\[#[0-9a-fA-F]{3,8}\]/ },
  {
    name: "a Tailwind palette color",
    pattern: new RegExp(
      `\\b(?:bg|text|border|ring|outline|fill|stroke|accent|decoration|from|via|to)-${PALETTE}\\b`,
    ),
  },
  { name: "bg-white (paper is the light surface)", pattern: /\bbg-white\b/ },
  { name: "monospace", pattern: /\bfont-mono\b/ },
  { name: "a gradient", pattern: /\bbg-(?:linear|radial|conic|gradient)-/ },
  // Glass is the glass and glass-float utilities of globals.css (plan D6).
  { name: "a loose blur", pattern: /\bbackdrop-blur/ },
  {
    // box-shadow inside a transition-[…] list is a CSS property, not a class.
    name: "a shadow other than shadow-soft and shadow-float",
    pattern: /(?<![\w-])(?:drop-)?shadow(?!-(?:soft|float)\b)(?:-[a-z0-9]+)?\b/,
  },
  {
    name: "a floating shadow or glass at rest",
    pattern: /\b(?:shadow|glass)-float\b/,
    allow: FLOATING,
  },
  // Fixed white or black breaks one of the themes: on-ink, pastel-ink, mark.
  { name: "text-white", pattern: /\btext-white\b/ },
  { name: "text-black", pattern: /\btext-black\b/ },
  // Themes come from the tokens, never from a variant (plan D2).
  { name: "the dark: variant", pattern: /(?<![\w-])dark:[a-z[!]/ },
  // Tailwind's default ring offset is white, a white gap in the dark theme.
  {
    name: "a ring offset without its color",
    pattern: /\bring-offset-\d\b(?![^"]*\bring-offset-(?:paper|stone)\b)/,
  },
  {
    name: "a duration longer than 400 ms",
    pattern:
      /\bduration-(?:[5-9]\d\d|\d{4,})\b|\bduration-\[(?:(?:4\d[1-9]|4[1-9]\d|[5-9]\d\d|\d{4,})ms|\d+(?:\.\d+)?s)\]/,
  },
  {
    name: "tracked uppercase labels",
    pattern: /\buppercase\b[^"]*\btracking-(?:wide|wider|widest)\b/,
  },
  { name: "an emoji", pattern: /\p{Extended_Pictographic}/u },
  // The old blue of spec 001 is gone everywhere (spec 005 RF-55..RF-58).
  { name: "the old blue #2563EB", pattern: /#2563eb/i },
];

describe("design guard (P9)", () => {
  it("scans the app sources", () => {
    expect(SOURCES.length).toBeGreaterThan(50);
  });

  it.each(RULES)("no file uses $name", ({ pattern, allow }) => {
    const offenders = SOURCES.filter(
      ({ file, code }) =>
        !file.endsWith("globals.css") &&
        !allow?.has(file) &&
        pattern.test(code),
    ).map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it("globals.css no longer defines the old brand tokens", () => {
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");

    expect(css).not.toMatch(/--color-brand/);
    expect(css).not.toMatch(/#2563eb/i);
    // Only src/ is scanned, so examples in the docs never become CSS.
    expect(css).toMatch(/@import "tailwindcss" source\("\.\."\);/);
  });
});
