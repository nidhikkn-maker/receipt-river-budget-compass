# Lead note — Track A dc41336 (tracka/p14-brief-gaps-2), 12 Nov 2026

Commit dc4133616e1fa1b4aafb9e4356a87603b265c84e, tree 0279c59b…, built on fab1ed36, which is built on develop/sf-base bcb2b889.

**Scope:** closes the migration-brief gaps for P14.
- G9: the rollback keeps the audit trail. The table is locked, its row count and md5 are checked under the lock, it is recorded and made read-only, and a re-install accepts it only if it is unchanged.
- G10: rows can be removed only by the owner's confirmed erasure or by demo-guest cleanup, matching P20.
- G11: the P14 and P20 trails are excluded from backup restore.
- Review M1: P14 install and rollback are refused while P18 is installed.

**Review cycle**
- fab1ed3 was reviewed independently. M1 was found: with P18 installed, a P14 rollback and reinstall recreated `exempt()` trusting the client-settable erasure flag, which allowed an unapproved disposal. The lead runner on fab1ed3 was stopped.
- dc41336 fixes M1 and adds the missing tests: E1 under P18; E2 refusing non-guests; approver read before and after rollback; the disabled-trigger checks; backup keys ignored. The P0-038 and P19 catalog checks compare the exact retained list again.

**Lead runner: ACCEPTED.** Typecheck and build passed; three runs, each 3,493 of 3,494 tests (1 skip, already in the base), 444 files.
- An earlier attempt failed on the environment, not the code: node_modules was a symlink outside the root, so Vite denied the font imports in 2 suites; all tests that ran had passed. A second attempt was stopped because another runner was started concurrently by mistake, which ran the machine out of memory. The accepted run ran alone.

**Mutation check:** disabling the P18 refusal in the P14 install (line 93) makes the P14-with-P18 test fail (1 of 20). The code was restored.

**Merged into develop/sf-base** as 6408e610 (no-ff; merged tree equals the verified tree). Staged SQL only; the hosted install is Blocked pending KK.

**Items for KK's migration brief** (from the review; no action now):
1. Owner erasure deletes P14 requests, including the approver's decision.
2. Excluding the trails from restore turns restored disposal entries into unposted P8 exceptions.
3. Before P18 is installed, E1 and `exempt()` trust the client-settable flag (same as P20).
4. Re-installing P14 later requires rolling back P18 first, including its audit-drop step, which needs KK approval.
