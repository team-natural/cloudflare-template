// `[id]` is the inquiry's public_id (a ULID), never the internal integer primary key.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { jsonItem, toErrorResponse } from "@app/server-kit/http";
import { requireRole, requireSession } from "$lib/server/auth/session";
import { deleteInquiry, getInquiryByPublicId } from "$lib/server/services/inquiries";

export async function GET({ params, cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    await requireSession(cookies, db);
    return jsonItem(await getInquiryByPublicId(db, params.id!));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE({ params, cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireSession(cookies, db);
    // Destructive and unlogged, so it takes the higher role even though editors handle
    // everything else about an inquiry. Spam is the reason this exists at all.
    requireRole(session, "admin");

    await deleteInquiry(db, params.id!, session);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
