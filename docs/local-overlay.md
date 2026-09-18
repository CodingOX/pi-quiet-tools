# Local overlay vs upstream

Status: **Current Truth** of what this repository owns on top of the two upstreams. Update it when glue or the display-intent fork gains, loses, or reclassifies a behaviour.

This is not a changelog, not a glossary, and not a sync plan.

| Need | Document |
| --- | --- |
| Shared vocabulary | [`../CONTEXT.md`](../CONTEXT.md) |
| Why a behaviour exists | [`adr/`](./adr/) |
| Pins, rebase cost, silent-failure landmines | [`upstream-sync.md`](./upstream-sync.md) |
| How to work in the repo | [`../AGENTS.md`](../AGENTS.md) |
| What users see | [`../README.md`](../README.md) |

## Layers

```text
pi-quiet-tools                    root = the published unit (main package)
├── src/                          this repo — glue overlay (display policy)
├── packages/markdown-enhance/    standalone — markdown transformer + opt-in fence hiding
├── packages/watchdog/            standalone — bash runaway gate (host + child)
├── packages/notify/              standalone — compact subagent notices
└── vendor/
    ├── hashline/                 read-only mirror — execution layer; wrapped, not changed
    └── display-intent/           fork — layout/liveness work lives here
```

The three `packages/*` and two `vendor/*` are `file:` dependencies of the root package and
are listed under `bundledDependencies`, so one install lands all five. See
[`../AGENTS.md`](../AGENTS.md#dependencies) for why `file:` is required rather than cosmetic.

Hashline’s execution contract is unchanged: the model still gets full anchors, `replace` / `insert` semantics, and complete tool results. Quiet-tools only changes what the **terminal** draws, plus a runaway gate for the UI host and for child sessions.

Display-intent feature work belongs in `vendor/display-intent`. Glue stays thin. Do not copy upstream files into `src/`.

> ⚠️ The two vendor copies are **not** the same kind of thing. `vendor/hashline` is a pure
> upstream snapshot; `vendor/display-intent` carries local-only work that no upstream sync will
> bring forward. `scripts/vendor-pull.sh` encodes that asymmetry.

---

## Added

Capabilities that vanilla hashline + standalone display-intent do not ship.

### Glue (`src/`)

**Watchdog** — `packages/watchdog/src/host-watchdog.ts`
Stops a silent bash runaway. UI host: 80 bash → nudge; then 10 turns → later tools are blocked and the model must report current/next work in Chinese; official text resets the ledger. Child session: same 80+10 on an isolated ledger, but official text does not reset; the child must return an incomplete handoff (`INCOMPLETE`) and settle. Waiting on Ask or a child does not trip the **host**. No UI notify on children. In-flight commands are not aborted. See [ADR 0003](./adr/0003-ui-host-watchdog.md) and [ADR 0004](./adr/0004-child-session-watchdog.md).

**Compact edit preview** — `compact-edit-ui.ts`

`replace` / `insert` stay outside the silent ledger and paint a truncated +/- snippet (about 6 change lines) with a left rail, not Pi’s default green shell. `Ctrl+O` restores hashline’s native preview.

**Edit schema lock** — `hashline-edit-schema.ts`

Hashline’s default schema allows extra properties, so models often send a write-style `path` into `replace` / `insert` and then fail validation. Glue copies the registered schema with `additionalProperties: false` and strips a loose `path` after upstream `prepareArguments`. Execution still uses hashline; only the model-facing contract is tightened.

**Quiet subagent notifications** — `packages/notify/src/quiet-subagent-notifications.ts`

Compresses subagent completion notices to one status line (must load before `@tintinweb/pi-subagents`). Transcript paths and result-preview metadata are not shown. More aggressive than display-intent 0.10.0’s custom-message fold.

**Narration keep / ledger-pin omit** — `aggregate-keep-narration.ts`, `aggregate-omit-ledger-narration.ts`

Mid-turn assistant Markdown stays visible as the assistant body. Thinking, GPT-style `<thinking>` tags, and leftover session-sequence prefixes are stripped. Display-intent’s in-progress `›` pin is dropped from the Tools ledger so the same prose is not shown twice.

**Silent-tool wrap** — `register-tool-hook.ts`, `aggregate-silent-tools.ts`, `aggregate-silent-ledger.ts`

Silent hashline tools (`read`, `undo_last_change`, `anchor_grep`, plus retired `undo_last_replace`) get empty `renderCall` / `renderResult`. Non-ledger silent rows are swallowed so hashline file bodies never leak beside the ledger. Collapsed ledger lines pass through.

**Markdown enhance** — `packages/markdown-enhance/`

Mermaid diagram dialects (`sequenceDiagram`, `stateDiagram-v2`, `classDiagram`, `erDiagram`) beyond the built-in ```mermaid fence, GitHub admonitions (`> [!NOTE]` → bold-labelled blockquote), and bare-URL linkify — all skipped inside code fences and during streaming. Two cosmetic switches default **off** so no personal workaround is pushed to other consumers: `deCircled` (① → (1), a Nerd Font U+2460–U+2473 ink-overflow workaround) and `hideCodeFence` (swallows ```` ``` ```` chrome via a `Markdown.renderToken` prototype patch). Config lives at `~/.pi/agent/extension-data/pi-quiet-tools-markdown-enhance/config.json`.

