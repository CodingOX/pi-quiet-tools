# pi-tool-display-intent

[English](./README.md)

![收起的 Tools 账本](./assets/demo-aggregate-1.png)

`pi-tool-display-intent` 是 [`MasuRii/pi-tool-display`](https://github.com/MasuRii/pi-tool-display) 0.5.0 的维护 fork。它提供紧凑工具展示、结果和 diff 压缩，并可显示模型在正常 tool call 中写入的 `displaySummary`。它不会再次发起推理，也不需要额外 API Key。

```text
read docs/tax-code.pdf - 检查 Colorado 税法
$ pnpm test - 验证 extension 测试套件

* Read(docs/tax-code.pdf) - 检查 Colorado 税法
  loaded 42 lines
```

## 功能

- 为已接管的内置工具显示路径、命令、pattern、diff 和可选的模型意图。
- 支持紧凑和 Claude 风格的工具行，以及 compact、summary、preview 结果模式。
- 支持 `individual`、`aggregate` 和 `per-turn` 三种布局。
- 为写入和编辑操作提供可配置的 diff 布局与折叠摘要。
- 通过合作式 display API 支持 custom、MCP 和延迟加载工具。
- `Agent` 及不能安全聚合的工具继续使用原 renderer。

不要同时加载 `pi-tool-display`、`pi-tool-display-summary` 和本扩展。它们会注册同名内置工具。

## 安装

```bash
pi install npm:@zhcsyncer/pi-tool-display-intent
# 或安装 workspace bundle。
pi install npm:@zhcsyncer/pi-extensions
```

之后重启 Pi 或执行 `/reload`。

> 使用 [pi-quiet-tools](https://github.com/CodingOX/pi-quiet-tools) 时，只安装 `pi-quiet-tools`；不要再单独安装本扩展或 hashline 扩展。

## 使用

```text
/tool-display-intent
/tool-display-intent show
/tool-display-intent reset
/tool-display-intent layout individual
/tool-display-intent layout aggregate
/tool-display-intent layout per-turn
/tool-display-intent mode compact
/tool-display-intent mode summary
/tool-display-intent mode preview
```

修改工具 ownership、layout、intent schema 或 call-frame decoration 后需要 `/reload`。

## 布局

`individual` 是默认布局：每个工具保持独立的一行。

`aggregate` 将一次用户请求中符合条件的内置、custom、MCP 和延迟加载工具收进一个 Tools 账本。开放账本会显示已运行时间和当前活动；账本结束后只保留紧凑的收据。`Ctrl+O` 可展开原始时间线，不会倾倒文件内容或 diff。图片和 `Agent` 保持原 renderer。

`per-turn` 使用同一种账本，但连续的纯工具 assistant 消息会共用一本账。可见 assistant 正文或中途 steer 会结束当前工具阶段，下一次工具调用会开启新账本。

## 设置

打开 `/tool-display-intent`，或从 [`config/config.example.json`](./config/config.example.json) 开始配置。

| 配置 | 可选值或作用 |
| --- | --- |
| `intent.enabled` | 是否启用模型写入的 `displaySummary`；`language` 可为 `auto`、`zh-CN`、`en` |
| `toolCalls.layout` | `individual`、`aggregate`、`per-turn` |
| `toolCalls.style` | `compact`、`claude` |
| `results.mode` | `compact`、`summary`、`preview` |
| `results.previewRows` | 折叠状态显示的结果换行数 |
| `diff.layout` | `auto`、`split`、`unified` |
| `diff.collapsedMode` | `body` 预览或仅显示 `summary` 统计 |
| `tools.passthrough` | aggregate 布局中保留原 renderer 的工具 |
| `tools.custom` | custom 或 MCP 工具的 renderer 与结果模式配置 |

## 自定义工具

若要使用共享的 display API，请在 `pi.registerTool` 前包装 custom tool：

```ts
import {
  decorateToolForDisplay,
  withDisplaySummary,
} from "@zhcsyncer/pi-tool-display-intent/tool-display-api-consumer";
import { Type } from "typebox";

const tool = withDisplaySummary({
  name: "web_search",
  label: "Web Search",
  description: "Search the web.",
  parameters: Type.Object({
    query: Type.String(),
  }),
  async execute(_toolCallId: string, args: { query: string }) {
    return runSearch(args.query);
  },
}, {
  language: "auto",
  required: true,
});

pi.registerTool(decorateToolForDisplay(tool, {
  kind: "generic",
  outputMode: "inherit",
  overrideExistingRenderers: true,
}));
```

`kind` 支持 `generic` 和 `mcp`。custom 结果模式支持 `hidden`、`summary`、`preview`；`outputMode: "inherit"` 会跟随全局 `results.mode`。

## 许可证

MIT。见 [`LICENSE`](./LICENSE) 与 [`UPSTREAM_LICENSE`](./UPSTREAM_LICENSE)。
