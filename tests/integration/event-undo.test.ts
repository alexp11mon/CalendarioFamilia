import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  anonClient,
  createTestUser,
  deleteQueuedImages,
  deleteTestMail,
  deleteTestUser,
  getOwnCalendarId,
  type TestUser,
} from "./helpers";

// Spec 017, T1: snapshot_event and restore_event, the purge margin and the
// cleanup job (plan "Modelo de datos", D6, D7; RF-25, RF-28 to RF-30).
let owner: TestUser;
let editor: TestUser;
let viewer: TestUser;
let stranger: TestUser;
let calendar: string;
const objectIds: string[] = [];
const SECRET = process.env.CRON_SECRET ?? "";

const TIMES = {
  starts_at: "2026-11-02T10:00:00Z",
  ends_at: "2026-11-02T11:00:00Z",
};

beforeAll(async () => {
  [owner, editor, viewer, stranger] = await Promise.all([
    createTestUser({ display_name: "Olga" }),
    createTestUser({ display_name: "Eva" }),
    createTestUser({ display_name: "Vic" }),
    createTestUser({ display_name: "Sam" }),
  ]);
  calendar = await getOwnCalendarId(owner.id);
  const { error } = await admin.from("calendar_members").insert([
    { calendar_id: calendar, user_id: editor.id, role: "editor" },
    { calendar_id: calendar, user_id: viewer.id, role: "viewer" },
  ]);
  if (error) throw error;
});

afterAll(async () => {
  await Promise.all(
    [owner, editor, viewer, stranger].map((user) => deleteTestUser(user.id)),
  );
  await deleteQueuedImages(objectIds);
  await deleteTestMail();
});

