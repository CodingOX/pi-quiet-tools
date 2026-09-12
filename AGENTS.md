# AGENTS.md — pi-quiet-tools

Guidance for humans and coding agents working in this repository.

## What this project is

**pi-quiet-tools** is a workspace that ships one Pi extension:

1. **`packages/core`** (`@pi-quiet-tools/core`) — glue: load order, silent UI, interim Markdown.
2. **`vendor/pi-extensions`** — git submodule of [CodingOX/pi-extensions](https://github.com/CodingOX/pi-extensions), tracking [zhcsyncer/pi-extensions](https://github.com/zhcsyncer/pi-extensions). Display-intent source lives here.
3. **pi-hashline-edit-pro** — still an npm dependency (execution layer).

Design goal: **minimal terminal noise**. Users should see small per-turn tool counts, mid-turn assistant Markdown, and the final answer — not per-call file contents or hashline output.

Do not copy upstream files into `packages/core`. Display-intent changes go in the submodule (then PR to zhcsyncer). Glue stays thin.

## Architecture

```text
pi-quiet-tools/
  packages/core/                 Pi extension entry (glue)
  vendor/pi-extensions/          submodule → CodingOX fork (upstream remote = zhcsyncer)
  package.json                   workspace root; pi.extensions → packages/core/index.ts

packages/core/index.ts
  ├─ config-seed.ts              First-run default config + passthrough migration
  ├─ register-tool-hook.ts       Wrap registerTool; silent renderCall/renderResult
  ├─ aggregate-silent-tools.ts   Swallow non-ledger silent renders; collapsed ledger passes through
  ├─ aggregate-keep-narration.ts Keep interim assistant Markdown
  ├─ upstream-loader.ts          display-intent duplicate guard (hashline guard removed — see below)
  └─ imports + invokes upstream default exports in order:
       1. installRegisterToolHook
       2. toolDisplayIntentExtension(pi)
       3. hashlineExtension(pi)   (unconditional)
       4. applyMinimalUiToHashlineTools
       5. installAggregateUiPatches
```

### Critical invariants

1. **Single extension entry** — Root `package.json` lists `./packages/core/index.ts` under `pi.extensions`. Do not add hashline or display-intent to the user's Pi `packages` list separately.

2. **No double hashline** — Glue calls `hashlineExtension` unconditionally, because at extension-load time `pi.getAllTools()` throws (`notInitialized`) so the status cannot be probed. The protections are external: Pi dedupes extensions by path, a genuine double install surfaces as a non-fatal `Tool "read" conflicts with ...` diagnostic, and README/AGENTS forbid installing hashline standalone. Do **not** reintroduce a `getAllTools()` guard — the reasoning lives in `packages/core/src/upstream-loader.ts`.

3. **Load order is load-bearing** — display-intent and hashline both register tools from the *same* extension factory, so Pi sees no conflict and the later registration wins the name. display-intent re-registers the builtins (`read`, `grep`, `find`, `ls`, `write`, `bash`) with builtin descriptions; hashline then registers its own `read` that returns `anchor│content`. Swapping steps 2 and 3 makes the model silently receive un-anchored file content while `read` still looks normal — no error anywhere. `tests/hashline-contract.test.ts` locks the order.

4. **Passthrough vs aggregate** — Putting `read` in display-intent `tools.passthrough` causes **individual Read rows** in the UI. Default config passthrough is only `Agent` and `edit`. Glue migrates away legacy passthrough of hashline tool names.

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

After updates: `npm run typecheck`, then Pi `/reload`.

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

## Testing checklist (manual)

1. Only `pi-quiet-tools` in Pi `packages` — no standalone hashline or display-intent.
2. User prompt triggers multiple `read` calls in one assistant turn → collapsed open ledger shows `Tools (...)` plus up to 3 Open rows (pending/running take slots first; leftover slots are recent done, including silent tools); no hashline per-file bodies. After settle, header + receipt only.
3. A later assistant turn with more tools gets its **own** Tools ledger after that turn's Markdown, not one block pinned at the bottom.
4. Mid-turn assistant prose (text before `toolUse`) stays visible as Markdown; thinking stays hidden.
5. `replace` and `insert` still work for the agent (hashline behavior unchanged). `anchor_grep` is the active search tool; the built-in `grep` is disabled while it is on.
6. `/reload` does not duplicate tools or lose silent UI / narration.
7. Existing display-intent config: passthrough migration strips every name in `HASHLINE_TOOL_NAME_SET` (current plus retired, e.g. `undo_last_replace`) and restores `Agent`, so subagent dispatch stays outside the quiet Tools ledger. Layout stays as saved (`aggregate` vs `per-turn`). Add more high-signal names to `QUIET_UI_PASSTHROUGH_KEEP` in `config-seed.ts`.

## Where hashline tool names live

`packages/core/src/hashline-tools.ts` is the single source of truth for the tool names `pi-hashline-edit-pro` registers. Four glue modules read it: the silent set, passthrough migration, duplicate-load detection, and the minimal-UI list. When upstream renames or adds a tool, edit that one file and update its tests — do not re-scatter the names.

## Naming

Public name: **pi-quiet-tools** (GitHub repo and Pi install). Workspace package: **`@pi-quiet-tools/core`**.

## Commits

Keep core commits focused. Submodule SHA bumps are separate from glue changes. Display-intent feature work is committed on the fork, then the parent repo updates the SHA.
