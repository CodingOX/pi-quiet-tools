# pi-quiet-tools

Glue extension for [Pi coding agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent). It combines two upstream packages into one install, with a **quiet tool UI**: you see that tools ran, not what they did.

| Upstream | Role |
|---|---|
| [pi-hashline-edit-pro](https://github.com/YuGiMob/pi-hashline-edit-pro) | Hash-anchored `read` / `replace` / `undo_last_replace` for the **model** |
| [@zhcsyncer/pi-tool-display-intent](https://github.com/zhcsyncer/pi-extensions/tree/main/packages/pi-tool-display-intent) | Aggregate Tools ledger and compact result modes for the **terminal** |

This repo does **not** fork or vendor upstream code. It only wires them together and applies opinionated display defaults.

## What you get

**In the terminal (human view):**

```text
✓ Tools (19 calls · 6 turns) · read ×9 · bash ×3 · ls ×2
  took 39s · tok ↑79k ↓1.2k · at 2026-08-18 23:15:19

[Assistant answer — the part you actually care about]
```

**Under the hood (agent view):** full hashline anchors, replace diffs, and tool results still reach the model unchanged.

Default UI policy:

- **Aggregate** Tools ledger (one block per turn)
- **Intent off** (`displaySummary` disabled)
- **Summary mode** for grep / bash / write / etc.
- **Silent** `read` / `replace` / `undo_last_replace` rows (counts only in the ledger)

## Install

Install **only this package**. Do not also install the two upstream extensions separately — that registers `read` twice and Pi will error.

```bash
# GitHub (Pi uses git:, not github:)
pi install git:github.com/CodingOX/pi-quiet-tools
pi install https://github.com/CodingOX/pi-quiet-tools

# Local checkout
pi install /path/to/pi-quiet-tools
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

## Update upstream dependencies

`pi install` / `pi update` updates **this glue package only**. It does **not** automatically bump nested upstream versions inside `node_modules`.

From the repo root:

```bash
# Bump within ^ ranges in package.json (usual workflow)
npm run update:upstream

# Pin both packages to npm latest and refresh lockfile
npm run update:upstream:latest

# Compare installed vs npm latest without changing anything
npm run update:upstream:check
```

After updating, reload Pi (`/reload`).

If an upstream ships a **breaking major** version, this glue may need a code change — bumping `npm update` alone is not always enough.

## Configuration

On first run, if no display-intent config exists, defaults are written to:

`~/.pi/agent/extension-data/pi-tool-display-intent/config.json`

Existing configs are **not** overwritten. The glue migrates legacy passthrough entries (`read`, `replace`, `undo_last_replace`) on startup.

To reset to glue defaults: delete that config file and reload Pi.

Tweak display later with Pi's `/tool-display-intent` command (layout, result mode, etc.). Some changes require `/reload`.

## How it works (short)

1. Seed / migrate display-intent config (aggregate + minimal passthrough).
2. Hook `pi.registerTool` so hashline tools get silent renderers.
3. Load display-intent, then hashline (skip either if already loaded).
4. Patch aggregate rendering so hashline tool rows stay hidden.

Load order and duplicate detection matter — see [AGENTS.md](./AGENTS.md) if you hack on this repo.

## Requirements

- Node.js ≥ 20
- Pi coding agent ≥ 0.80 (`@earendil-works/pi-coding-agent`)

## License

MIT
