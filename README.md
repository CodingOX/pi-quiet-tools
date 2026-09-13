# pi-quiet-tools

A single Pi extension package that makes the terminal quieter without taking anything away from the model.

`pi-quiet-tools` bundles two upstream layers behind one install: hash-anchored file editing (`pi-hashline-edit-pro`) and intent-aware tool rendering (`@zhcsyncer/pi-tool-display-intent`). On top of them it adds a thin glue layer that decides *what the terminal shows* — compact tool ledgers, live open rows, useful interim Markdown, and the final answer.

[简体中文](./README.zh-CN.md)

## What it combines

| Package | Responsibility |
| --- | --- |
| [pi-hashline-edit-pro](https://github.com/YuGiMob/pi-hashline-edit-pro) | Hash-anchored `read`, `replace`, `insert`, `undo_last_change`, and `anchor_grep` for the model |
| [@zhcsyncer/pi-tool-display-intent](https://github.com/zhcsyncer/pi-extensions/tree/main/packages/pi-tool-display-intent) | Tool renderers, result compaction, diffs, custom/MCP tool decoration, and Tools ledgers |
| `packages/core` | Load order, duplicate guards, quiet renderers, narration handling, and compact subagent notifications |

`vendor/pi-extensions` is a git submodule pinned to a fork of the display-intent repository. Display-intent feature work belongs in that submodule; the parent package stays thin glue.

Install this repository as **one** extension. Do not also install `pi-hashline-edit-pro` or `@zhcsyncer/pi-tool-display-intent` — Pi would register the same tools twice.

## The quiet contract

**Rendering changes; execution and model context do not.** The model still receives full hashline anchors, `replace` semantics, complete tool results, and the whole session. Quiet rendering only changes what the terminal draws.

Three claims define what "quiet" means here. Each one has an accepted decision record:

**1. Signal over transcript.** Tool activity collapses into a *Tools ledger* — a header, at most three Open rows, and a receipt. File bodies and hashline anchors never leak into the transcript view. Applied `replace` / `insert` calls are the exception: they show a truncated +/- snippet, not the whole file. `Ctrl+O` is always available when you do want the full call list.

**2. An open ledger must look alive.** A running phase shows a live mark and a ticking elapsed time, and keeps up to three *Open rows*: pending and running calls take slots first, then the most recently completed calls. Silent tools (`read`, `undo_last_change`, `anchor_grep`) share those rows instead of holding a private live pin, so a long `bash` is never hidden behind a `read`.
**3. Narration stays.** Mid-turn assistant Markdown is real content, so it remains visible and ends the current tool phase. Thinking placeholders and structured control noise are removed from terminal narration.

Read the decisions and the shared vocabulary:

- [`docs/adr/0001-open-ledger-liveness.md`](./docs/adr/0001-open-ledger-liveness.md) — why open ledgers tick and where that rendering lives
- [`docs/adr/0002-silent-tools-share-open-rows.md`](./docs/adr/0002-silent-tools-share-open-rows.md) — why glue stopped re-counting the three-row window
- [`docs/adr/0003-ui-host-watchdog.md`](./docs/adr/0003-ui-host-watchdog.md) — why the runaway gate lives in glue and only applies to the UI host
- [`CONTEXT.md`](./CONTEXT.md) — glossary: Tools ledger, open ledger, settled ledger, Open rows, silent tool, visible edit tool, open elapsed, ledger receipt
- [`docs/local-overlay.md`](./docs/local-overlay.md) — what this repo added, changed, and optimized on top of the two upstreams
- [`docs/upstream-sync.md`](./docs/upstream-sync.md) — evaluated state of both upstream dependencies, and what a sync would break

## Terminal behavior

With the default `pi-quiet-tools` seed configuration:

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

The headline is the ledger header (`✓` settled, `◐` still running, `!` something failed, followed by call/turn counts and a per-tool breakdown). A running ledger adds its elapsed time right after the counts; an open ledger may show up to three Open rows; a settled one replaces them with a receipt (`took … · tok ↑… ↓… · at …`). A later assistant turn with more tools gets its own ledger, positioned after that turn's Markdown.
Default bundle policy:

- `per-turn` Tools ledger: consecutive tool-only assistant messages stay in one ledger; visible assistant Markdown or a mid-turn steer starts the next tool phase.
- Intent fields are disabled by default in the bundle. The upstream extension can still render deterministic tool metadata.
- Result mode is `summary`; `read`, `undo_last_change`, and `anchor_grep` stay quiet while their counts remain in the ledger. `replace` and `insert` stay outside the ledger and show a truncated +/- snippet (about 6 change lines). `anchor_grep` is the anchored search that replaces the built-in `grep`; its hits already carry anchors, so an edit can be made without a separate `read`.
- `Agent` keeps its native renderer. `edit` is also kept outside the quiet ledger by the seeded passthrough configuration.
- Interim assistant Markdown remains visible; thinking placeholders and structured/control noise are removed from terminal narration.
- Subagent completion notices use one compact status line when this extension loads before `@tintinweb/pi-subagents`; transcript paths and result-preview metadata are not shown.

`Ctrl+O` exposes the grouped original tool timeline. Silent tools still do not dump file bodies; expanded `replace` / `insert` restore hashline's native preview.

## Usage

There is nothing to switch on: the extension is active as soon as Pi loads it. This section covers checking that it worked, reading what it draws, and changing its behavior.

### Verify the install in 60 seconds

Run `/reload` (or restart Pi), then confirm three things:

1. **Pi sees one package.**

   ```bash
   pi list
   ```

   If `pi-hashline-edit-pro` or `@zhcsyncer/pi-tool-display-intent` also appear as standalone entries, remove them first.

2. **Tools are hash-anchored.** Ask the model to read a file. Each line should come back as `anchor│content`:

   ```text
   Dafo│# pi-quiet-tools
   ```

   No anchors means the hashline layer did not load.

3. **Tools are aggregated.** Ask for something that triggers several tool calls in one turn. You should get **one** Tools ledger with a `×N` breakdown — not one transcript block per call, and never a `Read(path)` body dump.

You can also inspect the effective display settings any time with `/tool-display-intent`.

### Reading a ledger

| You see | It means |
| --- | --- |
| `✓ Tools (…)` | The tool phase is settled. Header and receipt only. |
| `◐ Tools (…) · 7s` | Still running. The elapsed time ticks so a long single tool never looks frozen. |
| `! Tools (…) · N failed` | Something in the phase failed; the expanded timeline shows which call. |
| `↳ 1 steer` | One or more steering messages landed inside this tool phase. |
| Rows starting with `◐` / `✓` | Open rows. Running and pending calls first, then the most recently completed calls, silent tools included. |
| `took … · tok ↑… ↓… · at …` | The receipt under a settled ledger. |

Two things deliberately do **not** appear in a ledger: the `›` in-progress narration pin, because that same prose is already rendered as ordinary Markdown above; and the per-call `Read(path)` rows for silent tools.

`Ctrl+O` expands the grouped original timeline — one row per call with its target and status — and collapses it again. Use it when the ledger is too coarse; you do not need it in normal use.

### Changing behavior

`/tool-display-intent` opens the display settings panel: layout, result mode, diff rendering, tool ownership, and which tools stay in the ledger. Settings persist to:

```text
~/.pi/agent/extension-data/pi-tool-display-intent/config.json
```

`replace` and `insert` stay in `tools.passthrough` so their truncated diffs can paint. Adding `read` there brings back individual Read rows; startup migration strips silent hashline names again. To add another high-signal tool that must stay outside the ledger, add its name there.

Changing tool ownership, layout, intent schema, or call-frame decoration requires `/reload`. Delete the config file and reload Pi to recreate the bundle defaults.

If you set `PI_CODING_AGENT_DIR`, all of the above resolves against that directory instead of `~/.pi/agent`.

### Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `Tool "read" conflicts with …` at startup | Two hashline providers are loaded. This is Pi's own diagnostic and it does not block startup, so the session still runs. Remove the standalone `pi-hashline-edit-pro` entry from `packages`. |
| Per-call `Read(path)` rows appear next to a ledger | A silent hashline tool name is in `tools.passthrough`. Remove it; startup migration normally does this for you. Truncated `replace` / `insert` snippets beside the ledger are expected. |
| Subagent completion notices are still verbose | `@tintinweb/pi-subagents` is loading before this extension. Pi picks the first registered renderer for a custom message type, so this one has to come first. |
| `Failed to load extension: ENOENT … prompts/undo-last-replace.md`, or `Cannot find module … /file-type/index.js` | Pi was started **before** a dependency was replaced on disk. jiti's module-resolution cache lives for the whole process, so `/reload` cannot clear it. The error names a file that only the *previous* version had (`undo-last-replace.md` in hashline 2.6.1; the root `index.js` entry in file-type 21.3.4). **Restart Pi** — a new process resolves everything correctly. |
| Nothing looks different | Run `/reload`. If it still looks unchanged, confirm the config file exists and that only one package is installed. |

## Install

### From GitHub

```bash
pi install git:github.com/CodingOX/pi-quiet-tools
```

The `https://github.com/CodingOX/pi-quiet-tools` form works the same way. The repository runs `scripts/init-submodule.sh` as its `preinstall` step, so the `vendor/pi-extensions` submodule is cloned and checked out at the pinned commit as part of the install — you do not need `--recurse-submodules`.

`github:CodingOX/pi-quiet-tools` is **not** a Pi package source; Pi only recognizes the `git:` prefix or a protocol URL.

> [!WARNING]
> Do not run `pi install npm:pi-quiet-tools`. This repository is not published to npm, and an **unrelated** package already owns that name. Pi would install a different tool that has nothing to do with this one.

### From a local checkout

```bash
git clone git@github.com:CodingOX/pi-quiet-tools.git
cd pi-quiet-tools
npm run submodule:init
npm install
pi install /absolute/path/to/pi-quiet-tools
```

After installing, restart Pi or run `/reload`.

### Remove previous standalone installs

If the upstream extensions were installed separately, remove them from `~/.pi/agent/settings.json` or the project `.pi/settings.json`, then keep only `pi-quiet-tools` in `packages`:

```bash
pi remove npm:pi-hashline-edit-pro
pi remove npm:@zhcsyncer/pi-tool-display-intent
```

### Updating

`pi update` refetches this repository and re-runs its install, which re-initializes the submodule at the commit pinned by the new revision. The submodule's own branch is not tracked — you get exactly the SHA committed here.

For a local checkout, pull and reinstall:

```bash
git pull
npm install
```

## Configuration

On first load, the glue writes this file when it does not already exist:

```text
~/.pi/agent/extension-data/pi-tool-display-intent/config.json
```

The seeded bundle configuration is intentionally different from the standalone display-intent defaults:

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

Existing configuration is not overwritten. Startup migration strips silent hashline names — including the retired `undo_last_replace` — from legacy `tools.passthrough` entries and restores `Agent`, `replace`, and `insert`, so reads stay aggregated while edits can show a truncated diff.

## Load order and safeguards

`packages/core/index.ts` installs the pieces in this order:

1. Seed or migrate display-intent configuration before importing the upstream module.
2. Install the `registerTool` hook and compact subagent notification renderer.
3. Load display-intent once, unless it is already active in the current Pi runtime.
4. Load hashline unconditionally. At extension-load time `pi.getAllTools()` throws, so the glue cannot probe whether hashline is already registered — see Troubleshooting for what actually catches a double install.
5. Apply minimal hashline renderers and the aggregate silent-tool/narration patches.
6. Refresh aggregate patches at `session_start` and `before_agent_start`.

Each display-intent runtime releases its prototype ownership, tool decorations, aggregate projection, and global state on `session_shutdown`. This matters for `/reload`, `/new`, `/resume`, `/fork`, and in-process child-agent lifecycles: one runtime cannot retain or overwrite another runtime's display state.

## Upstream updates

Read [`docs/upstream-sync.md`](./docs/upstream-sync.md) first. Both dependencies are pinned deliberately, and a sync can fail silently in ways the terminal will not report.
Held in the `vendor/pi-extensions` submodule:

```bash
npm run submodule:init
npm run sync:display-intent
```

Commit the resulting submodule SHA in this repository, and push the fork branch from the submodule when appropriate:

```bash
git -C vendor/pi-extensions push origin HEAD
```

Hashline stays an npm dependency:

```bash
npm run update:upstream:check
npm run update:upstream
```

After an upstream update:

```bash
npm run typecheck
npm test
```

Then restart Pi. `/reload` is not enough after a hashline bump.

## Requirements

- Pi coding agent >= 0.84 (`@earendil-works/pi-coding-agent`); developed and verified against 0.85.x. This floor comes from `pi-hashline-edit-pro` 4.x.
- Node.js >= 22.19, as required by both Pi and `pi-hashline-edit-pro`
- An interactive terminal session. The quiet ledger is a terminal renderer.

## License

MIT
