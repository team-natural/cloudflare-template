import { articleSchema } from "@app/content";
import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";

// Files live in packages/content/, not src/content/ — shared with any other app that needs
// to read (not edit) the same developer-maintained content, the same way D1/R2 are shared.
const articles = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "../../packages/content/articles" }),
  schema: articleSchema,
});

export const collections = { articles };
