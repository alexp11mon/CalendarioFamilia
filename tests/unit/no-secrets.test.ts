import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Constitution P4: server-only secrets must never appear in app code.
const FORBIDDEN_PATTERNS = ["SUPABASE_SECRET_KEY", "service_role"];
const SRC_DIR = join(process.cwd(), "src");

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

const FILES = listFiles(SRC_DIR).map((file) => ({
  path: relative(SRC_DIR, file).split(sep).join("/"),
  content: readFileSync(file, "utf8"),
}));

describe("no secrets in src/", () => {
  it("contains no reference to server-only secrets", () => {
    const offenders = FILES.flatMap(({ path, content }) =>
      FORBIDDEN_PATTERNS.filter((pattern) => content.includes(pattern)).map(
        (pattern) => `${path}: ${pattern}`,
      ),
    );

    expect(offenders).toEqual([]);
  });
});

// Spec 007, T14: the OAuth client secret, the cron secret and the refresh
// tokens stay on the server.
const SERVER_SECRETS = ["GOOGLE_CLIENT_SECRET", "CRON_SECRET"];
const isClient = (content: string) => /^\s*["']use client["']/.test(content);

/** `@/…` and relative imports of a file, as paths inside src/ without extension. */
function importsOf(path: string, content: string): string[] {
  const dir = path.split("/").slice(0, -1);
  return [...content.matchAll(/from\s+["']([^"']+)["']/g)].flatMap(
    ([, spec]) => {
      if (spec.startsWith("@/")) return [spec.slice(2)];
      if (!spec.startsWith(".")) return [];
      const parts = [...dir];
      for (const part of spec.split("/")) {
        if (part === "..") parts.pop();
        else if (part !== ".") parts.push(part);
      }
      return [parts.join("/")];
    },
  );
}

const withoutExtension = (path: string) => path.replace(/\.tsx?$/, "");

describe("spec 007 secrets (T14)", () => {
  it("never exposes the server secrets with NEXT_PUBLIC_", () => {
    const pattern = /NEXT_PUBLIC_\w*(GOOGLE_CLIENT_SECRET|CRON_SECRET)/;
    expect(
      FILES.filter(({ content }) => pattern.test(content)).map((f) => f.path),
    ).toEqual([]);
  });

  it("reads them only in server code that no client component imports", () => {
    const holders = FILES.filter(({ content }) =>
      SERVER_SECRETS.some((secret) => content.includes(secret)),
    );
    expect(holders.length).toBeGreaterThan(0);
    expect(
      holders.filter(({ content }) => isClient(content)).map((f) => f.path),
    ).toEqual([]);

    const holderPaths = new Set(holders.map((f) => withoutExtension(f.path)));
    const leaks = FILES.filter(({ content }) => isClient(content)).flatMap(
      ({ path, content }) =>
        importsOf(path, content)
          .filter((target) => holderPaths.has(target))
          .map((target) => `${path} -> ${target}`),
    );
    expect(leaks).toEqual([]);
  });

  it("handles refresh tokens only in the provider client and the server sync code", () => {
    // The callback stores the new token, the engine stores a rotated one, and
    // database.ts is the generated schema of the RPC arguments.
    const allowed = [
      "lib/sync/providers/google.ts",
      "app/api/oauth/[provider]/callback/route.ts",
      // Spec 018 T3: the token renewal moved from run-sync.ts to deps.ts.
      "lib/sync/deps.ts",
      "types/database.ts",
    ];
    const mentions = FILES.filter(({ content }) =>
      /refresh_?token/i.test(content),
    ).map((f) => f.path);

    expect(mentions.filter((path) => !allowed.includes(path))).toEqual([]);
    expect(
      FILES.filter(
        ({ path, content }) => allowed.includes(path) && isClient(content),
      ),
    ).toEqual([]);
  });
});

// Spec 013, T5: ical.js stays on the server (plan R7).
describe("spec 013 recurrence expansion (T5)", () => {
  it("ical.js is imported only by the .ics parser, the expansion and iCloud's .ics (spec 018)", () => {
    expect(
      FILES.filter(({ content }) => /from\s+["']ical\.js["']/.test(content))
        .map((f) => f.path)
        .sort(),
    ).toEqual([
      "lib/ics/parse-ics.ts",
      "lib/recurrence/expand.ts",
      "lib/sync/icloud-ics.ts",
    ]);
  });

  it("no client component imports the expansion", () => {
    const leaks = FILES.filter(({ content }) => isClient(content)).flatMap(
      ({ path, content }) =>
        importsOf(path, content.replace(/import\s+type\s[^;]*;/g, ""))
          .filter((target) => target === "lib/recurrence/expand")
          .map((target) => `${path} -> ${target}`),
    );
    expect(leaks).toEqual([]);
  });
});

// Spec 009, T13: the write engine runs only on the server; client components
// reach it through Server Actions, never by importing it.
describe("spec 009 write engine (T13)", () => {
  it("is not imported by any client component", () => {
    const serverOnly = [
      "lib/sync/write-event",
      "lib/sync/write-calendar",
      "lib/sync/upload-calendar",
      "lib/sync/engine",
      "lib/sync/providers/google",
    ];
    const leaks = FILES.filter(({ content }) => isClient(content)).flatMap(
      ({ path, content }) =>
        // `import type` is erased at build time, so it ships nothing.
        importsOf(path, content.replace(/import\s+type\s[^;]*;/g, ""))
          .filter((target) => serverOnly.includes(target))
          .map((target) => `${path} -> ${target}`),
    );
    expect(leaks).toEqual([]);
  });
});
