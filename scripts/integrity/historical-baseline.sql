-- Thapal historical-integrity baseline (Phase 0, V4 FND-05). READ-ONLY.
-- NOT RUN AGAINST PRODUCTION. Running it there requires KK's separate written approval (decision APR-PROD-READONLY).
-- Execute only inside: BEGIN TRANSACTION READ ONLY; ... ; ROLLBACK;
-- Output is minimised: owner ids are replaced by md5 hashes; only counts, sums, dates and hashes leave the database.
-- Run it before and after any migration; identical output = no historical record changed.

-- 1. Ledger rows and money by owner / account / currency / month.
SELECT 'ledger' AS check, md5(e.employee_id::text) AS owner, coalesce(e.account_id::text, '-') AS account,
       coalesce(e.currency, 'INR') AS currency, to_char(e.expense_date, 'YYYY-MM') AS period,
       coalesce(e.txn_type, 'expense') AS txn_type, count(*) AS rows, sum(e.amount) AS amount,
       md5(string_agg(e.id::text || ':' || e.amount::text || ':' || coalesce(e.statement_ref, ''), ',' ORDER BY e.id)) AS fingerprint
FROM public.expenses e GROUP BY 2, 3, 4, 5, 6 ORDER BY 2, 3, 4, 5, 6;

-- 2. Accounts and opening balances.
SELECT 'accounts' AS check, md5(owner_id::text) AS owner, count(*) AS rows, sum(opening_balance) AS opening_total,
       md5(string_agg(id::text || ':' || kind || ':' || opening_balance::text, ',' ORDER BY id)) AS fingerprint
FROM public.accounts GROUP BY 2 ORDER BY 2;

-- 3. Documents and stored originals (storage keeps size and checksum metadata; bytes are not read here).
SELECT 'documents' AS check, md5(owner_id::text) AS owner, count(*) AS rows, sum(size_bytes) AS bytes,
       md5(string_agg(id::text || ':' || file_path, ',' ORDER BY id)) AS fingerprint
FROM public.documents GROUP BY 2 ORDER BY 2;
SELECT 'stored_files' AS check, md5(split_part(name, '/', 1)) AS owner_prefix, bucket_id, count(*) AS files,
       sum(coalesce((metadata->>'size')::bigint, 0)) AS bytes,
       md5(string_agg(name || ':' || coalesce(metadata->>'eTag', metadata->>'size', '?'), ',' ORDER BY name)) AS fingerprint
FROM storage.objects GROUP BY 2, 3 ORDER BY 2, 3;

-- 4. Audit and history tables (existence and volume only).
SELECT 'audit' AS check, 'transaction_audit' AS source, md5(owner_id::text) AS owner, count(*) AS rows, max(created_at) AS latest
FROM public.transaction_audit GROUP BY 3
UNION ALL SELECT 'audit', 'period_close_evidence', md5(owner_id::text), count(*), max(created_at) FROM public.period_close_evidence GROUP BY 3
UNION ALL SELECT 'audit', 'report_history', md5(owner_id::text), count(*), max(created_at) FROM public.report_history GROUP BY 3
ORDER BY 2, 3;

-- 5. Financial registers kept in owner settings (JSON): sizes, fingerprints and possible PAST truncation.
--    A list whose length equals the cap the app used before Phase 0 may already have lost older records.
WITH lists(path, cap) AS (VALUES
  ('{books,journals}', 5000), ('{books,assetEvents}', 3000), ('{books,leases}', 500), ('{books,propertyCosts}', 3000),
  ('{books,gstInvoices}', 10000), ('{books,gstFilings}', 2000), ('{books,gstAdvances}', 2000), ('{books,snapshots}', 1500),
  ('{books,quotes}', 1000), ('{books,holdings}', 500), ('{books,docLinks}', 3000), ('{books,closedPeriods}', 200),
  ('{books,periodLog}', 500), ('{books,fyRecords}', 200), ('{books,properties}', 200), ('{books,findings}', 3000),
  ('{books,taxCredits}', 2000), ('{books,loanBalances}', 2000), ('{books,proposedFields}', 300), ('{assets}', 200),
  ('{entities}', 50), ('{decisions}', 300), ('{contractObligations}', 300), ('{allocationPlans}', 60))
SELECT 'settings_list' AS check, md5(f.owner_id::text) AS owner, l.path,
       CASE jsonb_typeof(f.data #> l.path::text[]) WHEN 'array' THEN jsonb_array_length(f.data #> l.path::text[]) END AS items,
       jsonb_typeof(f.data #> l.path::text[]) AS stored_type,
       l.cap AS previous_cap,
       (jsonb_typeof(f.data #> l.path::text[]) = 'array' AND jsonb_array_length(f.data #> l.path::text[]) = l.cap) AS at_previous_cap,
       md5(coalesce((f.data #> l.path::text[])::text, '')) AS fingerprint
FROM public.finance_preferences f CROSS JOIN lists l
WHERE f.data #> l.path::text[] IS NOT NULL ORDER BY 2, 3;

-- 6. Statement upload evidence at the previous 3,000-id cap (possible past truncation of undo evidence).
SELECT 'upload_evidence' AS check, md5(f.owner_id::text) AS owner, u->>'id' AS upload,
       jsonb_array_length(coalesce(u->'posted', '[]')) AS posted_ids, jsonb_array_length(coalesce(u->'reconciled', '[]')) AS reconciled_ids,
       (jsonb_array_length(coalesce(u->'posted', '[]')) = 3000 OR jsonb_array_length(coalesce(u->'reconciled', '[]')) = 3000) AS at_previous_cap
FROM public.finance_preferences f, jsonb_array_elements(CASE WHEN jsonb_typeof(f.data->'statementUploads') = 'array' THEN f.data->'statementUploads' ELSE '[]' END) u
ORDER BY 2, 3;

-- 7. Whole-settings fingerprint per owner (any change anywhere changes this).
SELECT 'settings' AS check, md5(owner_id::text) AS owner, revision, md5(data::text) AS fingerprint, octet_length(data::text) AS bytes
FROM public.finance_preferences ORDER BY 2;
