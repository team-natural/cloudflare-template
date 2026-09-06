// AdminUser session verification. This covers AdminUser ONLY — a Member-side login (if ever
// adopted in apps/public) gets its own separate session.ts, never sharing this table/cookie.
import type { AstroCookies } from "astro";
import { toBase64Url } from "@app/server-kit/auth";
import { ForbiddenError, UnauthenticatedError } from "@app/server-kit/http";
import { adminSessions, adminUsers } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { and, eq, gt } from "drizzle-orm";

export const ADMIN_SESSION_COOKIE = "admin_session";
const SESSION_TOKEN_BYTES = 32;

export type AdminRole = "admin" | "editor";

export interface Session {
  adminUserId: number;
  adminUserPublicId: string;
  role: AdminRole;
}

export async function getSession(cookies: AstroCookies, db: DbClient): Promise<Session | null> {
  const token = cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;

  const now = new Date().toISOString();
  const [row] = await db
    .select({
      adminUserId: adminUsers.id,
      adminUserPublicId: adminUsers.publicId,
      role: adminUsers.role,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminSessions.adminUserId, adminUsers.id))
    // `status` is re-checked on every request, not just at login: deactivating an AdminUser
    // must take effect immediately even though existing admin_sessions rows survive it.
    // Deleting those rows on deactivation is still the primary revocation path — this is the
    // backstop that also covers a status flipped directly in D1.
    .where(and(eq(adminSessions.sessionToken, token), gt(adminSessions.expiresAt, now), eq(adminUsers.status, "active")))
    .limit(1);

  return row ?? null;
}

export async function requireSession(cookies: AstroCookies, db: DbClient): Promise<Session> {
  const session = await getSession(cookies, db);
  if (!session) throw new UnauthenticatedError();
  return session;
}

// `admin` implicitly satisfies an `editor`-level check — the upper role includes the lower
// role's permissions.
export function requireRole(session: Session, role: AdminRole): void {
  const allowed: AdminRole[] = role === "editor" ? ["admin", "editor"] : ["admin"];
  if (!allowed.includes(session.role)) {
    throw new ForbiddenError(`この操作には ${role} ロールが必要です。`);
  }
}

// Session lifecycle (login/logout). `ttlDays` is caller-supplied rather than a constant here —
// the value comes from `env.SESSION_TTL_DAYS` (wrangler.jsonc `vars`), not hardcoded here.
export async function createSession(db: DbClient, adminUserId: number, ttlDays: number): Promise<{ token: string; expiresAt: string }> {
  // A missing env.*.vars entry gives Number(undefined) === NaN here, and new Date(NaN)
  // throws only *after* the password has already been verified — which turns a correct
  // credential pair into a 500 while wrong ones stay 401, i.e. a login oracle. Reject early.
  if (!Number.isFinite(ttlDays) || ttlDays < 1) {
    throw new Error(`SESSION_TTL_DAYS is not configured as a positive number (got ${ttlDays}). Check this environment's vars block in wrangler.jsonc.`);
  }
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(SESSION_TOKEN_BYTES)));
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  await db.insert(adminSessions).values({ adminUserId, sessionToken: token, expiresAt });
  return { token, expiresAt };
}

// Row deletion, not a status flag — revocation must be immediate and unambiguous.
export async function destroySession(db: DbClient, token: string): Promise<void> {
  await db.delete(adminSessions).where(eq(adminSessions.sessionToken, token));
}
