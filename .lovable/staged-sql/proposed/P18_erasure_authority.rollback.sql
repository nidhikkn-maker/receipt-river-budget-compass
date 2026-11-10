-- ============================================================================================
-- P18_erasure_authority.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores the exact pre-P18 catalog: every guard P18 re-created gets back its saved definition, the erasure wrapper is
-- dropped and the previous public.delete_my_finance_data() (unchanged body, owner and ACL) moves back from
-- phase3_p18_private; the audit table, authority tables and both schemas are dropped. Roll back P18 FIRST (before any
-- earlier proposed file). This RE-OPENS finding P0-036 (guards trust ledgerline.erasing / phase3_p9.discarding again).
-- Erasure audit rows are evidence: the rollback refuses while any exist unless the operator (KK approval, after
-- exporting them) sets in the same transaction: SET LOCAL phase3_p18.drop_audit = 'on'.
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase3_p18') IS NULL THEN RAISE EXCEPTION 'P18 is not installed'; END IF;
  IF EXISTS (SELECT 1 FROM public.erasure_audit) AND coalesce(current_setting('phase3_p18.drop_audit', true), '') <> 'on' THEN
    RAISE EXCEPTION 'P18 rollback: erasure audit rows exist; export them and obtain KK approval, then SET LOCAL phase3_p18.drop_audit = ''on''';
  END IF;
END $pre$;

DROP FUNCTION public.delete_my_finance_data();
ALTER FUNCTION phase3_p18_private.erase_inner() SET SCHEMA public;
ALTER FUNCTION public.erase_inner() RENAME TO delete_my_finance_data;

DO $r$
DECLARE d text;
BEGIN
  FOR d IN SELECT definition FROM phase3_p18.saved_functions WHERE signature <> 'public.delete_my_finance_data()' LOOP
    EXECUTE d;
  END LOOP;
END $r$;

DROP TABLE public.erasure_audit;
DROP SCHEMA phase3_p18_private;
DROP SCHEMA phase3_p18 CASCADE;
COMMIT;
