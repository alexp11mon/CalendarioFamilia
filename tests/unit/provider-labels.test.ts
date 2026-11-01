import { describe, expect, it } from "vitest";
import {
  goneDone,
  isGoneDone,
  providerName,
  providerOrGoogle,
} from "@/lib/sync/provider-labels";
import { readOnlyReason } from "@/lib/sync/read-only";
import { syncErrorText } from "@/lib/sync/summary";
import { WRITE_ERRORS, writeErrorText } from "@/lib/sync/write-errors";

// Spec 018, T4: the texts name the provider (plan "Textos y reglas de
// pantalla", R7; RF-1, RF-20, RF-33, RF-43, RF-46 to RF-48, RF-51, RF-62).
describe("providerName", () => {
  it("names each provider as the user knows it", () => {
    expect(providerName("google")).toBe("Google");
    expect(providerName("icloud")).toBe("iCloud");
  });

  it("reads unknown values as Google, the only provider before spec 018", () => {
    expect(providerOrGoogle("icloud")).toBe("icloud");
    expect(providerOrGoogle(undefined)).toBe("google");
    expect(providerOrGoogle("microsoft")).toBe("google");
  });
});

describe("writeErrorText (RF-45 to RF-48, RF-51)", () => {
  it("keeps the texts of spec 009 for Google", () => {
    for (const failure of [
      "transient",
      "revoked",
      "rejected",
      "gone",
    ] as const) {
      expect(writeErrorText(failure, "google")).toBe(WRITE_ERRORS[failure]);
    }
  });

  it("speaks of iCloud and its app-specific password for iCloud", () => {
    expect(writeErrorText("transient", "icloud")).toBe(
      "iCloud no responde. No se ha guardado el cambio; vuelve a intentarlo dentro de un momento.",
    );
    expect(writeErrorText("rejected", "icloud")).toBe(
      "iCloud no ha permitido el cambio, así que no se ha guardado.",
    );
    expect(writeErrorText("gone", "icloud")).toBe(
      "Este evento se había borrado en iCloud y se ha quitado de CaFam.",
    );
    expect(writeErrorText("revoked", "icloud")).toMatch(
      /contraseña específica de app nueva/,
    );
  });
});

describe("syncErrorText (RF-19, RF-61)", () => {
  it("names the provider in a withdrawn permission and a missing calendar", () => {
    expect(syncErrorText("missing", "icloud")).toBe(
      "Este calendario ya no existe en la cuenta de iCloud.",
    );
    expect(syncErrorText("revoked", "icloud")).toMatch(
      /contraseña del Apple ID/,
    );
    expect(syncErrorText("revoked", "google")).toMatch(/^Google ha retirado/);
  });
});

describe("goneDone", () => {
  it("tells which provider deleted the event, for the window's notice", () => {
    expect(goneDone("google")).toBe("gone");
    expect(goneDone("icloud")).toBe("goneIcloud");
    expect(isGoneDone("goneIcloud")).toBe(true);
    expect(isGoneDone("deleted")).toBe(false);
  });
});

describe("readOnlyReason (RF-20)", () => {
  const synced = {
    lastSyncedAt: null,
    accountEmail: null,
    connectionId: "c",
    canWrite: false,
    googleAccess: null,
    provider: "icloud" as const,
  };

  it("says the provider only lets read, or that the account must reconnect", () => {
    expect(readOnlyReason({ ...synced, googleAccess: "reader" })).toBe(
      "provider",
    );
    expect(readOnlyReason(synced)).toBe("reconnect");
    expect(readOnlyReason({ ...synced, canWrite: true })).toBeNull();
    expect(readOnlyReason(null)).toBeNull();
  });
});
