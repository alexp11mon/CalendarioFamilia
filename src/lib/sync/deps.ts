import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { refreshAccessToken } from "./providers/google";
import { ProviderError } from "./providers/types";

// What the sync engine needs, and the untyped rpc helper of the secret-protected
// sync functions (spec 007 plan D4). Moved out of run-sync so the providers can
// use it without a circular import (spec 018 plan D1).

export interface SyncDeps {
  supabase: SupabaseClient<Database>;
  secret: string;
  clientId: string;
  clientSecret: string;
  fetchFn?: typeof fetch;
  now?: () => Date;
  /** Time spent so far; the run stops claiming after 50 s (plan D19). */
  elapsedMs?: () => number;
}

export async function rpc(
  deps: SyncDeps,
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  // One untyped helper for every sync function; each caller casts its result.
  const { data, error } = await (
    deps.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  )(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

/** The stored secret of a connection: a refresh token or, for iCloud, a JSON credential. */
export async function storedSecret(
  deps: SyncDeps,
  connectionId: string,
): Promise<string> {
  const secret = (await rpc(deps, "sync_get_token", {
    p_secret: deps.secret,
    p_connection_id: connectionId,
  })) as string | null;
  if (!secret) throw new ProviderError("revoked", "No token stored");
  return secret;
}

/** One Google access token per connection; a rotated refresh token is stored first (R3). */
export async function accessToken(deps: SyncDeps, connectionId: string) {
  const refreshToken = await storedSecret(deps, connectionId);
  const renewed = await refreshAccessToken(
    {
      clientId: deps.clientId,
      clientSecret: deps.clientSecret,
      refreshToken,
    },
    deps.fetchFn,
  );
  if (renewed.refreshToken) {
    await rpc(deps, "sync_store_token", {
      p_secret: deps.secret,
      p_connection_id: connectionId,
      p_token: renewed.refreshToken,
    });
  }
  return renewed.accessToken;
}
