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
pi-quiet-tools
├── packages/core                 this repo — glue overlay (display + host policy)
├── vendor/pi-extensions          submodule fork of display-intent (layout/liveness)
└── pi-hashline-edit-pro          npm pin — execution layer; wrapped, not forked
```

Hashline’s execution contract is unchanged: the model still gets full anchors, `replace` / `insert` semantics, and complete tool results. Quiet-tools only changes what the **terminal** draws, plus one UI-host runaway gate that never touches child sessions.

Display-intent feature work belongs in the submodule (then PR to zhcsyncer). Glue stays thin. Do not copy upstream files into `packages/core`.

---

## Added

Capabilities that vanilla hashline + standalone display-intent do not ship.

### Glue (`packages/core`)

**UI-host watchdog** — `host-watchdog.ts`

Stops a silent bash / wall-clock runaway in the session a human is watching. 50 bash or 30 minutes → nudge; then 5 turns or 3 minutes → later tools are blocked and the model must report current/next work in Chinese. Child sessions (`hasUI !== true`) are exempt. In-flight commands are not aborted. See [ADR 0003](./adr/0003-ui-host-watchdog.md).

**Compact edit preview** — `compact-edit-ui.ts`

`replace` / `insert` stay outside the silent ledger and paint a truncated +/- snippet (about 6 change lines). `Ctrl+O` restores hashline’s native preview.

**Edit schema lock** — `hashline-edit-schema.ts`

Hashline’s default schema allows extra properties, so models often send a write-style `path` into `replace` / `insert` and then fail validation. Glue copies the registered schema with `additionalProperties: false` and strips a loose `path` after upstream `prepareArguments`. Execution still uses hashline; only the model-facing contract is tightened.

**Quiet subagent notifications** — `quiet-subagent-notifications.ts`

Compresses subagent completion notices to one status line (must load before `@tintinweb/pi-subagents`). Transcript paths and result-preview metadata are not shown. More aggressive than display-intent 0.10.0’s custom-message fold.

**Narration keep / ledger-pin omit** — `aggregate-keep-narration.ts`, `aggregate-omit-ledger-narration.ts`

Mid-turn assistant Markdown stays visible as the assistant body. Thinking, GPT-style `<thinking>` tags, and leftover session-sequence prefixes are stripped. Display-intent’s in-progress `›` pin is dropped from the Tools ledger so the same prose is not shown twice.

**Silent-tool wrap** — `register-tool-hook.ts`, `aggregate-silent-tools.ts`, `aggregate-silent-ledger.ts`

Silent hashline tools (`read`, `undo_last_change`, `anchor_grep`, plus retired `undo_last_replace`) get empty `renderCall` / `renderResult`. Non-ledger silent rows are swallowed so hashline file bodies never leak beside the ledger. Collapsed ledger lines pass through.

**Bundle seed + passthrough migration** — `config-seed.ts`, `config/default-display-config.json`

First-run config is quieter than standalone display-intent: `per-turn`, intent off, `summary` results, passthrough `Agent` / `replace` / `insert` / leftover `edit`. Existing configs are not overwritten; startup migration strips silent hashline names and restores the keep-list.

### Display-intent fork (`vendor/pi-extensions`)

**`per-turn` layout** — not present on zhcsyncer 0.10.0 (`individual` | `aggregate` only).

Consecutive tool-only assistant messages share one Tools ledger; visible Markdown or a mid-turn steer starts the next phase. This is the bundle default. Rebasing it onto upstream is a re-implementation, not a conflict resolve — see [upstream-sync](./upstream-sync.md).

**Open elapsed tick** — open ledger headers refresh about once per second so a long single tool does not look frozen. Owned by display-intent (it already has `startedAtMs`); glue does not inject the clock. See [ADR 0001](./adr/0001-open-ledger-liveness.md).

---

## Changed

Upstream behaviour we deliberately alter, without replacing the upstream package.

**Single extension entry.** Root `package.json` lists only `./packages/core/index.ts`. Users must not also install hashline or display-intent; Pi would register the same tools twice.

**Load order is load-bearing.** Glue always runs: registerTool hook → quiet subagent renderer → watchdog → display-intent (unless already active) → hashline (unconditional) → minimal hashline UI → aggregate patches. Display-intent and hashline both re-register `read` from the same factory; the later one wins. Swap them and the model gets un-anchored file content with no error. Locked by `tests/hashline-contract.test.ts`.

**Hashline is called unconditionally.** A `getAllTools()` “already loaded” guard cannot work at extension-load time (`notInitialized`). Protection is external: path dedupe, Pi’s `Tool "read" conflicts with …` diagnostic, and docs that forbid a standalone install. Reasoning lives in `upstream-loader.ts`.

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

**Hashline names in one module** — `hashline-tools.ts`. Silent set, visible-edit set, passthrough migration, and duplicate-load tests all read it. Upstream rename used to mean hunting four copies. Keep the retired name (`undo_last_replace`) in the matching set so old configs stay quiet.

**Exact npm pin** — `pi-hashline-edit-pro` is `4.2.5` with no `^`. A previous `^2.6.1` resolved to 2.8.4, which had already renamed `undo_last_replace`, and silently broke the glue.

**Dead duplicate-hashline guard removed.** The old `getAllTools()` check returned false at its only call site. Tests had mocked a working `getAllTools`, so they protected a branch production never reached.

**Display-intent duplicate detection by runtime owner.** `/reload` / `/new` / in-process child sessions must not share one prototype patch. Each runtime releases ownership on `session_shutdown`.

**Unified visible-text helpers** — `terminal-text.ts`. Ledger predicates and narration filters strip ANSI/OSC before matching, so colour and box-drawing do not break `Tools (` detection.

**Install plumbing** — `preinstall` clones the submodule at the pinned SHA.

**Contract tests** — hashline registers exactly the names glue knows; every hashline prompt file resolves; silent vs visible-edit classification is exhaustive. Wrong name lists fail here instead of leaking rows in the terminal.

---

## When you change something

1. Classify it: **glue** (`packages/core`), **fork** (submodule, then PR), or **hashline pin** (npm, exact).
2. Update this file in the same change if the overlay gained, lost, or reclassified a behaviour.
3. If the change is hard to reverse and surprising, add or amend an ADR. Do not copy the rationale into this file.
4. If the change is a pin, rebase, or silent-failure seam, update `upstream-sync.md` instead of (or in addition to) this file.
