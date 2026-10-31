// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COMMENT_MESSAGES } from "@/lib/comments/error-messages";
import { occurrenceId } from "@/lib/recurrence/occurrence-id";

// Spec 014, T5: Server Actions of the comments (plan "Contratos"; RF-7, RF-8,
// RF-10, RF-12 to RF-16, RF-28, casos límite).
const EVENT = "5b8f6c2e-3f0a-4d8e-9a51-2a8f1d7c9e10";
const SERIES = "0d7e1c6a-8b2f-4c3d-9e4f-5a6b7c8d9e0f";
const COMMENT = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const ROW = "33333333-3333-4333-8333-333333333333";
const OCCURRENCE = occurrenceId(SERIES, "2026-11-10T17:00:00Z");
const PAGE = { comments: [], hasOlder: false };
const SINCE = { createdAt: "2026-10-31T10:00:00.123456+00:00", id: COMMENT };

const h = vi.hoisted(() => ({
  listComments: vi.fn(),
  commentRowFor: vi.fn(),
  materializeOccurrence: vi.fn(),
  revalidatePath: vi.fn(),
  insert: vi.fn(),
  write: { data: null as unknown, error: null as unknown },
  visible: null as unknown,
  calls: [] as unknown[][],
}));

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@/lib/comments/queries", () => ({
  listComments: h.listComments,
  commentRowFor: h.commentRowFor,
}));
vi.mock("@/app/dashboard/events/image-actions", () => ({
  materializeOccurrence: h.materializeOccurrence,
}));
vi.mock("@/lib/calendar/queries", () => ({
  requireActionUser: async () => ({
    userId: "me",
    supabase: {
      from: () => ({
        insert: async (row: unknown) => {
          h.calls.push(["insert", row]);
          return h.insert();
        },
        update: (row: unknown) => ({
          eq: (column: string, value: unknown) => ({
            select: async () => {
              h.calls.push(["update", row, column, value]);
              return h.write;
            },
          }),
        }),
        delete: () => ({
          eq: (column: string, value: unknown) => ({
            select: async () => {
              h.calls.push(["delete", column, value]);
              return h.write;
            },
          }),
        }),
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: h.visible, error: null }),
          }),
        }),
      }),
    },
  }),
}));

const { addComment, deleteComment, editComment, loadComments } =
  await import("@/app/dashboard/events/comment-actions");

beforeEach(() => {
  vi.clearAllMocks();
  h.listComments.mockResolvedValue(PAGE);
  h.insert.mockReturnValue({ error: null });
  h.write = { data: [{ id: COMMENT }], error: null };
  h.visible = null;
  h.calls = [];
});

describe("loadComments (RF-1, RF-6, RF-20)", () => {
  it("passes before and since to the query", async () => {
    expect(await loadComments(EVENT)).toEqual({ ok: true, page: PAGE });
    expect(h.listComments).toHaveBeenLastCalledWith(
      expect.anything(),
      EVENT,
      "me",
      {},
    );
    await loadComments(EVENT, { before: SINCE });
    expect(h.listComments.mock.lastCall![3]).toEqual({ before: SINCE });
    await loadComments(OCCURRENCE, { since: SINCE });
    expect(h.listComments.mock.lastCall![3]).toEqual({ since: SINCE });
  });

  it("says the event is gone when the query finds nothing", async () => {
    h.listComments.mockResolvedValue(null);
    expect(await loadComments(EVENT)).toEqual({
      ok: false,
      gone: true,
      error: COMMENT_MESSAGES.gone,
    });
  });

  it("rejects invalid ids and cursors without calling Supabase", async () => {
    expect(await loadComments("x")).toMatchObject({ ok: false, gone: true });
    expect(
      await loadComments(EVENT, { since: { createdAt: "ayer", id: COMMENT } }),
    ).toMatchObject({ ok: false });
    expect(h.listComments).not.toHaveBeenCalled();
  });

  it("maps a failing query to the connection message", async () => {
    h.listComments.mockRejectedValue(new TypeError("fetch failed"));
    expect(await loadComments(EVENT)).toEqual({
      ok: false,
      error: COMMENT_MESSAGES.connection,
    });
  });
});

