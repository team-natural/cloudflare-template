import { existsSync } from "node:fs";
import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Bindings are declared inline rather than through `wrangler.configPath`: wrangler.jsonc's
// `main` is the Astro adapter entrypoint, which these tests never build. Keep them in sync.
const migrationsPath = path.join(import.meta.dirname, "../../packages/schema/migrations");

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2026-08-01",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["DB"],
        kvNamespaces: ["KV"],
        r2Buckets: ["BUCKET"],
        bindings: {
          TEST_MIGRATIONS: existsSync(migrationsPath) ? await readD1Migrations(migrationsPath) : [],
          SESSION_TTL_DAYS: "30",
          AUTH_LOCKOUT_MAX_ATTEMPTS: "5",
          AUTH_LOCKOUT_MINUTES: "15",
        },
      },
    }),
  ],
  test: {
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
  },
}));
