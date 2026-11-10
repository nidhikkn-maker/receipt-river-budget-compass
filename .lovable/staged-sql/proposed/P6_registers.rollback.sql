-- ============================================================================================
-- P6_registers.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores the exact P1+P2+P4+P5 catalog:
--   * the P6 entry points are unguarded (wrapper and __unguarded copy dropped, P4 registry rows
--     removed; their security_events audit rows are kept);
--   * the two P6 triggers on existing tables (archive history on register_records, erasure on
--     finance_preferences), every P6 function and the phase2_p6 schema are dropped;
--   * the seventeen P6 tables are MOVED (never dropped) to security_rollback_archive with a UTC suffix
--     and the prefix p6_, without policies, triggers or links to live tables, with no client or
--     service_role access.
-- Kept on purpose (P5 tables, so permanent IDs are never regenerated or reissued):
--   * register_records / record_ownerships rows created by the P6 backfill (valid P5 anchors; a
--     re-applied P6 re-attaches to the same uuid and AST/PRP number through (owner, kind, legacy_id));
--   * readable_id_formats LSE/HLD/RCV/PRJ, readable_id_counters and readable_id_registry rows (a number
--     once issued is never issued again, also after a re-apply);
--   * legacy_backfill_runs rows of the P6 kinds (append-only audit).
-- Run BEFORE the P5 rollback (which refuses while P6 is installed). No pre-existing column value changes.
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase2_p6') IS NULL OR to_regclass('public.assets') IS NULL THEN
    RAISE EXCEPTION 'P6 is not installed';
  END IF;
  -- P8 (asset depreciation posting) reads P6 assets and depreciation journals: roll P8 back first.
  IF to_regnamespace('phase3_p8') IS NOT NULL THEN
    RAISE EXCEPTION 'P6 rollback: P8_asset_depreciation_posting is installed; run P8_asset_depreciation_posting.rollback.sql first';
  END IF;
END $pre$;

-- 1. P4 guards added by P6: drop wrapper and original, forget the registry rows.
DO $unguard$
DECLARE g record;
BEGIN
  FOR g IN SELECT * FROM security_p4.guarded_functions WHERE proname IN (
             'preview_register_backfill', 'commit_register_backfill', 'register_backfill_report', 'register_valuation_report',
             'attach_asset_to_property', 'end_asset_containment', 'archive_register_item')
           ORDER BY seq DESC LOOP
    EXECUTE format('DROP FUNCTION public.%I(%s)', g.proname, g.identity_args);
    EXECUTE format('DROP FUNCTION public.%I(%s)', g.proname || '__unguarded', g.identity_args);
    DELETE FROM security_p4.guarded_functions WHERE seq = g.seq;
  END LOOP;
END $unguard$;

-- 2. Triggers on existing tables.
DROP TRIGGER p6_log_archive ON public.register_records;
DROP TRIGGER a_p6_erase_owner_registers ON public.finance_preferences;

-- 3. Archive (never drop) the P6 tables.
CREATE SCHEMA IF NOT EXISTS security_rollback_archive;
REVOKE ALL ON SCHEMA security_rollback_archive FROM PUBLIC, anon, authenticated;
DO $archive$
DECLARE t text; p record; c record; suffix text := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISSMS');
  tabs text[] := ARRAY['register_archive_events', 'register_legacy_copies', 'register_entry_links', 'projects', 'receivables', 'investment_holdings',
                       'trip_advances', 'trip_bookings', 'trips', 'leases', 'register_valuations', 'property_assets', 'property_units', 'properties',
                       'depreciation_journals', 'asset_events', 'assets'];
BEGIN
  FOREACH t IN ARRAY tabs LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    FOR p IN SELECT tgname FROM pg_trigger WHERE tgrelid = ('public.' || t)::regclass AND NOT tgisinternal LOOP
      EXECUTE format('DROP TRIGGER %I ON public.%I', p.tgname, t);
    END LOOP;
    -- links to tables that stay in public (register_records, legal_entities) would tie the archive to live data
    FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = ('public.' || t)::regclass AND contype = 'f'
             AND NOT (confrelid::regclass::text = ANY (SELECT 'public.' || x FROM unnest(tabs) x)) LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, c.conname);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
  END LOOP;
  FOREACH t IN ARRAY tabs LOOP
    -- index names are unique per schema: suffix them so a later rollback (after a re-apply) cannot collide
    FOR c IN SELECT i.relname FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid WHERE x.indrelid = ('public.' || t)::regclass LOOP
      EXECUTE format('ALTER INDEX public.%I RENAME TO %I', c.relname, left(c.relname, 24) || '_' || left(md5(c.relname), 6) || '_' || suffix);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I SET SCHEMA security_rollback_archive', t);
    EXECUTE format('ALTER TABLE security_rollback_archive.%I RENAME TO %I', t, 'p6_' || t || '_' || suffix);
  END LOOP;
END $archive$;

-- 4. P6 functions and the private schema.
DO $drop$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN (
      'p6_date', 'p6_ts', 'p6_num', 'p6_text', 'p6_uuid', 'p6_texts', 'p6_scope', 'p6_scope_label', 'p6_ref_ok', 'p6_entity_shared', 'p6_list',
      'p6_status_exception', 'p6_map_add', 'p6_guard_register_row', 'p6_guard_references', 'p6_guard_property_asset', 'p6_log_archive',
      'p6_plan_assets', 'p6_plan_properties', 'p6_plan_trips', 'p6_plan_holdings', 'p6_plan_receivables', 'p6_plan_projects', 'p6_register_plan',
      'p6_after_map', 'p6_orphans', 'p6_erase_owner_registers')
    ORDER BY p.proname DESC LOOP
    EXECUTE format('DROP FUNCTION %s', f.sig);
  END LOOP;
END $drop$;
DROP SCHEMA phase2_p6 CASCADE;
COMMIT;
