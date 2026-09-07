// One route per action rather than a PATCH on `status`: the legal moves are then visible in the
// URL space, and each can carry its own role.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { jsonItem, toErrorResponse } from "@app/server-kit/http";
import { requireRole, requireSession } from "$lib/server/auth/session";
import { transitionInquiry } from "$lib/server/services/inquiries";

export async function POST({ params, cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireSession(cookies, db);
    requireRole(session, "editor");

    return jsonItem(await transitionInquiry(db, params.id!, "new", session));
  } catch (error) {
    return toErrorResponse(error);
  }
}
