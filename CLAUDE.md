# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About this template

This repository is not a specific project — it's the **standard template** the team uses as the
starting point for a new project, built for Astro SSR on Cloudflare Workers. Individual projects
are created by copying/forking it.

`apps/public` is the main domain, `apps/admin` a subdomain of the same service. They are separate
Workers but share one D1, one R2 bucket, and the schema in `packages/schema`.

## Bootstrapping a new project

The ordered procedure is in `README.md`. Two constraints that bite silently, and belong here
because they apply whenever the subject comes up:

- **`database_id` must be identical in both apps.** It also keys the local sqlite file, so a
  mismatch gives each app its own database with no error.
- **Deleting an unused feature must happen before the first `pnpm db:generate`.** After that the
  migration contains its tables and removing them is a migration, not a deletion.

What comes out for each feature:

| No… | Delete |
| --- | --- |
| public-side login | `members` / `member_sessions`; public's `lib/server/{auth,services/auth.ts,services/members.ts,validation/auth.ts}`, `pages/{login.astro,mypage,api/v1/auth}`, `lib/components/{login-form,logout-button}.svelte`; public's KV binding and its `SESSION_TTL_DAYS` / `AUTH_LOCKOUT_*` vars |
| contact form | `inquiries`; both apps' `inquiries` services, validation, routes and tests |
| file uploads | `media`; admin's `media` service, validation, routes and tests; the `BUCKET` binding in both apps and `r2Buckets` in admin's `vitest.config.ts` |
| password reset | `password_reset_tokens` |

## Commands

| Command | Notes |
| --- | --- |
| `pnpm dev` | Both apps. public on 5173, admin on 5174 by default |
| `pnpm check` | format + lint + typecheck + unit tests |
| `pnpm test` | Vitest, all packages |
| `pnpm test:e2e` | Playwright. Requires `pnpm db:generate` first |
| `pnpm build` | |
| `pnpm db:generate` | Drizzle → `packages/schema/migrations/` |
| `pnpm db:migrate` | Applies to the shared local D1 |
| `pnpm --filter admin seed -- --table=admin_users --email=… --password=… --name=…` | `--table=members` for the public side. Values need `=`, not a space |

## Container

`docker-compose.yml` mounts only this repository at `/workspace`; sibling projects on the host are
deliberately invisible. The container just `sleep infinity`s and devcontainer tooling execs in.
Node 24 and the `claude` CLI come from Dev Container Features, so nothing is installed on the host.

Claude Code's auth lives in a named volume (`claude-config` at `/home/vscode/.claude`), not a host
bind mount, so **each project container needs its own `claude` login**. The volume is root-owned on
creation, which is why `setup.sh` chowns it on every `postCreateCommand`.

`setup.sh` also runs `corepack enable` + `pnpm install`, and installs `context-mode`,
`@playwright/mcp` and Chromium. `Dockerfile` adds `uv`, which the Semble MCP server needs.

Ports are published by docker compose only (`devcontainer.json` has no `forwardPorts`), bound to
`127.0.0.1`.

## Local database

Both apps open the same store: `persistState: { path: "../../.wrangler-state" }` in each
`astro.config.mjs`, and every wrangler CLI call passes `--persist-to ../../.wrangler-state`. Drop
that flag and you silently get a second, empty database.

`packages/schema/migrations/` is generated, not shipped — the template has none, each project
generates its own and commits them. Two consequences:

- Deleting `migrations/` means deleting `.wrangler-state/` too. Regenerating produces a new random
  filename, which no longer matches what `d1_migrations` recorded, and the next apply fails with
  `table already exists`.
- Deleting only the `.sql` file leaves `meta/`, and drizzle-kit then reports "no changes" and
  generates nothing.

## Dev servers

`astro dev` **detaches into the background** when it detects an AI coding agent, so it survives the
shell that started it. Stop it with `pnpm --filter admin exec astro dev stop`, not by killing the
foreground process. Playwright sets `ASTRO_DEV_BACKGROUND=0` for the same reason.

Each app pins its own `inspectorPort` (env-overridable), because an explicit port loses wrangler's
automatic fallback and both apps would otherwise fight over 9229.

`apps/admin` delays dev startup by 2.5s. Both apps recovering the shared WAL at once kills one of
them; letting `apps/public` go first avoids it.

Builds need `NODE_OPTIONS=--dns-result-order=ipv4first` — Node resolves `localhost` to `::1` while
the prerender fetch listens on `127.0.0.1`. It is set both in `devcontainer.json` and in each
app's `build` script, so CI works too.

## Architecture

```
apps/public   main domain: content pages, member login
apps/admin    subdomain: admin console (shadcn-svelte lives here only)
packages/schema      Drizzle tables, ULID, D1 client
packages/server-kit  password hashing, lockout, session rules, HTTP envelope
packages/content     developer-maintained Markdown for Content Collections
```

