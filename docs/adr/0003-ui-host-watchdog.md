# Watchdog lives in quiet-tools and only gates the UI host

> Superseded in part by [0004](./0004-child-session-watchdog.md): child sessions are no longer exempt. Host behaviour below still holds.

A silent bash runaway is a host-session accident, not a display bug and not a prompt problem. The watchdog ships in `packages/core` on the same extension entry: after 80 bash calls, nudge via `ctx.ui.notify` (a human-facing warning, not a progress tool); then at most 10 LLM turns; then hard-stop later tools and demand a status reply in Chinese (current work / next step). There is no request wall-clock cap and no grace wall-clock cap — waiting on Ask, a child session, or a long command must not trip the gate while the human is away. Only `bash` increments the budget; other tool calls do not. The first official assistant text of a turn (visible Markdown after stripping thinking / session-sequence leftovers, via `message_update` / `message_end`) is treated as progress: bash count and grace/hard-stop phase reset. Thinking-only output does not. Child sessions are exempt (`ctx.hasUI !== true`). Hard-stop returns only `{ block, reason }` from the tool-call handler so a follow-up LLM turn still runs; `terminate: true` belongs on custom tool `execute()` and would skip that turn. `before_agent_start` fires once per user prompt, so later-turn instructions are injected via the `context` event copy (not stored in the session). The nudge copy tells the model that thinking, tool calls, and self-instructions are meaningless to the user — only visible prose counts. `session_shutdown` resets state unconditionally — even if `hasUI` is lost — so counts do not carry into the next session. A separate plugin and a progress tool were rejected — one install, and a model that will not speak will not call a status tool either. Clipping subagents was rejected because the parent would treat the progress report as completion.

**Considered options**

- Separate plugin — rejected: extra install, against “fewer tools”.
- Same limits on child sessions — superseded by [0004](./0004-child-session-watchdog.md): children share 80+10 on an isolated ledger, but settle with an incomplete handoff instead of resetting on text.
- Abort the in-flight tool — rejected: a long but legitimate command would die mid-run.
- `terminate: true` on blocked tools — rejected: Pi skips the next LLM call, so there is no status reply.
- Inject a fake user message into the session — rejected: pollutes history; the `context` copy is enough.
- Request + grace wall clocks — rejected: Ask (and any human wait) would trip the gate while the user is away.
- Freeze the clock on Ask as well as Agent — rejected: every new blocking tool would need another freeze.
- Count every tool call, not just bash — rejected: read/grep storms are the quiet-tools happy path.
- Count silent LLM turns — not this change; bash volume is the runaway that can hang the machine.
- Keep 5 grace turns — raised to 10 so a real wrap-up after nudge is not clipped.
- Keep counting bash after official assistant text — rejected: visible progress means it is not a silent runaway; the first official text of a turn resets bash and grace.
