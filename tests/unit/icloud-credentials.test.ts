import { describe, expect, it } from "vitest";
import {
  normalizeAppleId,
  normalizeAppPassword,
  parseCredential,
  serializeCredential,
} from "@/lib/sync/icloud-credentials";
import { ICLOUD_CONNECT_ERRORS } from "@/lib/sync/error-messages";
import { icloudConnectSchema } from "@/lib/sync/schemas";

// Spec 018, T5: the iCloud credential (plan D3, "Resultado de la T1" (b);
// RF-5 to RF-8 and the format edge cases).
describe("normalizeAppleId", () => {
  it("lowercases and removes spaces", () => {
    expect(normalizeAppleId("  Ana.Garcia@iCloud.com ")).toBe(
      "ana.garcia@icloud.com",
    );
  });
});

describe("normalizeAppPassword", () => {
  it("takes the password with dashes, spaces or nothing, as Apple shows it", () => {
    for (const typed of [
      "abcd-efgh-ijkl-mnop",
      "abcdefghijklmnop",
      "abcd efgh ijkl mnop",
      " ABCD-EFGH-IJKL-MNOP ",
    ]) {
      expect(normalizeAppPassword(typed)).toBe("abcd-efgh-ijkl-mnop");
    }
  });

  it("leaves anything else as typed, without spaces, for the schema to refuse", () => {
    expect(normalizeAppPassword("mi clave 2024")).toBe("miclave2024");
  });
});

describe("icloudConnectSchema (RF-6, RF-7)", () => {
  it("accepts an Apple ID that is not an iCloud address", () => {
    const parsed = icloudConnectSchema.safeParse({
      appleId: " Ana@Gmail.com",
      password: "abcd efgh ijkl mnop",
    });
    expect(parsed.success && parsed.data).toEqual({
      appleId: "ana@gmail.com",
      password: "abcd-efgh-ijkl-mnop",
    });
  });

  it("explains each field in Spanish", () => {
    const parsed = icloudConnectSchema.safeParse({
      appleId: "ana",
      password: "",
    });
    expect(parsed.success).toBe(false);
    const issues = parsed.error?.issues ?? [];
    expect(issues.find((i) => i.path[0] === "appleId")?.message).toBe(
      "Escribe tu Apple ID, el correo con el que entras en iCloud.",
    );
    expect(issues.find((i) => i.path[0] === "password")?.message).toMatch(
      /contraseña específica de app/,
    );
  });

  it("refuses what is not an app-specific password, such as the normal one", () => {
    const parsed = icloudConnectSchema.safeParse({
      appleId: "ana@icloud.com",
      password: "MiClaveNormal1",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("ICLOUD_CONNECT_ERRORS (RF-6, RF-8)", () => {
  it("says it needs an app-specific password, not the normal one", () => {
    expect(ICLOUD_CONNECT_ERRORS.rejected).toMatch(
      /contraseña específica de app/,
    );
    expect(ICLOUD_CONNECT_ERRORS.rejected).toMatch(/no la contraseña normal/);
    expect(ICLOUD_CONNECT_ERRORS.transient).toMatch(/iCloud no responde/);
  });
});

describe("credential in Vault (plan D3)", () => {
  it("serializes to the versioned JSON and reads it back", () => {
    const text = serializeCredential({
      username: "ana@icloud.com",
      password: "abcd-efgh-ijkl-mnop",
    });
    expect(JSON.parse(text)).toEqual({
      v: 1,
      username: "ana@icloud.com",
      password: "abcd-efgh-ijkl-mnop",
    });
    expect(parseCredential(text)).toEqual({
      username: "ana@icloud.com",
      password: "abcd-efgh-ijkl-mnop",
    });
  });

  it("reads anything else as no credential", () => {
    expect(parseCredential("1//google-refresh-token")).toBeNull();
    expect(parseCredential('{"v":2,"username":"a","password":"b"}')).toBeNull();
    expect(parseCredential(null)).toBeNull();
  });
});
