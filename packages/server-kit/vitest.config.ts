import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests run inside workerd, not Node: password.ts depends on Web Crypto's PBKDF2 and lockout.ts
// on a real KVNamespace. There is no wrangler.jsonc here — this package has no Worker of its
// own — so the bindings are declared inline.
export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2026-08-01",
        compatibilityFlags: ["nodejs_compat"],
        kvNamespaces: ["KV"],
      },
    }),
  ],
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
