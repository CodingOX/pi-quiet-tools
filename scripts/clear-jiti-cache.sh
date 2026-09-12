#!/usr/bin/env bash
set -euo pipefail

# 清除 jiti 的编译缓存（升级依赖后的保险动作）。
#
# 背景：Pi 用 jiti 加载 TypeScript 扩展，编译产物会落到磁盘缓存。
# 在 Pi 运行期间原地 npm install 换掉依赖版本时，可能出现扩展加载失败：
#
#   Failed to load extension: ENOENT: no such file or directory, open
#   '.../pi-hashline-edit-pro/prompts/undo-last-replace.md'
#
# 即「旧版本的代码去读它那个版本才有的文件」—— hashline 2.6.1 的
# undo-last-replace.md 在 4.2.5 里已改名为 undo-last-change.md。
#
# 实测结论（勿据猜测改写）：
# - 磁盘上的包本身没问题：与 npm 分发的 4.2.5 tarball 逐文件一致；
# - 全新进程加载正常，即使把 prompt 删掉也不会复现；
# - jiti 的磁盘缓存会按内容失效（同路径改内容能拿到新结果）；
# - 只有「用升级前编译出的旧代码去执行」时才会抛该 ENOENT。
#
# 因此根因是升级前已编译的产物仍在运行中的 Pi 进程里存活，最可靠的处理是
# 重启 Pi。清缓存是成本极低的附加保险（缓存删掉会在下次加载自动重建），
# 也是让 `npm run update:upstream` 之后状态干净的一步。

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
