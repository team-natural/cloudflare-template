// `[id]` is the media's public_id (a ULID), never the internal integer primary key.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { ValidationError, jsonItem, toErrorResponse } from "@app/server-kit/http";
import { ZodError, flattenError } from "zod";
import { requireRole, requireSession } from "$lib/server/auth/session";
import { deleteMedia, getMediaByPublicId, updateMedia } from "$lib/server/services/media";
import { updateMediaSchema } from "$lib/server/validation/media";

export async function GET({ params, cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    await requireSession(cookies, db);
    return jsonItem(await getMediaByPublicId(db, params.id!));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH({ params, request, cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireSession(cookies, db);
    requireRole(session, "editor");

    const input = updateMediaSchema.parse(await request.json());
    return jsonItem(await updateMedia(db, params.id!, input));
  } catch (error) {
    if (error instanceof ZodError) {
      return toErrorResponse(new ValidationError(flattenError(error).fieldErrors));
    }
    return toErrorResponse(error);
  }
}

export async function DELETE({ params, cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireSession(cookies, db);
    // Destroys bytes as well as a row, and cannot be undone from the console.
    requireRole(session, "admin");

    await deleteMedia(db, env.BUCKET, params.id!, session);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
