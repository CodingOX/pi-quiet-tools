# AGENTS.md — pi-quiet-tools

Guidance for humans and coding agents working in this repository.

## What this project is

**pi-quiet-tools** is a monorepo that ships one Pi bundle plus three optional standalone packages.

```text
pi-quiet-tools/                 root = THE published unit (main package)
├── index.ts                    Pi entry: load order is the whole design
├── src/                        glue — display policy, silent renderers, schema lock
├── config/                     first-run display-intent seed
├── packages/markdown-enhance/  standalone package — markdown transformer + opt-in fence hiding
├── packages/watchdog/          standalone package — bash runaway gate
├── packages/notify/            standalone package — compact subagent notices
└── vendor/                     third-party source, see vendor/README.md
    ├── hashline/               read-only mirror of pi-hashline-edit-pro
    └── display-intent/         FORK of pi-tool-display-intent (has local-only work)
```

`packages/markdown-enhance` is the one package here that is **not** derived from hashline or display-intent — it was lifted out of `pi-cc-extensions` and folded into this bundle so its `grok-mermaid` dependency ships normally instead of every machine having to install it by hand. Its two cosmetic switches default off; the pipeline it owns is **not idempotent**, so a second copy anywhere in the load path corrupts URLs. See [`docs/local-overlay.md`](./docs/local-overlay.md).

Design goal: **minimal terminal noise**. Users should see small per-turn tool counts, truncated edit diffs, mid-turn assistant Markdown, and the final answer — not per-call file reads or hashline anchors.

**One install, everything included.** The root `package.json` declares the three `packages/*` and the two `vendor/*` as `file:` dependencies and lists them under `bundledDependencies`, so `pi install <this repo>` lands all five in `node_modules/`. Users never install the pieces separately.

What this repo added, changed, and optimized on top of upstream is recorded in [`docs/local-overlay.md`](./docs/local-overlay.md). Update that file in the same change when the overlay gains, loses, or reclassifies a behaviour. Do not copy that inventory into this file, `CONTEXT.md`, or the README.

| Need | Read |
| --- | --- |
| Shared vocabulary | `CONTEXT.md` |
| Why a behaviour exists | `docs/adr/` |
| Overlay vs upstream | `docs/local-overlay.md` |
| Upstream versions, fork cost, sync landmines | `docs/upstream-sync.md` |
| Rules for `vendor/` | `vendor/README.md` |
| Licensing of bundled third-party code | `THIRD-PARTY-NOTICES.md` |
| How to work here | this file |

## Architecture

```text
index.ts  (Pi entry — order below is a contract, not a preference)
  ├─ src/config-seed.ts                 First-run default config + passthrough migration
  ├─ @pi-quiet-tools/watchdog           bash runaway gate (UI host + child sessions)
  ├─ @pi-quiet-tools/notify             Compress subagent completion notifications
  ├─ src/register-tool-hook.ts          Wrap registerTool; silent read/search, compact replace/insert
  ├─ src/compact-edit-ui.ts             Truncated +/- preview for visible edits
  ├─ src/hashline-edit-schema.ts        Lock the model-facing edit schema
  ├─ src/aggregate-silent-tools.ts      Swallow non-ledger silent renders; collapsed ledger passes through
  ├─ src/aggregate-keep-narration.ts    Keep interim assistant Markdown
  ├─ src/upstream-loader.ts             display-intent duplicate guard
  └─ src/hashline-tools.ts              Single source of truth for hashline tool names
```

`packages/watchdog/src/assistant-text.ts` is a pure, Pi-free module. It exists so the watchdog does **not** import `src/aggregate-keep-narration.ts` — that module is a display-intent patch, and depending on it would drag the watchdog back into the display layer. Both the watchdog and the glue read narration predicates from `assistant-text.ts`.

### Critical invariants

1. **One extension entry** — Root `package.json` lists only `./index.ts` under `pi.extensions`. Do not add hashline or display-intent to the user's Pi `packages` list separately.

2. **No double hashline** — Glue calls `hashlineExtension` unconditionally, because at extension-load time `pi.getAllTools()` throws (`notInitialized`) so the status cannot be probed. The protections are external: Pi dedupes extensions by path, a genuine double install surfaces as a non-fatal `Tool "read" conflicts with ...` diagnostic, and README/AGENTS forbid installing hashline standalone. Do **not** reintroduce a `getAllTools()` guard — the reasoning lives in `src/upstream-loader.ts`.

3. **Load order is load-bearing** — display-intent and hashline both register tools from the *same* extension factory, so Pi sees no conflict and the later registration wins the name. display-intent re-registers the builtins (`read`, `grep`, `find`, `ls`, `write`, `bash`) with builtin descriptions; hashline then registers its own `read` that returns `anchor│content`. Swapping them makes the model silently receive un-anchored file content while `read` still looks normal — no error anywhere. `tests/hashline-contract.test.ts` locks the order.