> ⚠️ **The pipeline is not idempotent.** Pi runs *every* registered transformer in sequence
> (`applyMarkdownTransformers` loops over `runner.js` `getMarkdownTransformers()`), so a second copy of
> this extension corrupts URLs (`[[u](u)](u](u))`). Do not keep a standalone `extensions/markdown-enhance/`
> alongside the bundle — the old copy must be removed, not merely disabled.

**Bundle seed + passthrough migration** — `config-seed.ts`, `config/default-display-config.json`

First-run config is quieter than standalone display-intent: `per-turn`, intent off, `summary` results, passthrough `Agent` / `replace` / `insert` / leftover `edit`. Existing configs are not overwritten; startup migration strips silent hashline names and restores the keep-list.

**Markdown display chain** — this bundle owns the only `markdownTransformer`. Quiet-tools wraps `AssistantMessageComponent.render` (narration) while markdown-enhance owns the transformer slot and patches `Markdown.renderToken` (fence chrome). These are nested, not competing: narration render → `Markdown.render` → `renderToken`. Neither display-intent nor hashline touches either surface, so collecting the transformer here costs no slot contention.

### Display-intent fork (`vendor/display-intent`)

**`per-turn` layout** — not present on zhcsyncer 0.10.0 (`individual` | `aggregate` only).

Consecutive tool-only assistant messages share one Tools ledger; visible Markdown or a mid-turn steer starts the next phase. This is the bundle default. Rebasing it onto upstream is a re-implementation, not a conflict resolve — see [upstream-sync](./upstream-sync.md).

**Open elapsed tick** — open ledger headers refresh about once per second so a long single tool does not look frozen. Owned by display-intent (it already has `startedAtMs`); glue does not inject the clock. See [ADR 0001](./adr/0001-open-ledger-liveness.md).

---

## Changed

Upstream behaviour we deliberately alter, without replacing the upstream package.

**Single extension entry.** Root `package.json` lists only `./index.ts`. Users must not also install hashline or display-intent; Pi would register the same tools twice.

**Load order is load-bearing.** Glue always runs: registerTool hook → quiet subagent renderer → watchdog → display-intent (unless already active) → hashline (unconditional) → aggregate patches. Hashline silent/compact UI is applied inside the hook at `registerTool` time, not by a later `getAllTools()` rewrite. Display-intent and hashline both re-register `read` from the same factory; the later one wins. Swap them and the model gets un-anchored file content with no error. Locked by `tests/hashline-contract.test.ts`.

**Hashline is called unconditionally.** A `getAllTools()` “already loaded” guard cannot work at extension-load time (`notInitialized`). Protection is external: path dedupe, Pi’s `Tool "read" conflicts with …` diagnostic, and docs that forbid a standalone install. Reasoning lives in `src/upstream-loader.ts`.

**Default quiet policy vs standalone display-intent.**

