import cloudflare from "@astrojs/cloudflare";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
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
