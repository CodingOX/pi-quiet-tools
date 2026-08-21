#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUB="$ROOT/vendor/pi-extensions"
GENERATED="$SUB/packages/pi-tool-display-intent/node_modules"

# npm 会在生命周期脚本前为 file: 依赖创建这个占位 node_modules。
# 只有目录结构完全符合该占位形态时才清理，避免覆盖用户自己的未初始化内容。
clear_npm_placeholder() {
  [[ -d "$SUB" ]] || return 0
  [[ ! -e "$SUB/.git" ]] || return 0
  [[ -d "$GENERATED" ]] || return 0
  # 任一祖先是符号链接都会令 rm -rf 脱离仓库边界，因此宁可拒绝安装。
  if [[ -L "$SUB" || -L "$SUB/packages" || -L "$SUB/packages/pi-tool-display-intent" || -L "$GENERATED" ]]; then
    echo "Cannot initialize $SUB: npm placeholder paths must not be symbolic links" >&2
    exit 1
  fi

  local path
  while IFS= read -r path; do
    case "$path" in
    "$SUB/packages" | "$SUB/packages/pi-tool-display-intent" | "$GENERATED" | "$GENERATED"/*)
      ;;
    *)
      echo "Cannot initialize $SUB: unexpected content at $path" >&2
      echo "Inspect the directory and remove or relocate it, then retry." >&2
      exit 1
      ;;
    esac
  done < <(find "$SUB" -mindepth 1 -print)

  rm -rf "$GENERATED"
  rmdir "$SUB/packages/pi-tool-display-intent" 2>/dev/null || true
  rmdir "$SUB/packages" 2>/dev/null || true
  rmdir "$SUB" 2>/dev/null || true
}

clear_npm_placeholder
git -C "$ROOT" submodule sync --recursive
git -C "$ROOT" submodule update --init --recursive