async function createEvent(extra: object = {}) {
  const { data, error } = await admin
    .from("events")
    .insert({
      calendar_id: calendar,
      title: "Cena",
      created_by: owner.id,
      color: "#BDB2FF",
      ...TIMES,
      ...extra,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function seedImage(eventId: string) {
  const objectId = randomUUID();
  objectIds.push(objectId);
  const { data, error } = await admin
    .from("event_images")
    .insert({
      event_id: eventId,
      object_id: objectId,
      uploaded_by: viewer.id,
      status: "ready",
      bytes: 1000,
      width: 10,
      height: 10,
    })
    .select("id, object_id")
    .single();
  if (error) throw error;
  return data;
}

async function seedComment(eventId: string) {
  const { data, error } = await admin
    .from("event_comments")
    .insert({
      event_id: eventId,
      author_id: viewer.id,
      body: "Llevo la tarta",
      client_id: randomUUID(),
      edited_at: "2026-11-01T09:00:00Z",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

function snapshot(user: TestUser, eventId: string, originalStart?: string) {
  return user.client.rpc("snapshot_event", {
    p_event_id: eventId,
    ...(originalStart ? { p_original_start: originalStart } : {}),
  });
}

function restore(user: TestUser, trashId: string, eventId?: string) {
  return user.client.rpc("restore_event", {
    p_trash_id: trashId,
    ...(eventId ? { p_event_id: eventId } : {}),
  });
}

async function deleteAs(user: TestUser, eventId: string) {
  const { data, error } = await user.client
    .from("events")
    .delete()
    .eq("id", eventId)
    .select("id");
  if (error) throw error;
  expect(data).toHaveLength(1);
}

async function queued(objectId: string) {
  const { data } = await admin
    .from("image_purge_queue")
    .select("object_id")
    .eq("object_id", objectId);
  return (data ?? []).length === 1;
}

async function trashCount(userId: string) {
  const { count } = await admin
    .from("event_trash")
    .select("id", { count: "exact", head: true })
    .eq("deleted_by", userId);
  return count ?? 0;
}

describe("snapshot_event (RF-25, RF-30)", () => {
  it("works for owner and editor and refuses viewer, stranger and anon", async () => {
    const event = await createEvent();
    for (const user of [owner, editor]) {
      const { data, error } = await snapshot(user, event.id);
      expect(error).toBeNull();
      expect(data).toEqual(expect.any(String));
    }
    for (const user of [viewer, stranger]) {
      const { error } = await snapshot(user, event.id);
      expect(error?.code).toBe("CF404");
    }
    const { error } = await anonClient().rpc("snapshot_event", {
      p_event_id: event.id,
    });
    expect(error).not.toBeNull();
  });

  it("keeps only the last snapshot of each user", async () => {
    await snapshot(editor, (await createEvent()).id);
    await snapshot(editor, (await createEvent()).id);
    expect(await trashCount(editor.id)).toBe(1);
  });
});

describe("restore_event (RF-28, RF-29)", () => {
  it("brings back the event, its author, images and comments", async () => {
    const event = await createEvent();
    const image = await seedImage(event.id);
    const commentId = await seedComment(event.id);
    const { data: trashId } = await snapshot(editor, event.id);
    await deleteAs(editor, event.id);
    expect(await queued(image.object_id)).toBe(true);

    const { data, error } = await restore(editor, trashId!);
    expect(error).toBeNull();
    expect(data).toBe(event.id);

    const { data: row } = await admin
      .from("events")
      .select("*")
      .eq("id", event.id)
      .single();
    expect(row).toMatchObject({
      calendar_id: calendar,
      created_by: owner.id,
      color: "#BDB2FF",
      title: "Cena",
      created_at: event.created_at,
    });
    expect(Date.parse(row!.starts_at)).toBe(Date.parse(TIMES.starts_at));
    const { data: images } = await admin
      .from("event_images")
      .select("id, object_id, uploaded_by, status")
      .eq("event_id", event.id);
    expect(images).toEqual([
      {
        id: image.id,
        object_id: image.object_id,
        uploaded_by: viewer.id,
        status: "ready",
      },
    ]);
    expect(await queued(image.object_id)).toBe(false);
    const { data: comments } = await admin
      .from("event_comments")
      .select("id, author_id, edited_at")
      .eq("event_id", event.id);
    expect(comments).toEqual([
      {
        id: commentId,
        author_id: viewer.id,
        edited_at: expect.stringMatching(/^2026-11-01T09:00:00/),
      },
    ]);
    expect(await trashCount(editor.id)).toBe(0);
  });

  it("refuses another user, an old snapshot and a lost role", async () => {
    const event = await createEvent();
    const { data: trashId } = await snapshot(editor, event.id);
    await deleteAs(editor, event.id);
    expect((await restore(owner, trashId!)).error?.code).toBe("CF404");

    await admin
      .from("event_trash")
      .update({ created_at: new Date(Date.now() - 3_600_000).toISOString() })
      .eq("id", trashId!);
    expect((await restore(editor, trashId!)).error?.code).toBe("CF404");

    const other = await createEvent();
    const { data: secondId } = await snapshot(editor, other.id);
    await deleteAs(editor, other.id);
    await admin
      .from("calendar_members")
      .update({ role: "viewer" })
      .eq("calendar_id", calendar)
      .eq("user_id", editor.id);
    try {
      expect((await restore(editor, secondId!)).error?.code).toBe("CF404");
    } finally {
      await admin
        .from("calendar_members")
        .update({ role: "editor" })
        .eq("calendar_id", calendar)
        .eq("user_id", editor.id);
    }
  });

  it("fails when the id exists again", async () => {
    const event = await createEvent();
    const { data: trashId } = await snapshot(owner, event.id);
    const { error } = await restore(owner, trashId!);
    expect(error?.code).toBe("23505");
  });

  it("hangs images and comments on a given event with the original author", async () => {
    const event = await createEvent();
    const image = await seedImage(event.id);
    await seedComment(event.id);
    const { data: trashId } = await snapshot(editor, event.id);
    await deleteAs(editor, event.id);
    const created = await createEvent({ created_by: editor.id });

    const { data, error } = await restore(editor, trashId!, created.id);
    expect(error).toBeNull();
    expect(data).toBe(created.id);
    const { data: row } = await admin
      .from("events")
      .select("created_by")
      .eq("id", created.id)
      .single();
    expect(row!.created_by).toBe(owner.id);
    const { data: images } = await admin
      .from("event_images")
      .select("object_id")
      .eq("event_id", created.id);
    expect(images).toEqual([{ object_id: image.object_id }]);
    const { count } = await admin
      .from("event_comments")
      .select("id", { count: "exact", head: true })
      .eq("event_id", created.id);
    expect(count).toBe(1);
  });
});

describe("trash_row (T4)", () => {
  it("gives the saved row only to whoever deleted", async () => {
    const event = await createEvent();
    const { data: trashId } = await snapshot(editor, event.id);
    const own = await editor.client.rpc("trash_row", { p_trash_id: trashId! });
    expect(own.error).toBeNull();
    expect(own.data).toMatchObject({ id: event.id, title: "Cena" });
    const other = await owner.client.rpc("trash_row", {
      p_trash_id: trashId!,
    });
    expect(other.data).toBeNull();
  });
});

describe("occurrences of a series", () => {
  const START = "2026-11-10T17:00:00Z";
  const SERIES = {
    title: "Extraescolar",
    starts_at: "2026-11-03T17:00:00Z",
    ends_at: "2026-11-03T18:00:00Z",
    recurrence: "FREQ=WEEKLY;INTERVAL=1;BYDAY=TU",
    recurrence_tz: "Europe/Madrid",
  };

  async function exdatesOf(id: string) {
    const { data } = await admin
      .from("events")
      .select("exdates")
      .eq("id", id)
      .single();
    return (data!.exdates ?? []).map((value) => Date.parse(value));
  }

  it("without a row, undoing removes the date from exdates", async () => {
    const series = await createEvent(SERIES);
    const { data: trashId, error } = await snapshot(editor, series.id, START);
    expect(error).toBeNull();
    await admin
      .from("events")
      .update({ exdates: [START] })
      .eq("id", series.id);

    expect((await restore(editor, trashId!)).error).toBeNull();
    expect(await exdatesOf(series.id)).toEqual([]);
  });

  it("with an exception, restores it and removes the date", async () => {
    const series = await createEvent(SERIES);
    const exception = await createEvent({
      title: "Extraescolar cambiada",
      starts_at: START,
      ends_at: "2026-11-10T18:30:00Z",
      series_id: series.id,
      original_start: START,
    });
    const { data: trashId } = await snapshot(editor, series.id, START);
    await deleteAs(editor, exception.id);
    await admin
      .from("events")
      .update({ exdates: [START] })
      .eq("id", series.id);

    const { data, error } = await restore(editor, trashId!);
    expect(error).toBeNull();
    expect(data).toBe(exception.id);
    expect(await exdatesOf(series.id)).toEqual([]);
    const { data: row } = await admin
      .from("events")
      .select("title")
      .eq("id", exception.id)
      .single();
    expect(row!.title).toBe("Extraescolar cambiada");
  });
});

describe("purge margin and cleanup (plan D7)", () => {
  it("the general purge leaves objects queued in the last 2 minutes", async () => {
    const old = randomUUID();
    const fresh = randomUUID();
    objectIds.push(old, fresh);
    const { error } = await admin.from("image_purge_queue").insert([
      { object_id: old, bytes: 1, queued_at: "2000-01-01T00:00:00Z" },
      { object_id: fresh, bytes: 1, queued_at: new Date().toISOString() },
    ]);
    expect(error).toBeNull();

    // The oldest row of the whole queue is this test's one.
    const first = await anonClient().rpc("images_claim_purge", {
      p_secret: SECRET,
      p_limit: 1,
    });
    expect(first.error).toBeNull();
    expect(first.data).toEqual([old]);
    const second = await anonClient().rpc("images_claim_purge", {
      p_secret: SECRET,
      p_limit: 1,
    });
    expect(second.data).not.toContain(fresh);

    // Removing one image passes its ids: immediate (spec 012).
    const byId = await anonClient().rpc("images_claim_purge", {
      p_secret: SECRET,
      p_object_ids: [fresh],
    });
    expect(byId.data).toEqual([fresh]);
  });

  it("nobody reads or writes the trash directly", async () => {
    const { data } = await owner.client.from("event_trash").select("id");
    expect(data ?? []).toEqual([]);
    const insert = await owner.client
      .from("event_trash")
      .insert({ calendar_id: calendar });
    expect(insert.error).not.toBeNull();
  });

  it("schedules the cleanup", async () => {
    const { data } = await admin.rpc("trash_scheduled_jobs");
    expect(data).toEqual([
      { jobname: "event-trash-purge", schedule: "0 5 * * *" },
    ]);
  });
});
