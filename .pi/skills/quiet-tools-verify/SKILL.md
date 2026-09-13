---
name: quiet-tools-verify
description: pi-quiet-tools 改动后的收口核验流水线。改完 packages/core 或 vendor/pi-extensions 里的渲染、账本、看门狗、编辑 UI、hashline 契约、配置迁移之后，用它自上而下跑完「静态门禁 → 运行时接线 → 用户 reload → 落地确认 → 目视引导 → 收口判据」，并让用户按引导核对终端观感。用户说收口、验一下、改完自检、verify、跑一遍核验时使用。
---

# quiet-tools 改动收口核验

## 这个 skill 解决什么

改完代码 ≠ 改完行为。本项目几乎全部改动最终都体现为**终端上人眼看到的东西**，而扩展代码在 `reload` 之前不会生效。所以核验必须切成本地能验的（源码层）和只有 reload 后才能验的（运行时层），并且**不能自己调 reload** —— reload 会终止当前回合，agent 必须把控制权交回给人。

**自上而下执行，不得跳阶段。** 阶段 1 红牌就不许往下走。

---

## 🚫 硬规则（先读）

1. **绝不调用 `/reload` 或任何 reload 机制。** reload 会杀掉当前回合，agent 无法在 reload 后「接着往下跑」。阶段 3 必须停下来等人。
2. **绝不声称验过没验过的东西。** 运行时观感只有用户在阶段 5 确认后才算通过；agent 不得替用户下结论，也不得凭源码推断「应该没问题」就报绿。
3. **不要 `npm run cache:clear`** —— 该脚本已删除（jiti 进程级解析缓存只能靠重启，清磁盘缓存无用）。
4. **不要在 Pi 运行时 `npm install` / 改依赖版本**。jiti 的模块解析缓存是进程级的，`/reload` 救不了，只能重启 Pi。
5. **只改代码不验不算收口。** 每轮改动收尾必须给出阶段 6 的四段小结。
6. 阶段 5 的每一问都必须给出**触发方式 + 看哪里 + 期望长相 + 失败长相**，不能只说「你看看对不对」。

---

## 阶段 0 · 变更盘点（agent，只读）

```bash
git --no-pager status --short
git --no-pager diff --no-ext-diff --stat HEAD
git --no-pager diff --no-ext-diff HEAD
```

把每个变更文件映射到「受影响的观测面」，产出一张**本轮要验什么**的表：

| 改了什么 | 观测面 | 自动化能覆盖到哪 | 必须目视的部分 |
| --- | --- | --- | --- |

