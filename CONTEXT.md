# Quiet Tools Display

The language for collapsing tool activity in the Pi terminal without making an open phase look stuck, and for stopping a UI-host runaway without touching child sessions.

## Language

**Tools ledger**:
The collapsed aggregate view of consecutive tool calls in one tool phase — the `Tools (N calls · M turns)` header and any rows under it.
_Avoid_: tool list, tool dump, tool group

**Open ledger**:
A Tools ledger whose phase is not finished and may still have running or pending calls.
_Avoid_: last turn, live block, in-progress group

**Settled ledger**:
A Tools ledger whose phase has finished. Quiet UI shows the header and receipt only.
_Avoid_: historical tools, completed group

**Open rows**:
The at-most-three tool rows under an open Tools ledger. Pending and running calls take slots first; remaining slots show the most recently completed calls, including silent tools.
_Avoid_: live current tool, live tail, recent tools, active window, retained rows

**Silent tool**:
`read`, `replace`, `insert`, `undo_last_change`, and `anchor_grep` — the tools registered by `pi-hashline-edit-pro`. They share Open rows with other aggregated tools instead of keeping a private live pin. The set is defined once in `packages/core/src/hashline-tools.ts`.
_Avoid_: hidden tool, quiet tool

**Open elapsed**:
Wall-clock time an open ledger has been active. It is shown only while the ledger is not settled.
_Avoid_: receipt, took line

**Ledger receipt**:
The muted duration, token, and completion-time line under a settled ledger.
_Avoid_: stats line, footer

**UI host**:
The session a human is watching. `ctx.hasUI` is true.
_Avoid_: main agent, parent session

**Child session**:
An in-process subagent session. `ctx.hasUI` is false.
_Avoid_: isolated agent

**Bash budget**:
The cap on bash calls in one UI-host user request that trips the watchdog nudge.
_Avoid_: tool budget

**Watchdog nudge**:
The first intervention after the bash budget or a long wall-clock cap counted from the user request. This clock is not open elapsed, and it freezes while the UI host waits on `Agent` or `get_subagent_result`.
_Avoid_: warning, reminder, progress tool

**Grace period**:
The maximum remaining work after a watchdog nudge. Whichever limit hits first ends it.
_Avoid_: timeout

**Hard stop**:
The state after the grace period. Later tool calls are refused so the UI host must reply with current work and next steps. An already-running tool is not aborted.
_Avoid_: kill, abort, cancel
