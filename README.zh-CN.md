# pi-quiet-tools

一个让终端更安静的 Pi 扩展 —— 而且**不从模型手里拿走任何东西**。

Pi 默认会给每一次工具调用都打印一块内容：这里一行 `Read(path)` 加整份文件，那里一段 diff，
再来一条带 transcript 路径的子代理通知。忙起来的一轮就是一整屏转录，把真正的回答埋掉。
`pi-quiet-tools` 把这些收成简短易读的摘要，而模型收到的和以前完全一样：带 Hash 锚点的完整文件
内容、完整的工具结果、整个会话。

你会得到：

- **Hash 锚点编辑。** `read` 给每一行返回一个短锚点，模型按锚点改文件而不是重抄内容 ——
  改失败的次数更少，diff 里也不会出现整份文件重写。
- **一个 Tools 账本**，而不是逐次调用的转录 —— 一个标题、最多三行实时行、一条收据。
  文件正文和锚点都不会漏到终端上。
- **看得见的编辑。** `replace` 和 `insert` 留在账本之外，画一小段 `+/-` 片段，
  一眼就知道改了什么。
- **你的旁白留着。** 中途的 assistant Markdown 是真实内容，保持可见；只隐藏 thinking 和控制噪声。
- **bash 失控闸门。** 累计 80 次 bash 后请模型汇报进度；再过去十个回合仍没见到可见回复，
  就拦住后续工具调用，直到模型开口。
- **紧凑的子代理通知。** 完成通知变成一行状态，不再是一整块带路径的多行文本。
- **更好读的 Markdown。** Mermaid 各方言图、GitHub 提示框、裸 URL 转链接 —— 代码块内一律不动。
  两个口味项（圈数字改写、隐藏代码围栏）**默认关闭**，想要再打开。

全部功能都在一个包里。装一次即可 —— 没有第二步，没有要手工拷贝的胶水文件，
也不需要任何前置配置。

[English](./README.md)

---

## 安装

```bash
pi install git:github.com/CodingOX/pi-quiet-tools
```

这就是完整的安装。Pi 会把仓库 clone 到它自己的 git 目录、装好依赖、写进你的 settings。
Hash 锚点编辑器、工具渲染层、看门狗、紧凑通知，全都跟它一起来。

协议 URL 写法同样有效，也可以钉住某个分支或 tag：

```bash
pi install https://github.com/CodingOX/pi-quiet-tools
pi install git:github.com/CodingOX/pi-quiet-tools@main
```

装完重启 Pi。

> [!WARNING]
> 必须用 `git:` 前缀或完整的协议 URL。`github:CodingOX/pi-quiet-tools` **不是** Pi 的包来源写法 ——
> Pi 会把其它写法当成本地路径，报 `Path does not exist`。
>
> 不要执行 `pi install npm:pi-quiet-tools`。本项目未发布到 npm，而这个包名**已被另一个完全无关的包
> 占用**。那样装上的会是完全不同的工具。

### 更新

```bash
pi update                                          # 全部
pi update git:github.com/CodingOX/pi-quiet-tools    # 只更新这一个
```

**更新后要重启 Pi。** `/reload` 不够：Pi 的模块解析缓存是进程级长期存活的，
而更新后的包可能已经移动过缓存仍指向的文件。

### 卸载与清理旧安装

```bash
pi remove git:github.com/CodingOX/pi-quiet-tools
```

如果你以前单独装过底层的那几个包，也一并移除 —— 它们已经在本包里，
同时留着会让同一批工具被注册两次：

```bash
pi remove npm:pi-hashline-edit-pro
pi remove npm:@zhcsyncer/pi-tool-display-intent
```

---

## 你会看到什么

安静，但不是无声。一轮读了四个文件、跑了一条命令，长这样：

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

十六次工具调用，七行显示。模型那边什么都没少 —— 中间那个阶段读的九个文件都还在，
按一次 `Ctrl+O` 就能看到。

### 怎么读账本

