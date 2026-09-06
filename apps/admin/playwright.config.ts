import { defineConfig } from "@playwright/test";

const baseURL = `http://localhost:${process.env.APP_PORT_DEV_ADMIN ?? "5174"}`;

export default defineConfig({
  testDir: "tests/e2e",
  // A setup project is Playwright's recommendation, but it only pays off once the setup needs
  // a browser — this one shells out to wrangler.
  globalSetup: "./tests/e2e/global-setup.ts",
  // A stray test.only would otherwise let CI pass on a subset.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL, trace: "on-first-retry" },
  webServer: {
    command: "pnpm dev",
    // Astro 7 detaches `astro dev` for AI coding agents; Playwright then reports
    // "webServer exited early".
    env: { ASTRO_DEV_BACKGROUND: "0" },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
