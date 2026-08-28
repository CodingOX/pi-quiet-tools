# Silent tools share Open rows; glue does not recap the ledger

An open Tools ledger already has a three-row window in display-intent: pending and running take slots first, remaining slots show the most recently completed calls. Quiet glue no longer hides completed silent rows or caps silent live rows at one — collapsed ledger lines pass through. Glue still swallows non-ledger silent renders so hashline per-call rows do not leak beside the ledger. After settle, the ledger still collapses to header and receipt. This supersedes ADR 0001’s silent-row exception; open elapsed stays in display-intent.

**Considered options**

- Glue re-counts a three-row cap — rejected: duplicates the upstream window.
- Delete the silent wrap — rejected: non-ledger hashline rows would leak beside the ledger.
- Move silent visibility into display-intent — rejected: still quiet policy; only the extra filter is removed.
