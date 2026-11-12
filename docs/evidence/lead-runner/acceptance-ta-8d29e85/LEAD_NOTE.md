# Lead note — Track A 8d29e85 (tracka/receipt-correction-2)
Runner: ACCEPTED 3 x 3,461/3,462 (1 skipped by design: it.runIf(stack) full-stack-only guard test, applied-schema pass); tree bd489b59 unchanged.
Independent review: no High. Verified: online self-heal (no double flush/refresh, failed flush keeps queue), doc writes refuse offline, cleanup skips only missing-table, P18 rewrite both orders, re-adoption checks.
Not yet mergeable: M1 retained-md5 can be refreshed over admin-tampered rows by a later legitimate delete (header claim overstated); M2 cleanup-demos ignores deleteUser error (orphaned identity, pre-existing). Follow-up commit requested; merge decision on the follow-up after delta review + runner.
