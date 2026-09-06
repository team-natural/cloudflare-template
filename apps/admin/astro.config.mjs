import cloudflare from "@astrojs/cloudflare";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Both apps open the shared local D1 at once under `pnpm dev` and race to recover its WAL,
// killing one of them. Letting apps/public go first avoids it.
if (process.argv.includes("dev")) {
  await new Promise((resolve) => setTimeout(resolve, 2500));
}

export default defineConfig({
  output: "server",
  adapter: cloudflare({
    // Shared with apps/public, as in production.
    persistState: { path: "../../.wrangler-state" },
    // Distinct per app, or both apps fight over 9229. Explicit ports don't auto-fall back.
    inspectorPort: Number(process.env.APP_INSPECTOR_PORT_ADMIN ?? 9230),
  }),
  integrations: [svelte()],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ["@astrojs/svelte/server.js"],
    },
  },
  server: {
    host: true,
    port: Number(process.env.APP_PORT_DEV_ADMIN ?? 5174),
  },
});
