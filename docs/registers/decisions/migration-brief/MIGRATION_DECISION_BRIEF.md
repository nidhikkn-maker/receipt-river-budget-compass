# Hosted database migration decision brief: P14, P17, P20

Prepared 12 Nov 2026 for KK. Each migration needs its own decision. **This brief is documentation only.** No hosted database was connected to, no SQL was run against Lovable Cloud, Live or Supabase, nothing was pushed or merged, and no tests were re-run while writing it. Every result below is cited from evidence already in the repositories. Where something has not been done, the brief says **Not done**.

## One-screen summary

| Migration | What it changes | Ready to approve for hosted install? | Blocking gaps |
|---|---|---|---|
| **P14** `P14_asset_disposal_approval` (P0-015 / P14-a) | Adds the `asset_disposal_requests` table and the request / decide / cancel / preview RPCs. The database works out the book value itself. Adds BEFORE triggers on **`public.finance_preferences`** and **`public.expenses`**, so an asset can be disposed only through an approved request. Wraps P8's posting hook when P8 is installed. | **No.** At most, approve a rehearsal on a restored copy. | No restored-copy rehearsal. No hosted drift check (the published build is "through 0086", and P14 needs 0000–0088). No backup or PITR plan. P4 is not installed on hosted, so **every approval fails closed** and disposal is impossible in production. Without P18, `exempt()` still trusts `ledgerline.erasing`. The rollback **drops the audit table** when its override is used. Request rows are never removed by account erasure or demo cleanup. The table is not classified in `backup.ts`. The published app's old disposal paths will be refused. |
| **P17** `P17_locked_evidence_storage` (D8 / P0-035) | Adds three RESTRICTIVE policies on **`storage.objects`** (DELETE, UPDATE, INSERT) and one SECURITY DEFINER helper, so the file behind an `evidence_locked` document cannot be deleted, overwritten, moved or re-planted. It changes no data. | **No.** At most, approve a rehearsal on a restored copy. | Tested only against a **stub** `storage.objects`, never the real Supabase storage schema or Storage API. No restored-copy rehearsal. No drift check. No backup plan. `documents.file_path` has no index, so the cost per storage write is unmeasured. The published app's document delete behaviour under P17 has not been checked. Whether the hosted migration role may create policies on `storage.objects` is unverified. |
| **P20** `P20_claim_receipt_correction` (case J) | Adds the `correct_claim_receipt` action **inside `finance_operation`**, which every money movement uses. Adds the append-only audit table `claim_receipt_corrections` (no foreign key, guarded), an AFTER DELETE statement trigger on **`public.expenses`**, and RLS. Its rollback keeps the audit trail. | **No. It cannot be approved alone.** It requires **P19**, which is not installed on hosted and needs its own approval. | Hard dependency on P19, and P19 must match the hosted `finance_operation` bodies by md5 (unknown). No restored-copy rehearsal. No drift check. No backup plan. The service role has BYPASSRLS on hosted but not in PGlite. Without P18, E1 erasure trusts `ledgerline.erasing`. The table is not classified in `backup.ts`. No hosted smoke test exists for all `finance_operation` actions. |

**Recommendation:** decline hosted installation of all three for now. If KK wants progress, approve **separately**, migration by migration, a read-only hosted drift check (§0.3) and a rehearsal on a restored copy of the hosted database (§0.4). Bring the hosted-install decision back with those results.

---

## 0. Facts common to all three

### 0.1 Identity of the reviewed SQL

- Source of truth: branch **`develop/sf-base`** at **`bcb2b889298e1fa60be9102ce244a4b10accabb3`** (2026-11-12 05:29 UTC), in the repo `/home/user/thapal-sfbase`. Directory: `.lovable/staged-sql/proposed/`.
- The same bytes exist in `/home/user/thapal-ta7` (`tracka/p20-followup` @ `16e2b75a`) and `/home/user/thapal-wsev` (detached @ `83f3d274`, `ws/e-records-next23`). `/home/user/thapal-p17v` (detached @ `a33473a2`) has identical P14 and P17 files and no P20.
- **Warning: do not apply from `integration/phase2-3-p0`** (`/home/user/thapal-integration` @ `56b7391e`). That branch does not contain `bcb2b889`. Its `P14_asset_disposal_approval.sql` is the **original 24ba9b0b version** (sha256 `1df2471d…1c55`; rollback `cbb46ec0…e3f6`). That version trusted a caller-supplied book value (P0-037) and has been superseded. The branch has no P17 or P20 files.

