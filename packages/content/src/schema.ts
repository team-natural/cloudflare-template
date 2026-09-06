import { z } from "zod";

// Reference schema for developer-maintained content (git-committed Markdown, no admin UI) —
// the counterpart to packages/schema's D1 tables for client-maintained content. Shared here so
// every app reading these files (apps/public today) validates against the same shape.
export const articleSchema = z.object({
  title: z.string(),
  description: z.string(),
  publishedDate: z.coerce.date(),
});

export type Article = z.infer<typeof articleSchema>;
