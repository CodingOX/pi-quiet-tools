# AGENTS.md — pi-quiet-tools

Guidance for humans and coding agents working in this repository.

## What this project is

**pi-quiet-tools** is a workspace that ships one Pi extension:

1. **`packages/core`** (`@pi-quiet-tools/core`) — glue: load order, silent UI, interim Markdown.
2. **`vendor/pi-extensions`** — git submodule of [CodingOX/pi-extensions](https://github.com/CodingOX/pi-extensions), tracking [zhcsyncer/pi-extensions](https://github.com/zhcsyncer/pi-extensions). Display-intent source lives here.
3. **pi-hashline-edit-pro** — still an npm dependency (execution layer).

Design goal: **minimal terminal noise**. Users should see aggregate tool counts, mid-turn assistant Markdown, and the final answer — not per-call file contents or hashline output.

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
  ├─ aggregate-silent-tools.ts   Hide read/replace/undo rows; keep Tools ledger host
  ├─ aggregate-keep-narration.ts Keep interim assistant Markdown
  ├─ upstream-loader.ts          Detect already-loaded upstream (avoid double register)
  └─ imports + invokes upstream default exports in order:
       1. installRegisterToolHook
       2. toolDisplayIntentExtension(pi)
       3. hashlineExtension(pi)   (skipped if hashline already active)
       4. applyMinimalUiToHashlineTools
       5. installAggregateUiPatches
```

### Critical invariants

1. **Single extension entry** — Root `package.json` lists `./packages/core/index.ts` under `pi.extensions`. Do not add hashline or display-intent to the user's Pi `packages` list separately.

2. **No double hashline** — If `read` is already owned by pi-hashline-edit-pro, glue must not call `hashlineExtension` again. Symptom: `Tool "read" conflicts with ... pi-hashline-edit-pro`.

3. **Passthrough vs aggregate** — Putting `read` in display-intent `tools.passthrough` causes **individual Read rows** in the UI. Default config passthrough is only `Agent` and `edit`. Glue migrates away legacy passthrough of hashline tool names.

4. **Config before display-intent import** — `config-seed.ts` runs as a side effect on import **before** `@zhcsyncer/pi-tool-display-intent` loads, because that package reads config at module init.

5. **Aggregate patch timing** — `installAggregateSilentToolsPatch` runs on load and on `session_start` / `before_agent_start`, after display-intent installs its aggregate prototype patch.

6. **Submodule, not vendored files** — `vendor/pi-extensions` is a git submodule. Parent repo commits the SHA only. Display-intent code is pushed on the fork, not flattened into core.

## What to change vs what not to change

| Do in `packages/core` | Do in `vendor/pi-extensions` | Do on npm |
|---|---|---|
| Load order, duplicate guards, silent UI patches | Hashline is not here | Hashline releases |
| Default display-intent config / migration | display-intent features, new layouts | — |
| Workspace scripts | Fork PRs back to zhcsyncer | — |

Avoid editing files under `node_modules/`.

## Dependencies

- `@zhcsyncer/pi-tool-display-intent` → `file:../../vendor/pi-extensions/packages/pi-tool-display-intent`
- `pi-hashline-edit-pro` → npm `^` range; lockfile pins the install

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
2. User prompt triggers multiple `read` calls → collapsed view still shows `✓ Tools (...)` with `read ×N`; no per-file Read rows.
3. Mid-turn assistant prose (text before `toolUse`) stays visible as Markdown; thinking stays hidden.
4. `replace` still works for the agent (hashline behavior unchanged).
5. `/reload` does not duplicate tools or lose silent UI / narration.
6. Existing display-intent config: passthrough migration removes `read` / `replace` / `undo_last_replace` if present.

## Naming

Public name: **pi-quiet-tools** (GitHub repo and Pi install). Workspace package: **`@pi-quiet-tools/core`**.

## Commits

Keep core commits focused. Submodule SHA bumps are separate from glue changes. Display-intent feature work is committed on the fork, then the parent repo updates the SHA.
