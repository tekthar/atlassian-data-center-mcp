#!/usr/bin/env bash
# Prints the CHANGELOG.md section of one version, without its heading, for the GitHub release's notes.
# Usage: scripts/release-notes.sh 0.48.0
# Prints nothing when CHANGELOG.md has no section for that version.
set -euo pipefail
version="${1:?Usage: scripts/release-notes.sh <version>}"
awk -v heading="## [$version]" '
  index($0, heading) == 1 { found = 1; next }
  found && /^## / { exit }
  found { print }
' "$(dirname "$0")/../CHANGELOG.md" | sed -e '/./,$!d'
