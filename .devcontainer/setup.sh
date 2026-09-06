#!/bin/bash
set -e
cd "$(dirname "$0")/.."

# claude-config volume is root-owned at first; fix it or login won't persist
sudo chown -R vscode:vscode /home/vscode/.claude

# Enable the pnpm shim bundled with Node via Corepack (this is a pnpm workspace —
# see pnpm-workspace.yaml / package.json "packageManager")
corepack enable

# Install project dependencies (all workspace packages under apps/* and packages/*)
pnpm install

# Install Context Mode (context compression MCP) into the container
npm install -g context-mode

# Global, not a devDependency: .mcp.json invokes it with `npx --no-install`, and no project's
# package.json should carry it just to satisfy an MCP client
npm install -g @playwright/mcp

# Chromium for `playwright test` and for the MCP server. They share ~/.cache/ms-playwright but
# pin their own Playwright versions, so both are run; the second is a no-op while they match
pnpm --filter admin exec playwright install --with-deps chromium
npx @playwright/mcp install-browser chromium
