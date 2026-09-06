import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { NotFoundError, jsonItem, toErrorResponse } from "@app/server-kit/http";
import { requireSession } from "$lib/server/auth/session";
import { getMemberByPublicId, toPublicMember } from "$lib/server/services/members";
import { createDb } from "@app/schema/client";

export async function GET({ cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireSession(cookies, db);

    const member = await getMemberByPublicId(db, session.memberPublicId);
    if (!member) throw new NotFoundError();

    return jsonItem(toPublicMember(member));
  } catch (error) {
    return toErrorResponse(error);
  }
}
