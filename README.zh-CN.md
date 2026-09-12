# pi-quiet-tools

一个 Pi 扩展包，让终端更安静，但不从模型手里拿走任何东西。

`pi-quiet-tools` 把两个上游层收在一次安装里：Hash 锚点编辑（`pi-hashline-edit-pro`）与意图感知的工具渲染（`@zhcsyncer/pi-tool-display-intent`）。在它们之上是一层很薄的 glue，只决定**终端显示什么** —— 紧凑的工具账本、活跃的 Open rows、有用的中途 Markdown，以及最终回答。

[English](./README.md)

## 组合了什么

| 包 | 职责 |
| --- | --- |
| [pi-hashline-edit-pro](https://github.com/YuGiMob/pi-hashline-edit-pro) | 给模型用的 Hash 锚点 `read`、`replace`、`insert`、`undo_last_change`、`anchor_grep` |
| [@zhcsyncer/pi-tool-display-intent](https://github.com/zhcsyncer/pi-extensions/tree/main/packages/pi-tool-display-intent) | 工具 renderer、结果压缩、diff、custom/MCP 工具装饰，以及 Tools 账本 |
| `packages/core` | 加载顺序、重复加载守卫、静默 renderer、旁白处理、子代理通知紧凑化 |

`vendor/pi-extensions` 是一个 git submodule，指向 display-intent 仓库的一个 fork。display-intent 的功能开发属于那个 submodule；父包始终保持轻量 glue。

本仓库必须作为**单个**扩展安装。不要再单独安装 `pi-hashline-edit-pro` 或 `@zhcsyncer/pi-tool-display-intent` —— Pi 会把同一批工具注册两次。

## 安静契约

**只改渲染；不改执行，也不改模型上下文。** 模型依然拿到完整的 Hash 锚点、完整的 `replace` 语义、完整的工具结果和整个会话。安静渲染改变的只是终端画出来的东西。

"安静"在这里由三条主张定义，每条都有已接受（accepted）的决策记录：

**1. 要信号，不要转录。** 工具活动收进一个 *Tools 账本* —— 一个标题行、最多三行 Open rows，加一条 receipt。文件内容、diff、hashline 输出都不会漏进转录视图。真要看完整调用列表时，`Ctrl+O` 永远在。

**2. 开放账本必须看起来还活着。** 正在运行的阶段会显示活跃标记和逐秒走动的 elapsed 时间，并保留最多三行 *Open rows*：pending 和 running 的调用优先占位，剩下的槽位给最近完成的调用。静默工具（`read`、`replace`、`insert`、`undo_last_change`、`anchor_grep`）共享这些行，而不是独占一条 live pin，所以长时间的 `bash` 不会被一个 `read` 挡住。

**3. 旁白要留下。** 中途的 assistant Markdown 是真实内容，所以它保持可见，并结束当前工具阶段。thinking 占位符和结构化控制噪声会从终端旁白中移除。

决策记录与共享术语：

- [`docs/adr/0001-open-ledger-liveness.md`](./docs/adr/0001-open-ledger-liveness.md) —— 开放账本为什么要走时钟，以及这部分渲染归谁
- [`docs/adr/0002-silent-tools-share-open-rows.md`](./docs/adr/0002-silent-tools-share-open-rows.md) —— glue 为什么不再自己数那个三行窗口
- [`CONTEXT.md`](./CONTEXT.md) —— 术语表：Tools 账本、开放账本、已结算账本、Open rows、静默工具、open elapsed、账本 receipt
- [`docs/upstream-sync.md`](./docs/upstream-sync.md) —— 两个上游依赖的评估结论，以及同步会打断什么

## 终端行为

在默认的 `pi-quiet-tools` seed 配置下：

```text
I'll inspect the current glue layer first.

◐ Tools (4 calls · 2 turns) · 7s · read ×3 · bash ×1
  ◐ Read(packages/core/index.ts)
  ✓ Read(packages/core/src/config-seed.ts)
  ✓ Read(packages/core/src/aggregate-silent-tools.ts)

✓ Tools (9 calls · 3 turns) · read ×9
  took 12s · tok ↑18.2k ↓1.4k · at 14:32

The read path is already silent. Next I'll tighten the aggregate wrap.

✓ Tools (3 calls · 1 turn) · bash ×3

[Assistant answer]
```

主角是账本标题行（`✓` 已结算、`◐` 仍在跑、`!` 有失败，后面跟调用数／turn 数以及按工具拆分的计数）。运行中的账本会把 elapsed 时间紧跟在计数之后；开放账本最多显示三行 Open rows；已结算账本则把它们换成 receipt（`took … · tok ↑… ↓… · at …`）。后面某一轮又用到工具，会得到它自己的账本，位置在那轮 Markdown 之后。

默认行为约定：

- `per-turn` Tools 账本：连续只有工具调用的 assistant 消息留在同一个账本里；出现可见的 assistant Markdown 或一次中途 steer，就开启下一个工具阶段。
- 本 bundle 默认关闭 intent 字段。上游扩展仍可渲染确定性的工具元数据。
- 结果模式为 `summary`；`read`、`replace`、`insert`、`undo_last_change`、`anchor_grep` 保持静默，但计数仍留在账本里。`anchor_grep` 是取代内置 `grep` 的锚点搜索：它的命中行自带锚点，可以直接编辑，不必再单独 `read` 一遍。
- `Agent` 保留原生 renderer。`edit` 也由 seed 的 passthrough 配置留在安静账本之外。
- 中途的 assistant Markdown 保持可见；thinking 占位符与结构化控制噪声从终端旁白中移除。
- 当本扩展先于 `@tintinweb/pi-subagents` 加载时，子代理完成通知只占一行紧凑状态行；不显示 transcript 路径和结果预览元数据。

`Ctrl+O` 展开分组后的原始工具时间线。它不会让静默工具开始倾倒文件内容或 diff。

## 使用方法

没有开关要拨：Pi 加载本扩展后它就生效了。这一节讲三件事 —— 怎么确认它装对了、怎么读它画出来的东西、怎么改它的行为。

### 60 秒自检

执行 `/reload`（或重启 Pi），然后确认三件事：

1. **Pi 只看到一个包。**

   ```bash
   pi list
   ```

   如果 `pi-hashline-edit-pro` 或 `@zhcsyncer/pi-tool-display-intent` 也作为独立条目出现，先把它们移除。

2. **工具带 Hash 锚点。** 让模型读一个文件。每行应该长这样：`anchor│content`：

   ```text
   Dafo│# pi-quiet-tools
   ```

   没有锚点，说明 hashline 层没加载。

3. **工具被聚合了。** 让模型做一件会在一轮里触发多次工具调用的事。你应该只看到**一个** Tools 账本带 `×N` 拆分 —— 而不是每次调用一个转录块，也绝不该出现 `Read(path)` 的内容倾倒。

任何时候都可以用 `/tool-display-intent` 查看当前生效的显示设置。

### 怎么读账本

| 你看到的 | 含义 |
| --- | --- |
| `✓ Tools (…)` | 该工具阶段已结算。只有标题行和 receipt。 |
| `◐ Tools (…) · 7s` | 还在跑。elapsed 时间会走动，这样单个长工具也不会看起来卡死。 |
| `! Tools (…) · N failed` | 该阶段里有失败；展开时间线能看到是哪一次调用。 |
| `↳ 1 steer` | 该工具阶段里落了至少一次 steer。 |
| 以 `◐` / `✓` 开头的行 | Open rows。running 与 pending 的调用在前，然后是最近完成的调用（含静默工具）。 |
| `took … · tok ↑… ↓… · at …` | 已结算账本下方的 receipt。 |

有两样东西刻意**不会**出现在账本里：进行中的 `›` 旁白 pin —— 因为同样的文字已经作为普通 Markdown 渲染在上方了；以及静默工具的逐次 `Read(path)` 行。

`Ctrl+O` 展开分组后的原始时间线 —— 每次调用一行，带目标与状态 —— 再按一次折叠回去。账本太粗的时候用它；日常不需要。

### 改行为

`/tool-display-intent` 打开显示设置面板：布局、结果模式、diff 渲染、工具归属，以及哪些工具留在账本里。设置持久化到：

```text
~/.pi/agent/extension-data/pi-tool-display-intent/config.json
```

想让扩展继续渲染，但把 `read` / `replace` 放到账本外面，就把这两个名字从 `tools.passthrough` 里去掉。想再加一个必须留在账本外的高信号工具，把名字加进去即可。

改动工具归属、布局、intent schema 或 call-frame 装饰需要 `/reload`。删除配置文件并 reload Pi 可以恢复 bundle 默认值。

如果你设置了 `PI_CODING_AGENT_DIR`，上面所有路径都基于该目录解析，而不是 `~/.pi/agent`。

### 排障

| 现象 | 原因与处理 |
| --- | --- |
| 启动时报 `Tool "read" conflicts with …` | 加载了两套 hashline。把独立的 `pi-hashline-edit-pro` 条目从 `packages` 里移除。 |
| 账本旁边出现逐次 `Read(path)` 行 | 有 hashline 工具名出现在 `tools.passthrough` 里。把它去掉；启动迁移正常情况下会自动处理。 |
| 子代理完成通知还是很啰嗦 | `@tintinweb/pi-subagents` 先于本扩展加载。Pi 对同一 custom 消息类型只取最先注册的 renderer，所以本扩展必须在前面。 |
| 看起来完全没变化 | 执行 `/reload`。若仍无变化，确认配置文件存在，且只安装了一个包。 |

## 安装

### 从 GitHub 安装

```bash
pi install git:github.com/CodingOX/pi-quiet-tools
```

`https://github.com/CodingOX/pi-quiet-tools` 这种写法效果相同。本仓库把 `scripts/init-submodule.sh` 挂在 `preinstall` 上，所以 `vendor/pi-extensions` submodule 会在安装过程中被 clone 并检出到锁定提交 —— 你不需要加 `--recurse-submodules`。

`github:CodingOX/pi-quiet-tools` **不是** Pi 的包来源写法；Pi 只认 `git:` 前缀或协议 URL。

> [!WARNING]
> 不要执行 `pi install npm:pi-quiet-tools`。本仓库尚未发布到 npm，而这个包名**已被另一个完全无关的包占用**。执行会装上一个和本项目毫无关系的工具。

### 从本地 checkout 安装

```bash
git clone git@github.com:CodingOX/pi-quiet-tools.git
cd pi-quiet-tools
npm run submodule:init
npm install
pi install /absolute/path/to/pi-quiet-tools
```

安装后重启 Pi，或执行 `/reload`。

### 移除之前独立安装的扩展

如果上游扩展曾被单独安装过，请从 `~/.pi/agent/settings.json` 或项目的 `.pi/settings.json` 里移除它们，`packages` 只保留 `pi-quiet-tools`：

```bash
pi remove npm:pi-hashline-edit-pro
pi remove npm:@zhcsyncer/pi-tool-display-intent
```

### 更新

`pi update` 会重新拉取本仓库并重跑安装，从而把 submodule 重新初始化到新版本锁定的那个提交。submodule 自己的分支不会被跟踪 —— 你拿到的就是本仓库提交里写死的那个 SHA。

本地 checkout 则拉取后重装：

```bash
git pull
npm install
```

## 配置

首次加载时，若配置文件不存在，glue 会写入：

```text
~/.pi/agent/extension-data/pi-tool-display-intent/config.json
```

seed 的 bundle 配置刻意不同于 display-intent 独立安装时的默认值：

```json
{
  "$schema": "https://raw.githubusercontent.com/zhcsyncer/pi-extensions/main/packages/pi-tool-display-intent/config/config.schema.json",
  "version": 2,
  "intent": { "enabled": false },
  "toolCalls": { "layout": "per-turn", "style": "compact" },
  "results": { "mode": "summary" },
  "diff": { "collapsedMode": "summary" },
  "tools": { "passthrough": ["Agent", "edit"] },
  "advanced": { "truncationHints": false }
}
```

已存在的配置不会被覆盖。启动迁移会把每个 hashline 工具名（含已被淘汰的 `undo_last_replace`）从历史 `tools.passthrough` 里移除，并补回 `Agent`，让 hashline 调用可以保持聚合与静默。

## 加载顺序与保障

`packages/core/index.ts` 按以下顺序装配：

1. 在导入上游模块之前 seed 或迁移 display-intent 配置。
2. 安装 `registerTool` hook 与子代理通知紧凑 renderer。
3. 加载 display-intent 一次，除非当前 Pi 运行时里它已经活跃。
4. 加载 hashline 一次，除非 `read` 已由某个活跃的 hashline 扩展持有。
5. 给 hashline 工具套上极简 renderer，并安装聚合静默工具／旁白补丁。
6. 在 `session_start` 与 `before_agent_start` 刷新聚合补丁。

每个 display-intent 运行时都会在 `session_shutdown` 释放自己的 prototype 归属、工具装饰、聚合投影和全局状态。这对 `/reload`、`/new`、`/resume`、`/fork` 以及进程内子代理生命周期都很重要：一个运行时不能保留或覆盖另一个运行时的显示状态。

## 上游更新

先读 [`docs/upstream-sync.md`](./docs/upstream-sync.md)。两个依赖都是刻意锁定的，而同步可能以终端不会报错的方式静默失效。
display-intent 维护在 `vendor/pi-extensions` submodule 里：

```bash
npm run submodule:init
npm run sync:display-intent
```

把更新后的 submodule SHA 提交到本仓库，并在合适时机从 submodule 推送 fork 分支：

```bash
git -C vendor/pi-extensions push origin HEAD
```

hashline 仍然是 npm 依赖：

```bash
npm run update:upstream:check
npm run update:upstream
```

上游更新之后：

```bash
npm run typecheck
npm test
```

然后 reload Pi。

## 环境要求

- Pi coding agent >= 0.84（`@earendil-works/pi-coding-agent`）；开发与验证基于 0.85.x。这个下限来自 `pi-hashline-edit-pro` 4.x。
- Node.js >= 22.19，这是 Pi 与 `pi-hashline-edit-pro` 共同的要求
- 一个交互式的终端会话。安静账本是终端渲染器。

## License

MIT
