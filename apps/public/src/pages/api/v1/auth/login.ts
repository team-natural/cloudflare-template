// `member_session` cookie only — no Authorization header, no JWT.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { assertNotLockedOut, clearAuthFailures, recordAuthFailure } from "@app/server-kit/auth";
import { UnauthenticatedError, ValidationError, jsonItem, toErrorResponse } from "@app/server-kit/http";
import { ZodError, flattenError } from "zod";
import { MEMBER_SESSION_COOKIE } from "$lib/server/auth/session";
import { toPublicMember } from "$lib/server/services/members";
import { login } from "$lib/server/services/auth";
import { loginSchema } from "$lib/server/validation/auth";
import { createDb } from "@app/schema/client";

export async function POST({ request, cookies, clientAddress }: APIContext): Promise<Response> {
  let lockoutScope: { ip: string; email: string } | undefined;
  try {
    const db = createDb(env.DB);
    const { email, password } = loginSchema.parse(await request.json());

    // Check lockout before verifying credentials.
    const ip = request.headers.get("cf-connecting-ip") ?? clientAddress;
    lockoutScope = { ip, email };
    await assertNotLockedOut(env.KV, ip, email);

    const ttlDays = Number(env.SESSION_TTL_DAYS);
    const { session, member } = await login(db, email, password, ttlDays);
    await clearAuthFailures(env.KV, ip, email);

    cookies.set(MEMBER_SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(session.expiresAt),
    });

    return jsonItem(toPublicMember(member));
  } catch (error) {
    if (error instanceof UnauthenticatedError && lockoutScope) {
      await recordAuthFailure(env.KV, lockoutScope.ip, lockoutScope.email, {
        maxAttempts: Number(env.AUTH_LOCKOUT_MAX_ATTEMPTS),
        lockoutMinutes: Number(env.AUTH_LOCKOUT_MINUTES),
      });
    }
    if (error instanceof ZodError) {
      return toErrorResponse(new ValidationError(flattenError(error).fieldErrors));
    }
    return toErrorResponse(error);
  }
}
