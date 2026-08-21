# pi-quiet-tools

Glue extension for [Pi coding agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent). It combines two upstream packages into one install, with a **quiet tool UI**: you see that tools ran, not what they did.

| Upstream | Role |
|---|---|
| [pi-hashline-edit-pro](https://github.com/YuGiMob/pi-hashline-edit-pro) | Hash-anchored `read` / `replace` / `undo_last_replace` for the **model** |
| [@zhcsyncer/pi-tool-display-intent](https://github.com/zhcsyncer/pi-extensions/tree/main/packages/pi-tool-display-intent) | Aggregate Tools ledger and compact result modes for the **terminal** |

This repo is a small workspace: glue in `packages/core`, plus a **git submodule** of display-intent (`vendor/pi-extensions`, fork of zhcsyncer). Pi still gets **one** install. Do not add the two upstream packages to Pi separately.

## What you get

**In the terminal (human view):**

```text
I'll inspect the current glue layer first, then the display patch.

✓ Tools (9 calls · 1 turn) · read ×9

The read path is already silent. Next I'll tighten the aggregate wrap.

✓ Tools (3 calls · 1 turn) · bash ×3

[Assistant answer — the part you actually care about]
```

**Under the hood (agent view):** full hashline anchors, replace diffs, and tool results still reach the model unchanged.

Default UI policy:
- **Per-turn** Tools ledger (one small block per continuous tool phase)
- **Keep** mid-turn assistant Markdown (thinking stays hidden)
- **Intent off** (`displaySummary` disabled)
- **Summary mode** for grep / bash / write / etc.
- **Silent** `read` / `replace` / `undo_last_replace` rows (counts only in the ledger)
- **Native renderers** remain enabled for `Agent` and image results
- **Subagent completions** stay as one compact status line without a transcript path when `pi-quiet-tools` loads before `@tintinweb/pi-subagents`

With `per-turn`, consecutive tool-only assistant messages stay in the same ledger. Visible assistant Markdown or a mid-turn steer ends that phase; the next tool call starts a new ledger. Streaming updates of the same assistant message stay on the same ledger. `Ctrl+O` reveals the grouped one-line tool timeline, while silent tools still do not dump file contents or diffs.

## Install

Install **only this package**. Do not also install the two upstream extensions separately — that registers `read` twice and Pi will error.

```bash
# Local checkout (preferred while developing)
git clone --recurse-submodules git@github.com:CodingOX/pi-quiet-tools.git
cd pi-quiet-tools
npm run submodule:init
npm install
pi install /absolute/path/to/pi-quiet-tools
```

```bash
# GitHub (Pi uses git:, not github:)
pi install git:github.com/CodingOX/pi-quiet-tools
pi install https://github.com/CodingOX/pi-quiet-tools
```

`github:CodingOX/pi-quiet-tools` is **not** a Pi source. Without `git:` or an `https://` URL, Pi treats it as a local path.

This package is not published to npm yet. `pi install npm:pi-quiet-tools` will not work until it is.

Then `/reload` or restart Pi.

### If you previously installed upstream separately

Remove standalone packages from `~/.pi/agent/settings.json` (or project `.pi/settings.json`):

```bash
pi remove npm:pi-hashline-edit-pro
pi remove npm:@zhcsyncer/pi-tool-display-intent
```

Keep only `pi-quiet-tools` (or your local path) in `packages`.

## Update upstream

**display-intent** is `vendor/pi-extensions` (your fork; `upstream` remote is zhcsyncer).

```bash
npm run submodule:init          # first clone / add remotes
npm run sync:display-intent     # rebase current fork branch onto zhcsyncer/main
```

Then commit the new submodule SHA in this repo, and `git -C vendor/pi-extensions push origin HEAD`.

**hashline** is still npm:

```bash
npm run update:upstream:check
npm run update:upstream
```

## Configuration

On first run, if no display-intent config exists, defaults are written to:

`~/.pi/agent/extension-data/pi-tool-display-intent/config.json`

Existing configs are **not** overwritten. The glue migrates legacy passthrough entries (`read`, `replace`, `undo_last_replace`) on startup.

If your current config still has `toolCalls.layout: "aggregate"` (one ledger for the whole request), switch with `/tool-display-intent layout per-turn` then `/reload`, or delete the config file to re-seed glue defaults.

To reset to glue defaults: delete that config file and reload Pi.

Tweak display later with Pi's `/tool-display-intent` command (layout, result mode, etc.). Some changes require `/reload`.

## How it works (short)

1. Seed / migrate display-intent config (per-turn ledger + minimal passthrough).
2. Hook `pi.registerTool` so hashline tools get silent renderers.
3. Load display-intent, then hashline (skip either if already loaded).
4. Patch aggregate rendering so hashline tool rows stay hidden, and interim assistant Markdown stays visible.
5. When loaded before `@tintinweb/pi-subagents`, replace its completion renderer with compact status-only notifications.

Load order and duplicate detection matter — see [AGENTS.md](./AGENTS.md) if you hack on this repo.

## Requirements

- Node.js ≥ 20
- Pi coding agent ≥ 0.80 (`@earendil-works/pi-coding-agent`)

## License

MIT
