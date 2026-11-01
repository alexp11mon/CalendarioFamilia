import { accessToken, rpc, storedSecret, type SyncDeps } from "../deps";
import { revokeToken } from "./google";
import { googleSession } from "./google-session";
import { icloudSession } from "./icloud";
import {
  isProvider,
  ProviderError,
  type ProviderName,
  type ProviderSession,
} from "./types";

// Server-only: opens a connection with the provider it belongs to (spec 018
// plan D1). Google renews its token; iCloud reads its credential from Vault.

function providerOf(value: unknown): ProviderName {
  if (!isProvider(value)) {
    throw new ProviderError("rejected", `Unknown provider ${String(value)}`);
  }
  return value;
}

export async function openSession(
  deps: SyncDeps,
  provider: unknown,
  connectionId: string,
): Promise<ProviderSession> {
  if (providerOf(provider) === "google") {
    return googleSession(await accessToken(deps, connectionId), deps.fetchFn);
  }
  return icloudSession(await storedSecret(deps, connectionId), deps.fetchFn);
}

/**
 * Withdraws CaFam's access before disconnecting: Google revokes the token
 * (RF-30 of 007); iCloud cannot, so the user does it in their Apple account
 * (spec 018 RF-67).
 */
export async function revokeAccess(
  deps: SyncDeps,
  provider: unknown,
  connectionId: string,
): Promise<void> {
  if (providerOf(provider) !== "google") return;
  // As in spec 007: without a stored token there is nothing to revoke.
  const token = (await rpc(deps, "sync_get_token", {
    p_secret: deps.secret,
    p_connection_id: connectionId,
  }).catch(() => null)) as string | null;
  if (token) await revokeToken(token, deps.fetchFn);
}