| Knob | Standalone default (typical) | This bundle |
| --- | --- | --- |
| `toolCalls.layout` | `aggregate` (one ledger per user request) | `per-turn` (one ledger per tool phase) |
| `intent.enabled` | often on | off |
| `results.mode` | fuller | `summary` |
| `tools.passthrough` | whatever the user set | `Agent`, `replace`, `insert`, leftover `edit`; silent hashline names stripped |

**Silent vs visible hashline tools.** Reads / search / undo are ledger-only. Edits are high-signal: passthrough + truncated diff. Putting `read` in passthrough brings back individual Read rows.

**Open rows belong to display-intent.** Glue used to recap the three-row window (hide completed silent rows, cap silent live rows at one). It no longer does — collapsed ledger lines pass through. See [ADR 0002](./adr/0002-silent-tools-share-open-rows.md).

---

## Optimized

Internal shape that makes the overlay cheaper to keep, not a new user-facing feature.

**Hashline names in one module** — `src/hashline-tools.ts`. Silent set, visible-edit set, passthrough migration, and duplicate-load tests all read it. Upstream rename used to mean hunting four copies. Keep the retired name (`undo_last_replace`) in the matching set so old configs stay quiet.

**Vendored instead of pinned** — `pi-hashline-edit-pro` now lives in `vendor/hashline` as a read-only mirror, so its version can no longer move under us. The old npm pin was exact (`4.2.5`, no `^`) for the same reason: a previous `^2.6.1` resolved to 2.8.4, which had already renamed `undo_last_replace`, and silently broke the glue.

**Dead duplicate-hashline guard removed.** The old `getAllTools()` check returned false at its only call site. Tests had mocked a working `getAllTools`, so they protected a branch production never reached.

**Display-intent duplicate detection by runtime owner.** `/reload` / `/new` / in-process child sessions must not share one prototype patch. Each runtime releases ownership on `session_shutdown`.

**Unified visible-text helpers** — `terminal-text.ts`. Ledger predicates and narration filters strip ANSI/OSC before matching, so colour and box-drawing do not break `Tools (` detection.
**No install plumbing** — the old `preinstall` hook cloned a submodule and had ~40 lines of defence against npm's `file:` placeholder, symlink-escape, and unexpected-content cases. All of it is gone with the submodule. Cloning without `--recurse-submodules` is now correct.

**Root-level runtime deps for vendored transitives.** `pi-hashline-edit-pro` needs `diff@^9` while the dev-only `pi-coding-agent` needs `diff@8`, so npm nested v9 under `vendor/hashline/node_modules`. `npm pack` then wrote it to a path the bundled package could not reach, and only a *consumer* machine would have failed with `MODULE_NOT_FOUND`. Declaring `diff` / `file-type` / `xxhash-wasm` at the root pins them to the top level where the bundle places them. Same trap applies to any future hashline runtime dependency.

**Separate tsconfig per test surface.** `tsx` treats a tsconfig's `paths` as a runtime resolution map, so a `tsc` stub alias makes a real dependency resolve to a `.d.ts`. There are four configs and none of the three test ones may carry `paths`: `tsconfig.test.json` (glue), `tests/tsconfig.test.json` (the hashline contract test, which must load the real vendored upstream), and `packages/*/tsconfig.test.json` (per-package).

Test configs sit at **package roots, never inside `src/`**. A `tsconfig.test.json` in a source directory becomes the nearest config for every file beside it, and the language server picks its `baseUrl` over the package's real one — which is how a file importing a root-hoisted dependency reported `Cannot find module` while `tsc` was green.

**Contract tests** — hashline registers exactly the names glue knows; every hashline prompt file resolves; silent vs visible-edit classification is exhaustive. Wrong name lists fail here instead of leaking rows in the terminal.

---

## When you change something

1. Classify it: **glue** (`src/`), **standalone package** (`packages/*`), **fork work** (`vendor/display-intent`), or **vendor sync** (`vendor/hashline`, via `npm run vendor:pull`).
2. Update this file in the same change if the overlay gained, lost, or reclassified a behaviour.
3. If the change is hard to reverse and surprising, add or amend an ADR. Do not copy the rationale into this file.
4. If the change is a vendor version move, a fork rebase, or a silent-failure seam, update `upstream-sync.md` instead of (or in addition to) this file.
