// Read paths needed by login/me. Self-service registration, email verification and password
// reset are deliberately out of scope — they need a mail provider, which no project should be
// forced into by the template.
import { members } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { eq } from "drizzle-orm";

type MemberRow = typeof members.$inferSelect;

// Never let `passwordHash` (or the internal integer `id`) leave this layer in a response body.
export function toPublicMember(member: MemberRow) {
  return {
    id: member.publicId,
    name: member.name,
    email: member.email,
    status: member.status,
  };
}

export async function getMemberByEmail(db: DbClient, email: string) {
  const [row] = await db.select().from(members).where(eq(members.email, email)).limit(1);
  return row ?? null;
}

export async function getMemberByPublicId(db: DbClient, publicId: string) {
  const [row] = await db.select().from(members).where(eq(members.publicId, publicId)).limit(1);
  return row ?? null;
}

export async function touchLastLogin(db: DbClient, memberId: number): Promise<void> {
  await db.update(members).set({ lastLoginAt: new Date().toISOString() }).where(eq(members.id, memberId));
}