4. **Passthrough vs aggregate** — Putting `read` in display-intent `tools.passthrough` causes **individual Read rows** in the UI. Default passthrough is `Agent`, `replace`, `insert`, and leftover `edit`. Glue migrates away silent hashline names (`read`, `undo_last_change`, `anchor_grep`, retired `undo_last_replace`) and restores the visible-edit names so truncated diffs can actually paint.

5. **Config before display-intent import** — `config-seed.ts` runs as a side effect on import **before** `@zhcsyncer/pi-tool-display-intent` loads, because that package reads config at module init.

6. **Aggregate patch timing** — `installAggregateSilentToolsPatch` runs on load and on `session_start` / `before_agent_start`, after display-intent installs its aggregate prototype patch.

7. **`vendor/hashline` is a read-only mirror; `vendor/display-intent` is NOT.** The mirror is a pure upstream snapshot: syncing it is a directory-level overwrite with zero conflict surface. The display-intent copy carries local-only work (per-turn ledger layout, open-ledger tick, per-runtime owner lifecycle), so overwriting it **silently destroys that work**. `scripts/vendor-pull.sh` enforces this asymmetry: it overwrites hashline and only *reports* on display-intent.

8. **The pieces are bundled, not co-installed.** `packages/watchdog` and `packages/notify` are reachable both as bundle members and as standalone installs. Installing both the bundle *and* a standalone copy is not deduped by Pi (different paths) — see the handover notes in each package's `src/index.ts`.

9. **The markdown transformer is single-owner and its pipeline is not idempotent.** `packages/markdown-enhance` owns the only `registerMarkdownTransformer` in this bundle; quiet-tools never registers one (it wraps `AssistantMessageComponent.render`) and neither upstream does. Pi runs **every** registered transformer in sequence (`applyMarkdownTransformers` iterates `runner.js` `getMarkdownTransformers()`), and this pipeline re-wraps URLs on a second pass (`[[u](u)](u](u))`). A leftover `~/.pi/agent/extensions/markdown-enhance/` therefore corrupts output instead of merely duplicating work — remove the standalone copy, do not just disable it. Its two cosmetic switches (`deCircled`, `hideCodeFence`) default **off**; the Nerd Font circled-digit workaround and fence-chrome hiding are personal preferences and must not be imposed on consumers.

## Dependencies

All five runtime inputs are local `file:` paths resolved inside the repo:

| Dependency | Source | Channel |
| --- | --- | --- |
| `@pi-quiet-tools/watchdog` | `packages/watchdog` | workspace + bundled |
| `@pi-quiet-tools/markdown-enhance` | `packages/markdown-enhance` | workspace + bundled |
| `@pi-quiet-tools/notify` | `packages/notify` | workspace + bundled |
| `pi-hashline-edit-pro` | `vendor/hashline` | vendored mirror + bundled |
| `@zhcsyncer/pi-tool-display-intent` | `vendor/display-intent` | vendored fork + bundled |

> ⚠️ **`grok-mermaid` is declared at the root on purpose.** `packages/markdown-enhance` is the only bundle member with a third-party runtime dependency that is *not* vendored. Declaring it in the root `dependencies` + `bundledDependencies` is what makes `pi install <repo>` land it — otherwise every consumer hits the same `Cannot find module 'grok-mermaid'` that motivated folding this package in (see [`docs/local-overlay.md`](./docs/local-overlay.md)). Same rule as the transitive deps below: a new runtime dependency anywhere in `packages/*` must be declared at the root.

> ⚠️ **`file:` is required, not cosmetic.** `bundledDependencies` only picks up dependencies whose targets exist under the package's own `node_modules`. With a semver range, npm resolves a workspace package to a symlink and `npm pack` silently emits a tarball with **no** bundled deps. `file:` gives npm a concrete target to materialise. Verified against npm 11.17.0; re-verify if that changes.
>
> ⚠️ **Transitive deps must be declared at the root.** `pi-hashline-edit-pro` needs `diff@^9`, while the dev-only `@earendil-works/pi-coding-agent` needs `diff@8`. npm hoists the *conflicting* version into `vendor/hashline/node_modules/diff`, and `npm pack` then writes it to a path the bundled package cannot reach. Declaring `diff`, `file-type`, and `xxhash-wasm` in the root `dependencies` forces them to the top level where the bundle places them. If a future hashline bump adds a runtime dependency, add it here too — the symptom is a `MODULE_NOT_FOUND` only on a consumer machine, never in this repo.

```bash
npm run vendor:pull             # sync vendor/ per its own asymmetry rules
npm run vendor:pull -- --check  # report only, no writes
```

