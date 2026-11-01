// The iCloud credential: Apple ID and app-specific password (spec 018 plan D3).
// Pure; the JSON goes to Vault through connect_account, like Google's token.

export interface IcloudCredential {
  username: string;
  password: string;
}

/** Lowercase, without spaces: the account's identity (RF-9, RF-10). */
export function normalizeAppleId(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

const APP_PASSWORD = /^[a-z]{16}$/;

/**
 * Apple shows the password as `abcd-efgh-ijkl-mnop`: dashes and spaces are
 * accepted and it is stored in that form (plan "Resultado de la T1" (b)).
 * Anything else keeps its letters, without spaces, for the schema to refuse.
 */
export function normalizeAppPassword(value: string): string {
  const compact = value.replace(/\s+/g, "");
  const letters = compact.replace(/-/g, "").toLowerCase();
  if (!APP_PASSWORD.test(letters)) return compact;
  return letters.match(/.{4}/g)!.join("-");
}

export function isAppPassword(value: string): boolean {
  return /^[a-z]{4}(-[a-z]{4}){3}$/.test(value);
}

export function serializeCredential(credential: IcloudCredential): string {
  return JSON.stringify({ v: 1, ...credential });
}

/** The stored credential, or null if the secret is not one (a Google token). */
export function parseCredential(text: string | null): IcloudCredential | null {
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (
      typeof value === "object" &&
      value !== null &&
      "v" in value &&
      value.v === 1 &&
      "username" in value &&
      typeof value.username === "string" &&
      "password" in value &&
      typeof value.password === "string"
    ) {
      return { username: value.username, password: value.password };
    }
  } catch {
    // Not JSON: a Google refresh token.
  }
  return null;
}
