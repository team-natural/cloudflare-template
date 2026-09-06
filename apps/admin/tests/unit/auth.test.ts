// The session rules themselves are covered once in @app/server-kit; what is app-specific — and
// what these cover — is the join, the role check and the login orchestration.
import { env } from "cloudflare:workers";
import { adminSessions, adminUsers } from "@app/schema";
import { createDb } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { hashPassword } from "@app/server-kit/auth";
import { ForbiddenError, UnauthenticatedError } from "@app/server-kit/http";
import type { AstroCookies } from "astro";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ADMIN_SESSION_COOKIE, createSession, destroySession, getSession, requireRole } from "../../src/lib/server/auth/session";
import { login, logout } from "../../src/lib/server/services/auth";

const db = createDb(env.DB);
const EMAIL = "admin@example.com";
const PASSWORD = "correct horse battery staple";

function cookiesWith(token?: string) {
  return { get: (name: string) => (token && name === ADMIN_SESSION_COOKIE ? { value: token } : undefined) } as unknown as AstroCookies;
}

async function insertUser(overrides: Partial<typeof adminUsers.$inferInsert> = {}) {
  const [row] = await db
    .insert(adminUsers)
    .values({
      publicId: ulid(),
      name: "Admin",
      email: EMAIL,
      passwordHash: await hashPassword(PASSWORD),
      role: "admin",
      status: "active",
      updatedAt: new Date().toISOString(),
      ...overrides,
    })
    .returning();
  return row!;
}

beforeEach(async () => {
  await db.delete(adminSessions);
  await db.delete(adminUsers);
});

describe("getSession", () => {
  it("resolves a valid token to its AdminUser, role included", async () => {
    const user = await insertUser();
    const { token } = await createSession(db, user.id, 30);

    await expect(getSession(cookiesWith(token), db)).resolves.toEqual({
      adminUserId: user.id,
      adminUserPublicId: user.publicId,
      role: "admin",
    });
  });

  it("returns null with no cookie or an unknown token", async () => {
    await expect(getSession(cookiesWith(), db)).resolves.toBeNull();
    await expect(getSession(cookiesWith("not-a-real-token"), db)).resolves.toBeNull();
  });

  it("returns null once expired, and once the account is deactivated", async () => {
    const user = await insertUser();
    const { token } = await createSession(db, user.id, 30);

    await db.update(adminUsers).set({ status: "inactive" }).where(eq(adminUsers.id, user.id));
    await expect(getSession(cookiesWith(token), db)).resolves.toBeNull();

    await db.update(adminUsers).set({ status: "active" }).where(eq(adminUsers.id, user.id));
    await db
      .update(adminSessions)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(adminSessions.sessionToken, token));
    await expect(getSession(cookiesWith(token), db)).resolves.toBeNull();
  });
});

describe("requireRole", () => {
  it("lets admin satisfy an editor-level check but not the reverse", () => {
    expect(() => requireRole({ adminUserId: 1, adminUserPublicId: "x", role: "admin" }, "editor")).not.toThrow();
    expect(() => requireRole({ adminUserId: 1, adminUserPublicId: "x", role: "editor" }, "admin")).toThrow(ForbiddenError);
  });
});

describe("login", () => {
  it("issues a session and records the login time", async () => {
    await insertUser({ lastLoginAt: null });
    const { session } = await login(db, EMAIL, PASSWORD, 30);

    expect(session.token).not.toBe("");
    expect(await db.select().from(adminSessions)).toHaveLength(1);
    const [row] = await db.select().from(adminUsers);
    expect(row!.lastLoginAt).not.toBeNull();
  });

  it("rejects a wrong password and a deactivated account without creating a session", async () => {
    await insertUser();
    await expect(login(db, EMAIL, "wrong", 30)).rejects.toBeInstanceOf(UnauthenticatedError);

    await db.update(adminUsers).set({ status: "inactive" }).where(eq(adminUsers.email, EMAIL));
    await expect(login(db, EMAIL, PASSWORD, 30)).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(await db.select().from(adminSessions)).toHaveLength(0);
  });

  it("gives an unknown address the same message as a wrong password", async () => {
    await insertUser();
    const unknown = await login(db, "nobody@example.com", PASSWORD, 30).catch((error: Error) => error.message);
    const wrong = await login(db, EMAIL, "wrong", 30).catch((error: Error) => error.message);

    expect(unknown).toBe(wrong);
    expect(unknown).not.toContain("nobody@example.com");
  });

  it("spends a derivation on the miss path, so timing cannot reveal that an account exists", async () => {
    await insertUser();

    const wrongStart = performance.now();
    await login(db, EMAIL, "wrong", 30).catch(() => {});
    const wrong = performance.now() - wrongStart;

    const unknownStart = performance.now();
    await login(db, "nobody@example.com", PASSWORD, 30).catch(() => {});
    const unknown = performance.now() - unknownStart;

    // Loose bound: asserts the miss path is not an early return, not that the two are equal.
    expect(unknown).toBeGreaterThan(wrong / 4);
  });
});

describe("logout", () => {
  it("deletes the session row rather than just clearing a cookie", async () => {
    await insertUser();
    const { session } = await login(db, EMAIL, PASSWORD, 30);

    await logout(db, session.token);

    expect(await db.select().from(adminSessions)).toHaveLength(0);
    await expect(getSession(cookiesWith(session.token), db)).resolves.toBeNull();
  });
});

describe("destroySession", () => {
  it("is a no-op for an unknown token", async () => {
    await expect(destroySession(db, "not-a-real-token")).resolves.toBeUndefined();
  });
});
