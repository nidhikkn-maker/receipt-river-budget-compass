-- ============================================================================================
-- P20_claim_receipt_correction.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores finance_operation (and P4's __unguarded copy) to the saved P19 definitions (CREATE OR REPLACE keeps their
-- grants; each body is md5-checked against the saved copy), drops public.correct_claim_receipt and the phase3_p20
-- schema (its saved definitions are dropped explicitly, then the schema RESTRICT), and RETAINS the audit trail
-- public.claim_receipt_corrections:
--   R1 every row stays unchanged: row count and an md5 of every row's full text (ordered by id) are taken before and
--      after; any difference aborts the rollback.
--   R2 reads stay as installed: owners read only their own rows through the existing RLS policy; anon reads nothing.
--   R3 no app role can write: INSERT/UPDATE/TRUNCATE/REFERENCES/TRIGGER are revoked from every app role and DELETE from
--      all but service_role; the restrictive RLS write refusals stay; the phase3_p20_audit.guard() triggers (installed
--      by P20 and kept) now refuse every INSERT, UPDATE, DELETE and TRUNCATE, for any role, with the only exceptions
--      P20 K8 documents: E1 confirmed erasure of the caller's own data (row owner = auth.uid() and the erasure is
--      authorised: P18 erasure authority, or ledgerline.erasing before P18; phase3_p20_audit.follow_erasure on
--      public.expenses removes them in the erasure) and E2 the service / operator demo cleanup of an anonymous demo
--      guest's rows. Deleting a claim row (by anyone, any path) never removes its corrections.
--      Scope, stated honestly: these are DML guards. The table owner or a superuser can still bypass or remove them
--      with DDL (ALTER TABLE ... DISABLE TRIGGER, DROP TRIGGER/POLICY/TABLE) or session_replication_role = replica;
--      that is outside what SQL inside this database can prevent.
--   R4 the rollback is recorded on the table comment (time and retained row count) and in
--      phase3_p20_retained.rollback (table oid, table owner, row count, content md5); permitted E1/E2 deletes keep that
--      record current (phase3_p20_audit.track_retained, which refreshes it only from a verified pre-delete state and
--      otherwise marks it stale for good); the guards must be enabled in the ordinary mode ('O', the only mode
--      track_retained accepts) before the rollback runs; the rollback locks the trail (SHARE ROW EXCLUSIVE) before hashing
--      and every hash pins TimeZone UTC, DateStyle 'ISO, MDY', IntervalStyle postgres and extra_float_digits 1; a later P20 install adopts the table only if it is that same
--      table with that owner, its rows still match the recorded count and md5, and it has exactly the P20 shape.
-- Re-installing P20 (P20_claim_receipt_correction.sql) keeps every retained row, removes phase3_p20_retained,
-- re-applies the grants and policies and appends new corrections.
-- Roll back P20 before P19. Claims already corrected keep their corrected receipts; idempotency records of corrections
-- stay (a retry replays, never re-applies).
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase3_p20') IS NULL THEN RAISE EXCEPTION 'P20 is not installed'; END IF;
  IF to_regclass('public.claim_receipt_corrections') IS NULL THEN RAISE EXCEPTION 'P20 rollback: the audit trail public.claim_receipt_corrections is missing'; END IF;
  IF to_regnamespace('phase3_p20_retained') IS NOT NULL THEN RAISE EXCEPTION 'P20 rollback: phase3_p20_retained already exists'; END IF;
  IF (SELECT count(*) FROM pg_trigger g WHERE g.tgrelid = 'public.claim_receipt_corrections'::regclass AND NOT g.tgisinternal AND g.tgenabled = 'O'
       AND g.tgname IN ('claim_receipt_corrections_guard', 'claim_receipt_corrections_no_truncate') AND g.tgfoid = to_regprocedure('phase3_p20_audit.guard()')) <> 2
     OR NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = 'public.claim_receipt_corrections'::regclass AND g.tgname = 'claim_receipt_corrections_retained_record'
       AND g.tgenabled = 'O' AND g.tgfoid = to_regprocedure('phase3_p20_audit.track_retained()'))
     OR NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = 'public.expenses'::regclass AND g.tgname = 'p20_claim_corrections_follow_erasure' AND g.tgenabled = 'O') THEN
    RAISE EXCEPTION 'P20 rollback: the audit trail guards are missing or disabled; review before rolling back';
  END IF;
END $pre$;

