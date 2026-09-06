// Member sessions. Deliberately a separate table, cookie and module from apps/admin's
// AdminUser sessions — the shared rules live in @app/server-kit/auth, the storage never does.
import type { AstroCookies } from "astro";
import { isActiveSession, newSessionToken, sessionExpiresAt } from "@app/server-kit/auth";
import { UnauthenticatedError } from "@app/server-kit/http";
import { memberSessions, members } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { eq } from "drizzle-orm";

export const MEMBER_SESSION_COOKIE = "member_session";

export interface Session {
  memberId: number;
  memberPublicId: string;
}

export async function getSession(cookies: AstroCookies, db: DbClient): Promise<Session | null> {
  const token = cookies.get(MEMBER_SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      memberId: members.id,
      memberPublicId: members.publicId,
      status: members.status,
      expiresAt: memberSessions.expiresAt,
    })
    .from(memberSessions)
    .innerJoin(members, eq(memberSessions.memberId, members.id))
    .where(eq(memberSessions.sessionToken, token))
    .limit(1);

  if (!row || !isActiveSession(row)) return null;
  return { memberId: row.memberId, memberPublicId: row.memberPublicId };
}

export async function requireSession(cookies: AstroCookies, db: DbClient): Promise<Session> {
  const session = await getSession(cookies, db);
  if (!session) throw new UnauthenticatedError();
  return session;
}

export async function createSession(db: DbClient, memberId: number, ttlDays: number): Promise<{ token: string; expiresAt: string }> {
  const expiresAt = sessionExpiresAt(ttlDays);
  const token = newSessionToken();
  await db.insert(memberSessions).values({ memberId, sessionToken: token, expiresAt });
  return { token, expiresAt };
}

export async function destroySession(db: DbClient, token: string): Promise<void> {
  await db.delete(memberSessions).where(eq(memberSessions.sessionToken, token));
}
