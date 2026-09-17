# Child sessions get a settle-oriented watchdog

A silent child bash runaway never returns, so the parent waits forever. Child sessions (`ctx.hasUI !== true`) now share the host bash budget and grace (80 then 10 turns) on a **per-session ledger** keyed by `sessionManager.getSessionId()`, never mixed with the UI host. Intervention copy is an incomplete handoff to the parent (first line `INCOMPLETE`), not a status report to the human. Child official text does **not** reset the ledger: the parent cannot see mid-loop Markdown, so speaking and continuing is still a silent runaway. After nudge, if the child keeps tooling through grace, later tools are blocked (`{ block, reason }` only — no `terminate`) so the next LLM turn can write the handoff and settle. That ends the child run; it does not resume itself. The parent may `resume` or continue the work. No `ctx.ui.notify` on children. Host waiting on Ask or Agent still does not increment the host budget. ADR 0003’s child exemption and “clipping looks like completion” rejection are superseded: the handoff is explicitly unfinished.

**Considered options**

- Same host copy and reset-on-text on children — rejected: child prose never reaches the parent, so reset lets the runaway continue.
- Nudge only, never hard-stop — rejected: a child that ignores the nudge still never returns.
- Count every child tool call — rejected: Explorer read/grep storms are the happy path, same as host.
- One watchdog instance for all children — rejected: parallel children would share a budget.
- `terminate: true` on the child hard-stop — rejected: skips the LLM turn that must write the handoff.
- Clip at 50 bash — rejected: keep the system limit (80 + 10), not a second magic number.
