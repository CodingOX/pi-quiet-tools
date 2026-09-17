# pi-tool-display-intent

[简体中文](./README.zh-CN.md)

![Collapsed Tools ledger](./assets/demo-aggregate-1.png)

`pi-tool-display-intent` is a maintained fork of [`MasuRii/pi-tool-display`](https://github.com/MasuRii/pi-tool-display) 0.5.0. It renders tools compactly, summarizes results and diffs, and optionally shows the model-written `displaySummary` from normal tool calls. It does not make a second inference request or need another API key.

```text
read docs/tax-code.pdf - Checking the Colorado tax code
$ pnpm test - Verifying the extension test suite

* Read(docs/tax-code.pdf) - Checking the Colorado tax code
  loaded 42 lines
```

## Features

- Shows paths, commands, patterns, diffs, and optional model intent for owned built-in tools.
- Supports compact and Claude-style tool rows, plus compact, summary, and preview result modes.
- Supports `individual`, `aggregate`, and `per-turn` layouts.
- Renders write and edit diffs with configurable layouts and collapsed summaries.
- Supports custom, MCP, and late-loaded tools through a cooperative display API.
- Keeps `Agent` and tools that cannot be safely aggregated on their original renderer.

Do not load `pi-tool-display`, `pi-tool-display-summary`, and this extension together. They register the same built-in tool names.

## Install

```bash
pi install npm:@zhcsyncer/pi-tool-display-intent
# Or install the workspace bundle.
pi install npm:@zhcsyncer/pi-extensions
```

Restart Pi or run `/reload` afterwards.

> When using [pi-quiet-tools](https://github.com/CodingOX/pi-quiet-tools), install only `pi-quiet-tools`; do not install this extension or a hashline extension separately.

## Use

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

Run `/reload` after changing tool ownership, layout, intent schema, or call-frame decoration.

## Layouts

`individual` is the default: each tool keeps its own row.

`aggregate` folds all eligible built-in, custom, MCP, and late-loaded tools in one user request into a single Tools ledger. An open ledger shows its elapsed time and current activity; once settled, it keeps only the compact receipt. `Ctrl+O` expands the original timeline without dumping file contents or diffs. Images and `Agent` keep their original renderers.

`per-turn` uses the same ledger, but consecutive tool-only assistant messages share one ledger. Visible assistant narration or a mid-turn steer ends that tool phase, so the next tool starts a new ledger.

## Settings

Open `/tool-display-intent`, or start from [`config/config.example.json`](./config/config.example.json).

| Setting | Values or behavior |
| --- | --- |
| `intent.enabled` | Enables model-written `displaySummary`; `language` is `auto`, `zh-CN`, or `en` |
| `toolCalls.layout` | `individual`, `aggregate`, or `per-turn` |
| `toolCalls.style` | `compact` or `claude` |
| `results.mode` | `compact`, `summary`, or `preview` |
| `results.previewRows` | Number of wrapped result rows shown while collapsed |
| `diff.layout` | `auto`, `split`, or `unified` |
| `diff.collapsedMode` | `body` preview or `summary` statistics only |
| `tools.passthrough` | Tools that retain their original renderer in aggregate layouts |
| `tools.custom` | Renderer and result-mode configuration for custom or MCP tools |

## Custom tools

Wrap a custom tool before `pi.registerTool` to use the shared display API:

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

`kind` supports `generic` and `mcp`. Custom result modes are `hidden`, `summary`, and `preview`; `outputMode: "inherit"` follows the global `results.mode`.

## License

MIT. See [`LICENSE`](./LICENSE) and [`UPSTREAM_LICENSE`](./UPSTREAM_LICENSE).
