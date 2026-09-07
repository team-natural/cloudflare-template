# Cloudflare project template

Astro SSR on Cloudflare Workers, in a Dev Container. `apps/public` is the main domain and
`apps/admin` a subdomain of the same service — separate Workers sharing one D1, one R2 bucket and
the schema in `packages/schema`.

Ships with admin login, member login, a contact form, media uploads, Content Collections, unit and
e2e tests, and CI. Delete what the project does not need (step 4).

- **Implementation rules**: `CLAUDE.md`
- **Specifications**: `docs/` (25 documents; `docs/00_README.md` first)

## Prerequisites

- Docker (e.g. Docker Desktop)
- VS Code + the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers),
  or GitHub Codespaces
- A Cloudflare account. Password hashing costs ~50ms of CPU, which the Workers Free plan's 10ms
  limit cannot fit at any secure iteration count — **the admin login assumes a paid Worker**

## Bootstrapping a new project

Steps 1–2 are host-side; the rest run inside the container. **Step 4 must happen before step 8** —
after the first `pnpm db:generate` the migration contains those tables and removing them is no
longer a deletion.

### 1. Container identity and ports — `.devcontainer/`

Edit `.devcontainer/.env`:

- `COMPOSE_PROJECT_NAME` — unique per project. docker compose prefixes containers, volumes and
  networks with it, which is also what keeps each project's `claude-config` volume separate
- `APP_PORT_DEV_PUBLIC` / `APP_PORT_DEV_ADMIN` — change so they don't collide with other projects
  running side by side

Then `.devcontainer/devcontainer.json`: `name`, and the `portsAttributes` keys if the ports
changed. Add any OS packages the project needs to `.devcontainer/Dockerfile`.

### 2. Start the container and sign in to Claude Code

VS Code: **Dev Containers: Reopen in Container**. Or `docker compose -f
.devcontainer/docker-compose.yml up -d`.

`.devcontainer/setup.sh` runs on first start: `pnpm install`, the MCP servers, and Chromium for
Playwright. Claude Code's auth lives in a named volume rather than a host mount, so **each project
container needs its own login**:

```bash
claude
```

### 3. Project and Worker names

```bash
# Both are literal placeholders, not `replace-with-*` — grep will not find them
package.json                 "name": "app"
apps/public/wrangler.jsonc   "name": "public"
apps/admin/wrangler.jsonc    "name": "admin"
```

Rename the two Workers. The `name` field becomes the `workers.dev` subdomain and identifies the
Worker in the account, so `public` and `admin` will collide with every other project that left them
alone. Use something like `acme-public` / `acme-admin`.

The `@app/*` package scope stays as it is — renaming it means editing every import for no benefit.

### 4. Delete what the project does not need

Member login, the contact form, media uploads and password reset each ship whole and come out
cleanly. The table under **Bootstrapping a new project** in `CLAUDE.md` lists exactly what to
remove for each. Do this now, not after step 8.

### 5. Cloudflare resources

Create one of each, then copy the ids into **both** `wrangler.jsonc` files:

```bash
npx wrangler login
npx wrangler d1 create <db-name>
npx wrangler r2 bucket create <bucket-name>
npx wrangler kv namespace create KV
```

`database_id` **must be identical in both apps** — it also keys the local sqlite file, so a
mismatch silently gives each app its own database. Replace every `replace-with-*` placeholder,
including the `staging` and `production` blocks (`vars`, `d1_databases` and `kv_namespaces` are
non-inheritable, which is why they repeat).

R2 is only needed if the project keeps media uploads (step 4); KV only if it keeps a login, which
uses it for lockout counters.

### 6. Custom domains

Neither `wrangler.jsonc` declares `routes`, so a deploy lands on `workers.dev` — fine for staging,
[not recommended for production](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).
Add the domain to each app's production block:

```jsonc
"routes": [{ "pattern": "example.com", "custom_domain": true }]
```

`custom_domain` means the Worker is the origin, and Cloudflare creates the DNS record and
certificate. A plain route instead puts the Worker in front of an existing origin and needs a
proxied DNS record you create yourself.

### 7. Secrets

`apps/*/.dev.vars.example` → `.dev.vars` (gitignored). Nothing is required by the code that ships
today. Non-secret configuration belongs in `wrangler.jsonc` `vars`; in staging and production the
same keys become Workers Secrets (`wrangler secret put`).

### 8. Schema, migration, first account

```bash
pnpm db:generate    # → packages/schema/migrations/ — commit this
pnpm db:migrate     # applies to the shared local D1
pnpm --filter admin seed -- --table=admin_users --email=… --password=… --name=…
```

`migrations/` is generated per project, not shipped. If you ever delete it, delete
`.wrangler-state/` too — regenerating picks a new random filename and the next apply fails on
`table already exists`.

### 9. Verify

```bash
pnpm dev            # public on 5173, admin on 5174 by default
pnpm check          # format + lint + typecheck + unit tests
pnpm test:e2e       # needs pnpm db:generate first
```

Sign in at `http://localhost:5174` with the account from step 8. Use `localhost`, not the network
URL the dev server prints — the session cookie is `Secure`, and only `localhost` counts as a
secure context over plain HTTP.

### 10. Repository

`dev` is this template's default branch and CI runs on it. Create `main` for production, then
start replacing the scaffold: `apps/public/src/pages/index.astro` is a placeholder, and the
`docs/` set is filled in per project from `docs/00_INTAKE.md`.

## Day-to-day

| Command | |
| --- | --- |
| `pnpm dev` | Both apps. Stop with `pnpm --filter admin exec astro dev stop` — `astro dev` detaches when it detects an AI coding agent |
| `pnpm check` | format + lint + typecheck + unit tests |
| `pnpm test` / `pnpm test:e2e` | Vitest (inside workerd) / Playwright |
| `pnpm build` | |
| `pnpm db:generate` / `pnpm db:migrate` | Drizzle → migration SQL → local D1 |

`CLAUDE.md` has the rest, including the constraints that are not visible in the code.