-- R1/R4: no E1/E2 delete may commit between the hash below and this commit (DELETE takes ROW EXCLUSIVE, which this
-- lock conflicts with), and every hash renders timestamptz with fixed settings (track_retained pins the same ones), so
-- the record never depends on the session that ran the rollback.
LOCK TABLE public.claim_receipt_corrections IN SHARE ROW EXCLUSIVE MODE;
SET LOCAL TimeZone = 'UTC';
SET LOCAL DateStyle = 'ISO, MDY';
SET LOCAL IntervalStyle = 'postgres';
SET LOCAL extra_float_digits = 1;

CREATE TEMP TABLE p20_rollback_rows ON COMMIT DROP AS
  SELECT count(*) n, md5(coalesce(string_agg(c::text, E'\n' ORDER BY c.id), '')) h FROM public.claim_receipt_corrections c;

DO $r$
DECLARE f record; m text;
BEGIN
  FOR f IN SELECT * FROM phase3_p20.saved_functions ORDER BY signature LOOP
    EXECUTE f.definition;
    SELECT md5(prosrc) INTO m FROM pg_proc WHERE oid = to_regprocedure(f.signature);
    IF m IS DISTINCT FROM f.prosrc_md5 THEN RAISE EXCEPTION 'P20 rollback: % was not restored exactly', f.signature; END IF;
  END LOOP;
END $r$;

DROP FUNCTION public.correct_claim_receipt(jsonb, text);
DROP TABLE phase3_p20.saved_functions;
DROP SCHEMA phase3_p20 RESTRICT;

-- R3: the retained audit trail is read-only for every app role (service_role keeps DELETE for E2 only).
REVOKE INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.claim_receipt_corrections FROM PUBLIC, anon, authenticated, service_role;
REVOKE DELETE ON public.claim_receipt_corrections FROM PUBLIC, anon, authenticated;
-- R4: retained-mode marker (phase3_p20_audit.guard refuses every write but E1/E2 while it exists) and the record a
-- re-install checks.
CREATE SCHEMA phase3_p20_retained;
REVOKE ALL ON SCHEMA phase3_p20_retained FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE phase3_p20_retained.rollback (table_oid oid NOT NULL, table_owner oid NOT NULL, rows bigint NOT NULL, content_md5 text NOT NULL,
  rolled_back_at timestamptz NOT NULL DEFAULT clock_timestamp());
REVOKE ALL ON phase3_p20_retained.rollback FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO phase3_p20_retained.rollback(table_oid, table_owner, rows, content_md5)
  SELECT c.oid, c.relowner, r.n, r.h FROM pg_class c, p20_rollback_rows r WHERE c.oid = 'public.claim_receipt_corrections'::regclass;

DO $post$
DECLARE was record; now_n bigint; now_h text;
BEGIN
  SELECT * INTO was FROM p20_rollback_rows;
  SELECT count(*), md5(coalesce(string_agg(c::text, E'\n' ORDER BY c.id), '')) INTO now_n, now_h FROM public.claim_receipt_corrections c;
  IF now_n IS DISTINCT FROM was.n OR now_h IS DISTINCT FROM was.h THEN
    RAISE EXCEPTION 'P20 rollback: audit rows changed (% rows md5 % before, % rows md5 % after)', was.n, was.h, now_n, now_h;
  END IF;
  IF has_table_privilege('authenticated', 'public.claim_receipt_corrections', 'INSERT') OR has_table_privilege('authenticated', 'public.claim_receipt_corrections', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.claim_receipt_corrections', 'DELETE') OR has_table_privilege('authenticated', 'public.claim_receipt_corrections', 'TRUNCATE')
     OR has_table_privilege('service_role', 'public.claim_receipt_corrections', 'INSERT') OR has_table_privilege('service_role', 'public.claim_receipt_corrections', 'UPDATE')
     OR has_table_privilege('service_role', 'public.claim_receipt_corrections', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.claim_receipt_corrections', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.claim_receipt_corrections', 'SELECT') THEN
    RAISE EXCEPTION 'P20 rollback: unexpected privilege on the retained audit trail';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) x WHERE c.oid = 'public.claim_receipt_corrections'::regclass AND x.grantee <> c.relowner
              AND NOT ((x.grantee = 'authenticated'::regrole AND x.privilege_type = 'SELECT')
                    OR (x.grantee = 'service_role'::regrole AND x.privilege_type IN ('SELECT', 'DELETE')))) THEN
    RAISE EXCEPTION 'P20 rollback: unexpected privilege on the retained audit trail';
  END IF;
  -- R4
  EXECUTE format('COMMENT ON TABLE public.claim_receipt_corrections IS %L',
    concat_ws('; ', obj_description('public.claim_receipt_corrections'::regclass, 'pg_class'),
      format('P20 rolled back %s: %s audit rows retained read-only (owner-readable, no writes)', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), now_n)));
END $post$;
COMMIT;
