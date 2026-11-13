# Lead note — WS-F1 Travel density on develop/sf-base: lead candidate afda8824, 13 Nov 2026

**Candidate:** `lead/f1-density-on-sfbase` afda8824ced7428c16c3d1d370bf0eaae829bcee = WS-F1 5bd4753 (ws/f1-travel-density-2) merged with develop/sf-base a21f34dd (no-ff; only store.tsx auto-merged, no conflicts).

**Independent review: accept with lows**, for both the change and the merge.
- Completeness: no status, figure or limitation note was lost. "Settled/empty" collapse uses the same data as the figures, and a refund still expected keeps its section open. Offline, sections never collapse.
- No financial logic changed (no src/lib file touched). Classic uses semantic tokens only.
- The merge is exact: it is line-for-line identical to WS-F1's delta, and Travel adds no double padding inside the new `.sf-page`.
- Lows, routed:
  - headings inside `<summary>` with VoiceOver;
  - collapsed sections hide their calls to action behind an extra tap;
  - the jump-row `aria-current` can go stale;
  - the Payment region is named twice;
  - the "Not available yet" prefix is read twice;
  - the README wording for L3;
  - no test for the cancelled-bookings collapse;
  - coded-currency strings classed as text (fixed in Track B density-3);
  - "12 of 345" counts classed as text;
  - the 720 px cap gives uneven right edges on desktop;
  - the developer's captures predate the merge.

**Lead runner: ACCEPTED.** Typecheck and build passed; three runs, each 3,926 of 3,927 tests (1 skip, already in the base), 474 files. Two earlier attempts were interrupted by container restarts and are kept as `-killed` / `-int2`.

**Mutation check:** undoing the M3 phone stacking in TripClaimsSection.tsx:48/57 fails the travel-density test "gives the claim text the full row below sm…" (1 of 10). Restored.

**Protected gate: PENDING.** The deployment is ready: dpl_6vvhiAxWQA1wKJKERhcdHRy3d7tp, built from preview/ws-f1, which was fast-forwarded to afda8824. Creating the deployment-scoped share link (KK-20261112-02) needs an interactive approval prompt in this session. That prompt went unanswered overnight and was closed by a worker restart, so no link was created and the captures are not taken. Protection was never changed. Anonymous access to the alias is still 302.
