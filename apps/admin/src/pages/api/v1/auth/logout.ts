// Row deletion (session.ts's destroySession), not a status flag.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { toErrorResponse } from "@app/server-kit/http";
import { ADMIN_SESSION_COOKIE, requireSession } from "$lib/server/auth/session";
import { logout } from "$lib/server/services/auth";
import { createDb } from "@app/schema/client";

export async function POST({ cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    await requireSession(cookies, db);

    const token = cookies.get(ADMIN_SESSION_COOKIE)!.value;
    await logout(db, token);
    cookies.delete(ADMIN_SESSION_COOKIE, { path: "/" });

    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
