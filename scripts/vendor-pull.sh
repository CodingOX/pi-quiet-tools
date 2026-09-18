#!/usr/bin/env bash
#
# vendor-pull.sh —— 同步 vendor/ 下的第三方代码。
#
# ⚠️ 两个镜像的同步策略**故意不同**，因为它们的性质不同：
#
#   vendor/hashline        真正的只读镜像。本地零修改，上游同步 = 目录级覆盖，冲突面为零。
#   vendor/display-intent  **fork**，不是镜像。含本地独占工作（per-turn layout 等 14 个文件被改）。
#                          直接覆盖会静默销毁这些工作，所以本脚本只报告差异、
#                          不落地；真正的 rebase 是人工任务，见 docs/upstream-sync.md。
#
# 用法：
#   npm run vendor:pull                          按现状同步（hashline 保持钉住的版本）
#   npm run vendor:pull -- --check               全部只报告，不落地
#   npm run vendor:pull -- --to 4.3.4 --force   显式升级 hashline 到某个 tag
#
# ⚠️ hashline 默认**不升级**：它钉在本仓库认定的版本上，默认只校验「上游该 tag 与本地
#    是否一致」。升级必须显式 --to + --force，因为工具名/schema 漂移不会报错，只会静默失效。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHECK_ONLY=0
FORCE=0
TO_VERSION=""
# 用 while + shift 而不是 for：for 在进入循环时就把 "$@" 展开成固定列表，
# 循环体内 shift 无效，`--to 4.3.4` 的版本号会掉进 *) 变成「未知参数」。
while [[ $# -gt 0 ]]; do
  case "$1" in
  --check) CHECK_ONLY=1 ;;
  --force) FORCE=1 ;;
  --to)
    TO_VERSION="${2:-}"
    [[ -n "$TO_VERSION" ]] || { echo "--to 需要一个版本号，如 --to 4.3.4" >&2; exit 1; }
    shift
    ;;
  -h | --help)
    sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *)
    echo "Unknown argument: $1" >&2
    exit 1
    ;;
  esac
  shift
done