映射依据见文末 [观测面 ↔ 源文件表](#观测面--源文件表)。

**闸门**：盘点表为空（无变更）→ 直接告知用户「无待验改动」并结束，不要空转。

---

## 阶段 1 · 静态门禁（agent，静默执行）

```bash
timeout 60 npm run typecheck
timeout 60 npm test
```

- `npm test` = core 单测（`packages/core/src/*.test.ts`）+ 跨包契约测试（`tests/*.test.ts`）。
- 系统若无 `timeout`，退化为直接执行，但必须设好等待上限，不能挂死。
- 读**失败的具体断言**，不要只看退出码。

**闸门**：任一红 → **立即停止**，输出失败断言 + 疑似位置，不进入阶段 2。

---

## 阶段 2 · 接线与不变量断言（agent，这一阶段是本 skill 的核心价值）

单测通过 ≠ 改动真的生效。本阶段专门抓「单测全绿但运行时压根没走到」这类问题。

逐条核对：

1. **可达性**：改动是否真的从 `packages/core/index.ts` 的加载链上被走到？给出完整调用链 `index.ts:行 → … → 改动的函数`。
2. **注册期 vs 运行期**：改动是在扩展工厂（加载期）生效，还是在事件回调（运行期）生效？加载期无法用 `pi.getAllTools()` 探测状态，别写这种守卫。
3. **单测测的是行为还是纯函数**：如果只测了纯函数，明确说「该改动没有行为级测试覆盖」，不要拿纯函数绿冒充功能绿。
4. **不变量仍成立**（对照 `AGENTS.md` 的 Critical invariants，只核与本次改动相关的）：
   - 加载顺序：display-intent 在 hashline **之前**（否则模型静默拿到无锚点内容，无任何报错）。
   - hashline 工具名清单仍以 `packages/core/src/hashline-tools.ts` 为唯一来源。
   - passthrough 默认只含 `Agent` / `replace` / `insert` / 遗留 `edit`；静默名不得回流。
   - `packages/core/src/config-seed.ts` 仍在 display-intent import **之前**作为副作用执行。
5. **hashline pin 未松动**：`packages/core/package.json` 中 `pi-hashline-edit-pro` 必须是精确 `4.2.5`，出现 `^` 即判红。

**闸门**：接线不可达 → 停止，报「本次改动不会在运行时生效」+ 原因，请用户裁决，不要自行改架构。

**特别提醒（最近的坑）**：改完 `replace` / `insert` 的**工具 schema**（如收紧 `additionalProperties`、剥离 `path`）后，只跑单测**不足以**证明模型侧不再收到多余字段。这类改动要在阶段 5 用真实一次编辑来确认。

6. **跑测试用的 tsconfig 是否被误改**：`packages/core/src/tsconfig.test.json` 是给 `tsx` 用的运行期配置。`tsx` 会把 tsconfig 的 `paths` 当**运行时**解析表，所以 `tsconfig.json` 里为 `tsc` 准备的 upstream stub 别名（尤其是 `pi-hashline-edit-pro/src/...` 这类**子路径**别名）会让真实依赖被解析成 `.d.ts`，测试随即报 `does not provide an export named ...`。改过 `tsconfig.json` 的 `paths` 就必须同步 `tsconfig.test.json`。

---

## 阶段 3 · 交接卡（agent → ⛔ 停下等人 reload）

这是**唯一允许中断流水线的地方**，也是本 skill 能被跑起来的前提。

输出一张交接卡，然后**结束本回合，不要继续调用工具**：

```markdown
## 🛑 请你 reload 一次才能继续

**本轮改了什么**：<一句话>
**为什么现在验不了**：运行时观感跑的还是旧代码，reload 前看到的都是旧行为。
**静态层已验**：✅ typecheck ✅ 单测（<N> 个）/ ❌ 有红（详见上）
**reload 后我要做的事**：确认新代码真加载 → 给你 5～7 条目视引导

请执行以下之一：

| 选项 | 命令 | 什么时候用 |
| --- | --- | --- |
| 重载扩展 | `/reload` | 只改了 `packages/core` 或 submodule 的 TS |
| 重启 Pi | 退出后重开 | 动过依赖版本 / 子模块 SHA / `package.json` |

reload 完成后回我一句「reload 好了」，我接着跑阶段 4。
```

> 为什么依赖版本类改动必须重启：jiti 的模块解析缓存在进程内长期存活，`/reload` 会新建 jiti 实例但解析缓存仍在，会去读已被上游改名/删除的文件（例如 `prompts/undo-last-replace.md`）并抛 ENOENT。

---

## 阶段 4 · 落地确认（agent，新回合，reload 后）

目标是**证明新代码真的在跑**，不是复核源码。尽量用可观测证据：

1. **扩展加载无报错**：请用户确认没有 `Failed to load extension`，或没有 `Tool "read" conflicts with …` 之外的异常。
2. **工具表符合预期**：本次若动过静默/可见编辑工具集，核对模型实际可用的工具名（`replace` / `insert` / `read` / `undo_last_change` / `anchor_grep`），多一个少一个都要报。
3. **编辑契约实证**（改过编辑链时必做）：自己真实做一次 `replace`，把**一行原始工具输出**贴给用户看，证明：
   - `read` 返回的是 `anchor│content`（带 4 字符锚点），不是裸文本；
   - `replace` / `insert` 没有被 `path` / `file_path` 之类的多余字段炸掉。
   贴的是真实输出，不是复述。
4. **配置迁移生效**：若动过 `config-seed` / passthrough，读一次落盘配置并核对关键字段：

   ```
   ${PI_CODING_AGENT_DIR:-~/.pi/agent}/extension-data/pi-tool-display-intent/config.json
   ```

   核对 `layout` 是否按用户原样保留、`tools.passthrough` 是否已剥离静默 hashline 名并保留 `Agent` / `replace` / `insert`。
5. **事件接线生效**：若本次改的是事件驱动行为（如看门狗的 `message_update` / `turn_start`），说明它只能靠阶段 5 的行为观察确认，不要在这里编造证据。

**闸门**：新代码没加载 / 工具表不符 / 配置迁移没跑 → 停止并报，不要进入目视引导。

---

## 阶段 5 · 目视引导（agent 引导，用户核对）

按本轮**实际改动的观测面**挑选条目，不要无脑全列。每条固定四段式：

```
👀 <序号> <一句话标题>
   触发：<让 agent 做什么，或用户按什么键>
   看：<终端哪个位置>
   期望：<标准长相>
   失败长相：<看到这个就是没生效>
```

用户逐条回 OK / 有问题。用户只要说「不对」，就回到阶段 6 的红灯分支。

以下条目按观测面分组，**只取与本轮改动相关的那组**。

### A. 渲染与终端观感

**A1 · 折叠账本与 Open rows**
触发：让 agent 在一次回合里连续读 3 个以上文件。
看：工具账本首行。
期望：`Tools (N calls · M turns)` 之类的**一行**汇总，最多 3 条 Open 行（pending/running 优先占位），**没有**逐个文件的 `Read(path)` 行，也**没有** hashline 的逐文件正文。
失败长相：出现一排逐个 `Read(path)` 行 → 有静默工具名漏回了 `tools.passthrough`。

**A2 · 中途 Markdown 保留、thinking 隐藏**
触发：让 agent 做一件需要多轮工具的事，观察它中途写的正文。
看：账本**上方**。
期望：agent 中途写的中文正文照常显示为 Markdown；它的内部推理（thinking）完全不显示。
失败长相：中途正文消失只剩账本；或同一句正文在账本上方和账本内**出现两次**。

**A3 · 每回合独立账本**
触发：同一请求里让 agent 先做一轮工具，写一句话，再做一轮工具。
看：两次工具各自的账本位置。
期望：第二个账本出现在**那句话之后**，两个账本分开。
失败长相：所有工具挤成底部一个账本。

**A4 · 编辑截短 preview**
触发：让 agent 改一个文件（`replace` 或 `insert`）。
看：编辑那一行的标题与 `+/-` 片段。
期望：标题是**相对路径的文件名**（不是 `ALqs→cdJJ` 这种锚点名）；下面是截短的 `+/-` 片段（约 6 条变更行）；**末尾有一行空**，让后面的正文不贴着 diff。
失败长相：标题显示成锚点名 → 锚点反查或 `state.resolvedPath` 回写失效；正文紧贴 diff 无空行。

**A5 · Ctrl+O 展开**
触发：按 `Ctrl+O`。
期望：恢复 hashline 原生完整 preview（折叠态是被替换过的，展开态仍是上游原件）。
失败长相：展开后内容与折叠态一模一样（说明折叠态误改了展开路径）。

**A6 · 静默工具与 grep 冲突处理**
看：`anchor_grep` 调用。
期望：**完全静默**，不进账本、不出现独立行；同时内置 `grep` 在 `anchor_grep` 开启期间是关闭的。
失败长相：出现 `anchor_grep` 独立行。

**A7 · 子代理通知压缩**
触发：让 agent 起一个子代理并等它跑完。
期望：完成通知压成**一行状态**，不出现 transcript 路径和结果预览元数据。

### B. 看门狗（默认阈值下无法自然触发，读这段）

默认阈值是 **80 次 bash 或 30 分钟 → nudge**，**再 5 回合或 3 分钟 → 硬停**。单次核验会话几乎不可能自然撞到。

诚实做法二选一：

- **默认（推荐）**：不加证。只报「看门狗的行为由 `packages/core/src/host-watchdog.test.ts` 覆盖，本轮未做真机触发」，并列出单测锁住的具体断言。
- **可选真机验证**（**必须用户明确授权**）：把 `DEFAULT_WATCHDOG_LIMITS` 临时调小（如 `bashBudget: 3`、`requestWallClockMs: 60000`），按阶段 3 的流程 reload 后触发，验完**必须还原**并重新 reload。此为可回滚的临时改动，未经授权不得执行。

真机验证时看：

- nudge → 终端出现一行中文提醒（人类可见的告警，不是进度工具）；
- 此时 agent 写**可见中文正文**（不是 thinking）后，bash 计数与宽限**应当重置**；
- 继续沉默调工具 → 到期后后续工具被拦，并被要求用中文说明「当前做到哪 / 建议下一步」；
- 子会话（`hasUI !== true`）完全不受影响；
- 正在跑的命令**不会**被中止；
- host 等待子代理（`Agent` / `get_subagent_result`）期间墙钟**冻结**。

### C. 模型侧契约

**C1 · read 返回带锚点**
触发：让 agent 读任意一个文件，并**原样贴出一行**读到的内容。
期望：形如 `aB3x│某一行内容`，锚点是 4 个字符。
失败长相：裸文本无锚点 → 加载顺序被打乱（display-intent 覆盖了 hashline 的 `read`）。

**C2 · 编辑参数不再被多余字段炸**
触发：真实做一次 `replace`。
期望：一次成功，不出现校验错误。
失败长相：报未知字段 / `path` 相关校验失败 → schema 锁或参数剥离失效（阶段 1 的单测本应拦住）。

### D. 构建与依赖同步（多为提醒项）

**D1**：`packages/core/package.json` 中 hashline 是精确 `4.2.5`（无 `^`）。
**D2**：若动过 submodule，`git submodule status` 的 SHA 与本次提交一致，且父仓库只提交 SHA。
**D3**：动过依赖版本 / 子模块 / `package.json` 时，**重启 Pi 才算生效**，`/reload` 不够 —— 这一条必须明确说给用户。

---

## 阶段 6 · 收口判据（agent）

四段式收尾，缺一段不算收口：

1. **已验**：跑了哪些命令、看到什么结果、用户确认了哪几条目视项（逐条列）。
2. **未验 / 验不了**：明确列出（例如看门狗未真机触发），并说清为什么和怎么补。
3. **未通过**：给**最小复现步骤 + 疑似文件:行**，不要只说「有问题」。
4. **下一步**：给出一个明确动作（修 → 重跑本 skill / 提交 / 转交其它 skill）。

红灯时的额外要求：**先定位再改**，不要带着未定位的失败进入新一轮改动。

重跑本 skill 前，若本轮改过测试配置或依赖接线，**先确认 `npm test` 的红是本次引入的还是既有的**：`git stash` 后在 HEAD 上跑一次对比，不要把自己刚修好的既有红灯记到本轮账上。


---

## 观测面 ↔ 源文件表

| 观测面 | 源文件 / 位置 | 自动化 | 目视 |
| --- | --- | --- | --- |
| 加载顺序、扩展装载 | `packages/core/index.ts`、`packages/core/src/upstream-loader.ts` | `tests/hashline-contract.test.ts` | C1 |
| hashline 工具名分类 | `packages/core/src/hashline-tools.ts` | 同名契约测试 | 阶段 4 工具表 |
| 编辑工具 schema 锁 | `packages/core/src/hashline-edit-schema.ts` | 同名单测 | C2 |
| 编辑截短 preview | `packages/core/src/compact-edit-ui.ts` | 同名单测 | A4 / A5 |
| 静默工具与账本透传 | `packages/core/src/aggregate-silent-tools.ts`、`aggregate-silent-ledger.ts` | 同名测试 | A1 / A6 |
| 中途正文保留 | `packages/core/src/aggregate-keep-narration.ts` | 同名测试 | A2 |
| 账本钉去重 | `packages/core/src/aggregate-omit-ledger-narration.ts` | 同名测试 | A2 |
| 子代理通知 | `packages/core/src/quiet-subagent-notifications.ts` | — | A7 |
| 看门狗策略 | `packages/core/src/host-watchdog.ts` | 同名单测 + 不变量测试 | B（可选真机） |
| 首次配置与 passthrough 迁移 | `packages/core/src/config-seed.ts`、`packages/core/config/default-display-config.json` | `config-seed.test.ts` | 阶段 4 配置核对 |
| 配置落盘路径 | `packages/core/src/agent-dir.ts` | — | 阶段 4 |
| 账本布局与 open elapsed | `vendor/pi-extensions/packages/pi-tool-display-intent` | 无（submodule） | A1 / A3 |
| 依赖 pin、子模块 SHA | `packages/core/package.json`、`.gitmodules`、`git submodule status` | `update:upstream:check` | D1 / D2 / D3 |
| 测试运行期解析 | `packages/core/tsconfig.json`、`packages/core/src/tsconfig.test.json` | `npm test` 本身 | — |

> 本表与 `AGENTS.md` 的 **Testing checklist (manual)** 是同一套观测面的两种视角：那份是清单，这份带执行节奏与判据。改动新增观测面时，**两边都要补**。

---

## 本 skill 不做什么

- 不做全面代码审计（转 `code-review-report`）。
- 不做上线放行判断（转 `pre-release-gate`）。
- 不主张模块结构优化（转 `module-polish`）。
