import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// ulid.ts uses crypto.getRandomValues, so tests run in workerd rather than Node. No bindings
// are needed — this package's D1 usage is exercised from the apps.
export default defineConfig({
  plugins: [cloudflareTest({ miniflare: { compatibilityDate: "2026-08-01", compatibilityFlags: ["nodejs_compat"] } })],
  test: { include: ["tests/**/*.test.ts"] },
});
