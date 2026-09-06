// AdminUser sessions. Members (apps/public) get their own table, cookie and module — the shared
// rules live in @app/server-kit/auth, the storage never is.
import type { AstroCookies } from "astro";
import { isActiveSession, newSessionToken, sessionExpiresAt } from "@app/server-kit/auth";
import { ForbiddenError, UnauthenticatedError } from "@app/server-kit/http";
import { adminSessions, adminUsers } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { eq } from "drizzle-orm";

export const ADMIN_SESSION_COOKIE = "admin_session";

export type AdminRole = "admin" | "editor";

export interface Session {
  adminUserId: number;
  adminUserPublicId: string;
  role: AdminRole;
}

export async function getSession(cookies: AstroCookies, db: DbClient): Promise<Session | null> {
  const token = cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      adminUserId: adminUsers.id,
      adminUserPublicId: adminUsers.publicId,
      role: adminUsers.role,
      status: adminUsers.status,
      expiresAt: adminSessions.expiresAt,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminSessions.adminUserId, adminUsers.id))
    .where(eq(adminSessions.sessionToken, token))
    .limit(1);

  if (!row || !isActiveSession(row)) return null;
  return { adminUserId: row.adminUserId, adminUserPublicId: row.adminUserPublicId, role: row.role };
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

export async function createSession(db: DbClient, adminUserId: number, ttlDays: number): Promise<{ token: string; expiresAt: string }> {
  const expiresAt = sessionExpiresAt(ttlDays);
  const token = newSessionToken();
  await db.insert(adminSessions).values({ adminUserId, sessionToken: token, expiresAt });
  return { token, expiresAt };
}

export async function destroySession(db: DbClient, token: string): Promise<void> {
  await db.delete(adminSessions).where(eq(adminSessions.sessionToken, token));
}
