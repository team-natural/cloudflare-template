#!/bin/bash
set -e
cd "$(dirname "$0")/.."

# claude-config volume is root-owned at first; fix it or login won't persist
sudo chown -R vscode:vscode /home/vscode/.claude

# The Feature installs as root, so the CLI can't self-update; hand it to vscode and pull
# latest here (new models gate on CLI version). Non-fatal: offline rebuilds must still finish.
NPM_ROOT="$(npm root -g)"
if [ -d "$NPM_ROOT/@anthropic-ai" ]; then
  sudo chown -R "$(id -un):$(stat -c %G "$NPM_ROOT")" "$NPM_ROOT/@anthropic-ai"
fi
npm install -g @anthropic-ai/claude-code@latest || echo "WARN: claude-code update failed; keeping the image's version"

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
