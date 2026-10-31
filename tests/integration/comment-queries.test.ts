import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DELETED_ACCOUNT, FORMER_MEMBER } from "@/lib/account/author-label";
import { listComments } from "@/lib/comments/queries";
import { occurrenceId } from "@/lib/recurrence/occurrence-id";
import {
  admin,
  createTestUser,
  deleteTestMail,
  deleteTestUser,
  getOwnCalendarId,
  type TestUser,
} from "./helpers";

// Spec 014, T4: listComments (plan "Contratos", D3, D9; RF-1 to RF-4, RF-6,
// RF-16, RF-17, RF-21, RF-24, RF-28).
let owner: TestUser;
let viewer: TestUser;
let calendar: string;
const extraUsers: string[] = [];

beforeAll(async () => {
  [owner, viewer] = await Promise.all([
    createTestUser({ display_name: "Olga" }),
    createTestUser({ display_name: "Vic" }),
  ]);
  calendar = await getOwnCalendarId(owner.id);
  const { error } = await admin
    .from("calendar_members")
    .insert({ calendar_id: calendar, user_id: viewer.id, role: "viewer" });
  if (error) throw error;
});

afterAll(async () => {
  await Promise.all(
    [owner, viewer, ...extraUsers.map((id) => ({ id }))].map((user) =>
      deleteTestUser(user.id),
    ),
  );
  await deleteTestMail();
});

async function createEvent(extra: object = {}) {
  const { data, error } = await admin
    .from("events")
    .insert({
      calendar_id: calendar,
      title: "Cena",
      starts_at: "2026-11-02T10:00:00Z",
      ends_at: "2026-11-02T11:00:00Z",
      ...extra,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Comments one minute apart, the first the oldest. */
async function seed(eventId: string, authors: (string | null)[], from = 0) {
  const base = Date.parse("2026-10-01T10:00:00Z");
  const { data, error } = await admin
    .from("event_comments")
    .insert(
      authors.map((author, i) => ({
        event_id: eventId,
        author_id: author,
        client_id: randomUUID(),
        body: `Comentario ${from + i + 1}`,
        created_at: new Date(base + (from + i) * 60_000).toISOString(),
      })),
    )
    .select("id");
  if (error) throw error;
  return data.map((row) => row.id);
}

describe("pages (RF-1, RF-6)", () => {
  it("returns the 50 most recent in chronological order and hasOlder", async () => {
    const event = await createEvent();
    await seed(event, Array(55).fill(owner.id));

    const page = await listComments(viewer.client, event, viewer.id);
    expect(page!.comments).toHaveLength(50);
    expect(page!.comments[0].body).toBe("Comentario 6");
    expect(page!.comments.at(-1)!.body).toBe("Comentario 55");
    expect(page!.hasOlder).toBe(true);

    const first = page!.comments[0];
    const older = await listComments(viewer.client, event, viewer.id, {
      before: { createdAt: first.createdAt, id: first.id },
    });
    expect(older!.comments.map((c) => c.body)).toEqual([
      "Comentario 1",
      "Comentario 2",
      "Comentario 3",
      "Comentario 4",
      "Comentario 5",
    ]);
    expect(older!.hasOlder).toBe(false);
  });

  it("since returns everything from a comment, edited and without the deleted", async () => {
    const event = await createEvent();
    const ids = await seed(event, [owner.id, viewer.id, owner.id, owner.id]);
    const page = await listComments(viewer.client, event, viewer.id);
    const second = page!.comments[1];

    await admin
      .from("event_comments")
      .update({ body: "Cambiado" })
      .eq("id", ids[2]);
    await admin.from("event_comments").delete().eq("id", ids[3]);
    await seed(event, [owner.id], 5);

    const since = await listComments(viewer.client, event, viewer.id, {
      since: { createdAt: second.createdAt, id: second.id },
    });
    expect(since!.comments.map((c) => [c.body, c.edited])).toEqual([
      ["Comentario 2", false],
      ["Cambiado", true],
      ["Comentario 6", false],
    ]);
    expect(since!.hasOlder).toBe(true);
  });

  it("returns an empty page for an event without comments", async () => {
    const event = await createEvent();
    expect(await listComments(viewer.client, event, viewer.id)).toEqual({
      comments: [],
      hasOlder: false,
    });
  });
});

describe("authors and permissions (RF-2 to RF-4, RF-16, RF-17, RF-24)", () => {
  it("names the authors, without emails, and says what each may do", async () => {
    const leaver = await createTestUser({ display_name: "Lea" });
    const gone = await createTestUser({ display_name: "Gus" });
    extraUsers.push(leaver.id);
    await admin.from("calendar_members").insert([
      { calendar_id: calendar, user_id: leaver.id, role: "viewer" },
      { calendar_id: calendar, user_id: gone.id, role: "viewer" },
    ]);
    const event = await createEvent();
    await seed(event, [owner.id, viewer.id, leaver.id, gone.id]);
    await admin
      .from("calendar_members")
      .delete()
      .eq("calendar_id", calendar)
      .eq("user_id", leaver.id);
    await deleteTestUser(gone.id);

    const asViewer = await listComments(viewer.client, event, viewer.id);
    expect(
      asViewer!.comments.map((c) => [c.author, c.canEdit, c.canDelete]),
    ).toEqual([
      ["Olga", false, false],
      ["Vic", true, true],
      [FORMER_MEMBER, false, false],
      [DELETED_ACCOUNT, false, false],
    ]);
    expect(asViewer!.comments[1].authorId).toBe(viewer.id);
    expect(JSON.stringify(asViewer)).not.toMatch(/@cafam\.test/);

    const asOwner = await listComments(owner.client, event, owner.id);
    expect(asOwner!.comments.map((c) => [c.canEdit, c.canDelete])).toEqual([
      [true, true],
      [false, true],
      [false, true],
      [false, true],
    ]);
  });

  it("returns null for an event the user cannot see", async () => {
    const stranger = await createTestUser({ display_name: "Sam" });
    extraUsers.push(stranger.id);
    const event = await createEvent();
    expect(await listComments(stranger.client, event, stranger.id)).toBeNull();
    expect(
      await listComments(viewer.client, randomUUID(), viewer.id),
    ).toBeNull();
  });
});

describe("occurrences (RF-28)", () => {
  it("an occurrence without a row has no comments; with one, its own", async () => {
    const series = await createEvent({
      starts_at: "2026-11-03T17:00:00Z",
      ends_at: "2026-11-03T18:00:00Z",
      recurrence: "FREQ=WEEKLY;INTERVAL=1;BYDAY=TU",
      recurrence_tz: "Europe/Madrid",
    });
    const start = "2026-11-10T17:00:00Z";
    const exception = await createEvent({
      starts_at: start,
      ends_at: "2026-11-10T18:00:00Z",
      series_id: series,
      original_start: start,
    });
    await seed(exception, [viewer.id]);

    const withRow = await listComments(
      viewer.client,
      occurrenceId(series, start),
      viewer.id,
    );
    expect(withRow!.comments.map((c) => c.body)).toEqual(["Comentario 1"]);

    const withoutRow = await listComments(
      viewer.client,
      occurrenceId(series, "2026-11-17T17:00:00Z"),
      viewer.id,
    );
    expect(withoutRow).toEqual({ comments: [], hasOlder: false });
  });
});