| File | Last changing commit (reviewed version) | sha256 (computed 12 Nov 2026 with `git show <commit>:<path> \| sha256sum`; identical in the working trees and at `bcb2b889`) | git blob |
|---|---|---|---|
| `P14_asset_disposal_approval.sql` (456 lines) | `b3f6be6f9798d79527c8a8ee318124719ecebbde` (merged `88a2cb18`) | `7ba4b6bbb7d100d0a0da074d1e3682304df8391213bd4789adac22c152d8ce4f` | `a8679efe…` |
| `P14_asset_disposal_approval.rollback.sql` (38) | `b3f6be6f` | `ca7e739a146641c757dbee9458c89cd4e0faa220d9772b46706a7b8349e03651` | `e7b52c8e…` |
| `P17_locked_evidence_storage.sql` (64) | `8770eb7bc660ae1b288222a7220f03cdb6404789` (merged `a427dec3`) | `41d591df7508c7f1470902c1419d807f46c09bacb995249a214a1670b954dd0a` | `900322e8…` |
| `P17_locked_evidence_storage.rollback.sql` (12) | `f48a5c8be6d011e5041f015daaf9719a58593e37` | `662968ec45480b16d72bbb5791de12d3e54cd095929f9b9c1c4d6b91e3ea4dd0` | `e3368061…` |
| `P20_claim_receipt_correction.sql` (402) | `be6f98dddb016170d2c7fcd4c915d82da73bd7c3` (merged `d6422064`) | `914256af2fbcba23a8875085d9a551e62ff6226d398cf4074ea6001c9258d134` | `14fc9e59…` |
| `P20_claim_receipt_correction.rollback.sql` (122) | `16e2b75a645a819721c5720c57b3e4cc3753b633` (merged `bcb2b889`) | `dcd32a385287350a26eaac0b4a8f6e1c3043061ed9564cdb521b3e7cdf067c07` | `03678cf0…` |

Before any hosted step, the operator must re-compute these checksums on the exact files to be run and confirm they match this table.

### 0.2 What "applied" means today

- Applied migrations in the repo: `drizzle/migrations/0000`–`0088` (89 files). The hosted state is **not known**. `docs/registers/release_recovery.csv` records the last owner-approved publish as "through 0086", while main contains 0087 and 0088. Parity is recorded as "Open: parity not verified".
- **None of P1–P19 is installed on any hosted database.** Every staged file's header says "PROPOSED ONLY: NOT APPLIED". `MIGRATION_PROPOSAL_2026-11-09.md` and the approval register record the same, and blocker `RB-LED-01` says so too.
- How Lovable Cloud applies SQL is not verified: whether a file runs in one transaction, and which role runs it (`MIGRATION_PROPOSAL_2026-11-09.md` §Method item 4). The staged files carry their own `BEGIN`/`COMMIT`.

### 0.3 Hosted schema drift check: **Not done**

A read-only check is needed **before** any rehearsal or install. It must be **separately approved**, because it needs hosted database access that no agent has been given. Minimum content:

1. List the applied migration versions and confirm 0000–0088 are present (0087 and 0088 are at issue).
2. Compute catalog fingerprints with the same queries the PGlite tests use (`CATALOG` in `p14-…-sql.test.ts`, `p17-…-sql.test.ts`, `p20-…-sql.test.ts`): function md5(prosrc), ACL, security definer, proconfig; triggers; columns; policies, including `storage.objects`; namespaces. Compare them with a PGlite replay of 0000–0088.
3. Check specifically:
   - `md5(prosrc)` of `public.finance_operation` and `finance_operation__unguarded`, if present. P19 and P20 refuse to install unless these match the reviewed bodies.
   - `phase3_p7.classify_adjustment`, expected absent.
   - Existing policies on `storage.objects`.
   - `documents.evidence_locked` (0059) and `can_access_entity` (0075).
   - The `demo_sessions` table (0050).
   - The roles `anon`, `authenticated` and `service_role`, and whether `service_role` has BYPASSRLS.
   - The owner of `storage.objects`, and whether the migration role may `CREATE POLICY` on it.
   - That no `phase3_*` schema exists.
4. Record the results in a timestamped evidence file, the way `docs/evidence/hosted/auth-settings-2026-11-09.json` was recorded.

### 0.4 Rehearsal on a restored copy of the hosted schema: **Not done for any of the three**

No rehearsal has been run on a production-like copy, a staging project or a restored backup. All database evidence comes from **in-memory PGlite**. The fixture is `src/test/full-schema-pglite.ts`: it replays `drizzle/migrations` 0000–0088 over **hand-written stubs** of `auth.users`, `auth.uid()`/`jwt()`, `storage.objects`/`buckets` and the roles. In it, `service_role` is created **without** BYPASSRLS, and tests run as the PGlite superuser. Open blockers `RB-P1-06`, `RB-P1-07` and `RB-LED-01` already require "rehearsal on a production-like copy with before/after baseline parity and rollback proof".

### 0.5 Backups and recovery point: **Not done; capability unknown**

