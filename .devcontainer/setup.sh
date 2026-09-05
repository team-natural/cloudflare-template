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