| 你看到的 | 含义 |
| --- | --- |
| `✓ Tools (…)` | 该阶段已结束。只有标题和收据。 |
| `◐ Tools (…) · 7s` | 还在跑。计时会走动，单个长工具也不会看起来卡死。 |
| `! Tools (…) · N failed` | 有失败；展开看是哪次调用。 |
| `↳ 1 steer` | 你在这个阶段里插话了。 |
| 以 `◐` / `✓` 开头的行 | 实时行 —— pending 与 running 优先，然后是最近的。 |
| `took … · tok ↑… ↓… · at …` | 该已结束阶段的耗时与开销。 |

有两样东西刻意**不放进**账本：进行中的旁白钉（那段文字已经作为普通 Markdown 显示在它上方），
以及 `read` 这类安静工具的逐次行。

### 看全部

按 **`Ctrl+O`** 展开分组时间线 —— 每次调用一行，带目标与状态 —— 再按一次折叠回去。
日常不需要它；只在摘要太粗的时候用。

编辑是唯一不展开也能看见的东西，因为你通常就是想看它：

```text
replace src/config-seed.ts
+1 -1
-   "intent": { "enabled": true }
+   "intent": { "enabled": false }
```

对编辑按 `Ctrl+O` 会还原完整原生 diff。

---

## 按你的习惯调整

开箱即用，不需要配置。想改的时候：

- **`/tool-display-intent`** 打开显示设置面板 —— 布局、结果模式、diff 渲染，以及哪些工具留在
  账本之外。
- **`/hashline-config`** 管编辑那一侧 —— auto-read、diff 上下文行数、锚点搜索与内置 `grep` 的取舍、
  严格输入，以及要忽略的目录。

设置持久化在 `~/.pi/agent/extension-data/pi-tool-display-intent/config.json`
（如果设置了 `PI_CODING_AGENT_DIR`，则在那个目录下）。改动布局或工具归属需要 `/reload`。

想把别的工具也留在账本外、完整显示，把它的名字加进 `tools.passthrough`。
`read` 这类安静工具会在启动时被自动剔除，所以即使你粘了一份列出它们的旧配置，读取依然是聚合的。

---

## 看起来不对的时候

| 现象 | 处理 |
| --- | --- |
| Pi 启动时报 `Tool "read" conflicts with …` | 加载了两份 Hash 锚点编辑器。会话仍可继续。把独立的 `pi-hashline-edit-pro` 条目从 `packages` 里移除。 |
| 账本旁边出现逐次 `Read(path)` 行 | 旧配置仍把 `read` 当作 passthrough。正常情况下启动时会自动清理；没清掉就手动移除。 |
| 子代理通知还是很长 | `@tintinweb/pi-subagents` 先于本扩展加载。Pi 对同一类通知只取最先注册的 renderer，所以本包必须在前面。 |
| `Failed to load extension: ENOENT …` | Pi 在包于磁盘上更新完成之前就启动了。**重启 Pi** —— `/reload` 清不掉失效的模块路径。 |
| 看起来完全没变化 | 重启 Pi，然后确认只装了一个包、配置文件存在。 |
| 引用块里加粗/代码/链接**之后**的文字掉回普通样式 | 本次进程里已有一份更早版本的本扩展打过 `Markdown.renderToken` 补丁，而它无法被卸下。**重启 Pi** —— `/reload` 只重跑扩展代码，不会重置原型。 |

更深的问题 —— `E_STORE_UNAVAILABLE`、`Cannot find module`、以及加载顺序为什么关键 ——
见 [`docs/internals.md`](./docs/internals.md)。

---

## 环境要求

- Pi coding agent >= 0.84
- Node.js >= 22.19
- 一个交互式的终端会话 —— 账本是终端渲染器

---

## 更多文档

| 文档 | 内容 |
| --- | --- |
| [`docs/internals.md`](./docs/internals.md) | 架构、加载顺序、打包规则、开发、深层排障 |
| [`CONTEXT.md`](./CONTEXT.md) | 术语表 —— 账本、Open rows、静默工具、可见编辑 |
| [`docs/adr/`](./docs/adr) | 每个设计决策的来由 |
| [`docs/upstream-sync.md`](./docs/upstream-sync.md) | 两个内嵌上游的状态 |
| [`CHANGELOG.md`](./CHANGELOG.md) | 按日期里程碑记录 |

---

## License

MIT。内嵌的第三方代码保留其自身的 MIT 条款与版权人 ——
见 [`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md)。
