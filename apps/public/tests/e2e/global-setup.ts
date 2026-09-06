import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

// Seeded below rather than read from env vars, so `pnpm test:e2e` works unconfigured.
export const E2E_MEMBER = {
  email: "e2e-member@example.test",
  password: "e2e-only-password",
  name: "E2E Member",
};

// Resolved from this file, not the cwd: `playwright test --config apps/public/...` run from the
// repo root would otherwise point wrangler at paths that do not exist.
const appDir = path.join(import.meta.dirname, "../..");
const adminDir = path.join(appDir, "../admin");
const migrationsDir = path.join(appDir, "../../packages/schema/migrations");
// The store the dev server opens (astro.config.mjs `persistState`).
const persist = ["--persist-to", path.join(appDir, "../../.wrangler-state")];

// Run from apps/admin: its wrangler.jsonc owns the shared database (migrations_dir), and the
// seeder lives alongside it.
function runInAdmin(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: adminDir });
  if (result.status !== 0) throw new Error(`E2E setup failed: ${command} ${args.join(" ")}`);
}

export default function globalSetup() {
  if (!existsSync(migrationsDir)) {
    throw new Error("No D1 migrations found. Run `pnpm db:generate` from the repo root first.");
  }

  runInAdmin("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local", ...persist]);

  // Drop only this account, so a developer's own data survives a test run. Sessions go first:
  // member_sessions.member_id has no ON DELETE CASCADE.
  const email = E2E_MEMBER.email.replaceAll("'", "''");
  runInAdmin("npx", ["wrangler", "d1", "execute", "DB", "--local", ...persist, "--command", `DELETE FROM member_sessions WHERE member_id IN (SELECT id FROM members WHERE email = '${email}'); DELETE FROM members WHERE email = '${email}';`]);

  runInAdmin("pnpm", ["seed", "--", "--table=members", `--email=${E2E_MEMBER.email}`, `--password=${E2E_MEMBER.password}`, `--name=${E2E_MEMBER.name}`]);
}
