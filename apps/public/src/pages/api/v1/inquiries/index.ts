// The one unauthenticated write in this template: a contact form is open by definition. Abuse is
// handled at the edge (WAF rate limiting) rather than here, so this route stays a thin parse and
// insert — add an application-level throttle only if the edge rules prove insufficient.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { ValidationError, jsonItem, toErrorResponse } from "@app/server-kit/http";
import { ZodError, flattenError } from "zod";
import { createInquiry } from "$lib/server/services/inquiries";
import { createInquirySchema } from "$lib/server/validation/inquiries";

export async function POST({ request }: APIContext): Promise<Response> {
  try {
    const input = createInquirySchema.parse(await request.json());
    return jsonItem(await createInquiry(createDb(env.DB), input), 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return toErrorResponse(new ValidationError(flattenError(error).fieldErrors));
    }
    return toErrorResponse(error);
  }
}
