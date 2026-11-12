# Lead note — Track A fb41b01 (tracka/p20-release-gate)
Runner: ACCEPTED 3 x 3,477/3,478 (1 skipped by design, it.runIf(stack)); tree 1e2e0e83 unchanged.
Independent review: no High; md5 setting pins complete for column types; no rollback/E1 deadlock; demo cleanup cannot remove a real user's session; no applied migration edited.
Mutation (lead, 2026-11-12 ~03:10Z): removing track_retained SET clauses -> Kolkata/SQL-DMY rollback test fails (1 failed | 32 passed | 1 skipped); restored.
Merged develop/sf-base d6422064 (no-ff; merged tree == verified tree).
Follow-ups (non-blocking): cap demo cleanup lookups/failed lookups per run (review M1, operational); install lock test independent of later DDL locks; rollback post-block re-check of guard triggers.
