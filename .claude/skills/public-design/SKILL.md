---
name: public-design
description: Orchestrates the page-building chain for PUBLIC-FACING pages (LP, marketing, top page, general content) — frontend-design → baseline-ui → fixing-accessibility → fixing-motion-performance → web-design-guidelines → design-review. Use for BOTH the site's first page (establishing run — decides the design direction) and every page after it (following run — inherits that direction instead of re-deciding it). NOT for admin screens — use the admin-design skill for those. NOT for light touch-ups — for those use the individual skill instead (spacing/typography → baseline-ui, a11y → fixing-accessibility, animation → fixing-motion-performance, guideline audit → web-design-guidelines, visual review → design-review).
---

# Public Page Design

Build a public-facing page by applying six steps **in this exact order**. Do not skip or
reorder them; each one assumes the previous step's output. Step 1 has two forms — pick the mode
below before starting. The argument to this skill is the page brief (what to build, tone,
constraints).

## Pick a mode first (this decides what Step 1 does)

A public site's look is decided **once**, on its first page, and every page after it inherits
that decision. So this skill has two modes. State which one you are running and why, before
writing any code.

| | **Establishing run** (Mode A) | **Following run** (Mode B) |
|---|---|---|
| When | The site's first page — normally the top page, built together with `Layout.astro`. Also a deliberate site-wide redesign. | Every subsequent page (`/blog`, `/about`, a detail page…). |
| Step 1 | `frontend-design` — commits to a visual direction | **Skipped.** Inherit the established direction from the reference page + tokens (see Step 1B) |
| Steps 2–6 | All run | All run, unchanged |

**Do not run Mode A twice on one site.** `frontend-design` re-decides the visual direction
every time it runs, so a second establishing run gives that page a different look from the
rest — the single most common way a public site ends up inconsistent. If a page genuinely needs
to depart from the site's direction (a campaign LP), say so explicitly and treat it as its own
mini-site with its own reference page.

For admin screens use `admin-design` instead — admin design is decided by the existing
shadcn-svelte patterns, not by this chain. For a small fix on an existing page, don't use this
skill at all; invoke the one specialized skill that owns the problem (see the description
above).

## Project constraints (apply throughout every step)

- **No shadcn-svelte / `admin.css` tokens on public pages** — build with plain Astro + Svelte
  islands + Tailwind v4 (see CLAUDE.md's Architecture section). shadcn-svelte is the admin-side
  system only.
- **Layout**: wrap the page in `apps/public/src/layouts/Layout.astro` and import
  `apps/public/src/styles/global.css` (plain Tailwind — no component library; for its token layer
  see "Design tokens" below). Site-wide
  `<head>` changes (OGP, fonts) belong in the layout, not the page — pages contain only their
  `<main>` content.
- **Svelte components are islands**: place them in `apps/public/src/lib/components/`, mount from
  the `.astro` page with a `client:*` directive, and use Svelte 5 runes syntax (`$state`, etc.).
- **Design tokens**: `global.css` ships as a bare `@import "tailwindcss";` because the *template*
  has no brand — not because the public side is meant to stay tokenless. Theme values belong in
  one place, never as per-component overrides, so:
  - **Mode A**: when Step 1 commits to recurring custom values (brand colors, a type scale, a
    radius), add them to a `@theme` block in `apps/public/src/styles/global.css` and consume them
    through the utilities Tailwind generates from them. Do not scatter the same hex or `rem` value
    across pages, and do not park them in page-scoped CSS custom properties — that is the
    per-page duplication that rule exists to prevent, and it leaves Mode B nothing to inherit.
  - **Mode B**: use the existing tokens. If a page seems to need a new one, that is a site-wide
    decision — add it to `global.css`, don't hardcode it in the page.
  - Never reach into `admin.css`'s tokens from `apps/public`.

### Chain depth

Full 6-step chain: top page, LP, pricing/feature pages — anything that carries the product's
face. Simple pages (legal pages, `404.astro`/`500.astro`): Steps 1 and 6 are usually enough —
state which depth you chose and why.

## Step 1A — Establishing run (Mode A): `frontend-design`

Invoke the `frontend-design` skill and follow it while implementing the page: pin down the
subject/audience/job of the page, commit to a distinctive aesthetic direction, then build the
full UI. Done when the page renders end-to-end with real (or realistic) content.

Because every later page inherits this run, finish it by leaving the direction somewhere the
next page can actually read:

- Recurring values go in `global.css`'s `@theme` block (see "Design tokens" above).
- Anything shared across pages — header, footer, `<head>`/OGP — belongs in
  `apps/public/src/layouts/Layout.astro`, not in the page. Build the layout as part of this run.
- Extract the components you'd otherwise re-type on page 2 (section wrapper, card, button,
  prose block) into `apps/public/src/lib/components/`.
