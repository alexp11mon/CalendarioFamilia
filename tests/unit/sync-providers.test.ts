// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncDeps } from "@/lib/sync/deps";
import { openSession, revokeAccess } from "@/lib/sync/providers";
import { ProviderError } from "@/lib/sync/providers/types";

// Spec 018, T3: one interface, two providers (plan D1; RF-29 to RF-60, RF-67).
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;
let stored: string | null;
const rpc = vi.fn(async (fn: string) => ({
  data: fn === "sync_get_token" ? stored : null,
  error: null,
}));

function deps(): SyncDeps {
  return {
    supabase: { rpc } as unknown as SyncDeps["supabase"],
    secret: "s3cret",
    clientId: "id",
    clientSecret: "secret",
    fetchFn,
  };
}

beforeEach(() => {
  stored = "rt";
  rpc.mockClear();
  fetchFn = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify({ access_token: "at" })),
  );
});

describe("openSession", () => {
  it("renews Google's token and returns a Google session", async () => {
    const session = await openSession(deps(), "google", "conn-1");

    expect(String(fetchFn.mock.calls[0][0])).toBe(TOKEN_URL);
    expect(typeof session.listEvents).toBe("function");
  });

  it("refuses an unknown provider without calling anyone", async () => {
    await expect(openSession(deps(), "outlook", "conn-1")).rejects.toThrow(
      ProviderError,
    );
    expect(fetchFn).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("treats a missing stored secret as a withdrawn permission", async () => {
    stored = null;
    await expect(openSession(deps(), "google", "conn-1")).rejects.toMatchObject(
      { kind: "revoked" },
    );
  });
});

describe("revokeAccess (RF-30 of 007, RF-67 of 018)", () => {
  it("revokes the token in Google", async () => {
    await revokeAccess(deps(), "google", "conn-1");
    expect(String(fetchFn.mock.calls[0][0])).toBe(REVOKE_URL);
  });

  it("does nothing for iCloud: the user revokes the password at Apple", async () => {
    await revokeAccess(deps(), "icloud", "conn-1");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