After a vendor sync: `npm install && npm run typecheck && npm test`, then restart Pi (`/reload` is not enough after a hashline bump).

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

Typecheck uses stub declarations (`src/upstream.d.ts`) because the vendored TypeScript sources do not typecheck under our strict config.

**Tests each run under their own tsconfig, and that is load-bearing.** `tsx` treats a tsconfig's `paths` as a **runtime** resolution map. The root `tsconfig.json` needs stub aliases for tsc, and that mapping is poison for tests: a stubbed `pi-hashline-edit-pro` resolves to a `.d.ts`, and the contract test fails with `does not provide an export named 'default'`. So:

| Config | Used by | `paths` |
| --- | --- | --- |
| `tsconfig.json` | `npm run typecheck` | stubs, incl. the `src/edit-common.ts` subpath |
| `tsconfig.test.json` | glue tests | **none** — never re-add a subpath alias |
| `tests/tsconfig.test.json` | the hashline contract test | **none** — it must load the real vendored upstream |
| `packages/*/tsconfig.json` + `packages/*/tsconfig.test.json` | per-package gates | **none** — these packages have no upstream stubs |

## Change closeout gate

Any change to `src/`, `packages/`, `vendor/`, the scripts, or the dependency graph is **not done until it has been verified on a reloaded runtime**. Run the `quiet-tools-verify` skill (`.pi/skills/quiet-tools-verify/SKILL.md`) as the closeout pipeline: change inventory → static gate → wiring assertions → user reload → load confirmation → visual walkthrough → closeout verdict.

Two rules that make that pipeline possible:

1. **Never call `/reload` yourself.** Reload terminates the running turn, so the agent cannot continue past it. Stop at the handoff card and let the user reload.
2. **Never report runtime behaviour as verified without the user's confirmation.** Static checks (typecheck, unit tests, reachability) are the agent's; terminal appearance is the user's.

The skill defers to the manual checklist below for what to look at, and adds the execution order, gates, and failure signatures. When a change introduces a new observable surface, extend both.

## Testing checklist (manual)

1. Only `pi-quiet-tools` in Pi `packages` — no standalone hashline, display-intent, watchdog, or notify entry.
2. User prompt triggers multiple `read` calls in one assistant turn → collapsed open ledger shows `Tools (...)` plus up to 3 Open rows (pending/running take slots first; leftover slots are recent done, including silent tools); no hashline per-file bodies. After settle, header + receipt only.
3. A later assistant turn with more tools gets its **own** Tools ledger after that turn's Markdown, not one block pinned at the bottom.
4. Mid-turn assistant prose (text before `toolUse`) stays visible as Markdown; thinking stays hidden.
5. `replace` and `insert` show a truncated +/- snippet (about 6 change lines, stats on the header). `Ctrl+O` restores hashline's native preview. `anchor_grep` stays silent; the built-in `grep` is disabled while it is on.
6. `/reload` does not duplicate tools or lose silent UI / narration.
7. Existing display-intent config: passthrough migration strips silent hashline names (current plus retired, e.g. `undo_last_replace`) and restores `Agent`, `replace`, and `insert`. Layout stays as saved (`aggregate` vs `per-turn`). Add more high-signal names to `QUIET_UI_PASSTHROUGH_KEEP` in `config-seed.ts`.
8. UI host: 80 bash → nudge; after 10 more turns, later tools are blocked and the model is told to report current/next work in Chinese. Official assistant text (not thinking) in that turn resets bash and grace. Child sessions (`hasUI !== true`) share 80+10 on their own ledger; official text does **not** reset; the child is told to return an `INCOMPLETE` handoff to the parent and settle. In-flight commands are not aborted. There is no request or grace wall-clock cap.

## Where hashline tool names live

`src/hashline-tools.ts` is the single source of truth for the tool names `pi-hashline-edit-pro` registers, split into silent vs visible-edit. Glue reads those sets for the silent renderer, compact edit UI, passthrough migration, and duplicate-load tests. When upstream renames or adds a tool, edit that one file, classify the new name, and update its tests — do not re-scatter the names.

## Naming

Public name: **pi-quiet-tools** (GitHub repo and Pi install). Workspace packages: **`@pi-quiet-tools/watchdog`**, **`@pi-quiet-tools/notify`**.

> ⚠️ The npm name `pi-quiet-tools` is taken by an unrelated package. Publish under a scope, and install via git until that exists:
> `pi install git:github.com/CodingOX/pi-quiet-tools`

## Commits

Keep glue commits focused, and keep `vendor/` syncs in their own commit — a vendor overwrite is a third-party version change, not a behaviour change of ours. Fork work in `vendor/display-intent` should be described in the commit that lands it, since no upstream sync will carry it forward.
