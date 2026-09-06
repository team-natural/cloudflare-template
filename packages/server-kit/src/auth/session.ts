// The rules every login session obeys. Each app keeps its own tables and cookie — an AdminUser
// token must never authenticate a Member — but these must not drift between them.
import { toBase64Url } from "./encoding";

const SESSION_TOKEN_BYTES = 32;

// The minimum a session lookup must select; apps select more and keep their own row type.
export interface SessionRow {
  expiresAt: string;
  status: string;
}

export function newSessionToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(SESSION_TOKEN_BYTES)));
}

// A missing SESSION_TTL_DAYS var arrives as NaN. Left to new Date(NaN) it would throw only
// after the password was verified, making a correct credential pair answer 500 while wrong
// ones stay 401 — a login oracle.
export function sessionExpiresAt(ttlDays: number, from = Date.now()): string {
  if (!Number.isFinite(ttlDays) || ttlDays < 1) {
    throw new Error(`SESSION_TTL_DAYS is not configured as a positive number (got ${ttlDays}). Check this environment's vars block in wrangler.jsonc.`);
  }
  return new Date(from + ttlDays * 24 * 60 * 60 * 1000).toISOString();
}

// Status is re-checked per request, not just at login, so deactivating an account takes effect
// immediately even though its session rows survive. Deleting those rows is still the primary
// revocation path; this is the backstop.
export function isActiveSession(row: SessionRow, now = new Date()): boolean {
  return row.status === "active" && row.expiresAt > now.toISOString();
}
