import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { NotFoundError, jsonItem, toErrorResponse } from "@app/server-kit/http";
import { requireSession } from "$lib/server/auth/session";
import { getAdminUserByPublicId, toPublicAdminUser } from "$lib/server/services/admin-users";
import { createDb } from "@app/schema/client";

export async function GET({ cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireSession(cookies, db);

    const user = await getAdminUserByPublicId(db, session.adminUserPublicId);
    if (!user) throw new NotFoundError();

    return jsonItem(toPublicAdminUser(user));
  } catch (error) {
    return toErrorResponse(error);
  }
}
