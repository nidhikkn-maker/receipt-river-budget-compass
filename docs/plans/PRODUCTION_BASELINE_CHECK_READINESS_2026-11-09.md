# Production historical-baseline check: readiness assessment (for KK's approval decision)

**Status: prepared and tested in isolation. NOT executed on production.** Running it needs KK's separate written approval (decision `APR-PROD-READONLY`).

## 1. Purpose
1. **Establish a verified "before" picture** of every financial record ahead of any security, accounting or migration change. That lets us later prove nothing changed, or explain exactly what did.
2. **Detect likely past loss** caused by the pre-Phase-0 caps (for example a journal list sitting at exactly 5,000, or upload evidence at exactly 3,000 ids). Lost records cannot be recovered from the app. Finding them early lets us look for hosted backups while they may still exist.

## 2. What would run
- **File:** `scripts/integrity/historical-baseline.sql`, SHA-256 `a43dec86e6462ca462aff142c8ec7af7523c802f2506bb57505a1ed7b5b7cd90`. The file is pinned: any edit changes the hash and needs re-approval.
- **Content:** 7 checks in 9 statements, all `SELECT`/`WITH`. There is no `INSERT`, `UPDATE`, `DELETE`, DDL, `GRANT`, `COPY` or function call that writes. This is enforced by an automated test.
- **Exact procedure**, run by KK or, with approval, by Claude through the Lovable database tool:
  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL statement_timeout = '60s';      -- each statement stops after 60 s
  SET LOCAL lock_timeout = '2s';            -- never waits on another session's locks
  SET LOCAL idle_in_transaction_session_timeout = '120s';
  -- the 9 statements from historical-baseline.sql, results exported as CSV
  ROLLBACK;
  ```
- **Identity:** it must run as a database role that can see all owners (the platform's SQL console role or the service role). As an end user, row-level security would show only that user's rows and the check would be incomplete.

## 3. Runtime estimate (measured, isolated)
| Dataset (synthetic) | Result |
|---|---|
| 120,000 ledger rows, 60 owners, 180 accounts, 3,000 journals in each owner's settings | All 9 statements in **1.31 s** total; slowest is the ledger summary at 0.76 s |
| Output | 720 rows, about 158 KB |

- The measurement used PGlite (single-threaded WebAssembly Postgres), which is usually slower than a hosted server.
- A family/company dataset of this kind is expected to finish in **a few seconds**. The 60-second statement limit bounds the worst case.

## 4. Database impact
- **Locks:** read-only statements take only `ACCESS SHARE` locks. Normal reads and writes continue unaffected; only schema changes would wait. The 2-second lock timeout means the check gives way instead of queuing.
- **Load:**
  - one sequential scan of `expenses`, `accounts`, `documents` and `storage.objects`, plus small audit tables
  - one pass over each owner's settings document
  - grouping and hashing are CPU-light
  - no indexes are created and no statistics are changed
- **Writes:** none. The transaction is declared read-only, so Postgres itself refuses any write (tested: an `UPDATE` inside it fails), and it ends with `ROLLBACK`.
- **Timing:** recommended off-peak. It is not required, given the measured cost.

## 5. Data protection
- **Owner ids:** replaced by MD5 hashes in all output, so names, emails, PANs, descriptions, merchants and file names never leave the database.
  - Limitation: an MD5 of a known UUID can be matched by someone who already has that UUID. The output should be handled as **confidential internal evidence**, not shared publicly.
- **Output is aggregates only:** counts, sums, periods, account/upload ids and fingerprints. Account ids and upload ids are internal identifiers with no personal data.
- **Storage:** the output stays out of the repository and is stored by KK, for example alongside the backups. A second run after any change is compared fingerprint by fingerprint.

## 6. Limitations
1. **Detects, does not repair.** It shows that something changed or may have been truncated. Recovering records needs hosted backups or point-in-time recovery, which are not verified to exist (V4 Gate F).
2. **Past truncation is a heuristic.** It flags a list sitting **exactly** at an old cap. A list that was truncated and later grew or shrank would not be flagged, and a list naturally at that size would be a false alarm.
3. **File contents are not read.** Stored files are fingerprinted from storage metadata (size and eTag), not their bytes. A byte-level check needs a separate, approved storage read.
4. **Deleted rows are invisible.** Hard-deleted ledger rows (before reversal accounting, Phase 3) leave no trace for the baseline to find.
5. **Run-to-run consistency** needs no writes in between. Live activity between two runs shows up as a difference to explain, not necessarily an error.

## 7. Verification evidence (all isolated)
- `src/lib/integrity-baseline-sql.test.ts` (4 tests, in every full-suite run):
  - only read statements
  - runs inside `BEGIN TRANSACTION READ ONLY` on the full applied schema (migrations 0000–0088)
  - flags lists at a previous cap
  - hashes owner ids
  - identical output twice, and different output after one change
  - the read-only transaction refuses an update
- Benchmark: section 3 above.

## 8. Approval checklist for KK
- [ ] Approve execution of the SQL with hash `a43dec86…cd90`, read-only, using the exact procedure in section 2.
- [ ] Choose who runs it: KK in the platform SQL console, or Claude via the Lovable database tool.
- [ ] Choose where the output is stored.
- [ ] Optional: approve a second run later, after any approved production change, to prove parity.