`docs/registers/release_recovery.csv` lists "Backups (hosted database and object storage)" as **Open: not visible from repository; Lovable Cloud capability unknown**, and "Restore point / point-in-time recovery" as **Open: not evidenced**. The only tested backup is the owner ZIP backup (`src/lib/backup.ts`, local tests). It is app-level and deliberately excludes audit history such as `transaction_audit`.

The plan required before **any** hosted install:

1. KK, the only person with hosted access, confirms through Lovable Cloud or Supabase whether a platform backup or PITR exists. KK takes a **named recovery point** immediately before the install and records its identifier and time (UTC).
2. A schema-only dump of `public`, `storage` policies and the `phase3_*` namespaces, plus a data export of the tables each migration touches (listed per migration below). KK does this, or an operator under a separate approval.
3. An owner ZIP backup from the app as a secondary copy. It does not replace step 1.
4. Written restore steps, and a decision on who runs them, before the install starts.

Nothing in the repositories shows that any of this exists today.

### 0.6 Release and production isolation (all three)

- Proposed SQL lives only in `.lovable/staged-sql/proposed/`. It must **not** be copied into `drizzle/migrations/` (or `supabase/migrations/`) on a Lovable-connected branch before approval. AGENTS.md says pushed commits sync to Lovable, and no repository evidence shows whether Lovable would then apply them.
- The app code that uses these migrations is on `develop/sf-base` and the Track A and WS-E branches. **It is not published.** The published site is the last owner-approved publish, "through 0086". The database install and the app release must be ordered and approved together for each migration (details below). "Explicit owner release approval: None given" (`release_recovery.csv`).
- Whether this project has separate Lovable Cloud Test and Live databases is **not established** in the repositories. Until it is, assume one shared database and treat any hosted install as a production change.
- `RB-CI-01`: GitLab CI has never run a job, so there is no CI evidence for any of these commits. The only runner evidence is the lead's local acceptance runner.

### 0.7 Dependency order

- Tested install order (P20 stack test): `0000–0088 → P1 … P13 → P14 → P15 → P16 → P17 → P18 → P19 → P20`. P14 and P17 were also installed directly on `0000–0088` alone, and P20 on `0000–0088 + P19` alone.
- **P14** has a hard dependency on applied 0000–0088. Soft dependencies:
  - P1: Finance approval by company.
  - P4: step-up. **Without P4, approvals fail closed** with `P14_STEP_UP_UNAVAILABLE`.
  - P7 and P8: posting. Apply P14 after P8 and roll it back before P8.
  - P11: restore.
  - P18: replaces its `ledgerline.erasing` read.
- **P17** requires 0059 (`documents.evidence_locked`) and 0075 (`can_access_entity`). It is independent of P14 and P20.
- **P20 requires P19.** The P20 install refuses with "P20 requires P19" when `phase3_p19` is missing, and refuses again unless `finance_operation` matches P19's reviewed md5 `6eadbed3…` / `f0386c8c…`. P20 works in either order with P18.
- Rollback order is the reverse: P20 before P19, and P14 before P8. **Not tested:** rolling back P14 or P17 while P20 (or P18/P19) is installed. Each rollback was tested only from its own install point.

---

## 1. P14: asset disposal approval (P0-015, P14-a)

**What it is (verified from the SQL header and body):**
- Schema `phase3_p14`.
- Table `public.asset_disposal_requests`: RLS, SELECT-only for clients, append-only through the `p14_requests_kept` trigger.
- RPCs `request_asset_disposal`, `decide_asset_disposal`, `cancel_asset_disposal` (SECURITY DEFINER) and `preview_asset_disposal` (STABLE, read-only).
- `phase3_p14.book_value`: the database's own depreciation working. Approval stores and posts only the database figure, rounded to paise (R-E-I15).
- Guard triggers `p14_asset_disposal_fields` (BEFORE INSERT/UPDATE on `finance_preferences`) and `p14_disposal_entry` (BEFORE INSERT/UPDATE on `expenses`).
- If P8 is present, it wraps `phase3_p7.classify_adjustment` and saves the original.
- It changes no existing rows.

### 1.1 Files, commit, checksum, order
See §0.1: `b3f6be6f`, sha256 `7ba4b6bb…ce4f` / rollback `ca7e739a…3651`. History: `24ba9b0b → 237a93a5 → 5b139ced → dd369127 → b3f6be6f`. Order: §0.7.

### 1.2 Rehearsal and rollback evidence

