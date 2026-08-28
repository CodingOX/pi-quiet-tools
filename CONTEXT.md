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

**Open rows**:
The at-most-three tool rows under an open Tools ledger. Pending and running calls take slots first; remaining slots show the most recently completed calls, including silent tools.
_Avoid_: live current tool, live tail, recent tools, active window, retained rows

**Silent tool**:
`read`, `replace`, and `undo_last_replace`. They share Open rows with other aggregated tools instead of keeping a private live pin.
_Avoid_: hidden tool, quiet tool

**Open elapsed**:
Wall-clock time an open ledger has been active. It is shown only while the ledger is not settled.
_Avoid_: receipt, took line

**Ledger receipt**:
The muted duration, token, and completion-time line under a settled ledger.
_Avoid_: stats line, footer
