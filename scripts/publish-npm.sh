#!/bin/bash
# Publishes each server package whose current version is not yet on npm.
# Auth comes from npm trusted publishing (GitHub OIDC), so no NPM_TOKEN is used.
# Usage: scripts/publish-npm.sh [expected-version]
#   expected-version (e.g. from a v1.2.3 release tag) must match every package.json and server.json.
set -euo pipefail

NPM=(npx -y npm@11.21.1)
packages=("jira" "confluence" "bitbucket")
expected="${1#v}"

read_json() { node -p "require('./$1').$2"; }

for pkg in "${packages[@]}"; do
  dir="packages/$pkg"
  version=$(read_json "$dir/package.json" version)
  server_version=$(read_json "$dir/server.json" version)
  server_pkg_version=$(read_json "$dir/server.json" 'packages[0].version')
  for v in "$server_version" "$server_pkg_version" ${expected:+"$expected"}; do
    if [[ "$v" != "$version" ]]; then
      echo "::error::$dir is at $version but server.json or the release tag says $v (run scripts/sync-versions.js)" >&2
      exit 1
    fi
  done
done

for pkg in "${packages[@]}"; do
  dir="packages/$pkg"
  name=$(read_json "$dir/package.json" name)
  version=$(read_json "$dir/package.json" version)
  if [[ -n "$("${NPM[@]}" view "$name@$version" version 2>/dev/null || true)" ]]; then
    echo "$name@$version is already on npm, skipping."
    continue
  fi
  tag=latest
  [[ "$version" == *-* ]] && tag=next
  echo "Publishing $name@$version with dist-tag $tag..."
  "${NPM[@]}" publish --workspace="$dir" --tag "$tag"
done