**Exists (isolated PGlite only):**
- `src/lib/p14-asset-disposal-sql.test.ts`, 11 tests:
  - "applied schema" and "whole proposed stack P1..P13 (P8 hook wrapped and restored)": "installs; rollback refuses while requests exist, then restores the exact catalog".
  - P14-a: forged book value refused.
  - Correct value accepted, and step-up required.
  - R-E-I15: the database figure is stored and posted.
  - Out-of-tolerance value refused, and a register change refuses the decision.
  - "a session setting no longer opens the disposal guards (phase3_p14.writing …)".
  - Unverifiable assets refused.
  - "preview … has no side effects; another owner can neither preview, request nor decide".
  - Database working agrees with the app engine.
  - "applied schema + P14 without P4: approval fails closed".
- `src/lib/failure-injection.test.ts` D1–D4 (API level, P1..P9 + P14): no disposal outside approval, owner approval, Finance approval, and a balanced P7 posting with step-up.
- Runner evidence, all ACCEPTED with every P14 test passing:
  - `docs/evidence/lead-runner/acceptance-sfbase-93a9444/`: 3 × 3,350/3,350 (contains `b3f6be6f`).
  - `acceptance-ta-16e2b75/run-{1,2,3}/vitest.json`: p14 11/11, failure-injection 60/60.
- Lead note on merge `88a2cb18`: "lead-verified 3x 3,338 on b3f6be6, mutation-checked".
- Register `KK-20261110-54`: Verified, "isolated development only".

**Not done:**
- Rehearsal on a restored copy of the hosted schema.
- Rollback rehearsal on a restored copy.
- Rollback while P15–P20 are installed.
- Measuring trigger cost on real `finance_preferences` sizes. The guard loops over every asset on every preferences save.

### 1.3 Backups and recovery point
§0.5, plus a data export of `public.finance_preferences` (the `assets` array) and `public.expenses` rows tagged `disposal` or in category `Asset disposal`. If P8 or P7 are ever present, also export `phase3_p7`.

### 1.4 RLS, ownership and audit history

**Policies and functions:**
- `"Disposal requests: owner and approvers read"`: `owner_id = auth.uid() OR phase3_p14.may_approve(...)`. Finance role plus `can_access_expense(..., 'approve', entity)`.
- Clients get SELECT only.
- `guard_requests` raises `P14_AUDIT_KEPT` on UPDATE or DELETE (line 404).
- Approver ≠ requester.
- Tests: "another owner can neither preview, request nor decide" and D3 (Finance approver).

**Residual (without P18):**
- `phase3_p14.exempt()` (line 365) still exempts when `current_setting('ledgerline.erasing', true) = 'on'`. The repository's own threat model (`docs/security/p0-038/GUC_INVENTORY.md` row 14) classes this setting as client-settable. It is fixed only by proposed P18, which rewrites every reader.
- The service path (no `auth.uid()`, not anon or authenticated) is also exempt.

**Audit on rollback:**
- The rollback **does not keep** the audit table.
- Lines 15–16 refuse while requests exist unless `SET LOCAL phase3_p14.drop_requests = 'on'` (with KK approval, after export).
- Line 36 then runs `DROP TABLE public.asset_disposal_requests CASCADE`.
- Assets already disposed keep their `soldOn`, `saleValue` and `disposal` data and their disposal entries (rollback header lines 5–6).

**Erasure gap (finding):**
- No path deletes `asset_disposal_requests` on account erasure or demo cleanup. `src/lib/demo-cleanup.ts` lists `claim_receipt_corrections` but not this table, and P14 does not extend `delete_my_finance_data`.
- `owner_id` has no foreign key, so asset names, reasons and amounts would outlive an erased account.
- KK needs to decide whether that is intended retention or must be fixed before install.

### 1.5 Hosted drift check
§0.3. P14-specific: 0087 and 0088 present; no `phase3_p14`; `can_access_expense` signatures (2-argument and 3-argument); no `has_recent_step_up` (which confirms approvals would fail closed). **Not done.**

### 1.6 Smoke tests, downtime, blast radius, irreversible effects

**Smoke tests (Not written, Not done).** Run them on a demo guest or a dedicated test account, never on real books:
1. The catalog shows `phase3_p14` and both triggers.
2. An ordinary preferences save and an ordinary expense insert or update still succeed.
3. A direct `soldOn` edit and a direct disposal-tagged entry are refused with `P14_DISPOSAL_APPROVAL_REQUIRED`.
4. Archiving an asset still works and does not dispose it.
5. `preview_asset_disposal` returns a plan.
6. A request is created, and approval is refused with `P14_STEP_UP_UNAVAILABLE` (no P4).
7. Another account cannot read the request.

Request rows are permanent audit records, and no cleanup path removes them (§1.4), so smoke rows on hosted cannot be cleaned up.

**Downtime and blast radius:**
- Not measured. The install is one transaction taking short locks on `expenses` and `finance_preferences` for trigger creation.
- High blast radius: every expense write and every preferences save passes the new triggers. A fault there blocks core saving for all users.

