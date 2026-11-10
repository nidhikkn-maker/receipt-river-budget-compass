-- ============================================================================================
-- P7_balanced_posting.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores the exact P1+P2+P4+P5 catalog:
--   * the P7 entry points are unguarded (wrapper and __unguarded copy dropped, P4 registry rows
--     removed; their security_events audit rows are kept);
--   * the expenses and period_close_evidence hooks, every P7 function and the phase3_p7 schema are
--     dropped;
--   * the six P7 tables are MOVED (never dropped) to security_rollback_archive with a UTC suffix, with no
--     client or service_role access, so events, sources, batches, lines, reversals (including archived
--     reversed ledger rows) and backfill history are kept as evidence.
-- Refuses when postings exist unless the operator sets, in the same transaction and with KK approval:
--   SET LOCAL phase3_p7.rollback_archive_postings = 'on';
-- After rollback the app falls back to today's behaviour (posting_status() missing = capability off).
-- Ledger entries reversed through reverse_ledger_entry are NOT restored to public.expenses; their full
-- rows stay in the archived posting_reversals table for a separately approved repair.
-- Run BEFORE the P5 rollback (which refuses while P7 is installed). No existing column value changes.
-- r2: refuses while P8_asset_depreciation_posting.sql is installed (roll P8 back first). Also restores
-- the P5 body of p5_entry_closed (personal-only periods), re-enables the 0016 trigger
-- clear_empty_category_history, archives the five r2 tables and drops expenses.reverses_entry_id.
-- Reversal rows (decision 1) are working-ledger rows: dropping their link would make each one count as
-- a NEW entry. The rollback therefore refuses while reversal rows exist unless the operator also sets
-- SET LOCAL phase3_p7.rollback_keep_reversals = 'on' (KK approval), which keeps the column and its
-- rows unchanged (the app's ledgerView keeps netting them; the catalog then differs by that column).
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase3_p7') IS NULL OR to_regclass('public.posting_batches') IS NULL THEN
    RAISE EXCEPTION 'P7 is not installed';
  END IF;
  IF to_regnamespace('phase3_p8') IS NOT NULL THEN
    RAISE EXCEPTION 'P7 rollback: P8_asset_depreciation_posting is installed; run P8_asset_depreciation_posting.rollback.sql first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.expenses WHERE reverses_entry_id IS NOT NULL) AND coalesce(current_setting('phase3_p7.rollback_keep_reversals', true), '') <> 'on' THEN
    RAISE EXCEPTION 'P7 rollback: reversal entries exist; with KK approval SET LOCAL phase3_p7.rollback_keep_reversals = ''on'' to keep them linked';
  END IF;
  IF EXISTS (SELECT 1 FROM public.posting_batches) AND coalesce(current_setting('phase3_p7.rollback_archive_postings', true), '') <> 'on' THEN
    RAISE EXCEPTION 'P7 rollback: postings exist; export them, obtain KK approval and SET LOCAL phase3_p7.rollback_archive_postings = ''on''';
  END IF;
END $pre$;

-- 1. P4 guards added by P7.
DO $unguard$
DECLARE g record;
BEGIN
  FOR g IN SELECT * FROM security_p4.guarded_functions WHERE proname IN (
             'commit_posting_backfill', 'undo_posting_backfill', 'reverse_ledger_entry', 'reverse_journal_batch', 'post_journal_batch',
             'reverse_statement_upload', 'record_card_payment', 'submit_posting_request', 'decide_posting_request')
           ORDER BY seq DESC LOOP
    EXECUTE format('DROP FUNCTION public.%I(%s)', g.proname, g.identity_args);
    EXECUTE format('DROP FUNCTION public.%I(%s)', g.proname || '__unguarded', g.identity_args);
    DELETE FROM security_p4.guarded_functions WHERE seq = g.seq;
  END LOOP;
END $unguard$;

-- 2. Hooks on existing tables.
DROP TRIGGER zz_p7_sync_postings ON public.expenses;
DROP TRIGGER p7_guard_posted_delete ON public.expenses;
DROP TRIGGER p7_period_evidence ON public.period_close_evidence;
DROP TRIGGER zz_p7_sync_opening ON public.opening_postings;
DROP TRIGGER zz_p7_guard_reversals ON public.expenses;
ALTER TABLE public.expenses ENABLE TRIGGER clear_empty_category_history;
-- P5 body of the legacy entry guard helper (personal-only periods ignored again, as before P7 r2).
CREATE OR REPLACE FUNCTION public.p5_entry_closed(_owner uuid, _periods jsonb, _entity_accounts jsonb, _d date, _source text, _entity text, _account uuid, _to_account uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p jsonb; keys text[];
BEGIN
  IF _d IS NULL OR jsonb_typeof(_periods) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(_periods)
           WHERE (value->>'from') ~ '^\d{4}-\d{2}-\d{2}$' AND (value->>'to') ~ '^\d{4}-\d{2}-\d{2}$'
             AND _d BETWEEN (value->>'from')::date AND (value->>'to')::date LOOP
    IF nullif(p->>'entityId', '') IS NULL THEN RETURN true; END IF;
    IF keys IS NULL THEN
      -- Conservative during dual-read: the dated assignment AND the legacy JSON link both count, so a
      -- company close is honoured whichever of the two the app currently follows.
      keys := CASE WHEN _source = 'manual' AND nullif(_entity, '') IS NOT NULL THEN ARRAY[_entity] ELSE '{}'::text[] END
        || public.p5_account_entity_keys(_owner, _account, _d, _entity_accounts)
        || public.p5_account_entity_keys(_owner, _to_account, _d, _entity_accounts)
        || public.p5_json_account_keys(_entity_accounts, _account)
        || public.p5_json_account_keys(_entity_accounts, _to_account);
    END IF;
    IF p->>'entityId' = ANY (keys) THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END $$;


-- 3. Archive (never drop) the P7 tables: policies, triggers and links to live tables removed first.
CREATE SCHEMA IF NOT EXISTS security_rollback_archive;
REVOKE ALL ON SCHEMA security_rollback_archive FROM PUBLIC, anon, authenticated;
DO $archive$
DECLARE t text; p record; c record; suffix text := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISSUS');
  tabs text[] := ARRAY['posting_lines', 'posting_batches', 'posting_event_sources', 'posting_events', 'posting_reversals', 'posting_backfill_runs',
                       'posting_link_states', 'posting_request_decisions', 'posting_requests', 'statement_upload_reversals', 'posting_delegations'];
BEGIN
  FOREACH t IN ARRAY tabs LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    FOR p IN SELECT tgname FROM pg_trigger WHERE tgrelid = ('public.' || t)::regclass AND NOT tgisinternal LOOP
      EXECUTE format('DROP TRIGGER %I ON public.%I', p.tgname, t);
    END LOOP;
    -- foreign keys to tables that stay live (finance_preferences, legal_entities) would tie the archive
    -- to live data (an erasure cascade would delete evidence; P5's rollback would be blocked)
    FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = ('public.' || t)::regclass AND contype = 'f'
             AND confrelid NOT IN (SELECT ('public.' || x)::regclass FROM unnest(tabs) x) LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, c.conname);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
  END LOOP;
  FOREACH t IN ARRAY tabs LOOP
    -- indexes and owned sequences move with the table: suffix them so a later archive cannot collide
    FOR p IN SELECT i.relname FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid WHERE x.indrelid = ('public.' || t)::regclass LOOP
      EXECUTE format('ALTER INDEX public.%I RENAME TO %I', p.relname, left(p.relname, 40) || '_' || suffix);
    END LOOP;
    FOR p IN SELECT s.relname FROM pg_depend d JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
             WHERE d.refobjid = ('public.' || t)::regclass AND d.deptype = 'a' LOOP
      EXECUTE format('ALTER SEQUENCE public.%I RENAME TO %I', p.relname, left(p.relname, 40) || '_' || suffix);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I SET SCHEMA security_rollback_archive', t);
    EXECUTE format('ALTER TABLE security_rollback_archive.%I RENAME TO %I', t, 'p7_' || t || '_' || suffix);
  END LOOP;
END $archive$;

-- 4. P7 functions and the private schema.
DROP FUNCTION public.posting_status();
DROP FUNCTION public.preview_posting_backfill();
DROP FUNCTION public.posting_reconciliation_report();
DROP FUNCTION public.p7_can_read(uuid, uuid);
DROP FUNCTION public.posting_requests_overview(int);
DROP FUNCTION public.prior_period_adjustment_report();
-- expenses.reverses_entry_id: dropped when no reversal row exists (catalog returns exactly); kept with
-- its rows when the operator chose to keep reversals (see the header).
DO $col$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.expenses WHERE reverses_entry_id IS NOT NULL) THEN
    DROP INDEX public.expenses_one_reversal_idx;
    ALTER TABLE public.expenses DROP CONSTRAINT expenses_reversal_not_self;
    ALTER TABLE public.expenses DROP COLUMN reverses_entry_id;
  END IF;
END $col$;
DROP SCHEMA phase3_p7 CASCADE;
COMMIT;
