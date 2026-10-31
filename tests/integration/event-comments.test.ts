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

// Spec 014, T2: comments follow their event (plan D10, D6; RF-18, RF-19,
// RF-26 to RF-28).
const SECRET = process.env.CRON_SECRET ?? "";

async function connection(ownerId: string, canWrite = false) {
  const { data, error } = await admin
    .from("calendar_connections")
    .insert({
      owner_id: ownerId,
      provider: "google",
      account_subject: `sub-${randomUUID()}`,
      account_email: "owner@gmail.test",
      can_write: canWrite,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

const WEEKLY = {
  starts_at: "2026-11-03T17:00:00Z",
  ends_at: "2026-11-03T18:00:00Z",
  recurrence: "FREQ=WEEKLY;INTERVAL=1;BYDAY=TU",
  recurrence_tz: "Europe/Madrid",
};

function exceptionOf(series: string, start: string) {
  return {
    starts_at: start,
    ends_at: new Date(Date.parse(start) + 3_600_000).toISOString(),
    series_id: series,
    original_start: start,
  };
}

describe("deleting the event deletes its comments (RF-18, RF-19)", () => {
  it("with the event, the calendar and the series", async () => {
    const event = await createEvent(calendar);
    const onEvent = await seedComment(event, viewer.id);
    await admin.from("events").delete().eq("id", event);
    expect(await rowExists(onEvent)).toBe(false);

    const other = await createCalendar(owner.id, "Viaje");
    const onCalendar = await seedComment(await createEvent(other), owner.id);
    await admin.from("calendars").delete().eq("id", other);
    expect(await rowExists(onCalendar)).toBe(false);

    const series = await createEvent(calendar, WEEKLY);
    const exception = await createEvent(
      calendar,
      exceptionOf(series, "2026-11-10T17:00:00Z"),
    );
    const onException = await seedComment(exception, viewer.id);
    await admin.from("events").delete().eq("id", series);
    expect(await rowExists(onException)).toBe(false);
  });

  it("when the sync removes a synced event", async () => {
    const synced = await createCalendar(owner.id, "Google");
    await admin.from("synced_calendars").insert({
      calendar_id: synced,
      connection_id: await connection(owner.id),
      provider: "google",
      external_id: `cal-${randomUUID()}`,
    });
    const event = await createEvent(synced, {
      external_id: `ev-${randomUUID()}`,
    });
    const id = await seedComment(event, owner.id);

    const { error } = await anonClient().rpc("sync_apply_events", {
      p_secret: SECRET,
      p_calendar_id: synced,
      p_events: [],
      p_read_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(error).toBeNull();
    expect(await rowExists(id)).toBe(false);
  });
});

describe("moving, merging, copying and uploading keep them (RF-26, RF-27)", () => {
  it("moving the event keeps them with the new calendar's privacy", async () => {
    const work = await createCalendar(owner.id, "Trabajo");
    const event = await createEvent(calendar);
    const id = await seedComment(event, viewer.id);
    const { error } = await owner.client
      .from("events")
      .update({ calendar_id: work })
      .eq("id", event);
    expect(error).toBeNull();
    expect(await visibleTo(owner, id)).toBe(true);
    expect(await visibleTo(viewer, id)).toBe(false);
  });

  it("merge_calendars keeps them", async () => {
    const target = await createCalendar(owner.id, "Clases");
    const source = await createCalendar(owner.id, "Exámenes");
    const id = await seedComment(await createEvent(source), owner.id);
    const { error } = await owner.client.rpc("merge_calendars", {
      p_source_ids: [target, source],
      p_target_id: target,
    });
    expect(error).toBeNull();
    expect(await visibleTo(owner, id)).toBe(true);
  });

  it("copy_calendar_for_owner copies them with their authors and dates", async () => {
    const cleo = await createTestUser({ display_name: "Cleo" });
    extraUsers.push(cleo.id);
    const source = await createCalendar(owner.id, "Familia");
    const event = await createEvent(source);
    const id = await seedComment(event, editor.id);
    await admin.from("event_comments").update({ body: "Editado" }).eq("id", id);
    const series = await createEvent(source, WEEKLY);
    const exception = await createEvent(
      source,
      exceptionOf(series, "2026-11-10T17:00:00Z"),
    );
    await seedComment(exception, viewer.id);

    const { data: copy, error } = await admin.rpc("copy_calendar_for_owner", {
      p_calendar_id: source,
      p_user_id: cleo.id,
    });
    expect(error).toBeNull();

    const { data: original } = await admin
      .from("event_comments")
      .select("author_id, body, created_at, edited_at")
      .eq("id", id)
      .single();
    const { data: copied } = await admin
      .from("event_comments")
      .select(
        "author_id, body, created_at, edited_at, events!inner(calendar_id, series_id)",
      )
      .eq("events.calendar_id", copy!)
      .order("created_at");
    expect(copied).toHaveLength(2);
    expect(copied![0]).toMatchObject(original!);
    expect(copied![1].events.series_id).not.toBeNull();
  });

  it("uploading to Google keeps the comments of the exceptions", async () => {
    const connectionId = await connection(owner.id, true);
    const upload = await createCalendar(owner.id, "Subir");
    const series = await createEvent(upload, WEEKLY);
    const exception = await createEvent(
      upload,
      exceptionOf(series, "2026-11-10T17:00:00Z"),
    );
    const id = await seedComment(exception, owner.id);

    const { error } = await owner.client.rpc("sync_attach_uploaded", {
      p_secret: SECRET,
      p_calendar_id: upload,
      p_connection_id: connectionId,
      p_external_id: `cal-${randomUUID()}`,
      p_mapping: [{ event_id: exception, external_id: "g-1" }],
    } as never);
    expect(error).toBeNull();
    expect(await rowExists(id)).toBe(true);
  });
});

describe("series_loss counts the comments (RF-28, plan D6)", () => {
  it("of the exceptions that would be lost", async () => {
    const series = await createEvent(calendar, WEEKLY);
    const first = await createEvent(
      calendar,
      exceptionOf(series, "2026-11-10T17:00:00Z"),
    );
    const second = await createEvent(
      calendar,
      exceptionOf(series, "2026-11-17T17:00:00Z"),
    );
    await seedComment(first, viewer.id);
    await seedComment(first, owner.id);
    await seedComment(second, editor.id);

    const all = await owner.client.rpc("series_loss", { p_series_id: series });
    expect(all.data).toEqual([{ exceptions: 2, images: 0, comments: 3 }]);
    const from = await owner.client.rpc("series_loss", {
      p_series_id: series,
      p_from: "2026-11-17T17:00:00Z",
    });
    expect(from.data).toEqual([{ exceptions: 1, images: 0, comments: 1 }]);
  });
});
