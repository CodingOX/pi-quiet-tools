# Upstream sync evaluation

Status: **both halves vendored; hashline is a mirror, display-intent stays a deferred fork.**

> 📌 **This record predates the vendoring rework.** It was written when hashline came from npm
> and display-intent came from a git submodule. Those two channels no longer exist: both now live
> in `vendor/`, and the only sync entry point is `scripts/vendor-pull.sh`. The **analysis** below is
> kept verbatim because it is still the reasoning behind every decision — the fork's cost, the three
> silent-failure seams, and the version-ladder breakpoints all remain true. Where a command or a
> channel name is stale, the "Current channels" section below supersedes it.

Recorded 2026-09-12 against hashline 2.6.1 and display-intent 0.9.0. Read this before re-running any upstream sync, so the analysis is not repeated from scratch. Claims below were verified against source or by execution; anything resting on judgement instead of evidence is called out inline.

## Current channels

| Layer | Location | Upstream at time of writing | Local | Sync behaviour |
| --- | --- | --- | --- | --- |
| `pi-hashline-edit-pro` | `vendor/hashline` | **4.3.4** | **4.3.4** | read-only mirror → `vendor-pull.sh` overwrites it |
| `@zhcsyncer/pi-tool-display-intent` | `vendor/display-intent` | **0.10.0** | **0.9.0** + 14 fork-modified files | fork → `vendor-pull.sh` **only reports** |

```bash
npm run vendor:pull             # hashline overwritten; display-intent reported only
npm run vendor:pull -- --check  # report only, no writes
```

