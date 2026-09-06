import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

// Seeded below rather than read from env vars, so `pnpm test:e2e` works unconfigured.
export const E2E_ADMIN = {
  email: "e2e-admin@example.test",
  password: "e2e-only-password",
  name: "E2E Admin",
};

// Resolved from this file, not the cwd: `playwright test --config apps/admin/...` run from the
// repo root would otherwise point wrangler at paths that do not exist.
const appDir = path.join(import.meta.dirname, "../..");
const migrationsDir = path.join(appDir, "../../packages/schema/migrations");
// The store the dev server opens (astro.config.mjs `persistState`).
const persist = ["--persist-to", path.join(appDir, "../../.wrangler-state")];

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: appDir });
  if (result.status !== 0) throw new Error(`E2E setup failed: ${command} ${args.join(" ")}`);
}

export default function globalSetup() {
  if (!existsSync(migrationsDir)) {
    throw new Error("No D1 migrations found. Run `pnpm db:generate` from the repo root first.");
  }

  run("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local", ...persist]);

  // Drop only this account, so a developer's own seeded admin survives a test run. Sessions go
  // first: admin_sessions.admin_user_id has no ON DELETE CASCADE.
  const email = E2E_ADMIN.email.replaceAll("'", "''");
  run("npx", ["wrangler", "d1", "execute", "DB", "--local", ...persist, "--command", `DELETE FROM admin_sessions WHERE admin_user_id IN (SELECT id FROM admin_users WHERE email = '${email}'); DELETE FROM admin_users WHERE email = '${email}';`]);

  run("pnpm", ["seed", "--", "--table=admin_users", `--email=${E2E_ADMIN.email}`, `--password=${E2E_ADMIN.password}`, `--name=${E2E_ADMIN.name}`]);
}
