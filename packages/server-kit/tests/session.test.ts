import { describe, expect, it } from "vitest";
import { isActiveSession, newSessionToken, sessionExpiresAt } from "../src/auth/session";

describe("newSessionToken", () => {
  it("returns a distinct url-safe token per call", () => {
    const tokens = new Set(Array.from({ length: 50 }, newSessionToken));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("sessionExpiresAt", () => {
  it("adds ttlDays to the given instant", () => {
    const from = Date.parse("2026-01-01T00:00:00.000Z");
    expect(sessionExpiresAt(30, from)).toBe("2026-01-31T00:00:00.000Z");
  });

  it("rejects an unusable ttl rather than producing an invalid date", () => {
    // Number(undefined) from a missing wrangler.jsonc var. Throwing here rather than at
    // new Date(NaN) keeps a correct credential pair from answering 500 while wrong ones stay
    // 401 — that difference is a login oracle.
    for (const ttl of [NaN, 0, -1, Infinity]) {
      expect(() => sessionExpiresAt(ttl)).toThrow(/SESSION_TTL_DAYS/);
    }
  });
});

describe("isActiveSession", () => {
  const now = new Date("2026-01-15T00:00:00.000Z");

  it("accepts an unexpired session on an active account", () => {
    expect(isActiveSession({ status: "active", expiresAt: "2026-02-01T00:00:00.000Z" }, now)).toBe(true);
  });

  it("rejects an expired session", () => {
    expect(isActiveSession({ status: "active", expiresAt: "2026-01-14T23:59:59.999Z" }, now)).toBe(false);
  });

  it("rejects a deactivated account even while its session row is unexpired", () => {
    // Status is re-checked per request, so deactivating takes effect immediately.
    expect(isActiveSession({ status: "inactive", expiresAt: "2026-02-01T00:00:00.000Z" }, now)).toBe(false);
  });

  it("treats the exact expiry instant as expired", () => {
    expect(isActiveSession({ status: "active", expiresAt: now.toISOString() }, now)).toBe(false);
  });
});
