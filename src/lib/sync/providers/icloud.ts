import { ProviderError, type ProviderSession } from "./types";

// Placeholder until spec 018 T8 adds the CalDAV client.
export function icloudSession(
  _credential: string,
  _fetchFn?: typeof fetch,
): ProviderSession {
  throw new ProviderError("transient", "iCloud is not available yet");
}
