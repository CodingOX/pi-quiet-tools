# Quiet Tools Display

The language for collapsing tool activity in the Pi terminal without making an open phase look stuck, and for stopping a silent bash runaway on the UI host and on child sessions.

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
`read`, `undo_last_change`, and `anchor_grep` — plus the retired `undo_last_replace`. They share Open rows with other aggregated tools instead of keeping a private live pin. The set is `HASHLINE_SILENT_TOOL_NAME_SET` in `src/hashline-tools.ts`.
_Avoid_: hidden tool, quiet tool

**Visible edit tool**:
`replace` and `insert`. They stay in `tools.passthrough` and draw a truncated +/- snippet (about 6 change lines) instead of joining the silent ledger-only set. `Ctrl+O` restores hashline's native preview.
_Avoid_: edit dump, full diff

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
An in-process subagent session. `ctx.hasUI` is false. It has its own watchdog ledger, not the host's.
_Avoid_: isolated agent

**Bash budget**:
The cap on bash calls in one user request (host or child) that trips the watchdog nudge. Same number for both: 80.
_Avoid_: tool budget

**Watchdog nudge**:
The first intervention after the bash budget. On the UI host it asks for visible prose and resets when that prose appears. On a child session it asks for an incomplete handoff to the parent; child prose does not reset the ledger. Waiting on the human (Ask) or a child session does not trip the **host** gate. There is no request wall-clock cap.
_Avoid_: warning, reminder, progress tool

**Grace period**:
The remaining LLM tool-calling turns after a watchdog nudge. Turns alone end it; there is no grace wall-clock cap. Same length on host and child: 10.
_Avoid_: timeout

**Hard stop**:
The state after the grace period. Later tool calls are refused so the model must speak. An already-running tool is not aborted. On the UI host, the first official assistant text of a later turn resets this state. On a child session it does not: the child must settle with an incomplete handoff; it will not resume itself.
_Avoid_: kill, abort, cancel

**Incomplete handoff**:
The child-session watchdog reply. First line is `INCOMPLETE`. Tells the parent what is done, what is not, and whether to `resume` or continue the work. It is not a completion.
_Avoid_: progress report, status reply

**Official assistant text**:
Visible assistant Markdown — not thinking blocks, not GPT-style `<thinking>` tags, not a leftover session-sequence prefix. The first such text in a UI-host turn resets the bash budget and watchdog phase. Child-session text does not.
_Avoid_: thinking, tool dump, narration pin

**Closeout gate**:
The rule that a change is not done until it has been checked on a reloaded runtime, and the pipeline that does it — `quiet-tools-verify`. The agent may run the static stages alone; the user owns the reload and the visual stages.
_Avoid_: sign-off, QA pass, final check
