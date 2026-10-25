// One immediate retry for a dropped network call (B-10).
//
// When `fetch` itself throws, Clerk's Backend API client reports it as a
// ClerkAPIResponseError with no `status` and the transport message in
// `errors[0].message`. A real HTTP error (401, 404, 429, 5xx) always carries a
// numeric `status` and is never retried: retrying auth failures is wrong, and
// retrying 429/5xx adds load to a struggling API.

const TRANSPORT_MESSAGE = /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i;

export function isTransientFetchError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as {
    status?: unknown;
    message?: unknown;
    errors?: { message?: unknown }[];
  };
  if (typeof e.status === "number") return false;
  const messages = [e.message, e.errors?.[0]?.message];
  return messages.some((m) => typeof m === "string" && TRANSPORT_MESSAGE.test(m));
}

export async function withTransientRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isTransientFetchError(err)) throw err;
    return fn();
  }
}
