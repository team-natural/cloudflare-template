// The visitor-facing half. What matters here is that a form post cannot reach the columns the
// server owns — apps/admin's tests cover everything that happens afterwards.
import { env } from "cloudflare:workers";
import { inquiries } from "@app/schema";
import { createDb } from "@app/schema/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createInquiry } from "../../src/lib/server/services/inquiries";
import { createInquirySchema } from "../../src/lib/server/validation/inquiries";

const db = createDb(env.DB);
const form = { type: "general", name: "Visitor", email: "visitor@example.com", message: "Hello" };

beforeEach(async () => {
  await db.delete(inquiries);
});

describe("createInquirySchema", () => {
  it("drops the columns the server owns", () => {
    // Without the pick, a form post could arrive pre-resolved and pre-assigned.
    const parsed = createInquirySchema.parse({ ...form, status: "resolved", handledBy: 1, publicId: "spoofed" });
    expect(parsed).toEqual(form);
  });

  it("requires a usable email and a non-empty message", () => {
    expect(createInquirySchema.safeParse({ ...form, email: "not-an-email" }).success).toBe(false);
    expect(createInquirySchema.safeParse({ ...form, message: "" }).success).toBe(false);
    // Bounded so a single request cannot push an arbitrarily large row into D1.
    expect(createInquirySchema.safeParse({ ...form, message: "x".repeat(2001) }).success).toBe(false);
  });
});

describe("createInquiry", () => {
  it("returns only the public id, and files the row as new and unassigned", async () => {
    const created = await createInquiry(db, form);

    expect(created).toEqual({ id: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/) });
    const [row] = await db.select().from(inquiries);
    expect(row).toMatchObject({ status: "new", handledBy: null, email: form.email });
  });
});
