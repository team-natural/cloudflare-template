---
name: design-review
description: Automated visual design review of the running app using the Playwright MCP browser (screenshots, a11y snapshot, responsive checks). Use when asked to review the design of a page, after building or restyling frontend UI, or as the final step of the public-design/admin-design skills.
---

# Design Review

Review the actual rendered app in a real (headless) browser via the `playwright` MCP server —
not just the source code. Report findings; do not change code unless the user asks for fixes.

## 1. Preflight

- Identify the pages/routes to review (from the user's request or the work just completed).
- Make sure the relevant dev server is running. Inside this container: `apps/public` is at
  `http://localhost:${APP_PORT_DEV_PUBLIC}` (default `5173`), `apps/admin` is at
  `http://localhost:${APP_PORT_DEV_ADMIN}` (default `5174`) — check `.devcontainer/.env`; host
  and container ports are always the same value per app. If it is not running, start it with
  `pnpm --filter public dev` or `pnpm --filter admin dev` in the background.
- The `playwright` MCP server is configured in `.mcp.json` (headless Chromium, `--no-sandbox`).
  If its tools are not available in the current session, tell the user a session restart is
  needed instead of trying to reinstall anything.

## 2. Capture

For each page under review:

1. `browser_navigate` to the URL.
2. `browser_snapshot` — read the accessibility tree (roles, names, heading structure).
3. `browser_take_screenshot` — full page. Do not pass `filename`: an explicit filename
   resolves against `cwd` (`/workspace`) instead of the configured `outputDir`, bypassing it
   entirely and leaving an untracked file in the repo root (see CLAUDE.md's "MCP servers"
   section). Omit it so the screenshot auto-names into the gitignored `.playwright-mcp/`
   directory instead.
4. Repeat the screenshot at each breakpoint with `browser_resize`:
   - Mobile: 375×812
   - Tablet: 768×1024
   - Desktop: 1440×900
5. `browser_console_messages` — collect errors/warnings.
6. For key interactive elements, exercise hover/focus states (`browser_click`,
   keyboard navigation via `browser_press_key`) and observe the result.

## 3. Review checklist

Evaluate the captures against:

- **Visual hierarchy** — is the page's single most important element obvious? Do heading
  sizes/weights descend logically?
- **Spacing & alignment** — consistent spacing scale, no cramped or orphaned elements,
  aligned edges across sections.
- **Typography** — line length, line height, size contrast between levels, no default-looking
  font stacks if a design intent exists.
- **Color & contrast** — sufficient text contrast, intentional (not templated) palette,
  consistent semantic colors.
- **Interaction states** — visible hover/focus/active states; focus ring never removed
  without replacement.
- **Responsive behavior** — no horizontal overflow, no broken layout, sensible reflow at
  each breakpoint.
- **Accessibility tree** — headings in order, images labeled, controls named, landmarks
  present (complements the `fixing-accessibility` skill's code-level pass).
- **Console** — no errors; flag noisy warnings.

## 4. Report

Report findings in the user's language, ordered by severity (broken → hindering → polish).
For each: what's wrong, where (page + breakpoint, reference the screenshot), and a concrete
suggested fix. End with what looks good, so it isn't "fixed" away. Do not apply fixes in this
skill — hand the list back to the caller (the user, or the public-design/admin-design loop).
