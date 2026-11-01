import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  createTestUser,
  deleteTestUser,
  getOwnCalendarId,
  type TestUser,
} from "./helpers";

// Spec 009, T3: the write functions need the user's session and the server
// secret at once (plan "Contratos", D3; RF-6, RF-7, RF-10 to RF-12, RF-16,
// RF-19, RF-20, RF-25, RF-29, RF-31 to RF-34, RF-36, RF-38).
const SECRET = process.env.CRON_SECRET ?? "";
if (!SECRET) throw new Error("Missing CRON_SECRET: add it to .env.test.local");

let owner: TestUser;
let editor: TestUser;
let viewer: TestUser;
let connectionId: string;
let otherConnectionId: string;
let calA: string;
let calB: string;
let calOther: string;
let normal: string;

async function connect(subject: string) {
  const { data, error } = await owner.client.rpc("connect_account", {
    p_provider: "google",
    p_subject: subject,
    p_email: `${subject}@gmail.test`,
    p_refresh_token: "rt",
    p_can_write: true,
  });
  if (error) throw error;
  return (data as { id: string }).id;
}

async function synced(connection: string, externalId: string) {
  const { data, error } = await owner.client.rpc("select_synced_calendars", {
    p_connection_id: connection,
    p_calendars: [
      { external_id: externalId, name: externalId, access: "owner" },
    ],
  });
  if (error) throw error;
  return (data as { calendar_id: string }[])[0].calendar_id;
}

async function addMember(
  calendarId: string,
  user: TestUser,
  role: "editor" | "viewer",
) {
  const { error } = await admin
    .from("calendar_members")
    .insert({ calendar_id: calendarId, user_id: user.id, role });
  if (error) throw error;
}

