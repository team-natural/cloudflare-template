// @ts-check
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import eslintPluginAstro from "eslint-plugin-astro";
import boundaries from "eslint-plugin-boundaries";
import eslintPluginSvelte from "eslint-plugin-svelte";
import globals from "globals";
import tseslint from "typescript-eslint";
import adminSvelteConfig from "./apps/admin/svelte.config.js";
import publicSvelteConfig from "./apps/public/svelte.config.js";

export default tseslint.config(
  {
    ignores: ["**/dist/", "**/.astro/", "**/.wrangler/", "**/.turbo/", "**/node_modules/", "**/worker-configuration.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
  ...eslintPluginSvelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  // Each app has its own svelte.config.js; passing it to the parser is what makes
  // preprocessor-aware rules (svelte/valid-compile etc.) accurate.
  {
    files: ["apps/admin/**/*.svelte"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        svelteConfig: adminSvelteConfig,
      },
    },
  },
  {
    files: ["apps/public/**/*.svelte"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        svelteConfig: publicSvelteConfig,
      },
    },
  },
  {
    files: ["apps/*/src/**/*.{ts,astro,svelte}", "packages/*/src/**/*.ts"],
    plugins: { boundaries },
    settings: {
      // Without this, patterns resolve against cwd and silently match nothing when turbo runs eslint per app.
      "boundaries/root-path": path.dirname(fileURLToPath(import.meta.url)),
      // Required so boundaries can resolve extensionless TS imports
      "import/resolver": { typescript: true },
      "boundaries/elements": [
        { type: "public-pages", pattern: "apps/public/src/pages" },
        { type: "public-components", pattern: "apps/public/src/components" },
        { type: "admin-pages", pattern: "apps/admin/src/pages" },
        { type: "admin-components", pattern: "apps/admin/src/lib/components" },
        { type: "admin-server", pattern: "apps/admin/src/lib/server/*" },
        { type: "packages", pattern: "packages/*/src" },
      ],
    },
    rules: {
      // Two independently deployable Workers (apps/public, apps/admin) — neither app may reach
      // into the other's source, and packages/* is shared code that must not depend on either app.
      // admin-server (auth/services/validation — db/http moved to packages/*) is the one-way
      // dependency target: pages/API routes and UI components may call into it, never the reverse.
      // No rule yet forcing pages through the service layer instead of @app/schema directly —
      // add that once the API routes exist to check it against.
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          policies: [
            {
              from: {
                element: {
                  types: { anyOf: ["public-pages", "public-components"] },
                },
              },
              disallow: {
                to: {
                  element: {
                    types: { anyOf: ["admin-pages", "admin-components", "admin-server"] },
                  },
                },
              },
              message: "apps/public must not import from apps/admin — share code via packages/* instead",
            },
            {
              from: {
                element: {
                  types: { anyOf: ["admin-pages", "admin-components", "admin-server"] },
                },
              },
              disallow: {
                to: {
                  element: {
                    types: { anyOf: ["public-pages", "public-components"] },
                  },
                },
              },
              message: "apps/admin must not import from apps/public — share code via packages/* instead",
            },
            {
              from: { element: { type: "admin-components" } },
              disallow: { to: { element: { type: "admin-server" } } },
              message: "UI components must not import server layers — delegate via API routes",
            },
            {
              from: { element: { type: "admin-server" } },
              disallow: { to: { element: { types: { anyOf: ["admin-pages", "admin-components"] } } } },
              message: "Server layers must not depend on UI layers — dependencies flow one way",
            },
            {
              from: { element: { type: "packages" } },
              disallow: {
                to: {
                  element: {
                    types: { anyOf: ["public-pages", "public-components", "admin-pages", "admin-components", "admin-server"] },
                  },
                },
              },
              message: "packages/* must not depend on apps/* — dependencies flow apps -> packages only",
            },
          ],
        },
      ],
    },
  },
);
