import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Generated from docs/3-development/07-database-schema.md (DEV-07) — that document is the
// source of truth. Do not hand-edit table/column shapes here; update DEV-07 first, then
// regenerate (`pnpm db:generate`). Only the standard, always-present tables (DEV-07 §3-1
// through §3-3) are defined below — optional tables (members, orders, ai_jobs, etc.) are
// adoption-gated per project and get added here only once a project actually adopts them.

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

export const adminUsers = sqliteTable(
  "admin_users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["admin", "editor"] }).notNull(),
    status: text("status", { enum: ["active", "inactive"] }).notNull(),
    lastLoginAt: text("last_login_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_admin_users_public_id").on(table.publicId), uniqueIndex("uq_admin_users_email").on(table.email), index("idx_admin_users_role").on(table.role), index("idx_admin_users_status").on(table.status)],
);

export const adminSessions = sqliteTable(
  "admin_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    adminUserId: integer("admin_user_id")
      .notNull()
      .references(() => adminUsers.id),
    sessionToken: text("session_token").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("uq_admin_sessions_session_token").on(table.sessionToken), index("idx_admin_sessions_admin_user_id").on(table.adminUserId), index("idx_admin_sessions_expires_at").on(table.expiresAt)],
);

export const passwordResetTokens = sqliteTable(
  "password_reset_tokens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    adminUserId: integer("admin_user_id")
      .notNull()
      .references(() => adminUsers.id),
    token: text("token").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("uq_password_reset_tokens_token").on(table.token), index("idx_password_reset_tokens_admin_user_id").on(table.adminUserId), index("idx_password_reset_tokens_expires_at").on(table.expiresAt)],
);

export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_categories_slug").on(table.slug)],
);

export const tags = sqliteTable(
  "tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_tags_slug").on(table.slug)],
);

export const posts = sqliteTable(
  "posts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    authorId: integer("author_id")
      .notNull()
      .references(() => adminUsers.id),
    categoryId: integer("category_id").references(() => categories.id),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    body: text("body").notNull(),
    status: text("status", { enum: ["draft", "published", "archived"] }).notNull(),
    publishedAt: text("published_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_posts_public_id").on(table.publicId), uniqueIndex("uq_posts_slug").on(table.slug), index("idx_posts_author_id").on(table.authorId), index("idx_posts_category_id").on(table.categoryId), index("idx_posts_status").on(table.status), index("idx_posts_published_at").on(table.publishedAt)],
);

// Composite PK, no surrogate id — the documented exception (DEV-07 §4-5).
export const postTags = sqliteTable(
  "post_tags",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.tagId] }), index("idx_post_tags_tag_id").on(table.tagId)],
);

export const media = sqliteTable(
  "media",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    uploaderId: integer("uploader_id").references(() => adminUsers.id),
    key: text("key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    altText: text("alt_text"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_media_public_id").on(table.publicId), uniqueIndex("uq_media_key").on(table.key), index("idx_media_uploader_id").on(table.uploaderId)],
);

export const inquiries = sqliteTable(
  "inquiries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    type: text("type"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    message: text("message").notNull(),
    status: text("status", { enum: ["new", "in_progress", "resolved"] }).notNull(),
    handledBy: integer("handled_by").references(() => adminUsers.id),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_inquiries_public_id").on(table.publicId), index("idx_inquiries_status").on(table.status), index("idx_inquiries_handled_by").on(table.handledBy), index("idx_inquiries_created_at").on(table.createdAt)],
);

// No organization_id / tenant scope column — single-operator premise (DEV-01 §4).
export const activityLog = sqliteTable(
  "activity_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    logName: text("log_name"),
    description: text("description").notNull(),
    subjectType: text("subject_type"),
    subjectId: integer("subject_id"),
    event: text("event"),
    causerType: text("causer_type"),
    causerId: integer("causer_id"),
    properties: text("properties"),
    batchId: text("batch_id"),
    createdAt: createdAt(),
  },
  (table) => [index("idx_activity_log_subject").on(table.subjectType, table.subjectId), index("idx_activity_log_causer").on(table.causerType, table.causerId), index("idx_activity_log_log_name").on(table.logName)],
);
