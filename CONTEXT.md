# Quiet Tools Display

The language for collapsing tool activity in the Pi terminal without making an open phase look stuck.

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

**Live current tool**:
The at-most-one pending or running silent-tool row shown on an open ledger. Non-silent live rows stay visible.
_Avoid_: recent tools, live tail, retained rows, active window

**Silent tool**:
A tool whose completed per-call rows stay hidden in the collapsed quiet ledger. Currently `read`, `replace`, and `undo_last_replace`.
_Avoid_: hidden tool, quiet tool

**Open elapsed**:
Wall-clock time an open ledger has been active. It is shown only while the ledger is not settled.
_Avoid_: receipt, took line

**Ledger receipt**:
The muted duration, token, and completion-time line under a settled ledger.
_Avoid_: stats line, footer
