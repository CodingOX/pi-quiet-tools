#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUB="$ROOT/vendor/pi-extensions"

bash "$ROOT/scripts/bootstrap-submodule-remotes.sh"

cd "$SUB"
branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" == "HEAD" ]]; then
  echo "Submodule is detached. Check out a branch before rebasing." >&2
  exit 1
fi

git rebase upstream/main
echo
echo "Rebased $branch onto upstream/main."
echo "Push the fork: git -C vendor/pi-extensions push origin HEAD"
echo "Then commit the new submodule SHA in this repo."
