-- ============================================================================================
-- P20_claim_receipt_correction.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores finance_operation (and P4's __unguarded copy) to the saved P19 definitions (CREATE OR REPLACE keeps their
-- grants; each body is md5-checked against the saved copy), drops public.correct_claim_receipt and the phase3_p20
-- schema (only the saved definitions live there), and RETAINS the audit trail public.claim_receipt_corrections:
--   R1 every row stays (counted before and after; a mismatch aborts the rollback).
--   R2 reads stay as installed: owners read only their own rows through the existing RLS policy; anon reads nothing.
--   R3 nobody can write: INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER are revoked from every app role, the
--      restrictive RLS write refusals stay, and phase3_p20_retained.refuse_write() triggers refuse INSERT, UPDATE,
--      DELETE and TRUNCATE for every role, the table owner included. The one exception is the documented erasure
--      cascade (claim_id REFERENCES expenses ON DELETE CASCADE): a row may go only once its claim no longer exists,
--      so erasing a claim still works while a direct delete of a retained row is refused.
--   R4 the rollback is recorded on the table comment (time and retained row count).
-- Re-installing P20 (P20_claim_receipt_correction.sql) keeps every retained row, removes the R3 triggers and the
-- phase3_p20_retained schema, re-applies the grants and policies and appends new corrections.
-- Roll back P20 before P19. Claims already corrected keep their corrected receipts; idempotency records of corrections
-- stay (a retry replays, never re-applies).
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase3_p20') IS NULL THEN RAISE EXCEPTION 'P20 is not installed'; END IF;
  IF to_regclass('public.claim_receipt_corrections') IS NULL THEN RAISE EXCEPTION 'P20 rollback: the audit trail public.claim_receipt_corrections is missing'; END IF;
  IF to_regnamespace('phase3_p20_retained') IS NOT NULL THEN RAISE EXCEPTION 'P20 rollback: phase3_p20_retained already exists'; END IF;
END $pre$;

CREATE TEMP TABLE p20_rollback_rows ON COMMIT DROP AS SELECT count(*) n FROM public.claim_receipt_corrections;

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
DROP SCHEMA phase3_p20 CASCADE;

-- R3: the retained audit trail is read-only for everyone.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.claim_receipt_corrections FROM PUBLIC, anon, authenticated, service_role;
CREATE SCHEMA phase3_p20_retained;
REVOKE ALL ON SCHEMA phase3_p20_retained FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION phase3_p20_retained.refuse_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- Erasure cascade only: the claim row is already gone, so this is the FK's ON DELETE CASCADE, never a direct delete.
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.expenses x WHERE x.id = OLD.claim_id) THEN RETURN OLD; END IF;
  END IF;
  RAISE EXCEPTION 'Claim receipt corrections are retained audit history (P20 rolled back); they cannot be changed' USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION phase3_p20_retained.refuse_write() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER claim_receipt_corrections_retained BEFORE INSERT OR UPDATE OR DELETE ON public.claim_receipt_corrections
  FOR EACH ROW EXECUTE FUNCTION phase3_p20_retained.refuse_write();
CREATE TRIGGER claim_receipt_corrections_retained_truncate BEFORE TRUNCATE ON public.claim_receipt_corrections
  FOR EACH STATEMENT EXECUTE FUNCTION phase3_p20_retained.refuse_write();

DO $post$
DECLARE kept bigint; was bigint;
BEGIN
  SELECT n INTO was FROM p20_rollback_rows;
  SELECT count(*) INTO kept FROM public.claim_receipt_corrections;
  IF kept IS DISTINCT FROM was THEN RAISE EXCEPTION 'P20 rollback: audit rows changed (% before, % after)', was, kept; END IF;
  IF has_table_privilege('authenticated', 'public.claim_receipt_corrections', 'INSERT') OR has_table_privilege('authenticated', 'public.claim_receipt_corrections', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.claim_receipt_corrections', 'DELETE') OR has_table_privilege('authenticated', 'public.claim_receipt_corrections', 'TRUNCATE')
     OR has_table_privilege('service_role', 'public.claim_receipt_corrections', 'INSERT') OR has_table_privilege('service_role', 'public.claim_receipt_corrections', 'UPDATE')
     OR has_table_privilege('service_role', 'public.claim_receipt_corrections', 'DELETE') OR has_table_privilege('service_role', 'public.claim_receipt_corrections', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.claim_receipt_corrections', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.claim_receipt_corrections', 'SELECT') THEN
    RAISE EXCEPTION 'P20 rollback: unexpected privilege on the retained audit trail';
  END IF;
  -- R4
  EXECUTE format('COMMENT ON TABLE public.claim_receipt_corrections IS %L',
    concat_ws('; ', obj_description('public.claim_receipt_corrections'::regclass, 'pg_class'),
      format('P20 rolled back %s: %s audit rows retained read-only (owner-readable, no writes)', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), kept)));
END $post$;
COMMIT;
