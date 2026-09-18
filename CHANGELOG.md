# Changelog

本仓库尚未发布到 npm（安装走 git，见 [README](./README.md) 的 Install 章节），也没有打过 tag。
因此这里按**日期里程碑**记录，而不是按已发布的语义化版本。最新在最前。

格式参考 [Keep a Changelog](https://keepachangelog.com/)；日期术语与代码标识保留英文原文。

---
## 2026-09-18 · Tools 账本左缘对齐正文

一件纯观感修正：终端里 `Tools` 表头比它所属的助手正文更靠左一列。

根因是两侧左缘来源不同：正文走 Pi 的 `AssistantMessageComponent`，左缘由 `outputPad`
顶开 1 列；而 display-intent 把 `Tools` 表头画在 col 0，同块的统计行与行条目却是固定 2 空格。
块内自洽，只有表头这一行没跟正文对齐。

### Fixed

- **会话账本表头与助手正文左缘对齐**（`src/aggregate-ledger-indent.ts`）。
  账本行整体右移 1 列，块内层级（表头 0 / 统计 2 / 行条目 2）保持不变。
  三条实现约束：**逐行分类**而非整块平移（Ctrl+O 展开态下账本行与恢复出的正文在同一个
  渲染块里）；**幂等**（只在基准缩进上平移，因为包装器挂在原型上、跨 `/reload` 存活）；
  **不动非账本行**（`replace` / `insert` 的截短 rail diff 与账本共用同一条 render 原型）。
  识别还分两档收紧：框线行（`└ ✓`）形态独特、可独立认；裸内容行（`  ✓ test name`）
  前缀太常见（vitest / pytest 输出），必须与表头同块才平移，否则真实用例列表会被顶歪。
  三个渲染宿主都接：`aggregate-silent-tools.ts`（折叠账本）、`aggregate-keep-narration.ts`
  （展开态表头）、`aggregate-steer-indent.ts`（展开态 steer —— 它由 `UserMessageComponent`
  渲染，另两个宿主都看不到；整块纯轨道平移，续行没有 marker 只能整体缩）。
  前两者的 wrap key 分别升到 `aggregate-silent-wrap.v6` 与 `aggregate-keep-narration.v4` ——
  原型补丁跨 reload 存活，不升 key 会让新逻辑被提前 return 掉、表现为「改了没效果」。

---

## 2026-09-18 · Markdown 增强收编进 bundle

把个人维护的 `~/.pi/agent/extensions/markdown-enhance/` 收进仓库，成为
`packages/markdown-enhance`。起因是一次换机：pi-sync 明确不同步 `node_modules`
（`isDeniedPath()` 硬编码拒绝，无 allowlist），而该扩展依赖裸包 `grok-mermaid`，
于是新机器上 Pi 启动直接 `process.exit(1)`——报错还指向一个和插件无关的模块名。

### Added

- **`@pi-quiet-tools/markdown-enhance`**：从 `pi-cc-extensions` 抽出的 Markdown 变换层。
  mermaid 方言图（`sequenceDiagram` / `stateDiagram-v2` / `classDiagram` / `erDiagram`，
  内置 transformer 只认 ` ```mermaid `）、GitHub 提示框（`> [!NOTE]` → 加粗标签引用块）、
  裸 URL 转链接；代码块内与流式态一律跳过。
- **两个口味开关，默认关闭**：`deCircled`（①→(1)，Nerd Font 补丁字形 U+2460–U+2473
  ink 超界的规避）与 `hideCodeFence`（`Markdown.renderToken` 原型补丁，吞掉 ``` chrome）。
  默认关是刻意的：这是个人 workaround 与口味，不该强加给其他消费者。
  配置在 `~/.pi/agent/extension-data/pi-quiet-tools-markdown-enhance/config.json`，
  逐字段类型校验，坏字段单独退回默认。
- `grok-mermaid` 进根 `dependencies` + `bundledDependencies`（本 bundle 唯一非 vendor 的
  第三方运行时依赖），`pi install` 一次装齐。

### Changed

- **根 `index.ts` 接线**：`registerMarkdownEnhance(pi)` 与既有各层并列。它不抢槽位 ——
  quiet-tools 从不注册 `markdownTransformer`（只包 `AssistantMessageComponent.render`），
  display-intent 与 hashline 两个上游也都不碰；三者是嵌套（narration render →
  `Markdown.render` → `renderToken`）而非竞争。

### Fixed

- **换机后 `Cannot find module 'grok-mermaid'`**。根因不再是靠 vendor 内联规避，
  而是依赖随包发布：实测 `npm pack` 后 tarball 内含 64 个 grok-mermaid 文件的
  `node_modules/grok-mermaid`，模拟全新消费者安装后从包入口可正常解析。

> ⚠️ **管道不幂等，旧扩展必须删除而非禁用。** Pi 的 `applyMarkdownTransformers`
> 会顺序执行**所有**注册的 transformer，两次过管道会把 URL 毁成
> `[[u](u)](u](u))`。旧目录已移到 `~/.pi/agent/markdown-enhance.backup-<date>`（在
> `extensions/` 之外，既不被 Pi 加载也不被 pi-sync 同步）。锁在
> `AGENTS.md` 不变量 9 与 `docs/local-overlay.md`。

- **引用块内「加粗 / 行内代码 / 链接」之后的文字丢样式**。`hideCodeFence` 的
  `Markdown.renderToken` 包装只转发了前三个形参，吞掉第 4 个 `styleContext`——
  blockquote（`markdown.js:440`）与 list（`:616`）分支靠它给子 token 恢复引用块
  样式前缀，丢了之后前景色被上游 `\x1b[39m` 重置、再无人恢复，表现为「无标记的
  引用块正常，带标签的那部分不一样」。改用 `Function#apply` 转发**全部**实参，
  上游将来再加参数也不会重踩。缺陷在从 pi-cc-extensions 抽出时就已存在
  （上游原版没有这段 patch）。
- **原型补丁跨 `/reload` 换不掉**。`Markdown.prototype` 是进程级对象，reload 不重置
  它；v1 只置了布尔标记 `__mdEnhanceHideFences`、**没保存真原始函数**，所以修好
  包装逻辑后 reload 看似成功、实际仍在跑旧包装。现在把「版本 + 真原始函数」一起
  存在原型上（`__piQuietToolsCodeFencePatch`），可解包重装；遇到 v1 残留这种解不开
  的情况则返回 `false` 而不是假装装好。**这条修复必须重启 Pi 才能生效，`/reload` 不行。**

## 2026-09-18 · 单包自包含发布 + hashline 4.3.4

这一天的主题是**把「装一次就够」变成事实**：去掉 submodule，把两个上游内嵌进仓库，
并让四个包一起随主包发布。

### Added

- **四个随包插件一次到位**。根包用 `bundledDependencies` 打包四个 `file:` 依赖
  （`pi-hashline-edit-pro`、`@zhcsyncer/pi-tool-display-intent`、`@pi-quiet-tools/watchdog`、
  `@pi-quiet-tools/notify`），用户装一次即全部到位，不需要手工拷贝胶水层。
- **独立可发布的两个包**：`@pi-quiet-tools/watchdog` 与 `@pi-quiet-tools/notify`。
  两者零第三方耦合，可从本地路径单独安装；与主包同装会重复注册事件处理器。
- **README 补齐 GitHub 安装通道**：`git:` 前缀、协议 URL、`@<ref>` 钉版本三种写法；
  记录 clone 落点、四个依赖的解析结果，以及 `github:` 写法**不是** Pi 包来源这一事实。
- `THIRD-PARTY-NOTICES.md` 与 `LICENSE`（MIT）。

### Changed

- **去 submodule，改为自带 vendor 的单包发布**。`vendor/hashline` 是只读镜像，
  `vendor/display-intent` 是携带本地独占工作的 fork。普通 clone 即完整，
  `--recurse-submodules` 不再需要也没有意义。
- 看门狗改从本地 `packages/watchdog/src/assistant-text.ts` 取纯文本判定，
  解除对 display-intent 补丁模块的隐性依赖。
- 测试用 tsconfig 移出 `src/`，避免语言服务把它当成同目录文件的「最近配置」。

### Fixed

- **`vendor-pull.sh` 的 `--to` 参数解析**。原先用 `for arg in "$@"`，
  而 `"$@"` 在进入循环时就被展开成固定列表，循环体内的 `shift` 无效 ——
  于是 `--to 4.3.4` 的版本号掉进 `*)` 分支，报 `Unknown argument` 并退出。
  改成 `while [[ $# -gt 0 ]]` + 规范化 `shift`。

### Dependencies

- **`pi-hashline-edit-pro` 4.2.5 → 4.3.4**（vendor 目录级覆盖，跨 9 个版本）。

  | 版本 | 改动 |
  | :--- | :--- |
  | 4.2.6 | `hash-store` 双引擎探测（`node:sqlite` → `bun:sqlite` 回退）、`E_STORE_UNAVAILABLE`、glob 支持 |
  | 4.2.9 | 锚点注册表改为 **per-session + `AsyncLocalStorage`**；NUL 字节防护 |
  | 4.3.0 | 新增 `auto-read-all`（默认 `"off"`）；删除 `boundary-bypass.ts` |
  | 4.3.1–4.3.4 | 边界、批量、缓存修补 |

  **契约面逐项核对，全部未变**：五个工具名、`HASH_LEN = 4`、diff 折叠阈值 16/40、
  `tryResolveEditTarget` 签名、`buildEditToolSchema` / `buildInsertToolSchema` 签名、
  `renderShell` / `renderCall` / `renderResult`、`anchor-registry` 的测试导出。
  `dependencies` 逐字相同 —— 无需改动根依赖图。

  升级动机是**止血**而非新功能：4.2.5 在 `src/hash-store.ts` 顶层
  `await import("node:sqlite")`，而 `index.ts` 顶层引用它，导致 Bun 宿主下
  **整个扩展加载失败**（Bun 1.3.14 实测）；且模块级 `currentKey` 会被子会话的
  `session_start` 覆盖，宿主锚点在本会话内无法恢复（4.3.4 由 `AsyncLocalStorage` 作用域修复）。

  评估过程与逐项证据记录在 [`docs/upstream-sync.md`](./docs/upstream-sync.md)。

---

## 2026-09-17 · rail 折叠预览 + 子会话看门狗

### Added

- **折叠态编辑预览支持 rail 样式**，并移除默认绿壳（`renderShell: "self"`）。
- **子会话接入独立看门狗账本**。`hasUI !== true` 的子会话有自己的 80 + 10 预算，
  与 host 分开计数；到点后要求向父代理交 `INCOMPLETE` 未完成卷并结束本轮。
  见 [ADR 0004](./docs/adr/0004-child-session-watchdog.md)。

### Fixed

- 对齐 rail 模式下标题与轨道的左边线缩进。折叠预览的标题行与 diff 是同一
  `Box`/`Container` 的两个子节点，`paddingY` 必须保持 0，否则两者会被分开。

---

## 2026-09-13 ~ 14 · 看门狗、截短编辑、schema 锁、收口 skill

### Added

- **UI-host 看门狗**：bash 失控闸门。80 次 bash 后先 nudge，再过 10 个 LLM 回合
  拦住后续工具，逼模型用中文说明「当前做到哪 / 建议下一步」。
  不终止、不中止在途命令，**没有墙钟上限**。见 [ADR 0003](./docs/adr/0003-ui-host-watchdog.md)。
- **`replace` / `insert` 折叠态画截短 diff**（约 6 条变更行，统计在标题行），
  `Ctrl+O` 还原 hashline 原生预览。
- **`src/hashline-tools.ts`** 作为 hashline 工具名的唯一事实来源
  （静默名 / 可见编辑名 / 已淘汰名），四个消费模块都读它。
- **`quiet-tools-verify` skill**：改动收口核验流水线。
- `docs/local-overlay.md`：本仓库相对两个上游的叠加清单。

### Changed

- bash 阈值上调至 80；**去掉墙钟帽**，只数实际执行的 bash。
- 可见的助手正文（非 thinking）会重置 host 的 bash 计数与宽限。

### Fixed

- **锁紧 `replace` / `insert` 的模型侧 schema**：`additionalProperties` 改为 `false`；
  默认锚点模式下 `prepareArguments` 在上游归一化之后剥掉 `path` / `file_path`。
- 折叠标题显示相对路径，并从锚点反查文件（`tryResolveEditTarget`）；
  查到的路径写入 `state.resolvedPath`，因为 `replace` 执行后会释放旧锚点、标题会再画一次。
- 正确丢弃含 Markdown 竖线的折叠钉（`› │` 不是 Ctrl+O 时间线）。
- 完成态补空行，避免正文紧贴 diff。
- 测试改用独立 tsconfig，修既有 import 红灯。

---

## 2026-09-12 · hashline 4.2.5 + 上游评估 + 双语 README

### Added

- README 重写并新增简体中文版。
- [`docs/upstream-sync.md`](./docs/upstream-sync.md)：两个上游依赖的同步评估、版本阶梯断点、
  display-intent fork 的成本与三个静默失效点。

### Changed

- **hashline 工具名收敛为单一来源**（`src/hashline-tools.ts`）。
  原先同一份名单在四个文件里各写一遍，上游改名就要四处找。
- **升级 `pi-hashline-edit-pro` 2.6.1 → 4.2.5**。断点有两处：
  `undo_last_replace` → `undo_last_change`（2.7.0）、锚点 3 字符 → 4 字符（3.0.0）。
  glue 不解析锚点宽度，只有 README 示例需要改。
- **移除 hashline 的死守卫**，改为无条件加载：`pi.getAllTools()` 在扩展加载期
  会抛 `notInitialized`，那个守卫的 `catch` 吞掉了异常，从未真正生效。

### Fixed

- 锁住 display-intent 与 hashline 的注册顺序（顺序反了会让模型静默拿到无锚点文件内容）。
- 校验 hashline 的 prompt 引用全部可解析。
- 补充 ENOENT / `file-type` 的扩展加载排障条目 —— jiti 的模块解析缓存是**进程级**的，
  `/reload` 清不掉，只能重启 Pi。

---

## 2026-08-28 · 开放账本 liveness

### Added

- 开放账本显示活跃标记与逐秒走动的 elapsed 时间。
- [ADR 0001](./docs/adr/0001-open-ledger-liveness.md)、[ADR 0002](./docs/adr/0002-silent-tools-share-open-rows.md)。

### Changed

- 折叠账本直接透传上游的 Open rows，glue 不再自己数那个三行窗口。
- 静默工具（`read`、`undo_last_change`、`anchor_grep`）共享 Open rows，
  而不是独占一条 live pin —— 长时间的 `bash` 不会被一个 `read` 挡住。

---

## 2026-08-20 ~ 21 · 聚合账本与旁白

### Added

- 子代理完成通知的紧凑渲染：压成一行状态，不显示 transcript 路径与结果预览元数据。
- 按运行时隔离 display-intent 的重复加载检测（每次 `session_shutdown` 释放自己那套状态）。

### Changed

- `Agent` 保留原生 renderer，留在账本之外。

### Fixed

- 保留中途的助手 Markdown 为真实内容，同时隐藏 thinking 占位符。
- 折叠账本不再重复画旁白钉（同样的文字已作为普通 Markdown 渲染在上方）。
- 剥离 GPT 风格的 thinking 标签与会话序号前缀。
- 统一终端文本可见性判定。

---

## 2026-08-18 ~ 19 · 项目起点

### Added

- 初始版本：安静聚合工具 UI 的胶水扩展。
- `per-turn` Tools 账本：连续只有工具调用的助手消息留在同一个账本里。
- display-intent 作为子模块跟踪；`Ctrl+O` 展开时保留一行静默工具行。
- 记录 `git:` / `https://` 安装方式，以及 `github:` 不是 Pi 包来源。
