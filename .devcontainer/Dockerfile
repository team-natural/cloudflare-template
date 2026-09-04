FROM mcr.microsoft.com/devcontainers/base:bookworm

# Add project-specific packages here as needed.
# The base image already includes: git, curl, wget, and other common tools.

# Install uv (required by Semble MCP) to a shared location
# accessible by both root (build time) and vscode (runtime)
ENV UV_INSTALL_DIR="/usr/local/bin"
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
