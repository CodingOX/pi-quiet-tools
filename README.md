# pi-quiet-tools

A Pi extension that makes the terminal quieter **without taking anything away from the model**.

Pi normally prints a block for every tool call — a `Read(path)` row and a file body here, a diff there,
a subagent notice with a transcript path. A busy turn becomes a wall of transcript that buries the
answer. `pi-quiet-tools` collapses that into small, readable summaries, while the model keeps receiving
exactly what it received before: full file contents with hash anchors, complete tool results, the whole
session.

What you get:

- **Hash-anchored editing.** `read` returns each line with a short anchor, so the model edits by anchor
  instead of retyping file content — fewer failed edits, and no whole-file rewrites to see in the diff.
- **A Tools ledger** instead of a per-call transcript — one header, up to three live rows, and a
  receipt. File bodies and anchors never leak into the terminal.
- **Edits you can actually see.** `replace` and `insert` stay outside the ledger and show a short
  `+/-` snippet, so you can tell what changed at a glance.
- **Your narration stays.** Mid-turn assistant Markdown is real content and remains visible; only
  thinking and control noise are hidden.
- **A bash runaway gate.** After 80 bash calls it asks the model to report progress; if ten more turns
  pass with no visible reply, it blocks further tool calls until the model speaks.
- **Compact subagent notices.** Completion notices become one status line instead of a multi-line
  block with paths.
- **Markdown that reads better.** Mermaid diagram dialects, GitHub admonitions, and bare URLs become
  links — all inside code fences left untouched. Two cosmetic extras (circled-digit rewriting and
  code-fence hiding) are **off by default**; turn them on if you want them.

Everything ships in one package. Install once — there is no second step, no glue file to copy, and
nothing to configure before it works.

[简体中文](./README.zh-CN.md)

---

## Install

```bash
pi install git:github.com/CodingOX/pi-quiet-tools
```

That is the whole install. Pi clones the repository into its own git directory, installs its
dependencies, and adds it to your settings. The hash-anchored editor, the tool renderers, the watchdog,
and the compact notices all come with it.

The HTTPS form works too, and you can pin a branch or tag:

```bash
pi install https://github.com/CodingOX/pi-quiet-tools
pi install git:github.com/CodingOX/pi-quiet-tools@main
```

Then restart Pi.

> [!WARNING]
> Use the `git:` prefix or a full protocol URL. `github:CodingOX/pi-quiet-tools` is **not** a Pi package
> source — Pi treats anything else as a local path and fails with `Path does not exist`.
>
> Do **not** run `pi install npm:pi-quiet-tools`. This project is not published to npm, and an
> **unrelated** package already owns that name. You would install a different tool entirely.

### Updating

```bash
pi update                                          # everything
pi update git:github.com/CodingOX/pi-quiet-tools    # just this one
```

**Restart Pi after an update.** `/reload` is not enough: Pi caches module resolution for the whole
process, and an updated package may have moved files that the cache still points at.

### Uninstalling and cleaning up old installs

```bash
pi remove git:github.com/CodingOX/pi-quiet-tools
```

If you previously installed the underlying pieces separately, remove them too — they are already inside
this package, and keeping both means the same tools get registered twice:

```bash
pi remove npm:pi-hashline-edit-pro
pi remove npm:@zhcsyncer/pi-tool-display-intent
```

---

## What you'll see

Quiet, but not silent. A turn that reads four files and runs a command looks like this:

```text
I'll inspect the current glue layer first.

◐ Tools (4 calls · 2 turns) · 7s · read ×3 · bash ×1
  ◐ Read(index.ts)
  ✓ Read(src/config-seed.ts)
  ✓ Read(src/aggregate-silent-tools.ts)

✓ Tools (9 calls · 3 turns) · read ×9
  took 12s · tok ↑18.2k ↓1.4k · at 14:32

The read path is already silent. Next I'll tighten the aggregate wrap.

✓ Tools (3 calls · 1 turn) · bash ×3

[Assistant answer]
```

Sixteen tool calls in seven lines. Nothing was hidden from the model — the nine reads in the middle
phase are still all there, one `Ctrl+O` away.

### Reading the ledger

| You see | It means |
| --- | --- |
| `✓ Tools (…)` | The phase is finished. Header and receipt only. |
| `◐ Tools (…) · 7s` | Still running. The timer ticks so a long single tool never looks frozen. |
| `! Tools (…) · N failed` | Something failed; expand to see which call. |
| `↳ 1 steer` | You steered the agent during this phase. |
| Rows starting `◐` / `✓` | Live rows — pending and running first, then the most recent. |
| `took … · tok ↑… ↓… · at …` | Cost and time for the finished phase. |