**Functional effect in production:**
- With no P4 on hosted, **disposal cannot be completed at all**.
- The published app's existing paths (assets "Sold on" edit, Lifecycle disposal, AssetBooks disposal posting) are refused by design (`docs/evidence/p0-closure-2026-11-11/NOTES.md` §7).
- The published build has no request or approval UI, because I05 is on unpublished WS-E branches.

**Irreversible effects:**
- Request rows can be removed only by the rollback's drop override.
- Disposals approved while installed remain after rollback.

**Known limit (in the SQL header):** 0069's closed-period guard can block disposal of assets bought before a closed period.

### 1.7 Release isolation
§0.6. Install P14 only together with a release of the I05 screen (WS-E) and the P0-015 server functions. Screen register I05 is "BLOCKED for production: needs P14 installed".

### 1.8 Client-only evidence (does **not** verify P14)

All of the following are in `/home/user/thapal-wsev`:
- `src/components/screens/records/assets/asset-screens.test.tsx` (I05; it `vi.mock`s `@/lib/asset-disposal.functions` and fakes `asset_disposal_requests` reads).
- `src/lib/books/disposal-request.test.ts`, `asset-register.test.ts`, `asset-events-posting.test.ts`, `engine-consistency.test.ts`.
- The WS-E preview gate and captures (bfa5b9d, 48 captures; fixture preview). The screen register marks I05 "Code-level only (no captures)" for the P14 path.
- The WS-E runner totals (bfa5b9d 3 × 4,210; 83f3d27 3 × 4,243). These are aggregate suite passes. The 83f3d27 review was "not accepted".

The only database-level evidence is the PGlite files in §1.2.

---

## 2. P17: locked evidence files kept in storage (D8, P0-035)

Note: this is **not** a "records check" migration. It protects storage objects behind evidence-locked documents. It is surfaced on WS-E Records screen F05.

**What it is:** the SECURITY DEFINER `public.storage_object_is_locked_evidence(bucket, name)`, which answers only for documents the caller may already read and only for the buckets `receipts` and `statement-uploads`. It adds three RESTRICTIVE policies on `storage.objects`, for anon and authenticated:
- `"P17 locked evidence files cannot be deleted"` (DELETE)
- `"… cannot be changed"` (UPDATE)
- `"… paths cannot be replanted"` (INSERT)

It reads no session setting. Existing permissive policies (0002, 0052, P1, P4) are untouched. It changes no data and can be re-run.

### 2.1 Files, commit, checksum, order
§0.1: `8770eb7b` (SQL) and `f48a5c8b` (rollback). sha256 `41d591df…d0a` / `662968ec…dd0`. Requires 0059 and 0075 and has no ordering constraint with P14 or P20 (§0.7).

### 2.2 Rehearsal and rollback evidence

**Exists (isolated PGlite with a storage stub):**
- `src/lib/p17-locked-evidence-storage-sql.test.ts`, 4 tests:
  - Variants "applied schema" and "proposed stack P1..P16": "no client path deletes, overwrites, moves, replaces or re-plants a locked file; exact rollback". This covers owner, company reader and editor, another owner, anon, upsert, move or rename, bucket change, delete+insert replacement and re-planting, plus the authorised paths: owner unlock, erasure (rows then files) and service role.
  - Reproduction of open finding P0-036 (not an acceptance).
- Runners: `acceptance-sfbase-93a9444` (3 × 3,350/3,350) and `acceptance-ta-16e2b75` (p17 4/4 in each run).
- Lead merge `a427dec3`: "lead-verified targeted 31/31 and mutation-checked".
- Register `KK-20261110-42`: Verified "for isolated development scope only … do not deploy P17 to hosted databases".

**Not done:**
- Any test against the **real Supabase `storage` schema or the Storage API**. Real upsert, move and copy semantics, and real `storage.objects` columns, are untested. The stub has `owner`, `owner_id` and `metadata` only.
- Rehearsal on a restored copy.
- Hosted rollback rehearsal.
- Measuring the helper's cost on every storage INSERT/UPDATE/DELETE. `documents.file_path` has no index; the applied indexes are on `(owner_id, created_at)`, `replaces_id` and `(owner_id, entity_id)` only.

### 2.3 Backups and recovery point
§0.5, plus a dump of `storage.objects` policies (`pg_policies WHERE schemaname='storage'`) and the list of locked documents (`documents WHERE evidence_locked`) with their `file_path`.

### 2.4 RLS, ownership and audit

- The helper answers only for the owner or a member with company read access (`can_access_entity(..., false)`), so it reveals nothing about other owners' documents.
- Another owner's objects are already refused by the permissive policies.
- Authorised removal paths:
  - The owner unlocks the document (P1 refuses this for shared editors).
  - Account erasure: `delete_my_finance_data` removes the rows, then the app removes the files.
  - The service role.
