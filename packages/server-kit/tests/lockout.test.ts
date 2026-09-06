import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { RateLimitError } from "../src/http/errors";
import { assertNotLockedOut, clearAuthFailures, recordAuthFailure } from "../src/auth/lockout";

const config = { maxAttempts: 3, lockoutMinutes: 15 };
const IP = "203.0.113.1";
const EMAIL = "user@example.com";

async function failTimes(count: number, ip = IP, email = EMAIL) {
  for (let i = 0; i < count; i++) await recordAuthFailure(env.KV, ip, email, config);
}

// Storage is isolated per test file, not per test.
beforeEach(async () => {
  const { keys } = await env.KV.list();
  await Promise.all(keys.map((key) => env.KV.delete(key.name)));
});

describe("lockout", () => {
  it("allows attempts below the limit", async () => {
    await failTimes(config.maxAttempts - 1);
    await expect(assertNotLockedOut(env.KV, IP, EMAIL)).resolves.toBeUndefined();
  });

  it("locks out on the attempt that reaches the limit", async () => {
    await failTimes(config.maxAttempts);
    await expect(assertNotLockedOut(env.KV, IP, EMAIL)).rejects.toBeInstanceOf(RateLimitError);
  });

  it("counts per account as well as per IP, so switching IP does not reset it", async () => {
    await failTimes(config.maxAttempts, "198.51.100.7");
    await expect(assertNotLockedOut(env.KV, IP, EMAIL)).rejects.toBeInstanceOf(RateLimitError);
  });

  it("matches the account scope case-insensitively", async () => {
    await failTimes(config.maxAttempts, IP, "USER@example.com");
    await expect(assertNotLockedOut(env.KV, IP, EMAIL)).rejects.toBeInstanceOf(RateLimitError);
  });

  it("clears the counter on success, so earlier failures do not accumulate", async () => {
    await failTimes(config.maxAttempts - 1);
    await clearAuthFailures(env.KV, IP, EMAIL);
    await failTimes(config.maxAttempts - 1);
    await expect(assertNotLockedOut(env.KV, IP, EMAIL)).resolves.toBeUndefined();
  });

  it("fails closed when the limits are not configured", async () => {
    // Number(undefined) from a missing wrangler.jsonc var: every comparison against NaN is
    // false, so an unguarded implementation would silently never lock out.
    await expect(recordAuthFailure(env.KV, IP, EMAIL, { maxAttempts: NaN, lockoutMinutes: 15 })).rejects.toThrow(/AUTH_LOCKOUT_MAX_ATTEMPTS/);
    await expect(recordAuthFailure(env.KV, IP, EMAIL, { maxAttempts: 3, lockoutMinutes: 0 })).rejects.toThrow(/AUTH_LOCKOUT_MINUTES/);
  });
});
