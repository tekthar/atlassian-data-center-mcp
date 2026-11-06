#!/bin/bash

set -euo pipefail

publish_with_retry() {
  local attempt output status
  local max_attempts=6
  local retry_delay=30

  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    if output=$(../../mcp-publisher publish 2>&1); then
      printf '%s\n' "$output"
      return 0
    else
      status=$?
    fi
    printf '%s\n' "$output" >&2

    # Retry only npm version visibility failures, not other validation errors.
    if [[ "$output" != *"NPM package '"*"exists, but version '"*"was not found (status: 404)"* ]]; then
      return "$status"
    fi
    if ((attempt == max_attempts)); then
      echo "npm version still unavailable after $max_attempts publish attempts." >&2
      return "$status"
    fi

    echo "Waiting ${retry_delay}s for npm propagation before publish attempt $((attempt + 1))/$max_attempts..." >&2
    sleep "$retry_delay"
  done
}

# The MCP Registry checks that the npm version exists. npm can take several minutes to serve a
# version published moments ago, so wait for it instead of spending the publish retries.
wait_for_npm() {
  local name version attempt
  local max_attempts=40
  name=$(node -p "require('./$1/package.json').name")
  version=$(node -p "require('./$1/package.json').version")
  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    if curl -fsS -o /dev/null "https://registry.npmjs.org/$name/$version"; then
      echo "$name@$version is available on npm."
      return 0
    fi
    echo "Waiting for $name@$version on npm ($attempt/$max_attempts)..."
    sleep 30
  done
  echo "$name@$version is still not on npm after $((max_attempts / 2)) minutes." >&2
  return 1
}

echo "Publishing packages to MCP Registry..."

# Download MCP Publisher if not exists
if [ ! -f "./mcp-publisher" ]; then
  echo "Downloading MCP Publisher..."
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  ARCH=$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')
  DOWNLOAD_URL="https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_${OS}_${ARCH}.tar.gz"

  echo "Downloading from: $DOWNLOAD_URL"
  curl -fsSL "$DOWNLOAD_URL" | tar xz mcp-publisher
fi

# Login to MCP Registry using GitHub OIDC
echo "Logging into MCP Registry..."
./mcp-publisher login github-oidc

# Publish each package
packages=("jira" "confluence" "bitbucket")

for pkg in "${packages[@]}"; do
  wait_for_npm "packages/$pkg"
  echo "Publishing $pkg to MCP Registry..."
  (
    cd "packages/$pkg"
    publish_with_retry
  )
  echo "$pkg published successfully!"
done

echo "All packages published to MCP Registry successfully!"
