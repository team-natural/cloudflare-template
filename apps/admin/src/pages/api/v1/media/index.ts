import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { ValidationError, decodeCursor, encodeCursor, jsonCursorCollection, jsonItem, toErrorResponse } from "@app/server-kit/http";
import { requireRole, requireSession } from "$lib/server/auth/session";
import { listMedia, uploadMedia } from "$lib/server/services/media";

export async function GET({ request, cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    await requireSession(cookies, db);

    const params = new URL(request.url).searchParams;
    const perPageParam = params.get("per_page");
    const { items, perPage, nextId } = await listMedia(db, {
      beforeId: decodeCursor(params.get("cursor")),
      perPage: perPageParam ? Number(perPageParam) : undefined,
    });

    return jsonCursorCollection(items, { perPage, nextCursor: nextId ? encodeCursor(nextId) : null });
  } catch (error) {
    return toErrorResponse(error);
  }
}

// multipart/form-data rather than JSON — the body is the file. Nothing else in the API takes a
// form post, so this route parses instead of handing a Zod schema the request.
export async function POST({ request, cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireSession(cookies, db);
    requireRole(session, "editor");

    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) {
      throw new ValidationError({ file: ["ファイルを添付してください。"] });
    }

    return jsonItem(await uploadMedia(db, env.BUCKET, file, session), 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
