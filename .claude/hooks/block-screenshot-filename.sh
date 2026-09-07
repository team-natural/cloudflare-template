#!/bin/bash
# PreToolUse hook (mcp__playwright__browser_take_screenshot): reject an explicit `filename`.
# .mcp.json starts the playwright MCP server with --output-dir .playwright-mcp, but that flag
# only applies when no filename is given — a named screenshot lands in the repo root instead.
set -u

input=$(cat)
filename=$(printf '%s' "$input" | jq -r '.tool_input.filename // empty')

[ -n "$filename" ] || exit 0

echo "Drop the \`filename\` argument on browser_take_screenshot: --output-dir .playwright-mcp (.mcp.json) only applies with no filename, so a named screenshot writes to the repo root instead. Call it with no filename — it auto-names into .playwright-mcp/." >&2
exit 2