- Report the direction in prose too: the type scale, spacing rhythm, color roles, and any
  signature treatment. This is what a Mode B run is told to follow.

## Step 1B — Following run (Mode B): inherit, don't re-decide

**Do not invoke `frontend-design`.** Read the reference page first — the site's established page,
normally `apps/public/src/pages/index.astro` — plus `Layout.astro`, `global.css`'s `@theme`
block, and `apps/public/src/lib/components/`. Name the page you used as the reference in your report;
where several exist, prefer the most recent page of the same kind (list / detail / form / static).

Then build this page out of what you found: same layout wrapper, same tokens, same components,
same spacing rhythm and heading scale. Reach for a new component only when nothing existing
composes into what the page needs — and build it in the established style, in
`apps/public/src/lib/components/`, so the page after this one inherits it too.

Done when the page renders end-to-end with realistic content and reads as the same site as the
reference page.

## Step 2 — Polish pass: `baseline-ui`

Invoke the `baseline-ui` skill and sweep the code you just wrote: spacing scale, hierarchy,
typography, and small layout issues. Done when the pass produces no further changes.

## Step 3 — Accessibility pass: `fixing-accessibility`

Invoke the `fixing-accessibility` skill and audit/fix the page: ARIA labels, keyboard
navigation, focus management, contrast, form errors. Done when the audit finds nothing left
to fix in the new code.

## Step 4 — Motion & performance pass: `fixing-motion-performance`

Invoke the `fixing-motion-performance` skill and audit/fix every animation and transition on
the page: compositor-only properties, layout thrashing, scroll-linked motion, blur effects.
If the page has no motion at all, state that and move on. Done when the audit finds nothing
left to fix in the new code.

## Step 5 — Guideline QA gate: `web-design-guidelines`

Invoke the `web-design-guidelines` skill with the files written/changed in Steps 1–4 as the
audit target. It fetches the latest Vercel Web Interface Guidelines (100+ rules) and reports
violations in `file:line` format. This is a static code audit and runs AFTER all
code-rewriting passes so it sees the final code — it catches what the specialized passes
don't own (forms, touch targets, dark mode, i18n, image optimization, typography rules).
Fix every reported violation: route accessibility items with Step 3's approach and
animation items with Step 4's approach; fix the rest in place. Done when a re-audit reports
nothing, or only items you consciously reject as deliberate design decisions (state which
and why).

## Step 6 — Verify in a real browser: `design-review`

Invoke the `design-review` skill. It drives the running app through the `playwright` MCP
browser (screenshots at mobile/tablet/desktop, a11y snapshot, console check) and returns a
prioritized list of findings.

## Feedback loop

If design-review reports findings, fix them by returning to the step that owns the problem —
visual direction → Step 1A in Mode A; in Mode B a "wrong visual direction" finding means the page
drifted from the reference, so fix the page against the reference (Step 1B) rather than re-opening
the site's direction. Spacing/typography → Step 2, a11y → Step 3, animation jank or
performance → Step 4, guideline violations (forms, touch targets, dark mode, i18n, etc.) →
Step 5 — then re-run Step 6. Any fix that changed code should also pass back through the
Step 5 audit before re-verifying in the browser. Stop when design-review comes back clean or
only polish-level items remain; report those remaining items to the user rather than looping
forever (max 2 loops without asking).

## Reporting

At the end, summarize in the user's language: which mode you ran, what was built, what each pass
changed, and the final design-review result (attach/reference the screenshots). Then, depending
on the mode:

- **Mode A**: state the design direction in prose plus the tokens you added to `global.css` and
  the shared components/layout you created — this is the hand-off every later page follows.
- **Mode B**: name the reference page you followed, and list anything you promoted to a shared
  component or token so it is visible as a site-wide change rather than a page-local one.
