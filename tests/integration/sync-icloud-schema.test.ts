import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  anonClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// Spec 018, T2: iCloud is a provider like Google (plan "Modelo de datos", D3;
// RF-5, RF-9, RF-10, RF-11, RF-18).
let ana: TestUser;
let bea: TestUser;

beforeAll(async () => {
  [ana, bea] = await Promise.all([
    createTestUser({ display_name: "Ana" }),
    createTestUser({ display_name: "Bea" }),
  ]);
});

afterAll(async () => {
  await Promise.all(
    [ana, bea].filter(Boolean).map((user) => deleteTestUser(user.id)),
  );
});

const credential = (password: string) =>
  JSON.stringify({ v: 1, username: "ana@icloud.test", password });

async function connect(
  user: TestUser,
  provider: "google" | "icloud",
  subject: string,
  token: string,
) {
  return user.client.rpc("connect_account", {
    p_provider: provider,
    p_subject: subject,
    p_email: subject,
    p_refresh_token: token,
    p_can_write: provider === "icloud",
  });
}

async function storedToken(connectionId: string) {
  const { data, error } = await anonClient().rpc("sync_get_token", {
    p_secret: process.env.CRON_SECRET ?? "",
    p_connection_id: connectionId,
  });
  if (error) throw error;
  return data;
}

describe("iCloud connections (RF-5, RF-9, RF-10)", () => {
  it("creates an iCloud connection that can write, with its credential in Vault", async () => {
    const { data, error } = await connect(
      ana,
      "icloud",
      "ana@icloud.test",
      credential("abcd-efgh-ijkl-mnop"),
    );
    expect(error).toBeNull();
    const id = (data as { id: string }).id;

    const { data: row } = await admin
      .from("calendar_connections")
      .select("provider, can_write, account_email")
      .eq("id", id)
      .single();
    expect(row).toEqual({
      provider: "icloud",
      can_write: true,
      account_email: "ana@icloud.test",
    });
    expect(await storedToken(id)).toBe(credential("abcd-efgh-ijkl-mnop"));
  });

  it("replaces the credential when the same account connects again", async () => {
    const first = await connect(
      ana,
      "icloud",
      "otra@icloud.test",
      credential("aaaa-aaaa-aaaa-aaaa"),
    );
    await admin
      .from("calendar_connections")
      .update({ status: "needs_reauth" })
      .eq("id", (first.data as { id: string }).id);

    const second = await connect(
      ana,
      "icloud",
      "otra@icloud.test",
      credential("bbbb-bbbb-bbbb-bbbb"),
    );

    expect(second.data).toEqual({
      id: (first.data as { id: string }).id,
      existed: true,
    });
    expect(await storedToken((first.data as { id: string }).id)).toBe(
      credential("bbbb-bbbb-bbbb-bbbb"),
    );
  });

  it("lets another user connect the same iCloud account on their own", async () => {
    const { data, error } = await connect(
      bea,
      "icloud",
      "ana@icloud.test",
      credential("cccc-cccc-cccc-cccc"),
    );
    expect(error).toBeNull();
    expect((data as { existed: boolean }).existed).toBe(false);
  });
});

describe("limits across providers (RF-11, RF-18)", () => {
  it("counts Google and iCloud accounts together: the sixth fails", async () => {
    // Ana already has two iCloud accounts.
    for (const subject of ["g1", "g2", "g3"]) {
      const { error } = await connect(ana, "google", subject, "rt");
      expect(error).toBeNull();
    }
    const sixth = await connect(
      ana,
      "icloud",
      "sexta@icloud.test",
      credential("dddd-dddd-dddd-dddd"),
    );
    expect(sixth.error?.code).toBe("CF429");
  });

  it("accepts iCloud calendars with their access", async () => {
    const { data: conn } = await admin
      .from("calendar_connections")
      .select("id")
      .eq("owner_id", ana.id)
      .eq("provider", "icloud")
      .eq("account_subject", "ana@icloud.test")
      .single();

    const { error } = await ana.client.rpc("select_synced_calendars", {
      p_connection_id: conn!.id,
      p_calendars: [
        {
          external_id: "/123/calendars/home/",
          name: "Casa",
          color: "#FF2968",
          access: "owner",
        },
        {
          external_id: "/123/calendars/compartido/",
          name: "Compartido",
          color: "#1BADF8",
          access: "reader",
        },
      ],
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from("synced_calendars")
      .select("provider, external_id, google_access")
      .eq("connection_id", conn!.id)
      .order("external_id");
    expect(data).toEqual([
      {
        provider: "icloud",
        external_id: "/123/calendars/compartido/",
        google_access: "reader",
      },
      {
        provider: "icloud",
        external_id: "/123/calendars/home/",
        google_access: "owner",
      },
    ]);
  });

  it("keeps RLS on every public table", async () => {
    const { data, error } = await admin.rpc("list_tables_without_rls");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("still rejects unknown providers", async () => {
    const { error } = await connect(ana, "otro" as "google", "x", "rt");
    expect(error).not.toBeNull();
  });
});
