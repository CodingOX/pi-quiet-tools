# Open elapsed in display-intent; live current tool in quiet glue

Status: accepted; the silent-row exception is superseded by ADR 0002. Open elapsed ownership is unchanged.

The next paragraph is the original decision text. Its silent-row policy (one live silent row, hide completed silent rows) is no longer in force.
An open Tools ledger must show it is still working (live current tool + ticking open elapsed) without un-collapsing settled history. Open elapsed belongs in display-intent because that layer already owns the ledger header, `startedAtMs`, and invalidate/re-render. Quiet glue owns the silent-tool exception: keep at most one silent live current tool row, still hide completed silent rows, and leave non-silent live rows (such as bash) visible. While any ledger is open, display-intent refreshes about once per second so a long single tool does not freeze the clock; the timer stops on settle and session shutdown. No new user-facing config.

**Considered options**

- All in glue — rejected: injecting elapsed into an ANSI header is brittle, and glue does not own `startedAtMs`.
- All in display-intent — rejected: whether a silent tool’s live row is visible is quiet policy, not upstream layout.
- Event-only elapsed (no timer) — rejected: a long `read`/`replace` would still look stuck for a full minute.
- Configurable live pin or tick interval — rejected as YAGNI for this slice.
- Entire open ledger only one live row (P2) — rejected: a long bash could be hidden when a silent tool is also active.
- Restore up to three mixed live rows (P3) — rejected: that reopens the 1–3 row noise the Grill ruled out.