Layering inside an app is `pages/ → services/ → schema`. API routes parse input with Zod, call a
service, and convert thrown `AppError`s with `toErrorResponse`. Pages guard themselves — there is
no auth middleware, and unlike an API route a page redirects instead of answering 401.

Client-maintained content belongs in D1 with an admin screen; developer-maintained content belongs
in `packages/content` as Markdown. Prefer Content Collections when the choice is open — it costs no
database reads.

## Authentication

AdminUser and Member sessions never share a table or cookie: an admin token must not authenticate
on the public site. What they do share is `packages/server-kit/src/auth/session.ts` — token
generation, TTL validation and the expiry/status check. Change those in one place.

Two rules that look like implementation details but are not:

- Miss paths (`unknown email`, `deactivated`) still run `burnPasswordVerification`. Returning early
  makes them answer far faster than a real account, which is a usable enumeration oracle.
- A missing `SESSION_TTL_DAYS` or `AUTH_LOCKOUT_*` var must throw. `Number(undefined)` is `NaN`,
  every comparison against it is false, and the lockout would silently never engage.

`apps/public` sets `Cache-Control: private, no-store` on member routes **in middleware**, not in
page frontmatter: `Astro.response.headers` does not reach a `Response` returned from a page, so
redirects would go out cacheable. The admin subdomain needs no equivalent.

Lockout counts per IP as well as per account, and locally every request arrives from `127.0.0.1` —
so five failed attempts lock every account for 15 minutes, and the symptom is a 429 on a password
that is correct. Clear it from `apps/admin`, where both the binary and the relative path resolve:

```bash
npx wrangler kv key list --binding KV --local --persist-to ../../.wrangler-state
npx wrangler kv key delete "auth-lock:ip:127.0.0.1" --binding KV --local --persist-to ../../.wrangler-state
```

## Testing

Unit tests run inside workerd via `@cloudflare/vitest-plugin`, not Node — `hashPassword` needs Web
Crypto and lockout needs a real KV. It peers on `vitest ^4.1.0`; vitest 5 makes miniflare fail to
boot with a bare `SyntaxError`.

E2E seeds its own account in `globalSetup`, so no env vars are needed. `pnpm test:e2e` runs with
`--concurrency=1`: both suites drive a real dev server against the one local D1, and running them
in parallel corrupts it.

Cover what E2E cannot reach — fail-closed config, expiry, timing parity — in Vitest. Cover
hydration in E2E: a missing `client:*` directive still renders server-side, so only an interaction
catches it.

## MCP servers

Configured in `.mcp.json`, enabled in `.claude/settings.json`.

- `context7` — library/framework docs
- `astro-docs`, `svelte`, `cloudflare-docs` — the official docs servers for this stack. Prefer
  them over `context7` for those three
- `context-mode` — context compression
- `semble` — code search (needs `uv`)
- `playwright` — browser automation. `--browser chromium` is required: the default is branded
  Chrome, which is not installed. `--output-dir` only applies when no filename is given, so asking
  for a named screenshot writes it to the repo root.

## Skills

`.claude/skills/shadcn-svelte/` is vendored verbatim from `huntabyte/shadcn-svelte`
(`skills/shadcn-svelte/`). Never hand-edit it — refresh by replacing the directory. The rest are
this team's own.

`shadcn-svelte` components are added with `npx shadcn-svelte add <component>` from inside
`apps/admin`. The CLI writes tab-indented files, so run `pnpm format` afterwards.

## Editing files

Always create/modify files with the `Edit` / `Write` tools, never `Bash` (`sed`, `echo >`,
heredocs). The PostToolUse hook (`.claude/hooks/format-and-check.sh`) only fires on `Edit`/`Write`
— bypassing it silently skips Prettier, ESLint, and the typecheck that runs after them.

## Comments

Write the code first with no comments, then add back only the ones that survive this test:

**Name the specific mistake the comment prevents. If you cannot name one, delete it.**

"A reader might wonder why" is not a mistake. "Someone will reorder these two calls and orphan a
row" is. Apply it per comment, not per file.

Then:

- **One line.** A second line only to name the consequence. Never a paragraph.
- **State the constraint, not the reasoning that produced it.** `// Bucket first: a row must never
  point at missing bytes.` — not the paragraph about which failure mode is recoverable. The
  reasoning belongs in the commit message, or in `docs/` if it outlives the commit.
- **Say it once per file.** The second and third place cross-reference the first.
- **"Not X" only when someone would plausibly write X.** Ruling out an option nobody would reach
  for is noise.

If comment lines exceed roughly a tenth of a file, that is not a violation but it is a signal —
read them again with the test above.
