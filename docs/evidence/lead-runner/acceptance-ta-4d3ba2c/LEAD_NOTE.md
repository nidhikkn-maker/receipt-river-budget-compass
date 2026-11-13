# Lead note — Track A 4d3ba2cf (tracka/p14-copy-rule-2): staged P14-d, 13 Nov 2026

**What it fixes (from the P14-c review):**
- **M1:** open requests keyed by the copy owner.
- **L1:** parity with the app on known kinds, owner normalisation and JS truthiness.
- **L2:** a sold row is bound to its approval.
- **L3:** the contract doc's owner mapping.
- **L4:** legacy requests with a NULL ordinal.

**Independent review (PGlite attacks): accepted as development.** Verified:
- M1: entity B is approvable after entity A, and a single copy is never approved twice.
- L1 parity: `known_kind` equals `ASSET_KINDS`, and `truthy` matches JS on edge values.
- L4.
- Atomicity, rollback, and that `sold_rows_moved` reveals nothing to other users.
- The position binding breaks no current WS-E save path.

**Two Mediums must be fixed before P14 can be installed:**
- **M-a:** the L2 field binding compares raw bytes, so a name-only edit of a sold row stored in untidied form (owner "", null or false; land with no bookMethod; SLM with no bookRatePct) is refused. Bind by meaning instead: id, normalised owner, and the book value recomputed at the disposal date equal to the request's.
- **M-b:** excluding the sold copy (excludedAt) is accepted, which effectively undoes the disposal. Refuse it.

**Lows:**
- book-value fields not frozen (covered by the M-a fix);
- absolute-position binding is stricter than needed;
- a whitespace owner;
- the app's own `ownerOf` inconsistency (routed to WS-E);
- re-install over a P14-c retained table.

**Lead runner: ACCEPTED.** Three runs, each 3,547 of 3,548 tests.

**Mutation check:** dropping `asset_owner_entity` from the open-request index fails the P14-d M1 test (1 of 32). Restored.

**develop/sf-base fast-forwarded** 6ea9c77 → 4d3ba2cf.

**P14 remains BLOCKED / DO NOT INSTALL** until M-a and M-b are fixed. Routed to Track A as P14-e.
