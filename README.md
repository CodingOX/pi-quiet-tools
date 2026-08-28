# pi-quiet-tools

A single Pi extension package for a quieter terminal. It keeps the model-facing hashline tools and the display-intent renderer intact, while reducing terminal noise to compact tool ledgers, useful interim Markdown, and the final answer.

## What it combines

| Package | Responsibility |
| --- | --- |
| [pi-hashline-edit-pro](https://github.com/YuGiMob/pi-hashline-edit-pro) | Hash-anchored `read`, `replace`, and `undo_last_replace` for the model |
| [@zhcsyncer/pi-tool-display-intent](https://github.com/zhcsyncer/pi-extensions/tree/main/packages/pi-tool-display-intent) | Tool renderers, result compaction, diffs, custom/MCP tool decoration, and Tools ledgers |
| `packages/core` | Load order, duplicate guards, quiet renderers, narration handling, and compact subagent notifications |

`vendor/pi-extensions` is a git submodule containing the display-intent fork. Display-intent feature work belongs in that submodule; the parent package stays thin glue. Pi should load this repository as one extension only.

## Terminal behavior

With the default `pi-quiet-tools` seed configuration:

```text
I'll inspect the current glue layer first.

✓ Tools (9 calls · 1 turn) · read ×9

The read path is already silent. Next I'll tighten the aggregate wrap.

✓ Tools (3 calls · 1 turn) · bash ×3

[Assistant answer]
```

The model still receives full hashline anchors, replace semantics, tool results, and session data. Quiet rendering changes the terminal view, not tool execution or model context.

Default bundle policy:

- `per-turn` Tools ledger: consecutive tool-only assistant messages stay in one ledger; visible assistant Markdown or a mid-turn steer starts the next tool phase.
- Intent fields are disabled by default in the bundle. The upstream extension can still render deterministic tool metadata.
- Result mode is `summary`; `read`, `replace`, and `undo_last_replace` stay quiet while their counts remain in the ledger.
- `Agent` keeps its native renderer. `edit` is also kept outside the quiet ledger by the seeded passthrough configuration.
- Interim assistant Markdown remains visible; thinking placeholders and structured/control noise are removed from terminal narration.
- Subagent completion notices use one compact status line when this extension loads before `@tintinweb/pi-subagents`; transcript paths and result-preview metadata are not shown.

`Ctrl+O` exposes the grouped original tool timeline. It does not make silent tools dump file contents or diffs.

## Install

Install only this package. Do not install `pi-hashline-edit-pro` or `@zhcsyncer/pi-tool-display-intent` separately, otherwise Pi may register the same tools twice.

```bash
# Local checkout
git clone --recurse-submodules git@github.com:CodingOX/pi-quiet-tools.git
cd pi-quiet-tools
npm run submodule:init
npm install
pi install /absolute/path/to/pi-quiet-tools
```

```bash
# GitHub
pi install git:github.com/CodingOX/pi-quiet-tools
pi install https://github.com/CodingOX/pi-quiet-tools
```

`github:CodingOX/pi-quiet-tools` is not a Pi package source. This repository is not published to npm yet, so `pi install npm:pi-quiet-tools` does not work.

After installation, restart Pi or run `/reload`.

### Remove previous standalone installs

If the upstream extensions were installed separately, remove them from `~/.pi/agent/settings.json` or the project `.pi/settings.json`, then keep only `pi-quiet-tools` in `packages`:

```bash
pi remove npm:pi-hashline-edit-pro
pi remove npm:@zhcsyncer/pi-tool-display-intent
```

## Configuration

On first load, the glue writes this file when it does not already exist:

`~/.pi/agent/extension-data/pi-tool-display-intent/config.json`

The seeded bundle configuration is intentionally different from the standalone display-intent defaults:

```json
{
  "version": 2,
  "intent": { "enabled": false },
  "toolCalls": { "layout": "per-turn", "style": "compact" },
  "results": { "mode": "summary" },
  "diff": { "collapsedMode": "summary" },
  "tools": { "passthrough": ["Agent", "edit"] },
  "advanced": { "truncationHints": false }
}
```

Existing configuration is not overwritten. Startup migration removes `read`, `replace`, and `undo_last_replace` from legacy `tools.passthrough` entries and restores `Agent`, so hashline calls can remain aggregated and silent.

Use `/tool-display-intent` to inspect or change layout, result mode, ownership, and other display settings. Changes to tool ownership, layout, intent schema, or call-frame decoration require `/reload`. Delete the config file and reload Pi to recreate the bundle defaults.

## Load order and safeguards

`packages/core/index.ts` installs the pieces in this order:

1. Seed or migrate display-intent configuration before importing the upstream module.
2. Install the `registerTool` hook and compact subagent notification renderer.
3. Load display-intent once, unless it is already active in the current Pi runtime.
4. Load hashline once, unless `read` is already owned by an active hashline extension.
5. Apply minimal hashline renderers and the aggregate silent-tool/narration patches.
6. Refresh aggregate patches at `session_start` and `before_agent_start`.

Each display-intent runtime releases its prototype ownership, tool decorations, aggregate projection, and global state on `session_shutdown`. This matters for `/reload`, `/new`, `/resume`, `/fork`, and in-process child-agent lifecycles: one runtime cannot retain or overwrite another runtime's display state.

## Upstream updates

Display-intent is maintained in the `vendor/pi-extensions` submodule:

```bash
npm run submodule:init
npm run sync:display-intent
```

Commit the resulting submodule SHA in this repository, and push the fork branch from the submodule when appropriate:

```bash
git -C vendor/pi-extensions push origin HEAD
```

Hashline remains an npm dependency:

```bash
npm run update:upstream:check
npm run update:upstream
```

After an upstream update:

```bash
npm run typecheck
```

Then reload Pi.

## Requirements

- Node.js >= 20
- Pi coding agent >= 0.80 (`@earendil-works/pi-coding-agent`)

## License

MIT
