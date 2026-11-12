# Lead note — Track A 16e2b75 (tracka/p20-followup)
Runner: ACCEPTED 3 x 3,482/3,483 (1 skip by design); tree fa9a6b4a unchanged.
Lead review (diff read in full): lookup cap 400 + 10-error streak stop reported 500, never deletes on doubt; rollback re-checks all four guard triggers under lock before hashing; install lock proven by pg_locks probe.
Mutation (lead): disabling the error-streak stop -> "auth API down" test fails (1 failed | 8 passed); restored.
Merged develop/sf-base (no-ff; merged tree == verified tree).
