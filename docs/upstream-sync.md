# Upstream sync evaluation

Status: **hashline migration done; display-intent deliberately deferred.**

The hashline half of this record has been executed — see [What the hashline migration changed](#what-the-hashline-migration-changed). The analysis below is kept because it is still the reasoning behind the current pins, and because the display-intent half remains open.

Recorded 2026-09-12 against hashline 2.6.1 and display-intent 0.9.0. Read this before re-running any upstream update, so the analysis is not repeated from scratch. Claims below were verified against source or by execution; anything resting on judgement instead of evidence is called out inline.

## Verdict

| Dependency | Channel | Pinned | Upstream | Call |
| --- | --- | --- | --- | --- |
| `pi-hashline-edit-pro` | npm | **4.2.5** (exact) | **4.2.5** | ✅ Migrated |
| `@zhcsyncer/pi-tool-display-intent` | submodule `vendor/pi-extensions` | **0.9.0** (`0e90617`) | **0.10.0** | 🔴 Defer — cost exceeds gain right now |

The two channels are independent. `npm run update:upstream` only touches hashline; the submodule moves only through `npm run sync:display-intent`.

## Why hashline is worth migrating

### The version ladder has three distinct breakpoints

| Version | What changed | Impact on this repo |
| --- | --- | --- |
| 2.7.0 | `undo_last_replace` → **`undo_last_change`**; adds `insert`, `anchor_grep` | 🔴 Rename breaks 4 glue files |
| **3.0.0** | Anchor length **3 chars → 4 chars** | 🟠 `read` output shape changes |
| 3.0.4 | Boundary, batch, and cache fixes | 🟢 Stability only |
| 4.0.0–4.2.5 | Feature and fix releases | 🟢 Stability only |

So the `exported tool names` and `anchor width` seams both moved, not just one.

### The rename is inside the current semver range

`^2.6.1` resolves to **2.8.4**, which already carries the new tool name. Verified by `npm install --dry-run`:

```text
change pi-hashline-edit-pro 2.6.1 => 2.8.4
```

**The pin must stay exact.** While this repo sat on `^2.6.1`, a plain `npm update` (the `update:upstream` range mode) resolved to 2.8.4 — a version that had already renamed the tool — and silently broke the glue. The dependency is therefore pinned to `4.2.5` with no range. Keep it that way: move the pin deliberately, verify, and re-pin exactly.

### Capability gain

- **`anchor_grep` returns anchors on search results.** Every matching line comes back as `lineNumber │ anchor│content`, so a hit can be passed straight to `replace`/`insert` without a preceding `read`. For a project whose whole point is deleting terminal round-trips, this removes a full `read` per search — and `read` is the tool this repo exists to silence.
- **`insert` fills a semantic hole.** Inserting content currently means going through `replace`, which risks removing the anchor line. `insert` states explicitly that nothing is removed, reports a noop, and reuses the `replace` safety machinery (undo saved before write, BOM/EOL preservation).
- **`Tool result details` is new machine-readable metadata.** `read` gains `snapshotId` / `nextOffset` / `truncation`; `replace` and `insert` gain `diff` / `patch` / `changedLines` / `batch` / `metrics`. A quiet ledger currently can only count calls; these fields would let it report what actually changed and how much.

### What the hashline migration changed

The rename originally looked like a four-file find-and-replace. It was done differently on purpose, because that shape was the actual defect: the same name list was written out four times, so every upstream rename meant hunting for all four copies. The list now lives in one module.

```text
packages/core/src/hashline-tools.ts           ← single source of truth (new)
  HASHLINE_TOOLS          read, replace, insert, undo_last_change, anchor_grep
  LEGACY_HASHLINE_TOOLS   undo_last_replace (retired)
  HASHLINE_TOOL_NAME_SET  current + retired, for matching
```

Four modules now consume that set instead of repeating it:

| Module | Was | Now |
| --- | --- | --- |
| `aggregate-silent-ledger.ts` | inline `Set` of 3 names | `HASHLINE_TOOL_NAME_SET` |
| `config-seed.ts` | inline `Set` of 3 names | `HASHLINE_TOOL_NAME_SET` |
| `upstream-loader.ts` | `HASHLINE_TOOL_NAMES` array + `getAllTools()` guard | guard **deleted** (it was dead — see below) |
| `register-tool-hook.ts` | inline `Set` of 3 names | `HASHLINE_TOOL_NAME_SET` |

Keeping the retired name in the matching set is deliberate. It costs nothing, and it means an old config entry or a not-yet-upgraded hashline install still gets silenced instead of suddenly leaking per-call rows.

Beyond the rename:

- `insert` and `anchor_grep` joined the silent set at the 4.x rename. Glue later split `replace` / `insert` back out as visible edits (`HASHLINE_VISIBLE_EDIT_TOOLS`); `HASHLINE_SILENT_TOOL_NAME_SET` is the current matching set for ledger-only tools.
- The version floor moved up where it had become a lie: `engines.node` `>=20` → `>=22.19.0`, and the `pi-coding-agent` / `pi-tui` peer range `>=0.80.0` → `>=0.84.0`. Those are hashline 4.x's own requirements, not preferences.
- Docs and tests referencing the old name were updated (`CONTEXT.md`, both READMEs, `AGENTS.md`, `config-seed.test.ts`).
- The README's anchor example became 4 characters (`Dafo│`), matching `HASH_LEN = 4` in the new hashline.

The built-in `edit` tool is still force-disabled in 4.2.5 (`setActiveTools((t) => t !== "edit")`), so that behaviour carried over unchanged.

The 3→4 char anchor change stayed **narrower than it looked**: glue contains no parse of anchor width or shape. The `│` characters in `packages/core` are Ctrl+O frame edges, not anchor separators, so no ledger predicate depended on anchor width. Only the README sample needed updating, because it is documentation of `read` output.

New regression coverage, all verified to fail when the name list is wrong:

- `aggregate-silent-ledger.test.ts` — the 4.x names are silenced; the retired name still is; an `insert`-led ledger survives.
- `config-seed.test.ts` — passthrough migration strips current, new, and retired names alike.

### A dead guard found and removed

Review during this migration found that `hashlineAlreadyActive` — the guard intended to stop a second `hashlineExtension` call — **returned `false` unconditionally at its only call site**. It was not a regression from the rename; it had probably never worked.

The chain, verified in `pi-coding-agent` 0.85.1 `dist/core/extensions/loader.js`:

1. `createExtensionRuntime()` sets `getAllTools: notInitialized` (line 154), and `notInitialized` throws *"Extension runtime not initialized. Action methods cannot be called during extension loading."*
2. Extension factories are invoked during loading (`initializeExtension`), before `Runner.bindCore()` installs the real actions.
3. So the call throws every time, and the `catch { return false }` swallowed it.

The old test mocked `getAllTools` with a working implementation, so it asserted behaviour that production could never reach — it protected a dead branch.

Two facts make removal safe rather than merely tidy:

- Pi dedupes extensions by canonical path (`mergePaths`), so the same extension loaded from the same path only runs once.
- A genuine double install is already caught by Pi: a tool-name collision produces a `Tool "read" conflicts with ...` diagnostic. Note this is pushed to `errors` but **does not block startup** — all extensions stay loaded and precedence follows load order.

So glue now calls `hashlineExtension` unconditionally, and the reasoning is parked in a comment at the top of `packages/core/src/upstream-loader.ts` so nobody reintroduces the same dead guard. The duplicate-detection tests were removed with it, since asserting a dead branch produces confidence without protection.

## Why display-intent is deferred

### The fork and upstream have genuinely diverged

```text
merge-base: ddcc6ba  (2026-08-19)
upstream/main is 33 commits ahead
feat/per-turn-layout is 9 commits ahead
```

A throwaway clone was rebased to measure the cost; **the first commit alone produced 21 conflict blocks across 9 files**, and the real repo was never touched. Conflict surface:

| File | Blocks |
| --- | --- |
| `src/tool-overrides.ts` | 4 |
| `README.md` / `README.zh-CN.md` | 4 each |
| `src/config-modal.ts` | 2 |
| `src/aggregate-activity.ts` | 2 |
| `tests/config-modal.test.ts` | 2 |
| `src/types.ts`, `src/user-message-box-native.ts`, `tests/aggregate-activity.test.ts` | 1 each |

That is only commit 1 of 9.

### Three silent-failure landmines

These matter more than the conflict count, because each one **fails without an error**:

1. **The patch key moved `v1` → `v2`.** Upstream renamed `pi-tool-display-intent.aggregate-tool-execution.v1` to `...v2` (keeping a legacy constant for its own cleanup). `packages/core/src/aggregate-silent-tools.ts` reads **v1**, so after a sync the silent-tool patch would simply never install — hashline rows would leak beside the ledger, with nothing in the terminal saying why.

2. **`hasPrecedingAggregateToolsLedger` no longer exists upstream.** Verified: **0 occurrences across all of upstream/main**. Glue calls it through optional chaining and `=== true`, so the resolver degrades to `false` instead of throwing. The consequence is subtle: the native narration spacer stops being restored, so spacing regresses rather than breaking.

3. **The ledger title changed `Tools` → `Run`.** Two glue predicates match `^Tools\s*\(\s*\d+\s+calls?` (`aggregate-silent-ledger.ts`, `aggregate-omit-ledger-narration.ts`), plus 28 test assertions across `packages/core/src`. After a sync these stop matching and the narration-omission path quietly no-ops.

Also renamed: the slash command `/tool-display-intent` → `/tools`. And the seed config would need pruning — `intent.enabled` and `toolCalls.style` are gone from the 0.10.0 schema, with `toolCalls.expandedTimeline` / `showContextGrowth` added.

### `per-turn` is this repo's own asset, not something upstream absorbed

Upstream 0.10.0 has **no `per-turn` layout**. Its layout enum remains `["individual", "aggregate"]`. The only `per-turn` strings upstream are cosmetic config-modal text about context-growth changes — unrelated to a per-tool-phase ledger.

The three per-turn commits (`a07ee96`, `1001b52`, `b9f1e49`) therefore target a file upstream rewrote heavily (`aggregate-activity.ts` gained 1106 lines and lost 163 between the merge-base and `upstream/main`). Rebasing is not conflict resolution; it is re-implementing the semantic on a rewritten base.

### The biggest 0.10.0 win is already solved here

0.10.0's headline noise reduction includes folding custom messages — background task completion notices — into the Run ledger. `packages/core/src/quiet-subagent-notifications.ts` already renders those as one compact line, and does it more aggressively than upstream.

Worth noting: **upstream independently fixed the same bugs this fork fixed** — thinking being mistaken for mid-turn narration, ledger/narration spacing, and passthrough inset alignment. That is validation that the fork's direction was right, not evidence of duplicated work. The one upstream fix in this area (`1768c9d`) is an ancestor of the merge-base, so it was already inherited.

### The remaining 0.10.0 value is UI polish

Click-to-expand rows, a read-only Result/Args inspector with Metadata, Ctrl+O grouped by agent turn, a `ctx` growth receipt, and bounded head/tail steer previews. Real features, but they sit in the least stable part of the diff (mouse handling, viewport, widget order) while the quiet-ledger behaviour this repo cares about is already working.

## Facts verified, and how

| Fact | How it was established |
| --- | --- |
| `^2.6.1` resolves to 2.8.4 | `npm install --dry-run` |
| `--latest` rewrites the pin to `^4.2.5` | Sandboxed `npm install --package-lock-only` |
| Rename lands at 2.7.0; anchor width at 3.0.0 | Unpacked 2.6.2 / 2.7.0 / 2.8.4 / 3.0.0 / 4.0.0 tarballs and diffed tool names |
| No advisory in the pinned tree | `npm audit --registry=https://registry.npmjs.org` → 0 vulnerabilities (the local mirror does not implement the endpoint) |
| Rebase costs 21 blocks at commit 1 | Rebase on a disposable clone; real repo untouched |
| Patch key is v2 upstream | Read `aggregate-activity.ts` at `upstream/main` |
| `hasPrecedingAggregateToolsLedger` absent upstream | Repo-wide grep on `upstream/main` → 0 hits |
| `per-turn` absent upstream | `TOOL_CALL_LAYOUTS` at `upstream/main` is `["individual","aggregate"]` |
| Submodule installs itself from GitHub | Isolated `PI_CODING_AGENT_DIR` install of `git:github.com/CodingOX/pi-quiet-tools`; submodule checked out, CLI exited 0 |
| Exit code 0 on failure to install `github:` prefix form | Same isolated harness, `github:CodingOX/...` → `Path does not exist` |

Inference, not verified: that 0.10.0's UI features would still be reachable after reworking `per-turn` on the new base. Judging the size of that work needs a fresh look at `aggregate-activity.ts` in 0.10.0, not an estimate from this record.

## When revisiting this

Hashline is migrated. Display-intent remains deferred, and it is the only open item here.

For display-intent:

1. Re-read `aggregate-activity.ts` and `tool-overrides.ts` at `upstream/main` and re-estimate the `per-turn` rework — do not trust the estimates above.
2. Decide explicitly whether `per-turn` is still wanted. If upstream's single-ledger-per-request model is acceptable, the migration becomes far cheaper because the fork's 9 commits collapse.
3. Plan for the patch key: glue must read `v2` (or both) before anything else, or the silent-tool patch fails invisibly.
4. Re-point the ledger-title predicate and the narration resolver, and update the seed config for the removed and added fields.

Re-run these to refresh the facts:

```bash
npm run update:upstream:check                    # hashline installed vs range vs latest
git -C vendor/pi-extensions fetch upstream       # refresh upstream refs
git -C vendor/pi-extensions rev-list --left-right --count upstream/main...feat/per-turn-layout
```

## Related

- [`local-overlay.md`](./local-overlay.md) — what this repo owns on top of the two upstreams (not a sync plan)
- [`../CONTEXT.md`](../CONTEXT.md) — the ledger vocabulary these seams depend on
- [`adr/0001-open-ledger-liveness.md`](./adr/0001-open-ledger-liveness.md) — open elapsed ownership, the seam most exposed by a display-intent sync
- [`adr/0002-silent-tools-share-open-rows.md`](./adr/0002-silent-tools-share-open-rows.md) — the glue/upstream boundary a display-intent sync would move
