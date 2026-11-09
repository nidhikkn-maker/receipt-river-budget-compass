-- ============================================================================================
-- P5_legal_entities_foundation.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores the exact P1+P2+P4 catalog:
--   * guard_closed_period, guard_journals_rules and ll_closed_on get their saved 0058/0083 definitions
--     back (same oid; CREATE OR REPLACE keeps grants);
--   * the P5 entry points are unguarded (wrapper and __unguarded copy dropped, P4 registry rows
--     removed; their security_events audit rows are kept);
--   * the link triggers, the erasure trigger, every P5 function and the phase2_p5 schema are dropped;
--   * legal_entity_id is dropped from expenses, documents and opening_postings AFTER its values are
--     copied to security_rollback_archive.p5_ledger_links_<UTC>;
--   * the nine P5 tables are MOVED (never dropped) to security_rollback_archive with a UTC suffix,
--     with no client or service_role access, so entities, assignments, relationships, readable IDs,
--     counters, register records, ownership shares and backfill history are kept as evidence.
-- Run BEFORE the P4 rollback (which refuses while P5 is installed) and AFTER the P7 rollback
-- (this file refuses while P7_balanced_posting.sql is installed). No pre-existing column value changes.
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase2_p5') IS NULL OR to_regclass('public.legal_entities') IS NULL THEN
    RAISE EXCEPTION 'P5 is not installed';
  END IF;
  -- P7 (balanced posting) builds on legal_entities: roll P7 back first.
  IF to_regnamespace('phase3_p7') IS NOT NULL OR to_regclass('public.posting_batches') IS NOT NULL THEN
    RAISE EXCEPTION 'P5 rollback: P7_balanced_posting is installed; run P7_balanced_posting.rollback.sql first';
  END IF;
END $pre$;

-- 1. P4 guards added by P5: drop wrapper and original, forget the registry rows.
DO $unguard$
DECLARE g record;
BEGIN
  FOR g IN SELECT * FROM security_p4.guarded_functions WHERE proname IN (
             'commit_entity_backfill', 'reassign_account_entity', 'archive_legal_entity',
             'preview_entity_backfill', 'entity_backfill_report', 'record_entity_relationship', 'end_entity_relationship',
             'archive_register_record', 'register_shared_record', 'record_ownership_share', 'decide_ownership_share', 'end_ownership_share')
           ORDER BY seq DESC LOOP
    EXECUTE format('DROP FUNCTION public.%I(%s)', g.proname, g.identity_args);
    EXECUTE format('DROP FUNCTION public.%I(%s)', g.proname || '__unguarded', g.identity_args);
    DELETE FROM security_p4.guarded_functions WHERE seq = g.seq;
  END LOOP;
END $unguard$;

-- 2. Link and erasure triggers off; the original period functions back.
DROP TRIGGER zy_p5_link_legal_entity ON public.expenses;
DROP TRIGGER zy_p5_link_legal_entity ON public.documents;
DROP TRIGGER zy_p5_link_legal_entity ON public.opening_postings;
DROP TRIGGER p5_erase_owner_records ON public.finance_preferences;
DO $restore$
DECLARE s record;
BEGIN
  FOR s IN SELECT * FROM phase2_p5.saved_functions ORDER BY sig LOOP
    EXECUTE s.definition;
  END LOOP;
END $restore$;

-- 3. Keep the computed links as evidence, then drop the additive columns (their FKs go with them).
CREATE SCHEMA IF NOT EXISTS security_rollback_archive;
REVOKE ALL ON SCHEMA security_rollback_archive FROM PUBLIC, anon, authenticated;
DO $links$
DECLARE suffix text := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS');
BEGIN
  EXECUTE format('CREATE TABLE security_rollback_archive.%I AS
    SELECT ''expenses''::text tbl, id row_id, employee_id owner_id, entity_id, legal_entity_id FROM public.expenses WHERE legal_entity_id IS NOT NULL
    UNION ALL SELECT ''documents'', id, owner_id, entity_id, legal_entity_id FROM public.documents WHERE legal_entity_id IS NOT NULL
    UNION ALL SELECT ''opening_postings'', id, owner_id, entity_id, legal_entity_id FROM public.opening_postings WHERE legal_entity_id IS NOT NULL', 'p5_ledger_links_' || suffix);
  EXECUTE format('REVOKE ALL ON security_rollback_archive.%I FROM PUBLIC, anon, authenticated, service_role', 'p5_ledger_links_' || suffix);
END $links$;
ALTER TABLE public.expenses DROP COLUMN legal_entity_id;
ALTER TABLE public.documents DROP COLUMN legal_entity_id;
ALTER TABLE public.opening_postings DROP COLUMN legal_entity_id;

-- 4. Archive (never drop) the P5 tables: policies, triggers and links to public tables removed first.
DO $archive$
DECLARE t text; p record; c record; suffix text := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS');
BEGIN
  FOREACH t IN ARRAY ARRAY['record_ownerships', 'register_records', 'entity_relationships', 'account_entity_assignments', 'legacy_backfill_runs',
                           'readable_id_registry', 'readable_id_counters', 'legal_entities', 'readable_id_formats'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    FOR p IN SELECT tgname FROM pg_trigger WHERE tgrelid = ('public.' || t)::regclass AND NOT tgisinternal LOOP
      EXECUTE format('DROP TRIGGER %I ON public.%I', p.tgname, t);
    END LOOP;
    -- foreign keys to tables that stay in public (accounts) would tie the archive to live data
    FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = ('public.' || t)::regclass AND contype = 'f'
             AND confrelid NOT IN ('public.legal_entities'::regclass, 'public.readable_id_formats'::regclass, 'public.register_records'::regclass) LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, c.conname);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['record_ownerships', 'register_records', 'entity_relationships', 'account_entity_assignments', 'legacy_backfill_runs',
                           'readable_id_registry', 'readable_id_counters', 'legal_entities', 'readable_id_formats'] LOOP
    EXECUTE format('ALTER TABLE public.%I SET SCHEMA security_rollback_archive', t);
    EXECUTE format('ALTER TABLE security_rollback_archive.%I RENAME TO %I', t, 'p5_' || t || '_' || suffix);
  END LOOP;
END $archive$;

-- 5. P5 functions and the private schema.
DO $drop$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN (
      'guard_record_ownership', 'p5_can_read_register_record', 'guard_register_record_change', 'format_readable_id', 'issue_readable_id', 'claim_readable_id', 'assign_readable_id',
      'guard_account_entity_assignment', 'guard_legal_entity_change', 'guard_entity_relationship_change', 'guard_backfill_run_append_only',
      'legacy_sha256', 'legacy_exception', 'legacy_json_elements', 'legacy_compare_maps',
      'p5_personal_entity', 'p5_account_entity_keys', 'p5_expense_entity_keys', 'p5_entity_for_keys', 'p5_link_legal_entity',
      'p5_entry_closed', 'p5_asset_entity_key', 'p5_asset_closed', 'p5_json_account_keys', 'p5_legacy_entry_keys', 'p5_entity_backfill_plan', 'p5_erase_owner_records')
    ORDER BY p.proname DESC LOOP
    EXECUTE format('DROP FUNCTION %s', f.sig);
  END LOOP;
END $drop$;
DROP SCHEMA phase2_p5 CASCADE;
COMMIT;
