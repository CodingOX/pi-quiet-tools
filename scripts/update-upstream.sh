#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# hashline stays on npm. display-intent is the vendor/pi-extensions submodule.
NPM_PACKAGES=(
  "pi-hashline-edit-pro"
)

usage() {
  cat <<'EOF'
Update upstream sources this workspace depends on.

  display-intent  vendor/pi-extensions submodule (git fetch / rebase)
  hashline        npm package pi-hashline-edit-pro

Usage:
  scripts/update-upstream.sh           # fetch display-intent + bump hashline in ^ range
  scripts/update-upstream.sh --latest  # fetch display-intent + pin hashline to npm latest
  scripts/update-upstream.sh --check   # show status, do not write

After a successful update, reload Pi (/reload) or restart it.
EOF
}

installed_version() {
  local name="$1"
  node -e "
    const fs = require('node:fs');
    const path = require('node:path');
    const pkgPath = path.join('node_modules', process.argv[1], 'package.json');
    if (!fs.existsSync(pkgPath)) {
      process.stdout.write('missing');
      process.exit(0);
    }
    process.stdout.write(JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version);
  " "$name"
}

range_in_package_json() {
  local name="$1"
  node -e "
    const pkg = require('./packages/core/package.json');
    process.stdout.write(pkg.dependencies[process.argv[1]] ?? '');
  " "$name"
}

latest_version() {
  local name="$1"
  npm view "$name" version --silent
}

submodule_head() {
  if [[ -e vendor/pi-extensions/.git ]]; then
    git -C vendor/pi-extensions rev-parse --short HEAD
  else
    echo "missing"
  fi
}

print_status() {
  printf '%-38s %-12s %-12s %-12s\n' "package" "installed" "range" "npm-latest"
  printf '%-38s %-12s %-12s %-12s\n' "-------" "---------" "-----" "----------"
  for name in "${NPM_PACKAGES[@]}"; do
    printf '%-38s %-12s %-12s %-12s\n' \
      "$name" \
      "$(installed_version "$name")" \
      "$(range_in_package_json "$name")" \
      "$(latest_version "$name")"
  done
  printf '%-38s %-12s %-24s\n' \
    "@zhcsyncer/pi-tool-display-intent" \
    "$(installed_version "@zhcsyncer/pi-tool-display-intent")" \
    "submodule $(submodule_head)"
}

MODE="range"
case "${1:-}" in
  "" ) MODE="range" ;;
  --latest ) MODE="latest" ;;
  --check ) MODE="check" ;;
  -h|--help ) usage; exit 0 ;;
  * )
    echo "Unknown argument: $1" >&2
    usage
    exit 1
    ;;
esac

echo "Upstream status before:"
print_status
echo

if [[ "$MODE" == "check" ]]; then
  if [[ -e vendor/pi-extensions/.git ]]; then
    bash "$ROOT/scripts/bootstrap-submodule-remotes.sh"
  fi
  exit 0
fi

bash "$ROOT/scripts/init-submodule.sh"
bash "$ROOT/scripts/bootstrap-submodule-remotes.sh"

if [[ "$MODE" == "latest" ]]; then
  npm install -w @pi-quiet-tools/core "pi-hashline-edit-pro@latest"
else
  npm update -w @pi-quiet-tools/core pi-hashline-edit-pro
fi

echo
echo "Upstream status after:"
print_status
echo
echo "Done. Reload Pi with /reload (or restart) to pick up the new versions."
echo "To take display-intent commits from zhcsyncer: npm run sync:display-intent"
