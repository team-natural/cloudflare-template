# Development Environment

A generic Dev Container-based project template. Node.js and Claude Code come
pre-configured, so you can use this as the starting point for a new project.

## Prerequisites

- Docker (e.g. Docker Desktop)
- VS Code + the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
  or GitHub Codespaces

## Getting started from this template

When creating a new project from this template, first update the following:

1. **Update the values in `.devcontainer/.env`**
   - `COMPOSE_PROJECT_NAME`: change to a name unique to the project (docker compose uses it to
     prefix container, volume, and network names, keeping each project's containers and its
     Claude Code config volume isolated from other projects)
   - `APP_PORT_DEV`: change so it doesn't collide with other projects' ports (used for both the
     container-side and host-side port)
2. Update `name` in `.devcontainer/devcontainer.json` to match the project name, if needed
   - If `APP_PORT_DEV` was changed from the default `5173`, also update the port key under
     `portsAttributes` in `.devcontainer/devcontainer.json` to match
3. Add any required OS packages to `.devcontainer/Dockerfile`
4. Add real dependencies and scripts (build / lint / test, etc.) to `package.json`
   - Currently this is just a skeleton with no dependencies or scripts

## Starting the container

### VS Code

1. Open the repository in VS Code
2. Run `Dev Containers: Reopen in Container` from the command palette
3. On first startup, `.devcontainer/setup.sh` (`npm install`) runs automatically

### CLI

```bash
docker compose -f .devcontainer/docker-compose.yml up -d
```

Once started, the container listens on `APP_PORT_DEV` (default `5173`) and that same port is
published on the host, bound to `127.0.0.1` (handled by docker compose; change `APP_PORT_DEV` per
project to avoid collisions).

## Using Claude Code

This template's Dev Container includes the `claude-code` Dev Container Feature, so the `claude`
command is available right away inside the container. Claude Code's auth/settings are stored in a
named Docker volume (`claude-config`), not shared with the host, so each project container has its
own independent login. Run this in a terminal inside the container and log in the first time:

```bash
claude
```
