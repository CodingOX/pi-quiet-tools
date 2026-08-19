#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUB="$ROOT/vendor/pi-extensions"
UPSTREAM_URL="https://github.com/zhcsyncer/pi-extensions.git"

if [[ ! -e "$SUB/.git" ]]; then
  echo "Submodule missing. Run: npm run submodule:init" >&2
  exit 1
fi

cd "$SUB"
if ! git remote get-url upstream >/dev/null 2>&1; then
  git remote add upstream "$UPSTREAM_URL"
fi
git fetch upstream --tags
git fetch origin --tags
printf 'origin:   %s\n' "$(git remote get-url origin)"
printf 'upstream: %s\n' "$(git remote get-url upstream)"
printf 'HEAD:     %s\n' "$(git rev-parse --short HEAD)"
echo
echo "Commits on upstream/main not in HEAD:"
git log --oneline HEAD..upstream/main || true