async function googleEvent(calendarId: string, externalId: string) {
  const { data, error } = await admin
    .from("events")
    .insert({
      calendar_id: calendarId,
      external_id: externalId,
      title: "De Google",
      starts_at: "2026-11-02T10:00:00Z",
      ends_at: "2026-11-02T11:00:00Z",
      created_by: owner.id,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

function row(calendarId: string, title = "Cita") {
  return {
    calendar_id: calendarId,
    title,
    description: null,
    location: null,
    starts_at: "2026-11-03T09:00:00Z",
    ends_at: "2026-11-03T10:00:00Z",
    all_day: false,
    color: "#FFADAD",
    category_id: null,
  };
}

function context(user: TestUser, args: Record<string, unknown>) {
  return user.client.rpc("sync_write_context", {
    p_secret: SECRET,
    ...args,
  } as never);
}

function commit(user: TestUser, args: Record<string, unknown>) {
  return user.client.rpc("sync_commit_event", {
    p_secret: SECRET,
    p_event_id: null,
    p_external_id: null,
    ...args,
  } as never);
}

beforeAll(async () => {
  [owner, editor, viewer] = await Promise.all([
    createTestUser({ display_name: "Owner" }),
    createTestUser({ display_name: "Editor" }),
    createTestUser({ display_name: "Viewer" }),
  ]);
  normal = await getOwnCalendarId(owner.id);
  connectionId = await connect("write-main");
  otherConnectionId = await connect("write-other");
  calA = await synced(connectionId, "a@group");
  calB = await synced(connectionId, "b@group");
  calOther = await synced(otherConnectionId, "c@group");
  await Promise.all([
    addMember(calA, editor, "editor"),
    addMember(calB, editor, "editor"),
    addMember(calA, viewer, "viewer"),
  ]);
});

afterAll(async () => {
  await Promise.all(
    [owner, editor, viewer]
      .filter(Boolean)
      .map((user) => deleteTestUser(user.id)),
  );
});

describe("secret and session (D3, plan R4)", () => {
  it("fails without the secret or with a wrong one", async () => {
    for (const secret of ["", "wrong"]) {
      const { error } = await owner.client.rpc("sync_write_context", {
        p_secret: secret,
        p_calendar_id: calA,
      } as never);
      expect(error?.code).toBe("42501");
    }
  });
});

describe("sync_write_context (RF-6 to RF-8, RF-20)", () => {
  it("normal calendars answer synced false", async () => {
    const { data, error } = await context(owner, { p_calendar_id: normal });
    expect(error).toBeNull();
    expect(data).toEqual({ synced: false });
  });

  it("gives the Google ids to the owner and to an editor", async () => {
    const eventId = await googleEvent(calA, "ctx-1");
    for (const user of [owner, editor]) {
      const { data, error } = await context(user, {
        p_calendar_id: calA,
        p_event_id: eventId,
        p_target_calendar_id: calB,
      });
      expect(error).toBeNull();
      expect(data).toEqual({
        synced: true,
        // Spec 018 T3: the provider, so the server knows whom to write to.
        provider: "google",
        connection_id: connectionId,
        calendar_external_id: "a@group",
        target_external_id: "b@group",
        event_external_id: "ctx-1",
      });
    }
  });

  it("refuses a viewer (RF-7)", async () => {
    const { error } = await context(viewer, { p_calendar_id: calA });
    expect(error?.code).toBe("42501");
  });

  it("refuses an account that cannot write (RF-2, RF-8)", async () => {
    await admin
      .from("synced_calendars")
      .update({ google_access: "reader" })
      .eq("calendar_id", calA);
    const { error } = await context(owner, { p_calendar_id: calA });
    expect(error?.code).toBe("42501");
    await admin
      .from("synced_calendars")
      .update({ google_access: "owner" })
      .eq("calendar_id", calA);

    await admin
      .from("calendar_connections")
      .update({ status: "needs_reauth" })
      .eq("id", connectionId);
    const expired = await context(owner, { p_calendar_id: calA });
    expect(expired.error?.code).toBe("42501");
    await admin
      .from("calendar_connections")
      .update({ status: "active" })
      .eq("id", connectionId);
  });

  it("refuses mixing a synced and a normal calendar or two accounts (RF-20)", async () => {
    for (const [from, to] of [
      [calA, normal],
      [normal, calA],
      [calA, calOther],
    ]) {
      const { error } = await context(owner, {
        p_calendar_id: from,
        p_target_calendar_id: to,
      });
      expect(error?.code).toBe("22023");
    }
  });

  it("an event of another calendar is CF404", async () => {
    const eventId = await googleEvent(calB, "ctx-b");
    const { error } = await context(owner, {
      p_calendar_id: calA,
      p_event_id: eventId,
    });
    expect(error?.code).toBe("CF404");
  });
});

describe("sync_commit_event (RF-10 to RF-12, RF-16, RF-19, RF-25)", () => {
  it("insert keeps the editor as author and does not duplicate", async () => {
    const first = await commit(editor, {
      p_op: "insert",
      p_calendar_id: calA,
      p_row: row(calA),
      p_external_id: "new-1",
    });
    expect(first.error).toBeNull();
    const again = await commit(editor, {
      p_op: "insert",
      p_calendar_id: calA,
      p_row: row(calA, "Cita 2"),
      p_external_id: "new-1",
    });
    expect(again.data).toBe(first.data);

    const { data } = await admin
      .from("events")
      .select("title, created_by, color")
      .eq("calendar_id", calA)
      .eq("external_id", "new-1");
    expect(data).toEqual([
      { title: "Cita 2", created_by: editor.id, color: "#FFADAD" },
    ]);
  });

  it("update changes fields and moves inside the same account", async () => {
    const eventId = await googleEvent(calA, "upd-1");
    const { error } = await commit(editor, {
      p_op: "update",
      p_calendar_id: calA,
      p_event_id: eventId,
      p_row: row(calB, "Movido"),
    });
    expect(error).toBeNull();
    const { data } = await admin
      .from("events")
      .select("calendar_id, title, color, external_id")
      .eq("id", eventId)
      .single();
    expect(data).toEqual({
      calendar_id: calB,
      title: "Movido",
      color: "#FFADAD",
      external_id: "upd-1",
    });
  });

  it("delete and gone remove the event", async () => {
    for (const op of ["delete", "gone"]) {
      const eventId = await googleEvent(calA, `del-${op}`);
      const { error } = await commit(owner, {
        p_op: op,
        p_calendar_id: calA,
        p_event_id: eventId,
        p_row: null,
      });
      expect(error).toBeNull();
      const { count } = await admin
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("id", eventId);
      expect(count).toBe(0);
    }
  });

  it("repeats the role checks (RF-7)", async () => {
    const { error } = await commit(viewer, {
      p_op: "insert",
      p_calendar_id: calA,
      p_row: row(calA),
      p_external_id: "viewer-1",
    });
    expect(error?.code).toBe("42501");
  });

  it("refuses a normal calendar", async () => {
    const { error } = await commit(owner, {
      p_op: "insert",
      p_calendar_id: normal,
      p_row: row(normal),
      p_external_id: "x",
    });
    expect(error?.code).toBe("22023");
  });

  it("direct writes with RLS still fail", async () => {
    const { error } = await owner.client
      .from("events")
      .insert({ ...row(calA), created_by: owner.id });
    expect(error).not.toBeNull();
  });
});

describe("sync_update_calendar (RF-29, RF-31)", () => {
  it("renames only for the owner", async () => {
    const byEditor = await editor.client.rpc("sync_update_calendar", {
      p_secret: SECRET,
      p_calendar_id: calA,
      p_name: "No",
      p_description: null,
      p_color: "#A0C4FF",
    } as never);
    expect(byEditor.error?.code).toBe("42501");

    const { error } = await owner.client.rpc("sync_update_calendar", {
      p_secret: SECRET,
      p_calendar_id: calA,
      p_name: "Casa",
      p_description: "Solo CaFam",
      p_color: "#CAFFBF",
    } as never);
    expect(error).toBeNull();
    const { data } = await admin
      .from("calendars")
      .select("name, description, color")
      .eq("id", calA)
      .single();
    expect(data).toEqual({
      name: "Casa",
      description: "Solo CaFam",
      color: "#CAFFBF",
    });
  });
});

describe("sync_attach_created (RF-32, RF-33)", () => {
  it("creates an owner synced calendar", async () => {
    const { data, error } = await owner.client.rpc("sync_attach_created", {
      p_secret: SECRET,
      p_connection_id: connectionId,
      p_external_id: "created@group",
      p_name: "Nuevo",
    } as never);
    expect(error).toBeNull();
    const { data: s } = await admin
      .from("synced_calendars")
      .select("google_access, external_id")
      .eq("calendar_id", data as unknown as string)
      .single();
    expect(s).toEqual({ google_access: "owner", external_id: "created@group" });
  });

  it("refuses another user's connection", async () => {
    const { error } = await editor.client.rpc("sync_attach_created", {
      p_secret: SECRET,
      p_connection_id: connectionId,
      p_external_id: "x@group",
      p_name: "X",
    } as never);
    expect(error?.code).toBe("CF404");
  });
});

describe("sync_attach_uploaded (RF-33, RF-34, RF-36, RF-38)", () => {
  it("turns an own normal calendar into a synced one, keeping everything", async () => {
    const { data: calendar } = await owner.client
      .from("calendars")
      .insert({ owner_id: owner.id, name: "Subir", color: "#FFD6A5" })
      .select("id")
      .single();
    const uploadId = calendar!.id;
    await addMember(uploadId, editor, "editor");
    const { data: category } = await owner.client
      .from("event_categories")
      .insert({ calendar_id: uploadId, name: "Cole" })
      .select("id")
      .single();
    const { data: events } = await owner.client
      .from("events")
      .insert([
        {
          ...row(uploadId, "Dentro"),
          category_id: category!.id,
          created_by: owner.id,
        },
        { ...row(uploadId, "Fuera"), created_by: owner.id },
      ])
      .select("id, title");
    const inside = events!.find((e) => e.title === "Dentro")!.id;

    const { error } = await owner.client.rpc("sync_attach_uploaded", {
      p_secret: SECRET,
      p_calendar_id: uploadId,
      p_connection_id: connectionId,
      p_external_id: "up@group",
      p_mapping: [{ event_id: inside, external_id: "g-in" }],
    } as never);
    expect(error).toBeNull();

    const { data: after } = await admin
      .from("events")
      .select("title, external_id, category_id, color")
      .eq("calendar_id", uploadId)
      .order("title");
    expect(after).toEqual([
      {
        title: "Dentro",
        external_id: "g-in",
        category_id: category!.id,
        color: "#FFADAD",
      },
      {
        title: "Fuera",
        external_id: null,
        category_id: null,
        color: "#FFADAD",
      },
    ]);
    const { data: members } = await admin
      .from("calendar_members")
      .select("user_id")
      .eq("calendar_id", uploadId);
    expect(members).toHaveLength(2);
    const { data: s } = await admin
      .from("synced_calendars")
      .select("google_access")
      .eq("calendar_id", uploadId)
      .single();
    expect(s?.google_access).toBe("owner");

    // Already synced now: a second upload is refused (RF-38).
    const again = await owner.client.rpc("sync_attach_uploaded", {
      p_secret: SECRET,
      p_calendar_id: uploadId,
      p_connection_id: connectionId,
      p_external_id: "up2@group",
      p_mapping: [],
    } as never);
    expect(again.error?.code).toBe("CF404");
  });

  // An orphan calendar has no owner_id, so it fails the same ownership check.
  it("refuses a calendar of someone else or another user's connection (RF-38)", async () => {
    const editorOwn = await getOwnCalendarId(editor.id);
    for (const [user, calendarId] of [
      [owner, editorOwn],
      [editor, editorOwn],
    ] as const) {
      const { error } = await user.client.rpc("sync_attach_uploaded", {
        p_secret: SECRET,
        p_calendar_id: calendarId,
        p_connection_id: connectionId,
        p_external_id: "f@group",
        p_mapping: [],
      } as never);
      expect(error?.code).toBe("CF404");
    }
  });

  it("the 21st synced calendar is CF429 (RF-33)", async () => {
    const { count } = await admin
      .from("synced_calendars")
      .select("calendar_id", { count: "exact", head: true })
      .eq("connection_id", connectionId);
    const items = Array.from({ length: 20 - (count ?? 0) }, (_, i) => ({
      external_id: `fill-${i}`,
      name: `F${i}`,
    }));
    if (items.length) {
      const { error } = await owner.client.rpc("select_synced_calendars", {
        p_connection_id: connectionId,
        p_calendars: items,
      });
      expect(error).toBeNull();
    }
    const created = await owner.client.rpc("sync_attach_created", {
      p_secret: SECRET,
      p_connection_id: connectionId,
      p_external_id: "over@group",
      p_name: "Sobra",
    } as never);
    expect(created.error?.code).toBe("CF429");

    const ownNormal = await owner.client
      .from("calendars")
      .insert({ owner_id: owner.id, name: "Sobra 2", color: "#FFD6A5" })
      .select("id")
      .single();
    const uploaded = await owner.client.rpc("sync_attach_uploaded", {
      p_secret: SECRET,
      p_calendar_id: ownNormal.data!.id,
      p_connection_id: connectionId,
      p_external_id: "over2@group",
      p_mapping: [],
    } as never);
    expect(uploaded.error?.code).toBe("CF429");
  });
});
