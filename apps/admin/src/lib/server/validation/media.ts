// Only `altText` is client input. `key`, `mimeType` and `sizeBytes` describe the object that was
// actually stored, and `uploaderId` comes from the session — none of them are a caller's to send.
import { media } from "@app/schema";
import { createUpdateSchema } from "drizzle-zod";
import type { z } from "zod";

export const updateMediaSchema = createUpdateSchema(media, {
  altText: (schema) => schema.max(255),
}).pick({ altText: true });

export type UpdateMediaInput = z.infer<typeof updateMediaSchema>;
