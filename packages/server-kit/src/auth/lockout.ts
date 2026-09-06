// Brute-force lockout for auth endpoints: failed attempts are counted per IP and per account
// in KV (TTL windows); exceeding the limit locks that scope out. Generic IP rate limiting stays
// at the Cloudflare edge (WAF) — this covers only the account-level protection the edge can't see.
import { RateLimitError } from "../http/errors";

const WINDOW_SECONDS = 60;

export interface LockoutConfig {
  maxAttempts: number;
  lockoutMinutes: number;
}

function scopes(ip: string, email: string): string[] {
  return [`ip:${ip}`, `email:${email.toLowerCase()}`];
}

// `vars` is non-inheritable in wrangler.jsonc, so a missing env.* entry hands us
// Number(undefined) === NaN. Every comparison against NaN is false, which would make the
// lockout branch below unreachable — the brake silently never engages. Fail closed instead.
function requirePositiveInt(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`${name} is not configured as a positive number (got ${value}). Check this environment's vars block in wrangler.jsonc.`);
  }
  return value;
}

export async function assertNotLockedOut(kv: KVNamespace, ip: string, email: string): Promise<void> {
  const locks = await Promise.all(scopes(ip, email).map((scope) => kv.get(`auth-lock:${scope}`)));
  if (locks.some((lock) => lock !== null)) {
    throw new RateLimitError();
  }
}

// KV has no atomic increment; the read-modify-write race can undercount concurrent
// failures. Acceptable here — the counter is a best-effort brake, not an audit record.
export async function recordAuthFailure(kv: KVNamespace, ip: string, email: string, config: LockoutConfig): Promise<void> {
  await Promise.all(
    scopes(ip, email).map(async (scope) => {
      const maxAttempts = requirePositiveInt(config.maxAttempts, "AUTH_LOCKOUT_MAX_ATTEMPTS");
      const lockoutMinutes = requirePositiveInt(config.lockoutMinutes, "AUTH_LOCKOUT_MINUTES");
      const count = Number((await kv.get(`auth-fail:${scope}`)) ?? "0") + 1;
      if (count >= maxAttempts) {
        await kv.put(`auth-lock:${scope}`, "1", { expirationTtl: lockoutMinutes * 60 });
        await kv.delete(`auth-fail:${scope}`);
      } else {
        await kv.put(`auth-fail:${scope}`, String(count), { expirationTtl: WINDOW_SECONDS });
      }
    }),
  );
}

export async function clearAuthFailures(kv: KVNamespace, ip: string, email: string): Promise<void> {
  await Promise.all(scopes(ip, email).map((scope) => kv.delete(`auth-fail:${scope}`)));
}