describe("addComment (RF-7, RF-8, RF-10, RF-12, RF-13)", () => {
  it("inserts the trimmed text with the client id and returns the list", async () => {
    expect(
      await addComment(EVENT, "  Llevo la tarta \n", CLIENT, SINCE),
    ).toEqual({ ok: true, page: PAGE });
    expect(h.calls).toEqual([
      [
        "insert",
        { event_id: EVENT, body: "Llevo la tarta", client_id: CLIENT },
      ],
    ]);
    expect(h.listComments.mock.lastCall![3]).toEqual({ since: SINCE });
    expect(h.revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  });

  it("explains an empty or too long text next to the field", async () => {
    expect(await addComment(EVENT, "  ", CLIENT)).toEqual({
      ok: false,
      fieldError: COMMENT_MESSAGES.empty,
      error: COMMENT_MESSAGES.empty,
    });
    expect(await addComment(EVENT, "a".repeat(1001), CLIENT)).toMatchObject({
      fieldError: COMMENT_MESSAGES.tooLong,
    });
    expect(h.calls).toEqual([]);
  });

  it("counts a repeated client id as saved", async () => {
    h.insert.mockReturnValue({ error: { code: "23505" } });
    expect(await addComment(EVENT, "Hola", CLIENT)).toEqual({
      ok: true,
      page: PAGE,
    });
  });

  it("closes on a gone event and explains a lost access", async () => {
    h.insert.mockReturnValue({ error: { code: "23503" } });
    expect(await addComment(EVENT, "Hola", CLIENT)).toEqual({
      ok: false,
      gone: true,
      error: COMMENT_MESSAGES.gone,
    });
    h.insert.mockReturnValue({ error: { code: "42501" } });
    expect(await addComment(EVENT, "Hola", CLIENT)).toEqual({
      ok: false,
      error: COMMENT_MESSAGES.noAccess,
    });
  });

  it("rejects an invalid event or client id", async () => {
    expect(await addComment("x", "Hola", CLIENT)).toMatchObject({ ok: false });
    expect(await addComment(EVENT, "Hola", "x")).toMatchObject({ ok: false });
    expect(h.calls).toEqual([]);
  });
});

describe("addComment on an occurrence (RF-28)", () => {
  it("materializes an occurrence without a row first", async () => {
    h.commentRowFor.mockResolvedValue(undefined);
    h.materializeOccurrence.mockResolvedValue({ eventId: ROW });
    expect(await addComment(OCCURRENCE, "Hola", CLIENT)).toMatchObject({
      ok: true,
    });
    expect(h.materializeOccurrence).toHaveBeenCalledWith(OCCURRENCE);
    expect(h.calls[0]).toEqual([
      "insert",
      { event_id: ROW, body: "Hola", client_id: CLIENT },
    ]);
  });

  it("uses the exception that already exists", async () => {
    h.commentRowFor.mockResolvedValue({ id: ROW, calendarId: "c" });
    await addComment(OCCURRENCE, "Hola", CLIENT);
    expect(h.materializeOccurrence).not.toHaveBeenCalled();
    expect(h.calls[0]).toEqual([
      "insert",
      { event_id: ROW, body: "Hola", client_id: CLIENT },
    ]);
  });

  it("closes when the date is not an occurrence or the series is gone", async () => {
    h.commentRowFor.mockResolvedValue(undefined);
    h.materializeOccurrence.mockResolvedValue({ error: "No existe" });
    expect(await addComment(OCCURRENCE, "Hola", CLIENT)).toMatchObject({
      ok: false,
      gone: true,
    });
    h.commentRowFor.mockResolvedValue(null);
    expect(await addComment(OCCURRENCE, "Hola", CLIENT)).toMatchObject({
      ok: false,
      gone: true,
    });
    expect(h.calls).toEqual([]);
  });
});

describe("editComment and deleteComment (RF-14 to RF-16)", () => {
  it("edits the body and returns the list", async () => {
    expect(await editComment(EVENT, COMMENT, " Cambiado ", SINCE)).toEqual({
      ok: true,
      page: PAGE,
    });
    expect(h.calls).toEqual([["update", { body: "Cambiado" }, "id", COMMENT]]);
  });

  it("validates the edited text", async () => {
    expect(await editComment(EVENT, COMMENT, "")).toMatchObject({
      fieldError: COMMENT_MESSAGES.empty,
    });
    expect(h.calls).toEqual([]);
  });

  it("deletes and refreshes the views", async () => {
    expect(await deleteComment(EVENT, COMMENT, SINCE)).toEqual({
      ok: true,
      page: PAGE,
    });
    expect(h.calls).toEqual([["delete", "id", COMMENT]]);
    expect(h.revalidatePath).toHaveBeenCalled();
  });

  it("explains zero rows: gone comment or not allowed", async () => {
    h.write = { data: [], error: null };
    expect(await editComment(EVENT, COMMENT, "Hola")).toEqual({
      ok: false,
      error: COMMENT_MESSAGES.commentGone,
    });
    h.visible = { id: COMMENT };
    expect(await deleteComment(EVENT, COMMENT)).toEqual({
      ok: false,
      error: COMMENT_MESSAGES.forbidden,
    });
  });

  it("rejects invalid comment ids", async () => {
    expect(await deleteComment(EVENT, "x")).toMatchObject({ ok: false });
    expect(await editComment(EVENT, "x", "Hola")).toMatchObject({ ok: false });
    expect(h.calls).toEqual([]);
  });
});