Two things are deliberately **not** in the ledger: the in-progress prose pin (that same text is already
above it as normal Markdown), and per-call rows for quiet tools like `read`.

### Seeing everything

Press **`Ctrl+O`** to expand the grouped timeline — one line per call, with its target and status — and
press it again to collapse. You never need it for normal work; it is there when the summary is too
coarse.

Edits are the one thing that stays visible without expanding, because you usually want to see them:

```text
replace src/config-seed.ts
+1 -1
-   "intent": { "enabled": true }
+   "intent": { "enabled": false }
```

`Ctrl+O` on an edit restores the full native diff.

---

## Making it yours

Out of the box it needs no configuration. When you want to change it:

- **`/tool-display-intent`** opens the display settings panel — layout, result mode, diff rendering, and
  which tools stay outside the ledger.
- **`/hashline-config`** covers the editing side — auto-read, diff context lines, the anchored search vs
  the built-in `grep`, strict input, and which folders to ignore.

Settings persist to `~/.pi/agent/extension-data/pi-tool-display-intent/config.json` (or under
`$PI_CODING_AGENT_DIR` if you set it). Changes to layout or tool ownership need `/reload`.

If you want another tool kept out of the ledger and shown in full, add its name to
`tools.passthrough`. Quiet tools like `read` are stripped back out automatically on startup, so reads
stay aggregated even if you paste an old config that lists them.

The Markdown side has its own small config file — `~/.pi/agent/extension-data/pi-quiet-tools-markdown-enhance/config.json`:

```json
{
  "enabled": true,
  "common": true,
  "deCircled": false,
  "hideCodeFence": false
}
```

| Key | What it does |
| --- | --- |
| `common` | Mermaid dialects, admonitions, bare-URL linkify. |
| `deCircled` | Rewrites ①②③ → (1)(2)(3). Only needed if your font packs circled digits too tightly. |
| `hideCodeFence` | Drops the ```` ``` ```` chrome lines above and below code blocks. |

Both cosmetic keys are **off by default**, so a fresh install looks the same as vanilla Pi apart from the diagram and link improvements. Changing any value needs `/reload` — `hideCodeFence` installs a prototype patch that cannot be uninstalled mid-process.

---

## If something looks wrong

| Symptom | What to do |
| --- | --- |
| `Tool "read" conflicts with …` when Pi starts | Two copies of the hash-anchored editor are loaded. The session still works. Remove the standalone `pi-hashline-edit-pro` entry from your `packages` list. |
| A row per `Read(path)` next to the ledger | An old config still lists `read` as passthrough. It is normally cleaned up on startup; remove it manually if not. |
| Subagent notices are still long | `@tintinweb/pi-subagents` is loading first. Pi uses the first renderer registered for a notice type, so this package has to come first. |
| `Failed to load extension: ENOENT …` | Pi started before the package finished updating on disk. **Restart Pi** — `/reload` cannot clear a stale module path. |
| Nothing looks different at all | Restart Pi, then confirm only one package is installed and the config file exists. |
| Replacements inside a blockquote lose their quote styling after a bold/code/link run | A pre-1.0 copy of this extension already patched `Markdown.renderToken` in this process, and that patch cannot be uninstalled. **Restart Pi** — `/reload` only re-runs extension code; it does not reset the prototype. |

Deeper cases — `E_STORE_UNAVAILABLE`, `Cannot find module`, why the load order matters — live in
[`docs/internals.md`](./docs/internals.md).

---

## Requirements

- Pi coding agent >= 0.84
- Node.js >= 22.19
- An interactive terminal session — the ledger is a terminal renderer

---

## More

| Document | Contents |
| --- | --- |
| [`docs/internals.md`](./docs/internals.md) | Architecture, load order, bundling rules, development, deep troubleshooting |
| [`CONTEXT.md`](./CONTEXT.md) | Glossary — ledger, Open rows, silent tool, visible edit |
| [`docs/adr/`](./docs/adr) | Why each design decision was made |
| [`docs/upstream-sync.md`](./docs/upstream-sync.md) | State of the two vendored upstreams |
| [`CHANGELOG.md`](./CHANGELOG.md) | Dated milestones |

---

## License

MIT. The vendored third-party code keeps its own MIT terms and copyright holders — see
[`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md).