The asymmetry is deliberate and encoded in the script. `vendor/hashline` has zero local edits, so
overwriting it cannot lose anything. `vendor/display-intent` carries local-only work
(`per-turn` ledger layout, the open-ledger tick, per-runtime owner lifecycle), so an automatic
overwrite would destroy it silently — see [Three silent-failure landmines](#three-silent-failure-landmines).

Hashline is now level with upstream at **4.3.4** — the 4.2.5 → 4.3.4 gap was evaluated and
closed on 2026-09-18. The move was a **choice** held open, not drift: 4.2.6 → 4.3.4 landed inside six
days, and that ladder was left unevaluated until the evaluation below was actually run.

## Why hashline is worth migrating

### The version ladder has three distinct breakpoints

| Version | What changed | Impact on this repo |
| --- | --- | --- |
| 2.7.0 | `undo_last_replace` → **`undo_last_change`**; adds `insert`, `anchor_grep` | 🔴 Rename breaks 4 glue files |
| **3.0.0** | Anchor length **3 chars → 4 chars** | 🟠 `read` output shape changes |
| 3.0.4 | Boundary, batch, and cache fixes | 🟢 Stability only |
| 4.0.0–4.2.5 | Feature and fix releases | 🟢 Stability only |
| 4.2.6 | Bun `bun:sqlite` fallback engine; `E_STORE_UNAVAILABLE`; `glob` support | 🟠 Fixes a load-level defect — see below |
| 4.2.9 | Anchor registry becomes **per-session + `AsyncLocalStorage`**; NUL-byte guard | 🟠 The only seam that needed watching |
| 4.3.0 | Adds `auto-read-all` (default `"off"`); removes `boundary-bypass.ts` | 🟢 Off by default; `boundary-bypass` was never referenced here |
| 4.3.1–4.3.4 | Boundary, batch, and cache fixes | 🟢 Stability only |

So the `exported tool names` and `anchor width` seams both moved, not just one.

### The rename is inside the current semver range

`^2.6.1` resolves to **2.8.4**, which already carries the new tool name. Verified by `npm install --dry-run`:

```text
change pi-hashline-edit-pro 2.6.1 => 2.8.4
```

**The pin must stay exact.** While this repo sat on `^2.6.1`, a plain `npm update` (the `update:upstream` range mode) resolved to 2.8.4 — a version that had already renamed the tool — and silently broke the glue. The mirror is therefore pinned to an exact version (`4.3.4`) rather than a range. Keep it that way: move the pin deliberately, verify, and re-pin exactly.

### Capability gain

- **`anchor_grep` returns anchors on search results.** Every matching line comes back as `lineNumber │ anchor│content`, so a hit can be passed straight to `replace`/`insert` without a preceding `read`. For a project whose whole point is deleting terminal round-trips, this removes a full `read` per search — and `read` is the tool this repo exists to silence.
- **`insert` fills a semantic hole.** Inserting content currently means going through `replace`, which risks removing the anchor line. `insert` states explicitly that nothing is removed, reports a noop, and reuses the `replace` safety machinery (undo saved before write, BOM/EOL preservation).
- **`Tool result details` is new machine-readable metadata.** `read` gains `snapshotId` / `nextOffset` / `truncation`; `replace` and `insert` gain `diff` / `patch` / `changedLines` / `batch` / `metrics`. A quiet ledger currently can only count calls; these fields would let it report what actually changed and how much.

### What the hashline migration changed

The rename originally looked like a four-file find-and-replace. It was done differently on purpose, because that shape was the actual defect: the same name list was written out four times, so every upstream rename meant hunting for all four copies. The list now lives in one module.

```text
src/hashline-tools.ts           ← single source of truth (new)
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

The built-in `edit` tool is still force-disabled in 4.3.4 (`setActiveTools((t) => t !== "edit")`), so that behaviour carried over unchanged.

The 3→4 char anchor change stayed **narrower than it looked**: glue contains no parse of anchor width or shape. The `│` characters in `src` are Ctrl+O frame edges, not anchor separators, so no ledger predicate depended on anchor width. Only the README sample needed updating, because it is documentation of `read` output.

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

So glue now calls `hashlineExtension` unconditionally, and the reasoning is parked in a comment at the top of `src/upstream-loader.ts` so nobody reintroduces the same dead guard. The duplicate-detection tests were removed with it, since asserting a dead branch produces confidence without protection.

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

1. **The patch key moved `v1` → `v2`.** Upstream renamed `pi-tool-display-intent.aggregate-tool-execution.v1` to `...v2` (keeping a legacy constant for its own cleanup). `src/aggregate-silent-tools.ts` reads **v1**, so after a sync the silent-tool patch would simply never install — hashline rows would leak beside the ledger, with nothing in the terminal saying why.

2. **`hasPrecedingAggregateToolsLedger` no longer exists upstream.** Verified: **0 occurrences across all of upstream/main**. Glue calls it through optional chaining and `=== true`, so the resolver degrades to `false` instead of throwing. The consequence is subtle: the native narration spacer stops being restored, so spacing regresses rather than breaking.

3. **The ledger title changed `Tools` → `Run`.** Two glue predicates match `^Tools\s*\(\s*\d+\s+calls?` (`aggregate-silent-ledger.ts`, `aggregate-omit-ledger-narration.ts`), plus 28 test assertions across `src/src`. After a sync these stop matching and the narration-omission path quietly no-ops.

Also renamed: the slash command `/tool-display-intent` → `/tools`. And the seed config would need pruning — `intent.enabled` and `toolCalls.style` are gone from the 0.10.0 schema, with `toolCalls.expandedTimeline` / `showContextGrowth` added.

### `per-turn` is this repo's own asset, not something upstream absorbed

Upstream 0.10.0 has **no `per-turn` layout**. Its layout enum remains `["individual", "aggregate"]`. The only `per-turn` strings upstream are cosmetic config-modal text about context-growth changes — unrelated to a per-tool-phase ledger.

The three per-turn commits (`a07ee96`, `1001b52`, `b9f1e49`) therefore target a file upstream rewrote heavily (`aggregate-activity.ts` gained 1106 lines and lost 163 between the merge-base and `upstream/main`). Rebasing is not conflict resolution; it is re-implementing the semantic on a rewritten base.

### The biggest 0.10.0 win is already solved here

0.10.0's headline noise reduction includes folding custom messages — background task completion notices — into the Run ledger. `src/quiet-subagent-notifications.ts` already renders those as one compact line, and does it more aggressively than upstream.

Worth noting: **upstream independently fixed the same bugs this fork fixed** — thinking being mistaken for mid-turn narration, ledger/narration spacing, and passthrough inset alignment. That is validation that the fork's direction was right, not evidence of duplicated work. The one upstream fix in this area (`1768c9d`) is an ancestor of the merge-base, so it was already inherited.

### The remaining 0.10.0 value is UI polish

Click-to-expand rows, a read-only Result/Args inspector with Metadata, Ctrl+O grouped by agent turn, a `ctx` growth receipt, and bounded head/tail steer previews. Real features, but they sit in the least stable part of the diff (mouse handling, viewport, widget order) while the quiet-ledger behaviour this repo cares about is already working.
## The 4.2.5 → 4.3.4 evaluation (2026-09-18)

Nine releases landed between 2026-09-11 and 2026-09-16 (`4.2.6`, `4.2.7`, `4.2.8`, `4.2.9`, `4.3.0`,
`4.3.1`, `4.3.2`, `4.3.3`, `4.3.4`). Upstream publishes **no tags** — `git ls-remote --tags` is empty and
the only branch is `master` — so the npm tarball is the only precise version source, which is what
`vendor-pull.sh` already uses.

The evaluation was run by unpacking both tarballs and diffing them, then dropping 4.3.4 into a copy of
this repo and running the full gate. It was a **contract-compatible bump**:

| Seam this repo touches | 4.2.5 → 4.3.4 |
| --- | --- |
| The five tool names | unchanged |
| `HASH_LEN` | still `4` |
| Diff fold thresholds | still 16 / 40 |
| `tryResolveEditTarget` signature | unchanged — the compact-title seam is safe |
| `buildEditToolSchema` / `buildInsertToolSchema` | same signature, `additionalProperties` still `true` before our lock |
| `renderShell` / `renderCall` / `renderResult` | unchanged |
| `anchor-registry` test exports | `allocateAnchor`, `freeAnchors`, `initRegistry`, `resetRegistryForTests` all present |
| `package.json` `dependencies` | byte-identical — **no new runtime dependency**, so the root `dependencies` list needs no change |

Nothing this repo references was removed: `boundary-bypass`, `normReq`, and `EditToolFlags` construction
appear nowhere in `src/` or `index.ts`, and the only `details` field glue reads is `diff`, which survives.

Two behaviour differences surfaced, and one is the reason the bump is worth taking:

- 🔴 **4.2.5 cannot load under Bun at all.** `src/hash-store.ts` did a module-level
  `await import("node:sqlite")` and `index.ts` imports it at the top level, so under a Bun host
  (no `node:sqlite`; confirmed on Bun 1.3.14) the **entire extension fails to load**. 4.2.6+ probes for
  `bun:sqlite` and degrades gracefully. This is latent here only because pi currently runs on Node.
- 🟠 **The anchor registry became per-session (4.2.9), and that is strictly better for this repo.**
  4.2.5 kept a single module-level `currentKey`; a child session's `session_start` overwrote it and the
  host's anchors stayed unresolvable **for the rest of the session** (only `/reload` recovered). 4.3.4
  scopes the registry with `AsyncLocalStorage`, so the host's own next tool call heals the lookup.
  Both were reproduced with a probe against the real vendored module; neither is a complete fix —
  between a child session coming up and the host's next call, the compact-title lookup can still
  return `undefined` and fall back to `anchor→anchor` text. That is cosmetic (the title only) and
  self-healing, and it is not a reason to hold the pin.

Restating the shape of the fix for future syncs: 4.3.4 also added `auto-read-all` (a `before_agent_start`
custom message, default `"off"`, so unreachable unless opted in) and removed `boundary-bypass.ts`.
Neither is referenced by this repo.
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
| 4.3.4 is contract-compatible | Unpacked both tarballs, replaced `vendor/hashline` in a repo copy, ran `npm run typecheck` + the full suite: 72 / 5 / 24 / 10 all pass |
| The suite really loads 4.3.4 | A probe test resolved `pi-hashline-edit-pro/package.json` to `4.3.4` inside the tsx run |
| Upstream has no tags | `git ls-remote --tags` → empty; only `refs/heads/master` |
| Bun cannot load 4.2.5 | Bun 1.3.14: `import("node:sqlite")` → `No such built-in module`, and `src/hash-store.ts` is a top-level import of `index.ts` |
| Child session poisons 4.2.5's lookup; 4.3.4 heals | Probe driving real `allocateAnchor` / `ownerOf` through two session contexts, run against both vendored versions |
| `pi install git:...` lands a complete bundle | Isolated `PI_CODING_AGENT_DIR` install; all four bundled deps resolved and Pi's loader registered all ten tools |

Inference, not verified: that 0.10.0's UI features would still be reachable after reworking `per-turn` on the new base. Judging the size of that work needs a fresh look at `aggregate-activity.ts` in 0.10.0, not an estimate from this record.

## When revisiting this

Hashline is migrated and sits level with upstream. Display-intent remains deferred, and it is the only open item here.

For display-intent:

1. Re-read `aggregate-activity.ts` and `tool-overrides.ts` at `upstream/main` and re-estimate the `per-turn` rework — do not trust the estimates above.
2. Decide explicitly whether `per-turn` is still wanted. If upstream's single-ledger-per-request model is acceptable, the migration becomes far cheaper because the fork's 9 commits collapse.
3. Plan for the patch key: glue must read `v2` (or both) before anything else, or the silent-tool patch fails invisibly.
4. Re-point the ledger-title predicate and the narration resolver, and update the seed config for the removed and added fields.

Re-run these to refresh the facts:

```bash
npm run vendor:pull -- --check   # hashline drift (expected: none) vs display-intent fork delta, no writes
git ls-remote --tags https://github.com/YuGiMob/pi-hashline-edit-pro.git | tail -5
git ls-remote --heads https://github.com/CodingOX/pi-extensions.git   # fork branch still reachable
```

## Related

- [`local-overlay.md`](./local-overlay.md) — what this repo owns on top of the two upstreams (not a sync plan)
- [`../CONTEXT.md`](../CONTEXT.md) — the ledger vocabulary these seams depend on
- [`adr/0001-open-ledger-liveness.md`](./adr/0001-open-ledger-liveness.md) — open elapsed ownership, the seam most exposed by a display-intent sync
- [`adr/0002-silent-tools-share-open-rows.md`](./adr/0002-silent-tools-share-open-rows.md) — the glue/upstream boundary a display-intent sync would move
