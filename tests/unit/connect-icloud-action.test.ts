// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "@/lib/sync/providers/types";

// Spec 018, T12: connecting an iCloud account (plan D3, D12; RF-5 to RF-12).
const { rpc, verifyIcloudCredential, revalidatePath, redirect } = vi.hoisted(
  () => ({
    rpc: vi.fn(),
    verifyIcloudCredential: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn(),
  }),
);

vi.mock("@/lib/calendar/queries", () => ({
  requireActionUser: async () => ({ supabase: { rpc }, userId: "user-1" }),
  getProfileTimeZone: async () => "Europe/Madrid",
}));
vi.mock("@/lib/sync/engine", () => ({
  verifyIcloudCredential,
  syncConnection: vi.fn(),
  revokeConnection: vi.fn(),
  writeEngineDeps: () => ({}),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));

import { connectIcloud } from "@/app/dashboard/connections/actions";

const CONNECTION = "6f1c2a9e-1f0e-4c38-9d43-2a3b5c6d7e8f";
const EMPTY = { values: { appleId: "", password: "" } };

function form(appleId: string, password: string) {
  const data = new FormData();
  data.set("appleId", appleId);
  data.set("password", password);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyIcloudCredential.mockResolvedValue(undefined);
  rpc.mockResolvedValue({ data: { id: CONNECTION }, error: null });
});

describe("connectIcloud", () => {
  it("checks the credential, saves it in Vault through connect_account and opens the account", async () => {
    await connectIcloud(EMPTY, form(" Ana@iCloud.com", "abcd efgh ijkl mnop"));

    const credential = {
      username: "ana@icloud.com",
      password: "abcd-efgh-ijkl-mnop",
    };
    expect(verifyIcloudCredential).toHaveBeenCalledWith(credential);
    expect(rpc).toHaveBeenCalledWith("connect_account", {
      p_provider: "icloud",
      p_subject: "ana@icloud.com",
      p_email: "ana@icloud.com",
      p_refresh_token: JSON.stringify({ v: 1, ...credential }),
      p_can_write: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
    expect(redirect).toHaveBeenCalledWith(
      `/dashboard/connections/${CONNECTION}`,
    );
  });

  it("explains a refused password and keeps only the Apple ID (RF-6, RF-7)", async () => {
    verifyIcloudCredential.mockRejectedValue(
      new ProviderError("revoked", "401"),
    );

    const state = await connectIcloud(
      EMPTY,
      form("ana@icloud.com", "abcd-efgh-ijkl-mnop"),
    );

    expect(state).toEqual({
      formError: expect.stringMatching(/no la contraseña normal/),
      values: { appleId: "ana@icloud.com", password: "" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("says iCloud does not answer when the check fails otherwise (RF-8)", async () => {
    verifyIcloudCredential.mockRejectedValue(
      new ProviderError("transient", "timeout"),
    );
    const state = await connectIcloud(
      EMPTY,
      form("ana@icloud.com", "abcd-efgh-ijkl-mnop"),
    );
    expect(state.formError).toMatch(/iCloud no responde/);
  });

  it("refuses a sixth account (RF-11)", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "CF429" } });
    const state = await connectIcloud(
      EMPTY,
      form("ana@icloud.com", "abcd-efgh-ijkl-mnop"),
    );
    expect(state.formError).toMatch(/5 cuentas conectadas/);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("shows the field errors without calling iCloud", async () => {
    const state = await connectIcloud(EMPTY, form("ana", "secreta"));
    expect(state.fieldErrors).toEqual({
      appleId: expect.stringMatching(/Apple ID/),
      password: expect.stringMatching(/contraseña específica de app/),
    });
    expect(state.values).toEqual({ appleId: "ana", password: "" });
    expect(verifyIcloudCredential).not.toHaveBeenCalled();
  });

  it("never returns the password (RF-12)", async () => {
    verifyIcloudCredential.mockRejectedValue(
      new ProviderError("revoked", "401"),
    );
    const state = await connectIcloud(
      EMPTY,
      form("ana@icloud.com", "abcd-efgh-ijkl-mnop"),
    );
    expect(JSON.stringify(state)).not.toMatch(/abcd/);
  });
});
