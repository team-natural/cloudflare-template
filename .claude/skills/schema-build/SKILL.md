---
name: schema-build
description: Add or change D1 tables by updating the Drizzle schema and generating migration SQL. Use when asked to add/modify a table or column, or to sync the DB with docs/3-development/07-database-schema.md (DEV-07). NOT for writing application queries — that's plain Drizzle usage in Service code (see CLAUDE.md, DEV-05).
---

# Schema Build

Turns a table/column change into a Drizzle schema update and a generated D1 migration. **DEV-07
(`docs/3-development/07-database-schema.md`) is the source of truth** — always change DEV-07
first, then propagate. Never hand-write migration SQL and never edit files under `migrations/`
directly; they are `drizzle-kit generate` output.

Scope: this skill owns `packages/schema/src/schema.ts` and `packages/schema/migrations/`. It does
not write Service functions, Zod schemas, or API routes — those live in `apps/admin` and are
separate work that reads from this schema (`typeof table.$inferSelect` / `$inferInsert`;
`drizzle-zod` for validation).

## Step 1 — Confirm the DEV-07 change first

If the user is asking for a new/changed table but DEV-07 doesn't yet reflect it, update DEV-07
§3 (table list) and the relevant §4/§5/§7 column definition table before touching any code. Follow
DEV-07 §1's type conventions exactly:

- PK: `INTEGER PRIMARY KEY AUTOINCREMENT`. A join table with a composite PK and no surrogate id
  is the only exception
- Public-facing ID: `public_id TEXT` (ULID), only on tables exposed via URL/API
- Booleans: `INTEGER` (0/1), never a SQLite `BOOLEAN` alias
- Timestamps: `TEXT` ISO 8601; `created_at` defaults via `strftime(...)`, `updated_at` is set by
  the Service layer (no DB-side auto-update trigger unless one already exists for that table)
- No soft deletes — an explicit `status` column instead
- No `organization_id` or other tenant-scope column (single-operator premise, DEV-01 §4)

Also update the ERD Mermaid block between `<!-- ERD:START -->` / `<!-- ERD:END -->` in DEV-07 §2
so it stays in sync with §3/§4 (DEV-07's own stated rule).

## Step 2 — Update `packages/schema/src/schema.ts`

Translate the DEV-07 column table to Drizzle's `sqlite-core` API: `snake_case` DB names via the
first argument, `camelCase` TS property names, indexes/unique constraints returned from the
table's extra-config callback as an array — `(table) => [index(...), uniqueIndex(...)]`.

`schema.ts` already holds DEV-07 §3-1〜§3-3's standard tables (admin_users, admin_sessions,
password_reset_tokens, members, member_sessions, media, inquiries, activity_log), so follow
their house style rather than inventing one: the shared
`createdAt()` helper for the `strftime(...)` default, `publicId` alongside the internal integer
primary key, and the extra-config callback form above. Optional tables (orders, ai_jobs …) are
adoption-gated and get added only when the project adopts them.

| DEV-07 | Drizzle |
| --- | --- |
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `integer("id").primaryKey({ autoIncrement: true })` |
| `TEXT NOT NULL` | `text("col").notNull()` |
| `TEXT NULL` | `text("col")` |
| enum-like TEXT (e.g. `draft/published/archived`) | `text("col", { enum: [...] }).notNull()` — keep the enum values byte-for-byte identical to DEV-01/DEV-09's state names |
| `FK → other_table.id` | `integer("col").notNull().references(() => otherTable.id)` (nullable FK omits `.notNull()`) |
| `UNIQUE(col)` | `uniqueIndex("uq_<table>_<col>").on(table.col)` |
| plain index | `index("idx_<table>_<col>").on(table.col)` |
| composite index/PK | `.on(table.a, table.b)` / `primaryKey({ columns: [table.a, table.b] })` |

Naming for generated index/constraint names follows DEV-07 §8-1 (`idx_<table>_<column>`,
`uq_<table>_<column>`) exactly — this is what makes the generated migration SQL readable.

Add tables in dependency order (referenced table above the table that references it) — this file
has no enforced ordering otherwise, but it's the existing convention.

**Adoption-gated tables** (orders, ai_jobs, etc. — anything DEV-07 marks 採用時のみ):
only add them here when the project actually adopts that feature. Don't pre-populate the schema
with tables the project isn't using.

## Step 3 — Generate the migration

```bash
pnpm run db:generate
```

This runs `drizzle-kit generate` from `packages/schema`, diffing `schema.ts` against
`migrations/meta/` snapshots and writing new SQL to `packages/schema/migrations/NNNN_<name>.sql`.

On a fresh project there is no `migrations/` directory yet — the template deliberately ships none
(CLAUDE.md, "Local database"). drizzle-kit creates it, and because there is no prior
snapshot to diff against, that first run emits a clean `0000_*.sql` containing exactly the project's
tables. Commit the result; from then on every run is an incremental diff.
No live D1 connection is needed for this step. Read the generated SQL — confirm it's additive
(new `CREATE TABLE`/`CREATE INDEX`/forward-only `ALTER`) and matches DEV-07's forward-only
migration policy (DEV-07 §9). If it wants to drop or rebuild a column in a way `ALTER TABLE`
can't express (e.g. adding `NOT NULL` to an existing column), stop and follow DEV-07 §9-1's
staged approach instead of forcing it through.

Applying the migration (`wrangler d1 migrations apply`) is a separate, later step run from
**`apps/admin` only** (CLAUDE.md, "Local database") — this skill does not run it.

## Step 4 — Verify

```bash
pnpm --filter @app/schema test
```

`tests/conventions.test.ts` enforces the mechanical half of DEV-07 §12 — index naming, a unique
index on `public_id`, an index on every foreign key, `_at` columns stored as TEXT, a defaulted
`created_at`, no soft deletes, no tenant column. Do not weaken a rule to make a new table pass;
either the table is wrong, or the convention changed and DEV-07 changes with it.

The rest of §12 is judgment a test cannot make, so check it by reading: state values match
DEV-09, AdminUser and Member session tables stay separate, and the ERD block from Step 1 matches
§3/§4.

## Reporting

State which DEV-07 section changed, which tables/columns were added in `schema.ts`, and the
generated migration filename. If DEV-07 itself needed a content fix (not just a schema addition)
to have a definition to build from, call that out explicitly — don't silently invent columns DEV-07
never specified.
