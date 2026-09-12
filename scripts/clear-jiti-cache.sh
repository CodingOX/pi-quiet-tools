#!/usr/bin/env bash
set -euo pipefail

# 清除 jiti 的磁盘编译缓存（升级依赖后的保险动作）。
#
# 背景：Pi 用 jiti 加载 TypeScript 扩展，编译产物会落到磁盘缓存。
# 在 Pi 运行期间原地 npm install 换掉依赖版本后，可能接连出现扩展加载失败，
# 报错索要的是【旧版本】才有的文件：
#
#   Failed to load extension: ENOENT: no such file or directory, open
#   '.../pi-hashline-edit-pro/prompts/undo-last-replace.md'
#   Failed to load extension: Cannot find module
#   '.../node_modules/file-type/index.js'
#
# 这两条分别对应 hashline 2.6.1 → 4.2.5（prompt 改名）与 file-type
# 21.3.4 → 22.1.0（入口 ./index.js 移到 ./source/index.js）。
#
# 实测结论（勿据猜测改写，均经最小化复现验证）：
# - 磁盘上的依赖本身没问题：与 npm 分发的官方 tarball 逐文件一致；
# - 全新进程加载完全正常，即使把 prompt 删掉也不会复现；
# - 清掉 jiti 磁盘缓存也不够：同一进程内【新建】jiti 实例仍然失败；
# - 真正原因是 jiti 的模块解析缓存在【进程级】存活，与磁盘缓存无关。
#   最小复现：同进程先解析 v1（入口 ./index.js），再把磁盘换成 v2
#   （入口 ./source/index.js），用新 jiti 实例解析 v2 → 报的就是上面那种
#   “Cannot find module .../index.js”。
#
# 因此唯一的解法是【重启 Pi】—— /reload 会新建 jiti 实例，但同进程内的
# 解析缓存仍在，所以救不了。本脚本只清理磁盘缓存这一层，成本极低
# （缓存会自动重建），作为升级后的收尾动作有价值，但不是根治手段。

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

removed=0

# 1. 工作区自己的缓存目录
LOCAL_CACHE="$ROOT/node_modules/.cache/jiti"
if [[ -d "$LOCAL_CACHE" ]]; then
  rm -rf "$LOCAL_CACHE"
  echo "cleared  $LOCAL_CACHE"
  removed=$((removed + 1))
fi

# 2. jiti 的临时目录缓存（未找到 node_modules 缓存目录时的默认位置）。
#    这里无法按包名精确区分，整体清除；同机其他项目只是下次多编译一次。
TMP_CACHE="${TMPDIR:-/tmp}/jiti"
if [[ -d "$TMP_CACHE" ]]; then
  rm -rf "$TMP_CACHE"
  echo "cleared  $TMP_CACHE"
  removed=$((removed + 1))
fi

if [[ "$removed" -eq 0 ]]; then
  echo "no jiti cache found (nothing to clear)"
else
  echo "Done. Reload Pi with /reload (or restart) to recompile extensions."
fi