command -v rsync >/dev/null 2>&1 || {
  echo "vendor-pull.sh 需要 rsync（用于排除 .git / node_modules 的目录覆盖）。" >&2
  exit 1
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

log() { printf '%s\n' "$*"; }

# 从 registries 取某个精确版本的包 tarball 并解包，返回解包目录。
#
# 为什么不用 git clone：上游 hashline **只有 master 分支、没有任何 tag**
# （`git ls-remote` 实测 refs/heads/master 之外全是 PR head）。clone 只能拿到
# default branch，也就是「最新」，而这个仓库要的是「钉住的那一版」。
# npm 上每个版本都是不可变的 tarball，正好是精确取版的正确来源 ——
# 而且我们现在 vendor 的就是它（从 node_modules 复制而来），口径一致。
fetch_npm_tarball() {
  local name="$1" pkg="$2" version="$3"
  local dest="$WORK/$name"
  mkdir -p "$dest"

  log "  取 $pkg@$version …" >&2
  if ! (cd "$dest" && npm pack "$pkg@$version" --silent --pack-destination "$dest" 2>/dev/null | tail -1 > .tarname); then
    return 1
  fi
  local tar
  tar="$(cat "$dest/.tarname")"
  [[ -f "$dest/$tar" ]] || return 1
  tar -xzf "$dest/$tar" -C "$dest" || return 1
  rm -f "$dest/$tar" "$dest/.tarname"
  printf '%s' "$dest/package"
}

# 浅克隆上游仓库（仅用于 display-intent —— 它是 fork，需要 git 历史之外的分支语义）。
clone_upstream() {
  local name="$1" repo="$2" ref="$3"
  local dest="$WORK/$name"
  if ! git clone --quiet --depth 1 ${ref:+--branch "$ref"} "$repo" "$dest" 2>/dev/null; then
    log "  ⚠️  克隆失败（网络或仓库不可达${ref:+，ref=$ref}）：$repo"
    return 1
  fi
  printf '%s' "$dest"
}

read_version() {
  python3 -c "import json;print(json.load(open('$1/package.json'))['version'])" 2>/dev/null || echo unknown
}

# ─────────────────────────────────────────────────────────────
# hashline：真正的只读镜像 → 可以安全地目录级覆盖
# ─────────────────────────────────────────────────────────────
sync_hashline() {
  log "── hashline（只读镜像，可覆盖）─────────────"
  local dest="$ROOT/vendor/hashline"

  # 目标版本 = 本地镜像当前的版本，即本仓库钉住的那个版本。
  # 想升级必须显式改 vendor/hashline/package.json 的 version（或传 --to <tag>），
  # 然后重跑 —— 这样「升级」永远是一次有意识的动作，而不是同步的副作用。
  local target_ver="${TO_VERSION:-$(read_version "$dest")}"
  local clone
  clone="$(fetch_npm_tarball hashline pi-hashline-edit-pro "$target_ver")" || {
    log "  ⚠️  取不到 pi-hashline-edit-pro@${target_ver}（registry 上不存在该版本？）"
    return 1
  }

  local up_ver local_ver
  up_ver="$(read_version "$clone")"
  local_ver="$(read_version "$dest")"
  log "  目标版本：$up_ver  本地版本：$local_ver"

  if [[ "$up_ver" != "$local_ver" ]]; then
    log "  ⚠️  这是一次版本升级（${local_ver} → ${up_ver}），不是等价镜像刷新。"
    log "     覆盖后必须重新核对 src/hashline-tools.ts 的工具名分类与 schema 锁定，"
    log "     并确认 src/hashline-edit-schema.ts 的假设仍然成立。"
    log "     升级前建议先记下当前可用的行为基线（见 .pi/skills/quiet-tools-verify）。"
    if [[ "$CHECK_ONLY" != "1" && "${FORCE:-0}" != "1" ]]; then
      log "  ⛔ 拒绝在无确认的情况下升级。确认影响面后重跑：npm run vendor:pull -- --to ${up_ver} --force"
      return 1
    fi
  fi

  local diff_count
  diff_count="$(diff -rq --exclude=node_modules --exclude=.git "$clone" "$dest" 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "$diff_count" == "0" ]]; then
    log "  ✅ 已是最新"
    return 0
  fi

  log "  待覆盖差异条目：$diff_count"
  if [[ "$CHECK_ONLY" == "1" ]]; then
    diff -rq --exclude=node_modules --exclude=.git "$clone" "$dest" 2>/dev/null | sed 's/^/    /' | head -15
    return 0
  fi

  # 先清空再复制，保证上游已删除的文件不会残留；排除 .git 与 node_modules。
  find "$dest" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  rsync -a --exclude='.git' --exclude='node_modules' "$clone"/ "$dest"/
  log "  ✅ 已覆盖 vendor/hashline"
  log "  ⚠️  紧接着必须核对：src/hashline-tools.ts 的分类是否仍覆盖上游全部工具名"
  log "      （npm test 的 contract 测试会卡住漂移）"
  return 0
}

# ─────────────────────────────────────────────────────────────
# display-intent：fork，含本地独占工作 → 只报告，绝不自动覆盖
# ─────────────────────────────────────────────────────────────
report_display_intent() {
  log "── display-intent（fork，含本地工作 → 仅报告）──"
  local dest="$ROOT/vendor/display-intent"

  local clone
  if ! clone="$(clone_upstream display-intent https://github.com/zhcsyncer/pi-extensions.git "")"; then
    log "  跳过：无法取到上游用于对比"
    return 0
  fi
  local up="$clone/packages/pi-tool-display-intent"
  log "  上游版本：$(read_version "$up")  本地版本：$(read_version "$dest")"

  # 本地独占：fork 自己的提交（上游没有的文件）
  local fork_only up_only modified
  fork_only="$(diff -rq "$up/src" "$dest/src" 2>/dev/null | grep -c "^Only in $dest" || true)"
  up_only="$(diff -rq "$up/src" "$dest/src" 2>/dev/null | grep -c "^Only in $clone" || true)"
  modified="$(diff -rq "$up/src" "$dest/src" 2>/dev/null | grep -c "^Files" || true)"

  log "  本地改动：$modified 个文件被 fork 修改，$fork_only 个 fork 独有文件"
  log "  上游新增：$up_only 个文件尚未合并"

  if [[ "$modified" == "0" && "$fork_only" == "0" && "$up_only" == "0" ]]; then
    log "  ✅ 与上游一致"
    return 0
  fi

  log ""
  log "  ⛔ 本脚本【不会】覆盖这里 —— 那会静默销毁 fork 的本地工作。"
  log "     上游合并是一次人工 rebase，成本与雷区记录在 docs/upstream-sync.md："
  log "       · 上游 main 与 fork 的第一个冲突提交就有 21 个冲突块"
  log "       · 上游把账本标题从 Tools 改成了 Run"
  log "       · 上游移除了 hasPrecedingAggregateToolsLedger"
  log "     这三处会让主包静默失效，必须逐个核对。"
  log ""
  log "     如果只想看上游新增了什么，可以对比："
  log "       diff -rq '$up/src' '$dest/src' | head -40"
  return 0
}

log "vendor 同步（$( [[ "$CHECK_ONLY" == "1" ]] && echo '仅检查' || echo '按策略执行' )）"
log ""

HASHLINE_OK=0
sync_hashline && HASHLINE_OK=1
log ""
report_display_intent || true

log ""
if [[ "$HASHLINE_OK" != "1" ]]; then
  log "⚠️  hashline 未同步（见上面的原因）。其余部分未受影响。"
  exit 1
fi
log "完成。收尾：npm install && npm run typecheck && npm test"
