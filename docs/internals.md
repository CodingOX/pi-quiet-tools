# Internals

How `pi-quiet-tools` is assembled, configured, and maintained. Read this if you are changing the glue,
syncing a vendored upstream, or debugging something the [README](../README.md) troubleshooting table
does not cover.

For the user-facing tour — what it looks like and how to change it — see the [README](../README.md)
or its [Chinese version](../README.zh-CN.md).

---

## What ships in the bundle

One `pi install` lands all five rows. The glue layer **is** this package; the rest are dependencies
carried inside it.

| Ships in the bundle | Responsibility |
| --- | --- |
| `index.ts` + `src/` — **this package's own glue** | Load order, duplicate guards, quiet renderers, narration handling, the compact edit UI, and configuration seeding |
| [pi-hashline-edit-pro](https://github.com/YuGiMob/pi-hashline-edit-pro) — vendored mirror | Hash-anchored `read`, `replace`, `insert`, `undo_last_change`, and `anchor_grep` for the model |
| [@zhcsyncer/pi-tool-display-intent](https://github.com/zhcsyncer/pi-extensions/tree/main/packages/pi-tool-display-intent) — vendored fork | Tool renderers, result compaction, diffs, custom/MCP tool decoration, and Tools ledgers |
| `@pi-quiet-tools/watchdog` | Bash runaway gate. Nudges after 80 bash calls, then blocks later tools so the model has to speak. |
| `@pi-quiet-tools/notify` | Compresses subagent completion notices to one status line. |

Both upstream layers are **vendored in this repository** rather than resolved from npm.
`vendor/hashline` is a read-only mirror of `pi-hashline-edit-pro`; `vendor/display-intent` is a fork of
`@zhcsyncer/pi-tool-display-intent` that carries local-only work. See
[`vendor/README.md`](../vendor/README.md) and [`THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md).

The bottom two rows are also real, independently publishable packages (neither is published yet).
Installing them alongside the bundle double-registers their event handlers, so they exist for the case
where you want the watchdog or the compact notices *without* the quiet ledger.

### How the bundle reaches a consumer

The root `package.json` declares the four bundled dependencies as `file:` paths and lists them under
`bundledDependencies`, so `npm pack` writes them as real files into `node_modules/` inside the tarball.

> [!IMPORTANT]
> **`file:` is required, not cosmetic.** `bundledDependencies` only picks up dependencies whose targets
> exist under the package's own `node_modules`. With a semver range, npm resolves a workspace package to
> a symlink and `npm pack` silently emits a tarball with **no** bundled deps.
>
> **Some transitive deps must be declared at the root.** `pi-hashline-edit-pro` needs `diff@^9` while the
> dev-only `@earendil-works/pi-coding-agent` needs `diff@8`. npm hoists the *conflicting* version into
> `vendor/hashline/node_modules/diff`, and `npm pack` then writes it to a path the bundled package cannot
> reach. Declaring `diff`, `file-type`, and `xxhash-wasm` in the root `dependencies` forces them to the
> top level where the bundle places them. If a hashline bump adds a runtime dependency, add it here too —
> the symptom is a `MODULE_NOT_FOUND` only on a consumer machine, never in this repo.

---

## The quiet contract

**Rendering changes; execution and model context do not.** The model still receives full hashline
anchors, `replace` semantics, complete tool results, and the whole session. Quiet rendering only
changes what the terminal draws.

Three claims define what "quiet" means here. Each one has an accepted decision record:

**1. Signal over transcript.** Tool activity collapses into a *Tools ledger* — a header, at most three
Open rows, and a receipt. File bodies and hashline anchors never leak into the transcript view. Applied
`replace` / `insert` calls are the exception: they show a truncated +/- snippet, not the whole file.
`Ctrl+O` is always available when you do want the full call list.

**2. An open ledger must look alive.** A running phase shows a live mark and a ticking elapsed time, and
keeps up to three *Open rows*: pending and running calls take slots first, then the most recently
completed calls. Silent tools (`read`, `undo_last_change`, `anchor_grep`) share those rows instead of
holding a private live pin, so a long `bash` is never hidden behind a `read`.

**3. Narration stays.** Mid-turn assistant Markdown is real content, so it remains visible and ends the
current tool phase. Thinking placeholders and structured control noise are removed from terminal
narration.

The ledger's left edge is aligned to prose by glue: Pi indents assistant text with `outputPad`, while
display-intent paints the `Tools` header at column 0. `aggregate-ledger-indent.ts` shifts ledger rows
right by one column, so the block reads as one unit instead of hanging a column to the left.

Decision records and the shared vocabulary:

- [`docs/adr/0001-open-ledger-liveness.md`](./adr/0001-open-ledger-liveness.md) — why open ledgers tick and where that rendering lives
- [`docs/adr/0002-silent-tools-share-open-rows.md`](./adr/0002-silent-tools-share-open-rows.md) — why glue stopped re-counting the three-row window
- [`docs/adr/0003-ui-host-watchdog.md`](./adr/0003-ui-host-watchdog.md) — why the runaway gate lives in glue and only applies to the UI host
- [`docs/adr/0004-child-session-watchdog.md`](./adr/0004-child-session-watchdog.md) — why child sessions get their own ledger and an `INCOMPLETE` handoff
- [`CONTEXT.md`](../CONTEXT.md) — glossary: Tools ledger, open ledger, settled ledger, Open rows, silent tool, visible edit tool, open elapsed, ledger receipt
- [`local-overlay.md`](./local-overlay.md) — what this repo added, changed, and optimized on top of the two upstreams

---

## Load order and safeguards

`index.ts` installs the pieces in this order. **The order is a contract, not a preference.**

1. Seed or migrate display-intent configuration before importing the upstream module.
2. Install the `registerTool` hook.
3. Install the watchdog and the compact subagent notification renderer (both from their own packages).
4. Load display-intent once, unless it is already active in the current Pi runtime.
5. Load hashline unconditionally. At extension-load time `pi.getAllTools()` throws, so the glue cannot
   probe whether hashline is already registered — a genuine double install is caught by Pi's own
   `Tool "read" conflicts with …` diagnostic instead.
6. Install the aggregate silent-tool/narration patches. Hashline silent/compact
   renderers are already applied when `registerTool` runs (step 2); there is no
   second `getAllTools()` rewrite after hashline loads.
7. Refresh aggregate patches at `session_start` and `before_agent_start`.

**Why the order matters.** display-intent and hashline both register tools from the *same* extension
factory, so Pi sees no conflict and the later registration wins the name. display-intent re-registers
the builtins with builtin descriptions; hashline then registers its own `read` that returns
`anchor│content`. Swapping them makes the model silently receive un-anchored file content while `read`
still looks normal — no error anywhere. `tests/hashline-contract.test.ts` locks the order.

Each display-intent runtime releases its prototype ownership, tool decorations, aggregate projection,
and global state on `session_shutdown`. This matters for `/reload`, `/new`, `/resume`, `/fork`, and
in-process child-agent lifecycles: one runtime cannot retain or overwrite another runtime's display
state.

### Where hashline tool names live

`src/hashline-tools.ts` is the single source of truth for the tool names `pi-hashline-edit-pro`
registers, split into silent vs visible-edit. Glue reads those sets for the silent renderer, compact
edit UI, passthrough migration, and duplicate-load tests. When upstream renames or adds a tool, edit
that one file, classify the new name, and update its tests — do not re-scatter the names.

---

## Configuration seeding and migration

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

Existing configuration is **not** overwritten. Startup migration strips silent hashline names —
including the retired `undo_last_replace` — from legacy `tools.passthrough` entries and restores
`Agent`, `replace`, and `insert`, so reads stay aggregated while edits can show a truncated diff.

If you set `PI_CODING_AGENT_DIR`, all of the above resolves against that directory instead of
`~/.pi/agent`.

---

## Upstream updates

Read [`upstream-sync.md`](./upstream-sync.md) first. Both vendored layers are held deliberately, and a
sync can fail silently in ways the terminal will not report.

```bash
npm run vendor:pull             # hashline is overwritten; display-intent is only reported
npm run vendor:pull -- --check  # report only, no writes
npm run vendor:pull -- --to 4.3.4 --force   # explicit hashline upgrade
```

> [!IMPORTANT]
> The two vendored layers are handled differently on purpose. `vendor/hashline` is a pure upstream
> snapshot, so syncing it is a directory-level overwrite. `vendor/display-intent` is a **fork** carrying
> local-only work, so the script refuses to touch it — merging upstream there is a manual rebase with
> three documented silent-failure points.

After a vendor sync, restart Pi. `/reload` is not enough after a hashline bump, because jiti's
module-resolution cache is process-wide.

---

## Development

```bash
git clone git@github.com:CodingOX/pi-quiet-tools.git
cd pi-quiet-tools
npm install
npm run typecheck
npm test
pi install /absolute/path/to/this/repo
```

No submodules, no `preinstall` hook. Cloning without `--recurse-submodules` is fine.

### Tests each run under their own tsconfig, and that is load-bearing

`tsx` treats a tsconfig's `paths` as a **runtime** resolution map. The root `tsconfig.json` needs stub
aliases for `tsc`, and that mapping is poison for tests: a stubbed `pi-hashline-edit-pro` resolves to a
`.d.ts`, and the contract test fails with `does not provide an export named 'default'`.

| Config | Used by | `paths` |
| --- | --- | --- |
| `tsconfig.json` | `npm run typecheck` | stubs, incl. the `src/edit-common.ts` subpath |
| `tsconfig.test.json` | glue tests | **none** — never re-add a subpath alias |
| `tests/tsconfig.test.json` | the hashline contract test | **none** — it must load the real vendored upstream |
| `packages/*/tsconfig.json` + `packages/*/tsconfig.test.json` | per-package gates | **none** — these packages have no upstream stubs |

Test configs belong at the package root, never inside `src/`: a config in `src/` becomes the "nearest
config" for every file beside it, overriding the package's real `baseUrl` and producing false
positives where `tsc` exits 0 but the editor shows red.

### Change closeout

Any change to `src/`, `packages/`, `vendor/`, the scripts, or the dependency graph is not done until it
has been verified on a **reloaded runtime**. `.pi/skills/quiet-tools-verify/SKILL.md` is the closeout
pipeline: change inventory → static gate → wiring assertions → user reload → load confirmation → visual
walkthrough → closeout verdict.

Two rules make that pipeline possible:

1. **Never call `/reload` yourself** — it terminates the running turn, so the agent cannot continue
   past it. Stop at the handoff card and let the user reload.
2. **Never report runtime behaviour as verified without the user's confirmation.** Static checks are
   the agent's; terminal appearance is the user's.

See [`../AGENTS.md`](../AGENTS.md) for the full contributor rules and the manual testing checklist.

---

## Deep troubleshooting

These are the cases the README table does not cover.

### `Failed to load extension: ENOENT … prompts/undo-last-replace.md`

Pi was started **before** a dependency was replaced on disk. jiti's module-resolution cache lives for
the whole process, so `/reload` cannot clear it — the error names a file that only the *previous*
version had. **Restart Pi**; a new process resolves everything correctly.

### `Cannot find module … /file-type/index.js`

Same root cause as above, different symptom: file-type 21.3.4 exposed a root `index.js` entry that a
later version removed. Restart Pi.

### `Tool "read" conflicts with …` at startup

Two hashline providers are loaded. This is Pi's own diagnostic and it does **not** block startup — all
extensions stay loaded and precedence follows load order, so the session still runs. Remove the
standalone `pi-hashline-edit-pro` entry from `packages`.

### `E_STORE_UNAVAILABLE`

No SQLite runtime could be loaded: the host exposes neither `node:sqlite` (Node 22.19+) nor
`bun:sqlite`. This is a hashline-side error, not a glue one — run Pi under Node, or a Bun build that
ships SQLite. (Hashline 4.2.5 and earlier could not degrade gracefully here at all; on those versions a
Bun host failed to load the entire extension.)
