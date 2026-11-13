-- ============================================================================================
-- P14_asset_disposal_approval.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores the pre-P14 catalog: the guards on finance_preferences / expenses, the request / decide / cancel / preview
-- functions and phase3_p14 (incl. the P14-a book-value working) are dropped, and phase3_p7.classify_adjustment (P8's
-- hook, if P14 wrapped it) gets back the definition saved at install. Assets disposed through P14 keep their soldOn /
-- saleValue / disposal record and their disposal entries (app data). Roll back P14 before P8.
-- The disposal approval audit trail public.asset_disposal_requests is RETAINED (brief G9, 12 Nov 2026; lead ruling,
-- consistent with P20: "rollback must preserve financial audit trails even if the feature is reverted"):
--   R1 every row stays unchanged: row count and an md5 of every row's full text (ordered by id) are taken before and
--      after; any difference aborts the rollback. A request still pending stays pending (nothing can decide it while
--      P14 is rolled back; a re-install can).
--   R2 the owner's read stays: owners read only their own rows ("Disposal requests: owner reads retained history"; the
--      Finance approvers' read used phase3_p14.may_approve, which goes with phase3_p14); anon reads nothing.
--   R3 no app role can write: INSERT/UPDATE/TRUNCATE/REFERENCES/TRIGGER are revoked from every app role and DELETE from
--      all but service_role; the restrictive RLS write refusals stay; the phase3_p14_audit.guard() triggers (installed
--      by P14 and kept) now refuse every INSERT, UPDATE, DELETE and TRUNCATE, for any role, except E1 confirmed erasure
--      of the caller's own data (phase3_p14_audit.follow_erasure on public.expenses) and E2 the service / operator demo
--      cleanup of an anonymous demo guest's rows (P14 header D).
--      Scope, stated honestly: these are DML guards. The table owner or a superuser can still bypass or remove them
--      with DDL (ALTER TABLE ... DISABLE TRIGGER, DROP TRIGGER/POLICY/TABLE) or session_replication_role = replica.
--   R4 the rollback is recorded on the table comment (time and retained row count) and in phase3_p14_retained.rollback
--      (table oid, table owner, row count, content md5); permitted E1/E2 deletes keep that record current
--      (phase3_p14_audit.track_retained refreshes it only from a verified pre-delete state, otherwise marks it stale for
--      good); the guards must be enabled in the ordinary mode ('O') before the rollback runs and again under its lock;
--      the rollback locks the trail (SHARE ROW EXCLUSIVE) before hashing and every hash pins TimeZone UTC, DateStyle
--      'ISO, MDY', IntervalStyle postgres and extra_float_digits 1. A later P14 install adopts the table only if it is
--      that same table with that owner, its rows still match the recorded count and md5, and it has exactly the P14 shape.
-- Order: P18 is rolled back FIRST; this rollback refuses while phase3_p18 exists (P14 header, M1). Every guard trigger
-- (incl. the follow_erasure trigger on public.expenses) must call its own phase3_p14_audit function, enabled 'O'.
-- Re-installing P14 (P14_asset_disposal_approval.sql) keeps every retained row, removes phase3_p14_retained, re-applies
-- the grants and policies and appends new requests.
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase3_p14') IS NULL THEN RAISE EXCEPTION 'P14 is not installed'; END IF;
  -- M1: P18 is rolled back first (it saved phase3_p14.exempt() / phase3_p14_audit.removal_allowed() for its own rollback).
  IF to_regnamespace('phase3_p18') IS NOT NULL THEN
    RAISE EXCEPTION 'P14 rollback: P18 (erasure authority) is installed; roll back P18 first';
  END IF;
  IF to_regclass('public.asset_disposal_requests') IS NULL THEN RAISE EXCEPTION 'P14 rollback: the audit trail public.asset_disposal_requests is missing'; END IF;
  IF to_regnamespace('phase3_p14_retained') IS NOT NULL THEN RAISE EXCEPTION 'P14 rollback: phase3_p14_retained already exists'; END IF;
  IF (SELECT count(*) FROM pg_trigger g WHERE g.tgrelid = 'public.asset_disposal_requests'::regclass AND NOT g.tgisinternal AND g.tgenabled = 'O'
       AND g.tgname IN ('asset_disposal_requests_guard', 'asset_disposal_requests_no_truncate') AND g.tgfoid = to_regprocedure('phase3_p14_audit.guard()')) <> 2
     OR NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = 'public.asset_disposal_requests'::regclass AND g.tgname = 'asset_disposal_requests_retained_record'
       AND g.tgenabled = 'O' AND g.tgfoid = to_regprocedure('phase3_p14_audit.track_retained()'))
     OR NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = 'public.expenses'::regclass AND g.tgname = 'p14_disposal_requests_follow_erasure' AND g.tgenabled = 'O'
       AND g.tgfoid = to_regprocedure('phase3_p14_audit.follow_erasure()')) THEN
    RAISE EXCEPTION 'P14 rollback: the audit trail guards are missing or disabled; review before rolling back';
  END IF;
