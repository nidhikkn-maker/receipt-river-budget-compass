# Lead note — Track A 6ea9c77 (tracka/p14-copy-rule): staged P14-c, 13 Nov 2026

**Scope:** staged P14 SQL choose the disposal copy by the app's rule (owner- and month-aware; excluded copies skipped; the sale stops the id), record the asset ordinal, approve only that one row after re-checking it byte-identically under lock, and roll back on any refusal. The multiset guard now also blocks a second copy being marked sold. Independent note 4227345959.

**Independent review (with PGlite attack scripts): accept with one Medium.**
- **M1 (open):** the unique open-request index (owner_id, asset_id) means a second entity's copy of the same id can never be disposed once the first is approved. Fails closed; nothing is corrupted.
- **Lows:**
  - parity edge cases: kind "constructor" and similar; excludedAt 1e-400; ownerEntityId false/0;
  - the multiset guard allows relocating sold facts between rows;
  - the contract doc maps `?? ""` (wrong);
  - test gaps;
  - re-install shape check.
- **Verified:**
  - no cross-owner or cross-entity write;
  - the ordinal can't be forged;
  - one row written, under consistent lock order;
  - refusals are atomic;
  - search_path pinned;
  - overloads unambiguous;
  - line-by-line parity with the app;
  - rollback audit-preserving.

**Lead runner:** a restart interrupted the runner after typecheck, build and run-1 had PASSED. run-2 and run-3 were run in the foreground on the same tree, unchanged before and after each. Each run: 3,541 of 3,542 tests (1 skip, already in the base).

**Mutation check:** dropping the ordinal and byte-identical check at approval fails P14-c test (5) (1 of 26). Restored.

**develop/sf-base fast-forwarded** cdecb9c → 6ea9c77.

**P14 remains BLOCKED / DO NOT INSTALL** until M1 (open-request index keyed by copy owner) and the parity lows are fixed. Routed to Track A.
