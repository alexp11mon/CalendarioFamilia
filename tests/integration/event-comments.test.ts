import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  anonClient,
  createTestUser,
  deleteTestMail,
  deleteTestUser,
  getOwnCalendarId,
  type TestUser,
} from "./helpers";

// Spec 014, T1: event_comments and its policies (plan "Modelo de datos", D1,
// D7, D8; RF-7, RF-9, RF-10, RF-13 to RF-17, RF-22 to RF-24, RF-28).
let owner: TestUser;
let editor: TestUser;
let viewer: TestUser;
let stranger: TestUser;
let calendar: string;
const extraUsers: string[] = [];

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
    [owner, editor, viewer, stranger, ...extraUsers.map((id) => ({ id }))].map(
      (user) => deleteTestUser(user.id),
    ),
  );
  await deleteTestMail();
});

async function createCalendar(ownerId: string, name: string) {
  const { data, error } = await admin
    .from("calendars")
    .insert({ owner_id: ownerId, name })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function createEvent(calendarId: string, extra: object = {}) {
  const { data, error } = await admin
    .from("events")
    .insert({ calendar_id: calendarId, title: "Cena", ...TIMES, ...extra })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

function comment(user: TestUser, eventId: string, body = "Llevo la tarta") {
  return user.client
    .from("event_comments")
    .insert({ event_id: eventId, body, client_id: randomUUID() })
    .select("id, body, author_id, edited_at")
    .single();
}

async function seedComment(eventId: string, authorId: string | null) {
  const { data, error } = await admin
    .from("event_comments")
    .insert({
      event_id: eventId,
      author_id: authorId,
      body: "Hola",
      client_id: randomUUID(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function visibleTo(user: TestUser, id: string) {
  const { data } = await user.client
    .from("event_comments")
    .select("id")
    .eq("id", id);
  return (data ?? []).length === 1;
}

async function rowExists(id: string) {
  const { data } = await admin.from("event_comments").select("id").eq("id", id);
  return (data ?? []).length === 1;
}

describe("reading and writing by role (RF-7, RF-22, RF-24)", () => {
  it("owner, editor and viewer comment and read each other", async () => {
    const event = await createEvent(calendar);
    for (const user of [owner, editor, viewer]) {
      const { data, error } = await comment(user, event);
      expect(error).toBeNull();
      expect(data!.author_id).toBe(user.id);
    }
    const { data } = await viewer.client
      .from("event_comments")
      .select("id")
      .eq("event_id", event);
    expect(data).toHaveLength(3);
  });

  it("a stranger and anon neither read nor write", async () => {
    const event = await createEvent(calendar);
    const id = await seedComment(event, owner.id);
    expect(await visibleTo(stranger, id)).toBe(false);
    const { data } = await anonClient().from("event_comments").select("id");
    expect(data ?? []).toEqual([]);

    const insert = await comment(stranger, event);
    expect(insert.error?.code).toBe("42501");
    const anonInsert = await anonClient()
      .from("event_comments")
      .insert({ event_id: event, body: "x", client_id: randomUUID() });
    expect(anonInsert.error).not.toBeNull();
  });

  it("nobody comments as someone else", async () => {
    const event = await createEvent(calendar);
    const { error } = await viewer.client.from("event_comments").insert({
      event_id: event,
      author_id: owner.id,
      body: "Suplantado",
      client_id: randomUUID(),
    });
    expect(error?.code).toBe("42501");
  });

  it("no column carries an email", async () => {
    const event = await createEvent(calendar);
    await seedComment(event, owner.id);
    const { data } = await viewer.client
      .from("event_comments")
      .select("*")
      .eq("event_id", event)
      .single();
    expect(JSON.stringify(data)).not.toContain("@");
  });
});

describe("editing (RF-14, RF-17, RF-4)", () => {
  it("the author edits the body and it is marked as edited", async () => {
    const event = await createEvent(calendar);
    const { data: created } = await comment(viewer, event);
    expect(created!.edited_at).toBeNull();

    const { data, error } = await viewer.client
      .from("event_comments")
      .update({ body: "  Llego tarde  " })
      .eq("id", created!.id)
      .select("body, edited_at")
      .single();
    expect(error).toBeNull();
    expect(data!.body).toBe("Llego tarde");
    expect(data!.edited_at).not.toBeNull();
  });

  it("nobody edits a comment of someone else, not even the owner", async () => {
    const event = await createEvent(calendar);
    const id = await seedComment(event, viewer.id);
    for (const user of [owner, editor]) {
      const { data } = await user.client
        .from("event_comments")
        .update({ body: "Cambiado" })
        .eq("id", id)
        .select("id");
      expect(data ?? []).toEqual([]);
    }
  });

  it("only the body can change", async () => {
    const event = await createEvent(calendar);
    const other = await createEvent(calendar);
    const { data: created } = await comment(viewer, event);
    for (const change of [
      { event_id: other },
      { author_id: owner.id },
      { created_at: "2020-01-01T00:00:00Z" },
      { edited_at: null },
    ]) {
      const { error } = await viewer.client
        .from("event_comments")
        .update(change)
        .eq("id", created!.id);
      expect(error?.code).toBe("42501");
    }
  });
});

describe("deleting (RF-15, RF-16)", () => {
  it("the author deletes their own comment", async () => {
    const event = await createEvent(calendar);
    const id = await seedComment(event, viewer.id);
    await viewer.client.from("event_comments").delete().eq("id", id);
    expect(await rowExists(id)).toBe(false);
  });

  it("the owner deletes anyone's comment", async () => {
    const event = await createEvent(calendar);
    const id = await seedComment(event, viewer.id);
    await owner.client.from("event_comments").delete().eq("id", id);
    expect(await rowExists(id)).toBe(false);
  });

  it("editors and viewers only delete their own", async () => {
    const event = await createEvent(calendar);
    const id = await seedComment(event, owner.id);
    for (const user of [editor, viewer, stranger]) {
      await user.client.from("event_comments").delete().eq("id", id);
    }
    expect(await rowExists(id)).toBe(true);
  });

  it("in an ownerless calendar nobody deletes someone else's comment", async () => {
    const olivia = await createTestUser({ display_name: "Olivia" });
    extraUsers.push(olivia.id);
    const shared = await createCalendar(olivia.id, "Compartido");
    await admin.from("calendar_members").insert([
      { calendar_id: shared, user_id: editor.id, role: "editor" },
      { calendar_id: shared, user_id: viewer.id, role: "viewer" },
    ]);
    const event = await createEvent(shared);
    const fromViewer = await seedComment(event, viewer.id);

    const { error } = await olivia.client.rpc("delete_own_account");
    expect(error).toBeNull();
    extraUsers.splice(extraUsers.indexOf(olivia.id), 1);

    await editor.client.from("event_comments").delete().eq("id", fromViewer);
    expect(await rowExists(fromViewer)).toBe(true);
    const { error: insertError } = await comment(editor, event);
    expect(insertError).toBeNull();
  });
});

describe("members that leave (RF-23)", () => {
  it("an expelled member stops reading and their comments stay", async () => {
    const vera = await createTestUser({ display_name: "Vera" });
    extraUsers.push(vera.id);
    await admin
      .from("calendar_members")
      .insert({ calendar_id: calendar, user_id: vera.id, role: "viewer" });
    const event = await createEvent(calendar);
    const { data: created } = await comment(vera, event);

    await admin
      .from("calendar_members")
      .delete()
      .eq("calendar_id", calendar)
      .eq("user_id", vera.id);
    expect(await visibleTo(vera, created!.id)).toBe(false);
    expect(await visibleTo(owner, created!.id)).toBe(true);
    const { error } = await comment(vera, event);
    expect(error?.code).toBe("42501");
  });
});

describe("text rules (RF-9, RF-10)", () => {
  it("trims the ends and keeps the inner line breaks", async () => {
    const event = await createEvent(calendar);
    const { data } = await comment(viewer, event, "\n  Primera\n\nSegunda  \n");
    expect(data!.body).toBe("Primera\n\nSegunda");
  });

  it("rejects empty, blank and too long texts and accepts 1000", async () => {
    const event = await createEvent(calendar);
    for (const body of ["", "   \n\t ", "a".repeat(1001)]) {
      const { error } = await comment(viewer, event, body);
      expect(error?.code).toBe("23514");
    }
    const { error } = await comment(viewer, event, "é".repeat(1000));
    expect(error).toBeNull();
  });

  it("the same client_id of the same author is saved once", async () => {
    const event = await createEvent(calendar);
    const clientId = randomUUID();
    const row = { event_id: event, body: "Una vez", client_id: clientId };
    const first = await viewer.client.from("event_comments").insert(row);
    expect(first.error).toBeNull();
    const second = await viewer.client.from("event_comments").insert(row);
    expect(second.error?.code).toBe("23505");
  });
});

describe("series and synced calendars (RF-13, RF-28)", () => {
  it("rejects the row of a series and accepts an exception", async () => {
    const series = await createEvent(calendar, {
      starts_at: "2026-11-03T17:00:00Z",
      ends_at: "2026-11-03T18:00:00Z",
      recurrence: "FREQ=WEEKLY;INTERVAL=1;BYDAY=TU",
      recurrence_tz: "Europe/Madrid",
    });
    const onSeries = await comment(viewer, series);
    expect(onSeries.error?.code).toBe("22023");

    const exception = await createEvent(calendar, {
      starts_at: "2026-11-10T17:00:00Z",
      ends_at: "2026-11-10T18:00:00Z",
      series_id: series,
      original_start: "2026-11-10T17:00:00Z",
    });
    const onException = await comment(viewer, exception);
    expect(onException.error).toBeNull();
  });

  it("a viewer comments an event of a synced calendar", async () => {
    const { data: connection, error } = await admin
      .from("calendar_connections")
      .insert({
        owner_id: owner.id,
        provider: "google",
        account_subject: `sub-${randomUUID()}`,
        account_email: "owner@gmail.test",
      })
      .select("id")
      .single();
    if (error) throw error;
    const synced = await createCalendar(owner.id, "Google");
    await admin.from("synced_calendars").insert({
      calendar_id: synced,
      connection_id: connection.id,
      provider: "google",
      external_id: `cal-${randomUUID()}`,
    });
    await admin
      .from("calendar_members")
      .insert({ calendar_id: synced, user_id: viewer.id, role: "viewer" });
    const event = await createEvent(synced, {
      external_id: `ev-${randomUUID()}`,
    });

    const { error: insertError } = await comment(viewer, event);
    expect(insertError).toBeNull();
  });
});
