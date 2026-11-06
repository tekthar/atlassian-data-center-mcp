#!/bin/bash
# Publishes each server whose package.json version is not yet on npm.
# Auth is npm trusted publishing (GitHub OIDC from release.yml); there is no NPM_TOKEN.
#   scripts/publish-npm.sh --check   validate versions and report whether anything is unpublished
#   scripts/publish-npm.sh           publish the unpublished packages
set -euo pipefail

NPM=(npx -y npm@11.21.1)
packages=("jira" "confluence" "bitbucket")

read_json() { node -p "require('./$1').$2"; }
release_version() { read_json "packages/${packages[0]}/package.json" version; }

# The servers release in lockstep, and server.json must describe the same version for the MCP Registry.
check_versions() {
  local expected dir v
  expected=$(release_version)
  for pkg in "${packages[@]}"; do
    dir="packages/$pkg"
    for v in "$(read_json "$dir/package.json" version)" \
             "$(read_json "$dir/server.json" version)" \
             "$(read_json "$dir/server.json" 'packages[0].version')"; do
      if [[ "$v" != "$expected" ]]; then
        echo "::error::$dir has version $v, expected $expected. Run: node scripts/set-version.js $expected" >&2
        exit 1
      fi
    done
  done
}

is_published() { [[ -n "$("${NPM[@]}" view "$1@$2" version 2>/dev/null || true)" ]]; }

unpublished_packages() {
  local version name
  version=$(release_version)
  for pkg in "${packages[@]}"; do
    name=$(read_json "packages/$pkg/package.json" name)
    is_published "$name" "$version" && echo "$name@$version is already on npm." >&2 || echo "$pkg"
  done
}

check_versions
version=$(release_version)
pending=$(unpublished_packages)

if [[ "${1:-}" == "--check" ]]; then
  echo "version=$version" >> "${GITHUB_OUTPUT:-/dev/stdout}"
  echo "pending=$([[ -n "$pending" ]] && echo true || echo false)" >> "${GITHUB_OUTPUT:-/dev/stdout}"
  exit 0
fi

tag=latest
[[ "$version" == *-* ]] && tag=next
for pkg in $pending; do
  echo "Publishing packages/$pkg $version with dist-tag $tag..."
  "${NPM[@]}" publish --workspace="packages/$pkg" --tag "$tag"
done
