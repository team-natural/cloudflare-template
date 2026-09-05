#!/bin/bash
# PostToolUse hook (Edit|Write): Prettier -> ESLint --fix -> typecheck.
# Exits 2 with the error on stderr so Claude sees it and fixes it.
set -u

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_response.filePath // empty')

[ -n "$file" ] || exit 0
[ -f "$file" ] || exit 0

# Only handle files inside this project.
case "$file" in
  "${CLAUDE_PROJECT_DIR:-/workspace}"/*) ;;
  *) exit 0 ;;
esac

# Only handle files our toolchain knows about (*.md excluded — Prettier ignores Markdown here).
case "$file" in
  *.astro | *.svelte | *.ts | *.tsx | *.js | *.mjs | *.cjs | *.jsx | *.css | *.json | *.jsonc) ;;
  *) exit 0 ;;
esac

# Skip generated/ignored paths.
case "$file" in
  */node_modules/* | */dist/* | */.astro/* | */.wrangler/* | */pnpm-lock.yaml) exit 0 ;;
esac

# 1. Prettier (writes in place; a failure here is a syntax/parse error)
if ! out=$(npx prettier --write --ignore-unknown "$file" 2>&1); then
  {
    echo "Prettier failed on $file:"
    echo "$out"
  } >&2
  exit 2
fi

# 2. ESLint --fix (lintable source files only)
case "$file" in
  *.astro | *.svelte | *.ts | *.tsx | *.js | *.mjs | *.cjs | *.jsx)
    if ! out=$(npx eslint --fix "$file" 2>&1); then
      {
        echo "ESLint errors in $file:"
        echo "$out"
      } >&2
      exit 2
    fi
    ;;
esac

# 3. Typecheck (project-wide, only when a type-relevant file changed).
# Runs the full `typecheck` script (astro check + svelte-check): an edit to a
# .svelte file can break the .astro page importing it, and vice versa.
case "$file" in
  *.astro | *.svelte | *.ts | *.tsx)
    if ! out=$(pnpm run -s typecheck 2>&1); then
      {
        echo "Typecheck failed after editing $file:"
        echo "$out" | tail -40
      } >&2
      exit 2
    fi
    ;;
esac

exit 0
