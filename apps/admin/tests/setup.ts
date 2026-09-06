import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { env } from "cloudflare:workers";

// TEST_MIGRATIONS is a test-only binding from vitest.config.ts, not part of Cloudflare.Env.
const testEnv = env as typeof env & { TEST_MIGRATIONS: D1Migration[] };

// migrations/ is a derived artifact the template does not ship, so on a fresh clone it is empty
// and every D1-backed test would fail with a bare `no such table`.
if (!testEnv.TEST_MIGRATIONS?.length) {
  throw new Error("No D1 migrations found. Run `pnpm db:generate` from the repo root first.");
}

await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
