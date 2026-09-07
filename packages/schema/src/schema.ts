import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Standard tables only. Anything a project may or may not adopt (orders, ai_jobs, …) is added
// here when it adopts it. `members` is the exception: most projects need a public-side login,
// and adding one later costs design work while removing one is a deletion — so it ships, and
// projects that do not need it drop it before their first `pnpm db:generate`.

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

// Public-side login. Deliberately not sharing admin_users/admin_sessions: an AdminUser token
// must never authenticate on the public site, and the two have different threat models.
export const members = sqliteTable(
  "members",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    status: text("status", { enum: ["active", "inactive"] }).notNull(),
    lastLoginAt: text("last_login_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_members_public_id").on(table.publicId), uniqueIndex("uq_members_email").on(table.email), index("idx_members_status").on(table.status)],
);

export const memberSessions = sqliteTable(
  "member_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id),
    sessionToken: text("session_token").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("uq_member_sessions_session_token").on(table.sessionToken), index("idx_member_sessions_member_id").on(table.memberId), index("idx_member_sessions_expires_at").on(table.expiresAt)],
);

// Row metadata for an object in R2; `key` is the object key. Delete this table and the BUCKET
// binding together — neither is useful without the other.
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
