// Read paths needed by login/me. Full AdminUser management (list/invite/role change/deactivate,
// admin-only) is separate, not-yet-implemented scope.
import { adminUsers } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { eq } from "drizzle-orm";

type AdminUserRow = typeof adminUsers.$inferSelect;

// Never let `passwordHash` (or the internal integer `id`) leave this layer in a response body.
export function toPublicAdminUser(user: AdminUserRow) {
  return {
    id: user.publicId,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
  };
}

export async function getAdminUserByEmail(db: DbClient, email: string) {
  const [row] = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
  return row ?? null;
}

export async function getAdminUserByPublicId(db: DbClient, publicId: string) {
  const [row] = await db.select().from(adminUsers).where(eq(adminUsers.publicId, publicId)).limit(1);
  return row ?? null;
}

export async function touchLastLogin(db: DbClient, adminUserId: number): Promise<void> {
  await db.update(adminUsers).set({ lastLoginAt: new Date().toISOString() }).where(eq(adminUsers.id, adminUserId));
}
