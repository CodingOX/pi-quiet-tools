# pi-quiet-tools

一个 Pi 扩展包，让终端更安静，但不从模型手里拿走任何东西。

`pi-quiet-tools` 是一个自包含的 Pi 扩展包：Hash 锚点编辑（`pi-hashline-edit-pro`）、意图感知的工具渲染（`@zhcsyncer/pi-tool-display-intent`）、bash 失控看门狗、紧凑子代理通知，全都随它一起发布。它自己的 glue 层只决定**终端显示什么** —— 紧凑的工具账本、活跃的 Open rows、有用的中途 Markdown，以及最终回答。一次 `pi install` 全部到位。

[English](./README.md)

## 这个包里装了什么

一次 `pi install` 全部到位：glue 层**就是本包自己**，两个上游层也随包一起发布。没有单独的「胶水安装步骤」，没有要手工拷贝的文件，也没有第二个包要加。

| 随包发布 | 职责 |
| --- | --- |
| `index.ts` + `src/` —— **本包自己的 glue** | 加载顺序、重复加载守卫、静默 renderer、旁白处理、截短编辑 UI、配置 seed |
| [pi-hashline-edit-pro](https://github.com/YuGiMob/pi-hashline-edit-pro) —— 内嵌镜像 | 给模型用的 Hash 锚点 `read`、`replace`、`insert`、`undo_last_change`、`anchor_grep` |
| [@zhcsyncer/pi-tool-display-intent](https://github.com/zhcsyncer/pi-extensions/tree/main/packages/pi-tool-display-intent) —— 内嵌 fork | 工具 renderer、结果压缩、diff、custom/MCP 工具装饰，以及 Tools 账本 |
| `@pi-quiet-tools/watchdog` | bash 失控闸门。80 次 bash 后先 nudge，再拦住后续工具逼模型开口。 |
| `@pi-quiet-tools/notify` | 把子代理完成通知压成一行状态。 |

上面五行都从这一次安装里可达。在一个干净 clone 上，`npm install --omit=dev`（就是 Pi 安装时跑的那条命令）之后，Pi 自己的扩展加载器即可注册全部十个工具（`read`、`write`、`bash`、`replace`、`insert`、`anchor_grep`、`undo_last_change` 等）。不需要往别人机器上手工拷任何东西。

最后两行同时也是**真实可独立发布**的包。两者都还没发到 npm，也都不需要单独安装：只有当你想要看门狗或紧凑通知、但**不要**安静账本时才需要它们。与主包同时安装会把它们的事件处理器重复注册一遍。

两个上游层现在是**内嵌在本仓库**里的，不再从 npm 解析：`vendor/hashline` 是 `pi-hashline-edit-pro` 的只读镜像；`vendor/display-intent` 是 `@zhcsyncer/pi-tool-display-intent` 的 fork，含本地独占工作。见 [`vendor/README.md`](./vendor/README.md) 与 [`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md)。

本仓库必须作为**单个**扩展安装。不要再单独安装 `pi-hashline-edit-pro`、`@zhcsyncer/pi-tool-display-intent`、`@pi-quiet-tools/watchdog` 或 `@pi-quiet-tools/notify` —— 前两个会把同一批工具注册两次，后两个会把各自的事件处理器重复注册一遍。

## 安静契约

**只改渲染；不改执行，也不改模型上下文。** 模型依然拿到完整的 Hash 锚点、完整的 `replace` 语义、完整的工具结果和整个会话。安静渲染改变的只是终端画出来的东西。

"安静"在这里由三条主张定义，每条都有已接受（accepted）的决策记录：

**1. 要信号，不要转录。** 工具活动收进一个 *Tools 账本* —— 一个标题行、最多三行 Open rows，加一条 receipt。文件内容和 hashline 锚点都不会漏进转录视图。`replace` / `insert` 是例外：只画截短的 +/- 片段，不是整份文件。真要看完整调用列表时，`Ctrl+O` 永远在。

**2. 开放账本必须看起来还活着。** 正在运行的阶段会显示活跃标记和逐秒走动的 elapsed 时间，并保留最多三行 *Open rows*：pending 和 running 的调用优先占位，剩下的槽位给最近完成的调用。静默工具（`read`、`undo_last_change`、`anchor_grep`）共享这些行，而不是独占一条 live pin，所以长时间的 `bash` 不会被一个 `read` 挡住。
**3. 旁白要留下。** 中途的 assistant Markdown 是真实内容，所以它保持可见，并结束当前工具阶段。thinking 占位符和结构化控制噪声会从终端旁白中移除。

决策记录与共享术语：

- [`docs/adr/0001-open-ledger-liveness.md`](./docs/adr/0001-open-ledger-liveness.md) —— 开放账本为什么要走时钟，以及这部分渲染归谁
- [`docs/adr/0002-silent-tools-share-open-rows.md`](./docs/adr/0002-silent-tools-share-open-rows.md) —— glue 为什么不再自己数那个三行窗口
- [`docs/adr/0003-ui-host-watchdog.md`](./docs/adr/0003-ui-host-watchdog.md) —— 失控门禁为什么放在 glue，且只作用于 UI host
- [`docs/adr/0004-child-session-watchdog.md`](./docs/adr/0004-child-session-watchdog.md) —— 子会话为什么有自己的账本，以及为什么交 `INCOMPLETE` 未完成卷而不是 host 式 nudge
- [`CONTEXT.md`](./CONTEXT.md) —— 术语表：Tools 账本、开放账本、已结算账本、Open rows、静默工具、open elapsed、账本 receipt
- [`docs/local-overlay.md`](./docs/local-overlay.md) —— 相对两个上游，本仓库添加、改动和优化了什么
- [`docs/upstream-sync.md`](./docs/upstream-sync.md) —— 两个上游依赖的评估结论，以及同步会打断什么
- [`CHANGELOG.md`](./CHANGELOG.md) —— 按日期里程碑记录，最新在最前

## 终端行为

在默认的 `pi-quiet-tools` seed 配置下：

```text
I'll inspect the current glue layer first.

◐ Tools (4 calls · 2 turns) · 7s · read ×3 · bash ×1
  ◐ Read(index.ts)
  ✓ Read(src/config-seed.ts)
  ✓ Read(src/aggregate-silent-tools.ts)

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
- 结果模式为 `summary`；`read`、`undo_last_change`、`anchor_grep` 保持静默，但计数仍留在账本里。`replace` 和 `insert` 留在账本外，画大约 6 行 +/- 片段。`anchor_grep` 是取代内置 `grep` 的锚点搜索：它的命中行自带锚点，可以直接编辑，不必再单独 `read` 一遍。
- `Agent` 保留原生 renderer。`edit` 也由 seed 的 passthrough 配置留在安静账本之外。
- 中途的 assistant Markdown 保持可见；thinking 占位符与结构化控制噪声从终端旁白中移除。
- 当本扩展先于 `@tintinweb/pi-subagents` 加载时，子代理完成通知只占一行紧凑状态行；不显示 transcript 路径和结果预览元数据。

`Ctrl+O` 展开分组后的原始工具时间线。静默工具仍然不会倾倒文件正文；展开的 `replace` / `insert` 会还原 hashline 原生预览。

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

`replace` 和 `insert` 默认留在 `tools.passthrough` 里，截短 diff 才能画出来。把 `read` 加进去会重新出现逐次 Read 行；启动迁移会再次清掉静默 hashline 名。想再加一个必须留在账本外的高信号工具，把名字加进去即可。

改动工具归属、布局、intent schema 或 call-frame 装饰需要 `/reload`。删除配置文件并 reload Pi 可以恢复 bundle 默认值。

如果你设置了 `PI_CODING_AGENT_DIR`，上面所有路径都基于该目录解析，而不是 `~/.pi/agent`。

### 排障

| 现象 | 原因与处理 |
| --- | --- |
| 启动时报 `Tool "read" conflicts with …` | 加载了两套 hashline。这是 Pi 自己给出的诊断，**不会阻断启动**，会话仍可继续。把独立的 `pi-hashline-edit-pro` 条目从 `packages` 里移除。 |
| 账本旁边出现逐次 `Read(path)` 行 | 有静默 hashline 工具名出现在 `tools.passthrough` 里。把它去掉；启动迁移正常情况下会自动处理。账本旁出现截短的 `replace` / `insert` 片段是预期行为。 |
| 子代理完成通知还是很啰嗦 | `@tintinweb/pi-subagents` 先于本扩展加载。Pi 对同一 custom 消息类型只取最先注册的 renderer，所以本扩展必须在前面。 |
| `Failed to load extension: ENOENT … prompts/undo-last-replace.md`，或 `Cannot find module … /file-type/index.js` | Pi 启动**早于**依赖在磁盘上被替换。jiti 的模块解析缓存是**进程级**的，`/reload` 清不掉。报错里那个文件只有**旧版本**才有（hashline 2.6.1 的 `undo-last-replace.md`；file-type 21.3.4 的根入口 `index.js`）。**重启 Pi** —— 新进程会正确解析。 |
| 看起来完全没变化 | 执行 `/reload`。若仍无变化，确认配置文件存在，且只安装了一个包。 |

## 安装

下面每条路径装到的都是同一份完整 bundle：glue 层、两个内嵌上游、两个独立包，全部来自这一个源 —— 装完不需要再手工拷任何文件。

### 从 GitHub 安装（推荐）

Pi 会把仓库 clone 到它自己的 git 目录，在那里执行 `npm install --omit=dev`，并把该源写进你的 settings：

```bash
pi install git:github.com/CodingOX/pi-quiet-tools
```

协议 URL 写法等价，并且同样支持 ref 后缀：

```bash
pi install https://github.com/CodingOX/pi-quiet-tools
pi install git:github.com/CodingOX/pi-quiet-tools@main   # 钉住某个分支或 tag
```

端到端实测：clone 落在 `~/.pi/agent/git/github.com/CodingOX/pi-quiet-tools`，四个随包依赖全部解析成功，Pi 自己的扩展加载器从 `index.ts` 注册出全部十个工具。

> [!NOTE]
> `github:CodingOX/pi-quiet-tools` **不是** Pi 的包来源写法。Pi 只认 `git:` 前缀或协议 URL —— 其它写法会被当成本地路径，报 `Path does not exist`。

本仓库没有 submodule，也没有 `preinstall` 钩子。所有第三方层都提交在 `vendor/` 里，普通 clone 就是完整的 —— 不需要 `--recurse-submodules`，加了也没有意义。

> [!WARNING]
> 不要执行 `pi install npm:pi-quiet-tools`。本仓库尚未发布到 npm，而这个包名**已被另一个完全无关的包占用**。执行会装上一个和本项目毫无关系的工具。带 scope 的 `@pi-quiet-tools/pi-quiet-tools`、`@pi-quiet-tools/watchdog`、`@pi-quiet-tools/notify` 虽然没被占用，但也同样尚未发布。

### 两个独立包

`@pi-quiet-tools/watchdog` 与 `@pi-quiet-tools/notify` 没有发布到 npm。它们**不需要**单独安装 —— 主包已经含它们，与主包同时装会把事件处理器重复注册。从本地 checkout 可以直接指向它们：

```bash
pi install /absolute/path/to/pi-quiet-tools/packages/watchdog
pi install /absolute/path/to/pi-quiet-tools/packages/notify
```

git 源**不能**指向子目录 —— `git:github.com/CodingOX/pi-quiet-tools/packages/watchdog` 不是合法仓库，Pi 也不支持 `tree/main/...` 那种写法。这两个包请走主包 bundle。

### 从本地 checkout 安装

```bash
git clone git@github.com:CodingOX/pi-quiet-tools.git
cd pi-quiet-tools
npm install
pi install /absolute/path/to/pi-quiet-tools
```

`pi install` 也接受本仓库下的任意路径，包括上面那两个独立包。安装后重启 Pi，或执行 `/reload`。

### 移除之前独立安装的扩展

如果上游扩展曾被单独安装过，请从 `~/.pi/agent/settings.json` 或项目的 `.pi/settings.json` 里移除它们，`packages` 只保留 `pi-quiet-tools`：

```bash
pi remove npm:pi-hashline-edit-pro
pi remove npm:@zhcsyncer/pi-tool-display-intent
```

### 更新

```bash
pi update                                              # 全部
pi update git:github.com/CodingOX/pi-quiet-tools        # 只更新这一个
```

`pi update` 会重新拉取本仓库并在那里重跑 `npm install`。你拿到的就是该修订里提交的那份 vendor 代码 —— 不存在一条能自己漂移的嵌套通道。

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
  "tools": { "passthrough": ["Agent", "replace", "insert", "edit"] },
  "advanced": { "truncationHints": false }
}
```

已存在的配置不会被覆盖。启动迁移会把静默 hashline 名（含已被淘汰的 `undo_last_replace`）从历史 `tools.passthrough` 里移除，并补回 `Agent`、`replace`、`insert`，让读操作保持聚合，编辑可以画出截短 diff。

## 加载顺序与保障

`index.ts` 按以下顺序装配：

1. 在导入上游模块之前 seed 或迁移 display-intent 配置。
2. 安装 `registerTool` hook 与子代理通知紧凑 renderer。
3. 加载 display-intent 一次，除非当前 Pi 运行时里它已经活跃。
4. 无条件加载 hashline。扩展加载期 `pi.getAllTools()` 会 throw，所以 glue 无法探测 hashline 是否已注册 —— 真正拦住双装的是别的东西，见「排障」。
5. 给 hashline 工具套上极简 renderer，并安装聚合静默工具／旁白补丁。
6. 在 `session_start` 与 `before_agent_start` 刷新聚合补丁。

每个 display-intent 运行时都会在 `session_shutdown` 释放自己的 prototype 归属、工具装饰、聚合投影和全局状态。这对 `/reload`、`/new`、`/resume`、`/fork` 以及进程内子代理生命周期都很重要：一个运行时不能保留或覆盖另一个运行时的显示状态。

## 上游更新

先读 [`docs/upstream-sync.md`](./docs/upstream-sync.md)。两个内嵌层都是刻意持有的，而同步可能以终端不会报错的方式静默失效。

```bash
npm run vendor:pull             # hashline 直接覆盖；display-intent 只报告
npm run vendor:pull -- --check  # 只报告，不落地
```

> [!IMPORTANT]
> 两个内嵌层的处理方式**故意不同**。`vendor/hashline` 是纯上游快照，所以同步就是目录级覆盖。
> `vendor/display-intent` 是**fork**，承载本地独占工作，所以脚本拒绝碰它 —— 那边的上游合并是
> 一次人工 rebase，有三个已记录的静默失效点。

同步之后：

```bash
npm run typecheck
npm test
```

然后重启 Pi。hashline 大版本升级后 `/reload` 不够。

## 环境要求

- Pi coding agent >= 0.84（`@earendil-works/pi-coding-agent`）；开发与验证基于 0.85.x。这个下限来自 `pi-hashline-edit-pro` 4.x。
- Node.js >= 22.19，这是 Pi 与 `pi-hashline-edit-pro` 共同的要求
- 一个交互式的终端会话。安静账本是终端渲染器。

## License

本仓库为 MIT。内嵌的第三方代码保留其自身的 MIT 条款与版权人 —— 见 [`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md)。
