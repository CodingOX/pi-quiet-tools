# AGENTS.md — pi-quiet-tools

Guidance for humans and coding agents working in this repository.

## What this project is

**pi-quiet-tools** is a workspace that ships one Pi extension:

1. **`packages/core`** (`@pi-quiet-tools/core`) — glue: load order, silent UI, interim Markdown, UI-host watchdog.
2. **`vendor/pi-extensions`** — git submodule of [CodingOX/pi-extensions](https://github.com/CodingOX/pi-extensions), tracking [zhcsyncer/pi-extensions](https://github.com/zhcsyncer/pi-extensions). Display-intent source lives here.
3. **pi-hashline-edit-pro** — still an npm dependency (execution layer).

Design goal: **minimal terminal noise**. Users should see small per-turn tool counts, truncated edit diffs, mid-turn assistant Markdown, and the final answer — not per-call file reads or hashline anchors.

Do not copy upstream files into `packages/core`. Display-intent changes go in the submodule (then PR to zhcsyncer). Glue stays thin.

What this repo added, changed, and optimized on top of the two upstreams is recorded in [`docs/local-overlay.md`](./docs/local-overlay.md). Update that file in the same change when glue or the fork gains, loses, or reclassifies a behaviour. Do not copy that inventory into this file, `CONTEXT.md`, or the README.

| Need | Read |
| --- | --- |
| Shared vocabulary | `CONTEXT.md` |
| Why a behaviour exists | `docs/adr/` |
| Overlay vs upstream | `docs/local-overlay.md` |
| Pins and sync landmines | `docs/upstream-sync.md` |
| How to work here | this file |

## Architecture

```text
pi-quiet-tools/
  packages/core/                 Pi extension entry (glue)
  vendor/pi-extensions/          submodule → CodingOX fork (upstream remote = zhcsyncer)
  package.json                   workspace root; pi.extensions → packages/core/index.ts

packages/core/index.ts
  ├─ config-seed.ts              First-run default config + passthrough migration
  ├─ register-tool-hook.ts       Wrap registerTool; silent read/search, compact replace/insert
  ├─ compact-edit-ui.ts          Truncated +/- preview for visible edits
  ├─ quiet-subagent-notifications.ts  Compress subagent completion notifications
  ├─ host-watchdog.ts            UI-host bash/wall-clock runaway gate
  ├─ aggregate-silent-tools.ts   Swallow non-ledger silent renders; collapsed ledger passes through
  ├─ aggregate-keep-narration.ts Keep interim assistant Markdown
  ├─ upstream-loader.ts          display-intent duplicate guard (hashline guard removed — see below)
  └─ imports + invokes in order:
       1. installRegisterToolHook
       2. installQuietSubagentNotificationRenderer
       3. installHostWatchdog
       4. toolDisplayIntentExtension(pi)
       5. hashlineExtension(pi)   (unconditional)
       6. applyMinimalUiToHashlineTools
       7. installAggregateUiPatches
```

### Critical invariants

1. **Single extension entry** — Root `package.json` lists `./packages/core/index.ts` under `pi.extensions`. Do not add hashline or display-intent to the user's Pi `packages` list separately.

2. **No double hashline** — Glue calls `hashlineExtension` unconditionally, because at extension-load time `pi.getAllTools()` throws (`notInitialized`) so the status cannot be probed. The protections are external: Pi dedupes extensions by path, a genuine double install surfaces as a non-fatal `Tool "read" conflicts with ...` diagnostic, and README/AGENTS forbid installing hashline standalone. Do **not** reintroduce a `getAllTools()` guard — the reasoning lives in `packages/core/src/upstream-loader.ts`.

3. **Load order is load-bearing** — display-intent and hashline both register tools from the *same* extension factory, so Pi sees no conflict and the later registration wins the name. display-intent re-registers the builtins (`read`, `grep`, `find`, `ls`, `write`, `bash`) with builtin descriptions; hashline then registers its own `read` that returns `anchor│content`. Swapping steps 4 and 5 makes the model silently receive un-anchored file content while `read` still looks normal — no error anywhere. `tests/hashline-contract.test.ts` locks the order.

4. **Passthrough vs aggregate** — Putting `read` in display-intent `tools.passthrough` causes **individual Read rows** in the UI. Default passthrough is `Agent`, `replace`, `insert`, and leftover `edit`. Glue migrates away silent hashline names (`read`, `undo_last_change`, `anchor_grep`, retired `undo_last_replace`) and restores the visible-edit names so truncated diffs can actually paint.

5. **Config before display-intent import** — `config-seed.ts` runs as a side effect on import **before** `@zhcsyncer/pi-tool-display-intent` loads, because that package reads config at module init.

6. **Aggregate patch timing** — `installAggregateSilentToolsPatch` runs on load and on `session_start` / `before_agent_start`, after display-intent installs its aggregate prototype patch.

7. **Submodule, not vendored files** — `vendor/pi-extensions` is a git submodule. Parent repo commits the SHA only. Display-intent code is pushed on the fork, not flattened into core.

## What to change vs what not to change

| Do in `packages/core` | Do in `vendor/pi-extensions` | Do on npm |
| --- | --- | --- |
| Load order, duplicate guards, silent UI patches | Hashline is not here | Hashline releases |
| Default display-intent config / migration | display-intent features, new layouts | — |
| Workspace scripts | Fork PRs back to zhcsyncer | — |

Avoid editing files under `node_modules/`.

## Dependencies

- `@zhcsyncer/pi-tool-display-intent` → `file:../../vendor/pi-extensions/packages/pi-tool-display-intent`
- `pi-hashline-edit-pro` → npm, **pinned exactly** (`4.2.5`). Never widen this to a `^` range: at the previous pin, `^2.6.1` resolved to 2.8.4, which had already renamed `undo_last_replace` to `undo_last_change`, so a plain `npm update` silently broke the glue. See `docs/upstream-sync.md`.

```bash
npm run submodule:init          # clone submodule + add `upstream` remote
npm run sync:display-intent     # rebase fork branch onto zhcsyncer/main
npm run update:upstream:check   # show hashline npm + submodule SHA
npm run update:upstream         # fetch submodule remotes + bump hashline in range
```

After updates: `npm run typecheck`, then restart Pi (`/reload` is not enough after a hashline bump).

## Development

```bash
git clone --recurse-submodules git@github.com:CodingOX/pi-quiet-tools.git
cd pi-quiet-tools
npm run submodule:init
npm install
npm run typecheck
pi install /absolute/path/to/this/repo
```

If you already cloned without submodules: `npm run submodule:init`.

Typecheck uses stub declarations (`packages/core/src/upstream.d.ts`) because upstream TypeScript sources do not typecheck under our strict config.

**Tests run with their own tsconfig** (`packages/core/src/tsconfig.test.json`, wired into the core `test` script). `tsx` treats a tsconfig's `paths` as a **runtime** resolution map, so a tsc-only stub alias — especially a **subpath** alias such as `pi-hashline-edit-pro/src/edit-common.ts` — makes the real dependency resolve to a `.d.ts` and tests fail with `does not provide an export named ...`. Keep `paths` in sync between `tsconfig.json` and `tsconfig.test.json`; never re-add a subpath alias to the test config.

## Change closeout gate

Any change to `packages/core`, `vendor/pi-extensions`, the workspace scripts, or the dependency pins is **not done until it has been verified on a reloaded runtime**. Run the `quiet-tools-verify` skill (`.pi/skills/quiet-tools-verify/SKILL.md`) as the closeout pipeline: change inventory → static gate → wiring assertions → user reload → load confirmation → visual walkthrough → closeout verdict.

Two rules that make that pipeline possible:

1. **Never call `/reload` yourself.** Reload terminates the running turn, so the agent cannot continue past it. Stop at the handoff card and let the user reload.
2. **Never report runtime behaviour as verified without the user's confirmation.** Static checks (typecheck, unit tests, reachability) are the agent's; terminal appearance is the user's.

The skill defers to the manual checklist below for what to look at, and adds the execution order, gates, and failure signatures. When a change introduces a new observable surface, extend both.

## Testing checklist (manual)

1. Only `pi-quiet-tools` in Pi `packages` — no standalone hashline or display-intent.
2. User prompt triggers multiple `read` calls in one assistant turn → collapsed open ledger shows `Tools (...)` plus up to 3 Open rows (pending/running take slots first; leftover slots are recent done, including silent tools); no hashline per-file bodies. After settle, header + receipt only.
3. A later assistant turn with more tools gets its **own** Tools ledger after that turn's Markdown, not one block pinned at the bottom.
4. Mid-turn assistant prose (text before `toolUse`) stays visible as Markdown; thinking stays hidden.
5. `replace` and `insert` show a truncated +/- snippet (about 6 change lines, stats on the header). `Ctrl+O` restores hashline's native preview. `anchor_grep` stays silent; the built-in `grep` is disabled while it is on.
6. `/reload` does not duplicate tools or lose silent UI / narration.
7. Existing display-intent config: passthrough migration strips silent hashline names (current plus retired, e.g. `undo_last_replace`) and restores `Agent`, `replace`, and `insert`. Layout stays as saved (`aggregate` vs `per-turn`). Add more high-signal names to `QUIET_UI_PASSTHROUGH_KEEP` in `config-seed.ts`.
8. UI host: 80 bash → nudge; after 10 more turns, later tools are blocked and the model is told to report current/next work in Chinese. Official assistant text (not thinking) in that turn resets bash and grace. Child sessions (`hasUI !== true`) are untouched. In-flight commands are not aborted. There is no request or grace wall-clock cap.

## Where hashline tool names live

`packages/core/src/hashline-tools.ts` is the single source of truth for the tool names `pi-hashline-edit-pro` registers, split into silent vs visible-edit. Glue reads those sets for the silent renderer, compact edit UI, passthrough migration, and duplicate-load tests. When upstream renames or adds a tool, edit that one file, classify the new name, and update its tests — do not re-scatter the names.

## Naming

Public name: **pi-quiet-tools** (GitHub repo and Pi install). Workspace package: **`@pi-quiet-tools/core`**.

## Commits

Keep core commits focused. Submodule SHA bumps are separate from glue changes. Display-intent feature work is committed on the fork, then the parent repo updates the SHA.
