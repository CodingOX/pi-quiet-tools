#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Upstream packages orchestrated by pi-quiet-tools.
PACKAGES=(
  "pi-hashline-edit-pro"
  "@zhcsyncer/pi-tool-display-intent"
)

usage() {
  cat <<'EOF'
Update the two upstream Pi extensions this glue depends on.

Usage:
  scripts/update-upstream.sh           # bump within package.json ranges (^)
  scripts/update-upstream.sh --latest  # pin package.json to npm latest, then install
  scripts/update-upstream.sh --check   # show installed vs latest, do not write

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
    const pkg = require('./package.json');
    process.stdout.write(pkg.dependencies[process.argv[1]] ?? '');
  " "$name"
}

latest_version() {
  local name="$1"
  npm view "$name" version --silent
}

print_status() {
  printf '%-38s %-12s %-12s %-12s\n' "package" "installed" "range" "npm-latest"
  printf '%-38s %-12s %-12s %-12s\n' "-------" "---------" "-----" "----------"
  for name in "${PACKAGES[@]}"; do
    printf '%-38s %-12s %-12s %-12s\n' \
      "$name" \
      "$(installed_version "$name")" \
      "$(range_in_package_json "$name")" \
      "$(latest_version "$name")"
  done
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
  exit 0
fi

if [[ "$MODE" == "latest" ]]; then
  specs=()
  for name in "${PACKAGES[@]}"; do
    specs+=("${name}@latest")
  done
  npm install "${specs[@]}"
else
  npm update "${PACKAGES[@]}"
fi

echo
echo "Upstream status after:"
print_status
echo
echo "Done. Reload Pi with /reload (or restart) to pick up the new versions."
