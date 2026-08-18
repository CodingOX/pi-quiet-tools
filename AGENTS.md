# AGENTS.md — pi-quiet-tools

Guidance for humans and coding agents working in this repository.

## What this project is

**pi-quiet-tools** is a thin **glue extension** for Pi. It orchestrates:

1. **pi-hashline-edit-pro** — execution layer (`read` with hash anchors, `replace`, `undo_last_replace`; disables built-in `edit`).
2. **@zhcsyncer/pi-tool-display-intent** — presentation layer (aggregate Tools ledger, result compaction).

Design goal: **minimal terminal noise**. Users should see aggregate tool counts and assistant answers, not per-call file contents or hashline output.

This repo must stay small. Do not copy upstream source here. Depend on npm packages and glue at the boundaries.

## Architecture

```text
pi-quiet-tools/index.ts
  ├─ config-seed.ts          First-run default config + passthrough migration
  ├─ register-tool-hook.ts   Wrap registerTool; silent renderCall/renderResult
  ├─ aggregate-silent-tools.ts  Hide read/replace/undo rows in aggregate ledger
  ├─ upstream-loader.ts      Detect already-loaded upstream (avoid double register)
  └─ imports + invokes upstream default exports in order:
       1. installRegisterToolHook
       2. toolDisplayIntentExtension(pi)
       3. hashlineExtension(pi)   (skipped if hashline already active)
       4. applyMinimalUiToHashlineTools
       5. installAggregateUiPatches
```

### Critical invariants

1. **Single extension entry** — Only `./index.ts` is listed under `pi.extensions` in `package.json`. Upstream packages must **not** be added to the user's Pi `packages` list separately.

2. **No double hashline** — If `read` is already owned by pi-hashline-edit-pro, glue must not call `hashlineExtension` again. Symptom: `Tool "read" conflicts with ... pi-hashline-edit-pro`.

3. **Passthrough vs aggregate** — Putting `read` in display-intent `tools.passthrough` causes **individual Read rows** in the UI. Default config passthrough is only `Agent` and `edit`. Glue migrates away legacy passthrough of hashline tool names.

4. **Config before display-intent import** — `config-seed.ts` runs as a side effect on import **before** `@zhcsyncer/pi-tool-display-intent` loads, because that package reads config at module init.

5. **Aggregate patch timing** — `installAggregateSilentToolsPatch` runs on load and on `session_start` / `before_agent_start`, after display-intent installs its aggregate prototype patch.

## What to change vs what not to change

| Do here | Do upstream instead |
|---|---|
| Load order, duplicate guards, silent UI patches | Hashline edit semantics, anchor format |
| Default display-intent config / migration | display-intent features, new tool kinds |
| `scripts/update-upstream.sh` | Upstream release process |

Avoid editing files under `node_modules/`. Fix glue or bump upstream.

## Dependencies

```json
"pi-hashline-edit-pro": "^2.6.1",
"@zhcsyncer/pi-tool-display-intent": "^0.9.0"
```

- `^` allows compatible semver bumps; **lockfile** pins what is actually installed.
- `npm run update:upstream` — refresh within ranges.
- `npm run update:upstream:latest` — pin to npm latest.

After dependency updates: `npm run typecheck`, manual smoke test in Pi (`/reload`, run a read + replace turn, confirm ledger-only UI).

## Development

```bash
npm install
npm run typecheck
pi install /absolute/path/to/this/repo
```

Typecheck uses stub declarations for upstream packages (`src/upstream.d.ts`) because upstream ships TypeScript sources that do not typecheck under our strict config.

## Testing checklist (manual)

1. Only `pi-quiet-tools` in Pi `packages` — no standalone hashline or display-intent.
2. User prompt triggers multiple `read` calls → no per-file Read lines; aggregate shows `read ×N`.
3. `replace` still works for the agent (hashline behavior unchanged).
4. `/reload` does not duplicate tools or lose silent UI.
5. Existing display-intent config: passthrough migration removes `read` / `replace` / `undo_last_replace` if present.

## Naming

Public name: **pi-quiet-tools** (npm package and GitHub repo). Emphasizes user-facing goal (quiet tools), not implementation (glue).

Folder may still be `pi-tools` locally; Pi cares about `package.json` `"name"` and install path.

## Commits

Keep commits focused. This repo should remain easy to review as a single glue layer (~10 source files).