END $pre$;

-- R1/R4: no E1/E2 delete may commit between the hash below and this commit, and every hash renders timestamptz with
-- fixed settings (track_retained pins the same ones).
LOCK TABLE public.asset_disposal_requests IN SHARE ROW EXCLUSIVE MODE;
SET LOCAL TimeZone = 'UTC';
SET LOCAL DateStyle = 'ISO, MDY';
SET LOCAL IntervalStyle = 'postgres';
SET LOCAL extra_float_digits = 1;

CREATE TEMP TABLE p14_rollback_rows ON COMMIT DROP AS
  SELECT count(*) n, md5(coalesce(string_agg(c::text, E'\n' ORDER BY c.id), '')) h FROM public.asset_disposal_requests c;

DO $r$
DECLARE d text;
BEGIN
  SELECT definition INTO d FROM phase3_p14.saved_functions WHERE signature = 'phase3_p7.classify_adjustment(public.expenses,uuid,text)';
  IF d IS NOT NULL THEN
    EXECUTE d;
    REVOKE ALL ON FUNCTION phase3_p7.classify_adjustment(public.expenses, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
  END IF;
END $r$;

DROP TRIGGER IF EXISTS p14_asset_disposal_fields ON public.finance_preferences;
DROP TRIGGER IF EXISTS p14_disposal_entry ON public.expenses;
DROP FUNCTION public.request_asset_disposal(text, text, date, numeric, uuid, uuid[], text, uuid, jsonb, numeric, text);
DROP FUNCTION public.decide_asset_disposal(uuid, boolean, text, numeric);
DROP FUNCTION public.cancel_asset_disposal(uuid, text);
DROP FUNCTION public.preview_asset_disposal(text, date, numeric);
DROP FUNCTION public.preview_asset_disposal(text, date, numeric, text);
-- R2: the owner's read no longer needs phase3_p14 (dropped next).
DROP POLICY "Disposal requests: owner and approvers read" ON public.asset_disposal_requests;
CREATE POLICY "Disposal requests: owner reads retained history" ON public.asset_disposal_requests FOR SELECT TO authenticated USING (owner_id = auth.uid());
DROP SCHEMA phase3_p14 CASCADE;

-- R3: the retained audit trail is read-only for every app role (service_role keeps DELETE for E2 only).
REVOKE INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.asset_disposal_requests FROM PUBLIC, anon, authenticated, service_role;
REVOKE DELETE ON public.asset_disposal_requests FROM PUBLIC, anon, authenticated;
-- R4: retained-mode marker (phase3_p14_audit.guard refuses every write but E1/E2 while it exists) and the record a
-- re-install checks.
CREATE SCHEMA phase3_p14_retained;
REVOKE ALL ON SCHEMA phase3_p14_retained FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE phase3_p14_retained.rollback (table_oid oid NOT NULL, table_owner oid NOT NULL, rows bigint NOT NULL, content_md5 text NOT NULL,
  rolled_back_at timestamptz NOT NULL DEFAULT clock_timestamp());
REVOKE ALL ON phase3_p14_retained.rollback FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO phase3_p14_retained.rollback(table_oid, table_owner, rows, content_md5)
  SELECT c.oid, c.relowner, r.n, r.h FROM pg_class c, p14_rollback_rows r WHERE c.oid = 'public.asset_disposal_requests'::regclass;

DO $post$
DECLARE was record; now_n bigint; now_h text;
  retained constant text[] := ARRAY['Disposal requests: owner reads retained history', 'P14 requests recorded only by the disposal workflow', 'P14 requests cannot be changed',
    'P14 requests cannot be deleted', 'P14 service reads disposal requests', 'P14 demo cleanup removes guest requests'];
BEGIN
  SELECT * INTO was FROM p14_rollback_rows;
  -- Re-checked under the lock: a guard disabled (or replaced) after the precheck but before the lock is refused.
  IF (SELECT count(*) FROM pg_trigger g WHERE g.tgrelid = 'public.asset_disposal_requests'::regclass AND NOT g.tgisinternal AND g.tgenabled = 'O'
       AND g.tgname IN ('asset_disposal_requests_guard', 'asset_disposal_requests_no_truncate') AND g.tgfoid = to_regprocedure('phase3_p14_audit.guard()')) <> 2
     OR NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = 'public.asset_disposal_requests'::regclass AND g.tgname = 'asset_disposal_requests_retained_record'
       AND g.tgenabled = 'O' AND g.tgfoid = to_regprocedure('phase3_p14_audit.track_retained()'))
     OR NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = 'public.expenses'::regclass AND g.tgname = 'p14_disposal_requests_follow_erasure' AND g.tgenabled = 'O'
       AND g.tgfoid = to_regprocedure('phase3_p14_audit.follow_erasure()')) THEN
    RAISE EXCEPTION 'P14 rollback: the audit trail guards were disabled or changed after the precheck; review before rolling back';
  END IF;
  -- Exactly the retained guards and policies remain on the trail (the CASCADE above removed nothing it needs).
  IF EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = 'public.asset_disposal_requests'::regclass AND NOT g.tgisinternal
              AND g.tgname NOT IN ('asset_disposal_requests_guard', 'asset_disposal_requests_no_truncate', 'asset_disposal_requests_retained_record'))
     OR (SELECT array_agg(p.polname::text ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid = 'public.asset_disposal_requests'::regclass)
        IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(retained) x) THEN
    RAISE EXCEPTION 'P14 rollback: the retained audit trail does not have exactly the retained policies and guards';
  END IF;
  SELECT count(*), md5(coalesce(string_agg(c::text, E'\n' ORDER BY c.id), '')) INTO now_n, now_h FROM public.asset_disposal_requests c;
  IF now_n IS DISTINCT FROM was.n OR now_h IS DISTINCT FROM was.h THEN
    RAISE EXCEPTION 'P14 rollback: audit rows changed (% rows md5 % before, % rows md5 % after)', was.n, was.h, now_n, now_h;
  END IF;
  IF has_table_privilege('authenticated', 'public.asset_disposal_requests', 'INSERT') OR has_table_privilege('authenticated', 'public.asset_disposal_requests', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.asset_disposal_requests', 'DELETE') OR has_table_privilege('authenticated', 'public.asset_disposal_requests', 'TRUNCATE')
     OR has_table_privilege('service_role', 'public.asset_disposal_requests', 'INSERT') OR has_table_privilege('service_role', 'public.asset_disposal_requests', 'UPDATE')
     OR has_table_privilege('service_role', 'public.asset_disposal_requests', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.asset_disposal_requests', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.asset_disposal_requests', 'SELECT') THEN
    RAISE EXCEPTION 'P14 rollback: unexpected privilege on the retained audit trail';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) x WHERE c.oid = 'public.asset_disposal_requests'::regclass AND x.grantee <> c.relowner
              AND NOT ((x.grantee = 'authenticated'::regrole AND x.privilege_type = 'SELECT')
                    OR (x.grantee = 'service_role'::regrole AND x.privilege_type IN ('SELECT', 'DELETE')))) THEN
    RAISE EXCEPTION 'P14 rollback: unexpected privilege on the retained audit trail';
  END IF;
  -- R4
  EXECUTE format('COMMENT ON TABLE public.asset_disposal_requests IS %L',
    concat_ws('; ', obj_description('public.asset_disposal_requests'::regclass, 'pg_class'),
      format('P14 rolled back %s: %s disposal requests retained read-only (owner-readable, no writes)', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), now_n)));
END $post$;
COMMIT;