- Audit: P17 itself records nothing. The header notes that `delete_my_finance_data` records no audit (finding P0-036).
- Rollback: drops only the three policies and the helper, which reopens D8. There are no data effects.

### 2.5 Hosted drift check
§0.3. P17-specific:
- Existing `storage.objects` policy names and definitions, which the restrictive policies AND with.
- Bucket ids `receipts` and `statement-uploads`.
- The owner of `storage.objects`, and whether the migration role may create policies on it. Applied 0002 and 0052 already created policies on `storage.objects`, which suggests it can, but this is unverified.

**Not done.**

### 2.6 Smoke tests, downtime, blast radius, irreversible effects

**Smoke tests (Not written, Not done)** on a test account:
1. Upload a new receipt.
2. Delete an unlocked receipt file.
3. Upload to `statement-uploads` through the accountant link (service role).
4. Deleting, overwriting or moving the file of a locked document is refused.
5. Unlock the document, then delete it.
6. Run the Storage API as anon and as another account.

**Downtime:** none expected (policy DDL only). Not measured.

**Blast radius:** every storage write by anon or authenticated users evaluates the helper. A fault there blocks all uploads and deletes. Not checked: how the **published** app's document delete flow behaves when the file delete is refused. The `removeDocument` guard (`8770eb7b`) is not in the published build.

**Irreversible effects:** none to data.

### 2.7 Release isolation
§0.6. Screen register F05 is "PARTIAL: storage-side lock needs P17 (proposed, not applied)". Pair the install with a release that contains the `removeDocument` guard and the F05 wording.

### 2.8 Client-only evidence (does **not** verify P17)

In `/home/user/thapal-wsev`:
- `src/components/screens/records/documents/documents.test.tsx` ("F05 a locked original says why it can't be deleted").
- `src/lib/books/document-lifecycle.test.ts`, `src/lib/pending-documents.test.ts`, `src/components/records-archive/vault.repro.test.tsx`.
- WS-E captures and preview gate (fixture data). The screen register marks F05 "Code-level only (no captures)".

The only database-level evidence is `p17-locked-evidence-storage-sql.test.ts`, and it runs against a storage stub.

---

## 3. P20: claim receipt correction (audited, reduce-only)

