import { describe, expect, it } from "vitest";
import {
  COMMENT_MESSAGES,
  getCommentErrorMessage,
} from "@/lib/comments/error-messages";
import { linkify } from "@/lib/comments/linkify";
import { fullDateTime, relativeTime } from "@/lib/comments/relative-time";
import { commentBodySchema } from "@/lib/comments/schemas";

// Spec 014, T3: pure logic of the comments (RF-2, RF-9 to RF-12).

describe("commentBodySchema (RF-9, RF-10)", () => {
  it("trims the ends and keeps the inner line breaks", () => {
    expect(commentBodySchema.parse("\n  Hola\n\nadiós  \n")).toBe(
      "Hola\n\nadiós",
    );
  });

  it("rejects empty and blank texts with a message", () => {
    for (const text of ["", "   \n\t "]) {
      const result = commentBodySchema.safeParse(text);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe(COMMENT_MESSAGES.empty);
    }
  });

  it("accepts 1000 characters, counting emojis as one, and rejects 1001", () => {
    expect(commentBodySchema.safeParse("a".repeat(1000)).success).toBe(true);
    expect(commentBodySchema.safeParse("🎂".repeat(1000)).success).toBe(true);
    const result = commentBodySchema.safeParse("a".repeat(1001));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(COMMENT_MESSAGES.tooLong);
  });

  it("accepts only emojis and other languages", () => {
    expect(commentBodySchema.parse("🎉🎂")).toBe("🎉🎂");
    expect(commentBodySchema.parse("お誕生日おめでとう")).toBe(
      "お誕生日おめでとう",
    );
  });
});

describe("linkify (RF-11)", () => {
  it("splits https links from the text", () => {
    expect(linkify("Mira https://example.com/a?b=1 y vuelve")).toEqual([
      { type: "text", text: "Mira " },
      { type: "link", href: "https://example.com/a?b=1" },
      { type: "text", text: " y vuelve" },
    ]);
  });

  it("leaves the final punctuation of a sentence out of the link", () => {
    expect(linkify("Entradas: https://example.com/x.")).toEqual([
      { type: "text", text: "Entradas: " },
      { type: "link", href: "https://example.com/x" },
      { type: "text", text: "." },
    ]);
    expect(linkify("(https://example.com)")).toEqual([
      { type: "text", text: "(" },
      { type: "link", href: "https://example.com" },
      { type: "text", text: ")" },
    ]);
  });

  it("keeps a closing parenthesis that belongs to the link", () => {
    expect(linkify("https://es.wikipedia.org/wiki/Tarta_(postre)")).toEqual([
      { type: "link", href: "https://es.wikipedia.org/wiki/Tarta_(postre)" },
    ]);
  });

  it("keeps http, javascript and HTML as text", () => {
    for (const text of [
      "http://example.com",
      "javascript:alert(1)",
      "<b>hola</b>",
      'https:/"roto"',
    ]) {
      expect(linkify(text)).toEqual([{ type: "text", text }]);
    }
  });

  it("returns nothing for an empty text", () => {
    expect(linkify("")).toEqual([]);
  });
});

describe("relativeTime and fullDateTime (RF-2)", () => {
  const TZ = "Europe/Madrid";
  // 2026-11-03 12:00 in Madrid.
  const now = new Date("2026-11-03T11:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it("says ahora under a minute, also with a clock ahead", () => {
    expect(relativeTime(ago(30_000), now, TZ)).toBe("ahora");
    expect(relativeTime(ago(-5_000), now, TZ)).toBe("ahora");
  });

  it("counts minutes and hours of the same day", () => {
    expect(relativeTime(ago(5 * 60_000), now, TZ)).toBe("hace 5 min");
    expect(relativeTime(ago(2 * 3_600_000), now, TZ)).toBe("hace 2 h");
  });

  it("says ayer with the time in the profile's zone", () => {
    expect(relativeTime("2026-11-02T17:30:00Z", now, TZ)).toBe(
      "ayer a las 18:30",
    );
  });

  it("gives the day for older dates and the year for other years", () => {
    expect(relativeTime("2026-10-20T08:05:00Z", now, TZ)).toBe(
      "20 oct a las 10:05",
    );
    expect(relativeTime("2025-12-31T10:00:00Z", now, TZ)).toBe("31 dic 2025");
  });

  it("gives the full date and time", () => {
    expect(fullDateTime("2026-11-02T17:30:00Z", TZ)).toBe(
      "lunes, 2 de noviembre de 2026, 18:30",
    );
  });
});

describe("getCommentErrorMessage (RF-12)", () => {
  it("translates the codes of the database", () => {
    expect(getCommentErrorMessage({ code: "42501" })).toBe(
      COMMENT_MESSAGES.noAccess,
    );
    expect(getCommentErrorMessage({ code: "23503" })).toBe(
      COMMENT_MESSAGES.gone,
    );
    expect(getCommentErrorMessage({ code: "CF404" })).toBe(
      COMMENT_MESSAGES.gone,
    );
    expect(getCommentErrorMessage({ code: "23514" })).toBe(
      COMMENT_MESSAGES.length,
    );
  });

  it("maps network errors and unknown codes to the connection message", () => {
    expect(getCommentErrorMessage(new TypeError("fetch failed"))).toBe(
      COMMENT_MESSAGES.connection,
    );
    expect(getCommentErrorMessage({ code: "XX000" })).toBe(
      COMMENT_MESSAGES.connection,
    );
    expect(getCommentErrorMessage(null)).toBe(COMMENT_MESSAGES.connection);
  });
});
