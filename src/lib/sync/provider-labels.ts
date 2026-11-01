import type { ProviderName } from "./providers/types";

// How each provider is named on screen (spec 018 plan "Textos", R7). Pure, so
// client components can use it without the provider clients.

const NAMES: Record<ProviderName, string> = {
  google: "Google",
  icloud: "iCloud",
};

export function providerName(provider: ProviderName): string {
  return NAMES[provider];
}

/** Before spec 018 every connection was Google; anything else reads as Google too. */
export function providerOrGoogle(value: unknown): ProviderName {
  return value === "icloud" ? "icloud" : "google";
}

/** The window's notice of an event deleted in its provider (spec 009 RF-25, spec 018 RF-48). */
export type GoneDone = "gone" | "goneIcloud";

export function goneDone(provider: ProviderName): GoneDone {
  return provider === "icloud" ? "goneIcloud" : "gone";
}

export function isGoneDone(value: unknown): value is GoneDone {
  return value === "gone" || value === "goneIcloud";
}