**What it is (verified):**
- New finance action `correct_claim_receipt`, spliced into `public.finance_operation` and P4's `finance_operation__unguarded` copy if present. It runs under P19's lock and idempotency.
- It **reduces** one receipt citation on one claim (K1–K6). The money-back entry itself never changes.
- Audit table `public.claim_receipt_corrections` (K7):
  - `claim_id` is a plain uuid with **no foreign key** (K8).
  - Guard triggers `claim_receipt_corrections_guard` and `claim_receipt_corrections_no_truncate` refuse UPDATE and TRUNCATE.
  - INSERT is allowed only inside the P19-authorised workflow. DELETE is allowed only for E1 (the caller's own confirmed erasure) or E2 (service-role demo cleanup of an anonymous guest).
  - The AFTER DELETE statement trigger `p20_claim_corrections_follow_erasure` on `public.expenses` handles E1.
- RLS: owner-only SELECT, plus restrictive INSERT/UPDATE/DELETE refusals for clients.

### 3.1 Files, commit, checksum, order

§0.1. SQL `be6f98dd`, sha256 `914256af…134`. Rollback `16e2b75a`, sha256 `dcd32a38…7c07`. History:
- `86e68e4f → dfe9287a → 47adabdc → 8d29e850 → 6394ac82 → be6f98dd` (SQL)
- `… → 16e2b75a` (rollback)

**Requires P19** (§0.7). P19 has its own staged pair, `P19_finance_operation_authority.sql` and `.rollback.sql`, and needs **its own approval and its own copy of this brief's evidence**, which this brief does not supply.

### 3.2 Rehearsal and rollback evidence

**Exists (isolated PGlite only):** `src/lib/p20-claim-receipt-correction-sql.test.ts`. Each run has 35 passing tests and 1 skipped by design (`it.runIf(stack)` in the applied variant).
- Two variants:
  - "applied schema + P19"
  - "proposed stack P1..P19", which includes P14, P17 and P18
- Key tests:
  - "before P20 the operation does not exist; P20 installs once"
  - case J and partial case
  - "the server refuses an increase, a txnId/date/account change, a missing reason, a stale amount and another owner's claim; nothing changes"
  - idempotent retry and conflict
  - "K8: deleting a corrected claim (owner, team delegate, operator, statement undo) never removes its corrections"
  - E1 and E2, plus E2 spoofing
  - "rollback retains the audit trail read-only (owner-readable, writable by no one); everything else is restored exactly"
  - "re-installing P20 after a rollback keeps every retained row and appends new corrections; a second rollback retains them all"
  - "P20 and P18 in either order"
  - "rollback in Asia/Kolkata + 'SQL, DMY' … tampering is still refused"
  - SHARE ROW EXCLUSIVE lock tests, including the `pg_locks` probe
  - "the rollback refuses a guard disabled after its precheck but before its lock"
- Runner evidence (all ACCEPTED, three full runs each, unchanged tree):

  | Runner dir | Commit | Passing tests per run |
  |---|---|---|
  | `acceptance-ta-86e68e4` | 86e68e4 | 3,430 |
  | `acceptance-ta-6394ac8` | 6394ac8 | 3,465 of 3,466 |
  | `acceptance-ta-fb41b01` | fb41b01 | 3,477 of 3,478 |
  | `acceptance-ta-16e2b75` | 16e2b75 (current SQL) | 3,482 of 3,483 |

  At 16e2b75, P19 passed 18/18 and P18 9/9 in every run.
- Mutation checks (lead notes):
  - `fb41b01`: removing the `track_retained` SET clauses fails the Kolkata test.
  - `6394ac8` and `16e2b75`: demo-cleanup mutations.
- Release-gate items M1, M2, L3 and L4 (`acceptance-ta-6394ac8/P20_RELEASE_GATE_OPEN.md`) were addressed in `be6f98dd`, `fb41b01` and `16e2b75`, according to the merge notes. The register still lists P20 hosted install as "Blocked pending KK".

**Not done:**
- Rehearsal on a restored copy. This is critical because P20 rewrites `finance_operation` and refuses unless the hosted body matches P19's reviewed md5.
- Hosted rollback rehearsal.
- A regression run of **all other `finance_operation` actions** against hosted-shaped data after the splice.
- Behaviour with hosted `service_role` BYPASSRLS. The PGlite `service_role` has no BYPASSRLS. On hosted, the `"P20 demo cleanup removes guest corrections"` RLS policy would not bind the service role, and only the guard trigger (`removal_allowed → demo_guest`) would.

### 3.3 Backups and recovery point
§0.5, plus `pg_get_functiondef` of `finance_operation` and `finance_operation__unguarded`, and exports of `public.finance_operations` (idempotency records) and `public.expenses` claim rows (`reimbursement` JSON).

### 3.4 RLS, ownership and audit-history proof

**Policies:**
- `"Owner reads claim receipt corrections"` (`owner_id = auth.uid()`).
- Restrictive `"P20 corrections recorded only by the finance workflow"`, `"… cannot be changed"` and `"… cannot be deleted"` (anon and authenticated).
- `"P20 service reads …"`.
- `"P20 demo cleanup removes guest corrections"` (service_role, `demo_guest(owner_id)`).

**Grants:** authenticated SELECT; service_role SELECT and DELETE. The install's `$post$` block verifies that no other privilege exists and that there is no foreign key (P20 SQL lines 366–400).

**Claim ownership:** K2 requires `employee_id = auth.uid()` and write access to the company.

**Rollback keeps the audit trail. Verified, with line citations from `P20_claim_receipt_correction.rollback.sql`:**
- The rollback contains **no `DROP TABLE public.claim_receipt_corrections`**. Its only DROPs are `correct_claim_receipt` (line 70), `phase3_p20.saved_functions` (line 71) and `SCHEMA phase3_p20 RESTRICT` (line 72).
- Line 51: `LOCK TABLE public.claim_receipt_corrections IN SHARE ROW EXCLUSIVE MODE`. Lines 52–55 pin the hash settings.
- Lines 57–58 take the row count and the md5 of every row before any change.
- Lines 75–76 revoke INSERT, UPDATE, TRUNCATE, REFERENCES and TRIGGER from every app role, and DELETE from all except service_role. The table becomes read-only.
- Lines 79–85 create `phase3_p20_retained.rollback` with the table oid, owner, row count and content md5.
- Lines 93–98 re-check, under the lock, that all four guard triggers are enabled.
- Lines 100–103 abort the rollback if the row count or md5 changed.
- Lines 104–116 abort on unexpected privileges.
- Lines 118–120 record the rollback on the table comment.
- The guard schema `phase3_p20_audit` and its triggers are deliberately kept.

**Stated limits:**
- These are DML guards. A table owner or superuser can bypass them with DDL or `session_replication_role = replica` (rollback lines 17–19).
- After rollback, retained rows can still be deleted under E1 (the owner's own confirmed erasure) and E2 (anonymous demo guest), by design.
- Without P18, E1 is decided by `current_setting('ledgerline.erasing')` (P20 SQL, `removal_allowed`). With P18 it uses `phase3_p18.erasure_authorised()`, through the rewrite at lines ~231–248.

### 3.5 Hosted drift check
§0.3. P20-specific:
- md5 of the hosted `finance_operation` and `__unguarded` bodies, against P19's expectations and then P20's.
- `demo_sessions` (0050) and `auth.users.is_anonymous`.
- No existing `claim_receipt_corrections` table or `phase3_p20*` schemas.
- `service_role` attributes.

**Not done.**

### 3.6 Smoke tests, downtime, blast radius, irreversible effects

**Smoke tests (Not written, Not done)** on a demo guest account, so that E2 cleanup can remove the rows:
1. A reimbursement, a scheduled payment, a claim receipt and a loan repayment each still succeed through `finance_operation`. This is a regression of every existing action.
2. `correct_claim_receipt` on case J succeeds and its retry replays.
3. Another account cannot read the correction.
4. A direct INSERT, UPDATE or DELETE on the table is refused.
5. Deleting the claim keeps the correction.

**Downtime:** none measured. The install replaces `finance_operation` inside one transaction.

**Blast radius: highest of the three.** Every money movement (reimbursements, scheduled payments, loans, card EMI, claim receipts, yearly-bill confirmation) runs through the replaced function. A fault would stop all of them. Every DELETE statement on `public.expenses` also fires `follow_erasure`.

**Irreversible effects:**
- Corrections change claims' saved receipts, and these stay after rollback (rollback header lines 29–30).
- Audit rows persist after rollback; they are intended to be permanent.

**Post-apply code follow-up:** classify `public.claim_receipt_corrections` in `src/lib/backup.ts` (P20 header). This is not done; the table is not listed there.

### 3.7 Release isolation
§0.6. The `develop/sf-base` app code shows "Unknown operation" until P20 is installed. The WS-F1 editor wiring is still pending (register `KK-20261111-23`), so installing the database part first is harmless to the UI. P19 must be installed and released first.

### 3.8 Client-only evidence
- `p20-claim-receipt-correction-sql.test.ts` describe "receipt correction plan (client rules, no database)" (4 tests).
- `src/lib/store-online-signal.test.tsx`.
- WS-F1 runner passes. `wsf1-50f0abc` was "NOT_ACCEPTED on review".

None of these is database evidence.

---

## 4. Consolidated gap list

| # | Gap | P14 | P17 | P20 |
|---|---|---|---|---|
| G1 | Rehearsal on a restored copy of the hosted schema | Not done | Not done | Not done |
| G2 | Rollback rehearsal on a restored copy | Not done | Not done | Not done |
| G3 | Read-only hosted drift check (needs separate access approval) | Not done | Not done | Not done |
| G4 | Hosted backup or PITR capability confirmed, and a named recovery point taken | Not done | Not done | Not done |
| G5 | Post-apply smoke test scripts written | Not done | Not done | Not done |
| G6 | Downtime and performance measured on real-size data | Not done (trigger on every preferences/expense write) | Not done (helper on every storage write; no `file_path` index) | Not done (`finance_operation` replaced) |
| G7 | Test against real Supabase auth/storage, roles and BYPASSRLS (PGlite stubs only) | Not done | Not done (storage stub) | Not done (service_role BYPASSRLS) |
| G8 | Prerequisites installed on hosted | P4 absent, so approvals fail closed; P18 absent, so `ledgerline.erasing` is trusted | None needed beyond 0059/0075 (unverified on hosted) | **P19 required and not approved**; P18 absent, so the erasure check trusts the setting |
| G9 | Audit kept on rollback | **No**: the override drops `asset_disposal_requests` (rollback line 36) | n/a (no audit) | Yes (§3.4) |
| G10 | Erasure and demo cleanup cover the new table | **No** (finding) | n/a | Yes (E1/E2) |
| G11 | `backup.ts` classification of the new table | Not done | n/a | Not done |
| G12 | App release paired with the DB install; published build behaviour under the migration checked | Not done (published paths refused) | Not done (published delete flow) | Not done (P19 first) |
| G13 | Cross-rollback with later migrations installed | Not done | Not done | Not done |
| G14 | CI job-level evidence (`RB-CI-01`) | None | None | None |
| G15 | Whether separate Test and Live databases exist | Unknown | Unknown | Unknown |

## 5. Decisions requested from KK (one per line, independent)

1. P14 hosted install: Approve / **Decline (recommended now)**
2. P17 hosted install: Approve / **Decline (recommended now)**
3. P20 hosted install: Approve / **Decline (recommended now; requires a separate P19 decision first)**
4. Optional, per migration: approve a read-only hosted drift check (§0.3) and a rehearsal on a restored copy (§0.4), with access granted by KK and results recorded under `docs/evidence/hosted/`.
5. P14: decide whether disposal requests must survive account erasure (current behaviour) or be erased, and whether the rollback may ever drop them.
