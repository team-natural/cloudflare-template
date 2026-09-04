#!/bin/bash
set -e
cd "$(dirname "$0")/.."

# claude-config volume is root-owned at first; fix it or login won't persist
sudo chown -R vscode:vscode /home/vscode/.claude

# Install project dependencies
npm install

# Install Context Mode (context compression MCP) into the container
npm install -g context-mode
