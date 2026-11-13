# Lead note — WS-F1 fb4094d (ws/f1-travel-density-4), 13 Nov 2026

**Candidate:** fb4094d52d913f89d25f6b9240d94a26066f7e42, tree 53cc3713. One commit on 00a755c, fixing the review lows of 00a755c:
- desktop 720 px caps for the approver and needs-review rows;
- collapsed-summary captures;
- jump-row measure on mount and a scroll lock;
- test timers;
- summary aria-labelledby (heading plus status).

**Review:** the lead reviewed the 5-file delta: scroll-lock cleanup is correct; the money-row cap applies to Signature Flow only; no src/lib change.

**Runner:** a container restart interrupted the runner after typecheck and build PASSED, so the three passes were run in the foreground on the same tree, unchanged before and after each. Each pass: 3,949 of 3,950 tests (1 skip, already in the base).

**Mutation check:** going back to aria-describedby fails "L-A1 … named by it and its status" (1 of 20). Restored.

**Gate:** PASS on preview/ws-f1 c16812c1, a lead merge with a tree identical to fb4094d, deployment dpl_5HkEhSAgA6fvTrWgfMxg4CJi2EhW.
- The bundle commit matches; fixture only; 0 production references; no lock-screen leaks.
- 43 captures: 0 overflow and 0 page errors.
- The link was revoked; see AFTER_CHECKS in docs/evidence/lead-gate/2026-11-13c.
