---
name: admin-design
description: Build or rework ADMIN screens (dashboards, lists, forms, settings) using shadcn-svelte, following the project's existing component patterns, then verify with fixing-accessibility and design-review. Use when implementing an admin/dashboard screen under apps/admin/src/pages. NOT for public-facing pages — use the public-design skill for those.
---

# Admin Screen Design

Build an admin screen by following the project's existing shadcn-svelte patterns — admin
design is decided by shadcn-svelte components and `admin.css`'s design tokens, not by per-page
aesthetic exploration. The goal is uniformity: every admin screen should feel like the same
product. Do NOT invoke `frontend-design` or seek a distinctive visual direction here.

The argument to this skill is the screen brief (which screen, what data/actions it needs).

## Step 1 — Implement against the standard patterns

Invoke the `shadcn-svelte` skill before writing anything — it covers the CLI, this project's
`components.json` (aliases, `neutral` base color, `lucide` icons), and the composition/forms/
styling/icon rules under `.claude/skills/shadcn-svelte/rules/`. While implementing:

- Compose from the primitives already in `apps/admin/src/lib/components/ui/` first; only run
  `npx shadcn-svelte add <component>` (from inside `apps/admin`) for something genuinely
  missing. Per CLAUDE.md: never hand-edit `.claude/skills/shadcn-svelte/`, and run
  `pnpm run format` after `add`/`update` since the CLI's own output uses tabs.
- Look at the most similar existing admin screen for established composition style before
  inventing a new layout — currently the login screen: `apps/admin/src/pages/index.astro`
  + `apps/admin/src/lib/components/login-form.svelte`, and the dashboard at
  `apps/admin/src/pages/dashboard/index.astro`. What the login screen establishes: `Card.Root` >
  `Card.Header`/`Card.Content`/`Card.Footer` composition, `Field.FieldGroup` > `Field.Field` >
  `Field.FieldLabel` + control + `Field.FieldError` for form layout (never a bare `div` with
  `grid gap-*` — the vendored rule in `.claude/skills/shadcn-svelte/rules/forms.md`), and
  Svelte 5 runes (`$state`) for local form state. It is wired to
  `POST /api/v1/auth/login`, so it also establishes this project's client-side form conventions:
  inline per-field errors from the API's 422 envelope, a `role="alert"` form-level message for
  everything else, and a submit button disabled until `onMount` fires (an island's markup exists
  before its JS, and a submit in that window is a native POST that loses the input). Follow those
  three, but treat the *layout* as a minimal scaffold rather than a finished screen. As more admin screens land, treat the most recent screen of the same kind
  (dashboard/list/form/settings) as the reference instead — this skill doesn't hard-code
  per-type layouts, because none are established yet.
- Wrap the page in `apps/admin/src/layouts/Layout.astro` (which imports
  `apps/admin/src/styles/admin.css`) — never `apps/public`'s layout or `global.css`.
- Styling stays within `admin.css`'s CSS-variable tokens (`--primary`, `--muted-foreground`,
  etc.) — no per-screen color/typography decisions. If something looks off product-wide, fix
  the token in `admin.css`, not the page.

Done when the screen renders end-to-end with realistic data.

## Step 2 — Consistency & polish pass

Sweep the screen you just built:

- Compare spacing/typography against the most similar existing admin screen, not against
  taste.
- Confirm each control came from `apps/admin/src/lib/components/ui/` (or a freshly-added
  shadcn-svelte component) rather than hand-rolled markup duplicating what a primitive already
  does.
- Empty/loading/error states are present and each surfaces one clear action.
- Invoke the `baseline-ui` skill for the generic sweep (spacing, hierarchy, small layout
  issues). Skip its design-direction concerns — `admin.css`'s tokens already decide those.

## Step 3 — Accessibility pass: `fixing-accessibility`

Invoke the `fixing-accessibility` skill and audit/fix the screen. shadcn-svelte's primitives
(built on `bits-ui`) already cover most primitive-level behavior (focus trap, ARIA roles) —
focus the audit on what the page composes: heading order (the login screen has no `<h1>` at all
today — give every screen you build a real one, visible or `sr-only`, rather than copying that
gap), form error associations, icon-only buttons, table semantics, focus after dialog/sheet
close.

## Step 4 — Verify in a real browser: `design-review`

Invoke the `design-review` skill for the finished screen. Pay particular attention to its
consistency findings (does this screen look like the rest of the admin?) and the responsive
behavior of tables/filters/forms at the mobile breakpoint.

## Feedback loop

Fix findings by returning to the step that owns them (pattern/composition → Step 1, polish →
Step 2, a11y → Step 3), then re-run Step 4. Max 2 loops without checking in with the user.

## Reporting

Summarize in the user's language: which existing screen you used as the pattern reference,
what was built, and the a11y/review results (reference the screenshots).
