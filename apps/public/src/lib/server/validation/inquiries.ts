// Derived from the table, so a column change surfaces here as a type error. `status`,
// `publicId` and `handledBy` are picked off: they belong to the server, not to a form post.
import { inquiries } from "@app/schema";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const createInquirySchema = createInsertSchema(inquiries, {
  name: (schema) => schema.min(1).max(100),
  email: () => z.email().max(255),
  message: (schema) => schema.min(1).max(2000),
  type: (schema) => schema.max(50),
}).pick({ type: true, name: true, email: true, message: true });

export type CreateInquiryInput = z.infer<typeof createInquirySchema>;
