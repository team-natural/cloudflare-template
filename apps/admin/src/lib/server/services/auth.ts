// Login business logic. Session verification lives in ../auth/session.ts;
// this file is specifically about turning credentials into a session.
import { burnPasswordVerification, verifyPassword } from "@app/server-kit/auth";
import { UnauthenticatedError } from "@app/server-kit/http";
import type { DbClient } from "@app/schema/client";
import { createSession, destroySession } from "../auth/session";
import { getAdminUserByEmail, touchLastLogin } from "./admin-users";

export async function login(db: DbClient, email: string, password: string, ttlDays: number) {
  const user = await getAdminUserByEmail(db, email);

  // Same error for "no such user" and "wrong password" — do not let a client distinguish
  // account existence from credential correctness.
  const invalidCredentials = () => new UnauthenticatedError("メールアドレスまたはパスワードが正しくありません。");

  // Burn one derivation on the miss paths too. Returning early here would make "unknown email"
  // and "deactivated account" answer far faster than a real one, which is a usable
  // enumeration oracle regardless of the error message being identical.
  if (!user || user.status !== "active") {
    await burnPasswordVerification(password);
    throw invalidCredentials();
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw invalidCredentials();

  const session = await createSession(db, user.id, ttlDays);
  await touchLastLogin(db, user.id);

  return { session, user };
}

export async function logout(db: DbClient, token: string): Promise<void> {
  await destroySession(db, token);
}
