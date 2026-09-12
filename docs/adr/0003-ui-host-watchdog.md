# Watchdog lives in quiet-tools and only gates the UI host

A silent bash runaway is a host-session accident, not a display bug and not a prompt problem. The watchdog ships in `packages/core` on the same extension entry: after 50 bash calls or 30 minutes (`requestWallClockMs`, measured from the user request — not open elapsed, and frozen while the UI host has `Agent` or `get_subagent_result` in flight), nudge via `ctx.ui.notify` (a human-facing warning, not a progress tool); then at most 5 turns or 3 minutes; then hard-stop later tools and demand a status reply in Chinese (current work / next step). Wall-clock thresholds advance on UI-host timers, not only on the next tool, turn, or context event; timers do not abort an already-running tool. Child sessions are exempt (`ctx.hasUI !== true`) and do not share this clock. Hard-stop returns only `{ block, reason }` from the tool-call handler so a follow-up LLM turn still runs; `terminate: true` belongs on custom tool `execute()` and would skip that turn. `before_agent_start` fires once per user prompt, so later-turn instructions are injected via the `context` event copy (not stored in the session). `session_shutdown` resets state unconditionally — even if `hasUI` is lost — so counts do not carry into the next session. A separate plugin and a progress tool were rejected — one install, and a model that will not speak will not call a status tool either. Clipping subagents was rejected because the parent would treat the progress report as completion.

**Considered options**

- Separate plugin — rejected: extra install, against “fewer tools”.
- Same limits on child sessions — rejected: delegated work would look finished when it was only paused.
- Abort the in-flight tool — rejected: a long but legitimate command would die at the clock.
- `terminate: true` on blocked tools — rejected: Pi skips the next LLM call, so there is no status reply.
- Inject a fake user message into the session — rejected: pollutes history; the `context` copy is enough.
- Event-only wall clock (no timer) — rejected: a quiet gap would not nudge until the next tool event.
- Count host wait-on-subagent toward wall clock — rejected: subagents have their own limits; freeze the host clock for in-flight `Agent` / `get_subagent_result`.
