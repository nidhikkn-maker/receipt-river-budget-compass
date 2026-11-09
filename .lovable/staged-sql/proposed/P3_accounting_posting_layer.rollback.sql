-- Rollback for P3_accounting_posting_layer.sql (PROPOSED, NOT APPLIED). Restores the exact 0088 objects:
-- restore_finance_backup is the unchanged 0072 function moved back; delete_my_finance_data was never changed.
-- DATA: dropping the posting tables discards postings, runs, grants and reviews. Journal anchor rows in
-- public.expenses (txn_type 'adjustment', receipt_details.accounting) are NOT removed and keep moving balances;
-- linked documents stay evidence_locked. Export public.accounting_postings/_lines first and obtain KK approval,
-- then run this in ONE transaction with: SET LOCAL ledgerline.rollback_discard_postings = 'on';
DO $$ BEGIN
 IF to_regclass('public.accounting_postings') IS NULL THEN RAISE EXCEPTION 'P3 is not installed'; END IF;
 IF EXISTS (SELECT 1 FROM public.accounting_postings) AND coalesce(current_setting('ledgerline.rollback_discard_postings', true), '') <> 'on' THEN
  RAISE EXCEPTION 'Postings exist: export them, obtain KK approval and SET LOCAL ledgerline.rollback_discard_postings = on';
 END IF;
END $$;
DROP TRIGGER IF EXISTS accounting_original_immutable ON public.documents;
DROP TRIGGER IF EXISTS accounting_entry_sync ON public.expenses;
DROP TRIGGER IF EXISTS accounting_entry_immutable ON public.expenses;
DROP FUNCTION public.restore_finance_backup(jsonb, text);
ALTER FUNCTION accounting_private.restore_finance_backup_0072(jsonb, text) SET SCHEMA public;
ALTER FUNCTION public.restore_finance_backup_0072(jsonb, text) RENAME TO restore_finance_backup;
-- Drops only P3's private helpers (posting policies that call accounting_private.can_read go with their tables below).
DROP SCHEMA accounting_private CASCADE;
DROP FUNCTION IF EXISTS public.accounting_backfill_undo(uuid, text);
DROP FUNCTION IF EXISTS public.accounting_backfill(text, uuid, text);
DROP FUNCTION IF EXISTS public.post_accounting_journal(uuid, jsonb, bigint);
DROP FUNCTION IF EXISTS public.review_accounting_exception(uuid, uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.set_accounting_review_grant(text, text, boolean);
DROP VIEW IF EXISTS public.accounting_journal_evidence;
DROP TABLE IF EXISTS public.accounting_exception_reviews;
DROP TABLE IF EXISTS public.accounting_review_grants;
DROP TABLE IF EXISTS public.accounting_backfill_runs;
DROP TABLE IF EXISTS public.accounting_posting_lines;
DROP TABLE IF EXISTS public.accounting_postings;
