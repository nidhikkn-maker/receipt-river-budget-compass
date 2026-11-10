# Isolated staging verification of the P7/P9 safeguards: plan for KK's approval (11 Nov 2026)

**Status: proposed. Nothing in this plan has been executed.** Production is never touched: no production database access, migration, data copy or secret.

## 1. What this proves

Direct database and API evidence, on a real hosted Supabase/PostgREST stack rather than PGlite, for:
- deletion protection (P7 posted entries; P9 archive-controlled rows; P10 withdrawn entries, once accepted);
- archive-history integrity (append-only; no wipe through the preferences row);
- duplicate-import prevention and statement-line idempotency (P9 claims plus stable entry ids);
- financial-event idempotency (P7 sources, card payments, reversals);
- owner and entity isolation (RLS; cross-user requests return nothing or are refused);
- rollback of every proposed migration in reverse order, with before/after catalog and row parity.

## 2. Environment: two stages, each needing KK's separate approval

**Stage A — staging project with synthetic data (requested first).**
- **The project:** a new, separate Lovable Cloud/Supabase project, `thapal-staging`. It has its own URL, keys and auth users, and nothing shared with production. KK creates it, or authorises its creation; its keys go only into the secure credential form, never into chat or the repository.
- **Schema:** `drizzle/migrations` 0000–0088 (the applied production history), then proposed P1, P2, P4, P5, P5b, P6, P7, P8, P9 (and P10 once accepted).
- **Data:** synthetic fixtures only — the same deterministic fixtures as the tests (`src/test/backup-fixture.ts`, the failure-injection statement, the hand-calculated cross-module rows). No personal or financial data.
- **Users:** two staging-only test users (owner and other), plus a third for entity-member tests. They are created in the staging project only.
- **Access:** network access from the verification session to the staging host only. The production host stays unused, and I will propose removing it from this session's allowed hosts.

**Stage B — restored-database rehearsal (only after Stage A passes, and only with KK's separate approval).**
- **Source:** a point-in-time backup of production, restored by KK (or the platform) into a **separate, isolated** project `thapal-rehearsal`. Claude never reads from production.
- **Sanitisation before anyone else connects,** run inside the rehearsal project:
  1. Replace every `auth.users` email with `user-<n>@rehearsal.invalid` and delete phone numbers, OAuth identities and refresh tokens.
  2. Delete all storage objects (receipts and documents) from the rehearsal buckets, keeping only path and size metadata so links and counts can be checked.
  3. Replace free text (titles, merchants, descriptions, notes, `receipt_details` text fields) with deterministic placeholders. Keep amounts, dates, currencies, account kinds, ids and relationships so the accounting is preserved exactly.
  4. Revoke all passkeys, push subscriptions, assistant tokens and upload links; rotate the project's API keys.
  5. Record row counts and checksums of every financial column, before and after sanitisation, as the baseline.
- **Permissions:** Claude gets the rehearsal project's anon key plus one sanitised test-owner sign-in. The service role is used only by KK or the platform to run the migration and rollback scripts. The rehearsal project has no link to production; email and push are disabled.
- **Rehearsal:**
  1. Take the baseline: checksums and financial figures per owner (balances, net worth, claims outstanding, card due, loan outstanding).
  2. Apply P1→P10.
  3. Re-run the figures: they must equal the baseline exactly (historical-data protection).
  4. Run the direct API test suite.
  5. Roll back P10→P1 and confirm the catalog and figures equal the baseline again.
- **Disposal:** the rehearsal project is deleted after the report, and deletion is confirmed by KK.

## 3. Direct database/API test suite (prepared before any approval)

- **Script:** `scripts/staging/verify-db-safeguards.ts`, to be written and reviewed against PGlite first. It reads `STAGING_URL`, `STAGING_ANON_KEY` and test-user credentials only from the environment (the secure credential form), and refuses to run if the URL is the production project.
- **Method:** it sends real PostgREST and RPC requests as each signed-in user, mirroring `src/lib/failure-injection.test.ts`:
  - repeat, interrupted, lost-response and concurrent imports;
  - `DELETE` and `TRUNCATE` attempts on every guarded table;
  - archive and restore of records, including history wipe and forge attempts;
  - reversals and card payments retried with the same idempotency key;
  - cross-user and cross-entity reads and writes.
- **Output:** a JSON and Markdown report with each request, the expected outcome and the observed outcome, tied to the exact Git commit and migration set.

## 4. Rollback and failure handling

- **Rollback:** every proposed file has a reverse rollback, already tested in PGlite in `integration-stack.test.ts`.
- **On any unexpected result:** stop, keep the project for inspection, and report.
- **Production:** nothing is promoted. Applying anything to production remains a separate KK decision after Stage A and Stage B evidence.

## 5. Approvals needed

1. Create, or authorise, the `thapal-staging` project, and provide its keys through the secure credential form (Stage A).
2. Create the staging-only test users. I can create these through the staging project's auth once its keys are provided.
3. Later and separately: the restored, sanitised rehearsal (Stage B).

## 6. Complete project configuration (Stage A, for approval; nothing created)

| Item | Configuration |
|---|---|
| Provider | Separate Supabase project in a **separate organisation** from production (no shared members, keys or billing alerts). A separate Lovable project with its own Cloud backend is the alternative if KK prefers Lovable billing. |
| Name / region | `thapal-staging`, same region as production for timing parity. No connection to the production project. |
| Auth | Email/password only. Signups disabled; the 3 staging test users are created by the admin script. SMTP set to a sink (no real email), Google OAuth off, MFA as in production. |
| Storage | Buckets `receipts`, `documents` and `statement-uploads` created by migration, holding synthetic files only. |
| Secrets | Anon key, service role key and URL entered only through the secure credential form (never in chat or the repository). The service role is used only by the migration and rollback script. |
| Network | Allowed from the verification session to the staging host only. I will propose removing the production host from this session's allow-list before Stage A starts. |
| Data | Deterministic synthetic fixtures (`src/test/backup-fixture.ts`, failure-injection statements, cross-module rows), loaded by a seed script after migration. |
| Guards | The seed and verify scripts refuse to run unless `STAGING_URL` matches the staging host. A hard-coded denylist includes the production project ref. Every report records the target host and project ref. |
| Migrations | `drizzle/migrations` 0000–0088, then proposed P1, P2, P4, P5, P5b, P6, P7, P8, P9 (and P10/P11 once accepted), each recorded with its checksum. |
| Rollback | The reverse rollback files, run in order, verified by catalog and figure parity with the pre-migration snapshot. The project can be deleted outright afterwards. |
| Evidence | JSON and Markdown report per run: git commit, migration checksums, every API request with expected and observed results, timings. |

## 7. Estimated cost

Source: Supabase's official pricing page, checked 10 Nov 2026; please confirm on the page before approving.

| Option | Monthly cost | Notes |
|---|---|---|
| Free organisation (Stage A, synthetic data) | **$0** | Up to 2 free projects per organisation. Free projects pause after inactivity, which is acceptable for staging. |
| Pro organisation, one Micro project | **≈ $25/month** | Plan fee; the included $10 compute credit covers one Micro instance. |
| Each additional Micro project on Pro (e.g. the rehearsal) | **≈ $10/month**, billed hourly | The rehearsal project exists for hours, not months, so it costs a fraction of this. Delete it after the report. |
| Database branching (not proposed) | $0.01344 per branch-hour | Listed for completeness. |
| Vercel (existing Hobby preview) | $0 | Unchanged. |

If production is on Lovable Cloud, a Lovable-hosted staging project is billed through Lovable's plan instead; I can't see that pricing from here.
