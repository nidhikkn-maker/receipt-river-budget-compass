-- ============================================================================================
-- P11_backup_restore_receipts.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores the exact pre-P11 catalog: public.restore_finance_backup gets back the definition saved at install
-- (so a P4 step-up check present then stays), the checked restore, the receipts table and the phase3_p11 schema
-- are dropped. Restore receipts are audit evidence: the rollback refuses while any exist unless the operator, with
-- KK approval and after exporting them, sets in the same transaction: SET LOCAL phase3_p11.drop_receipts = 'on'.
-- Roll back in reverse order of applying (P11 before P4's rollback if P4 was applied first).
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase3_p11') IS NULL THEN RAISE EXCEPTION 'P11 is not installed'; END IF;
  IF EXISTS (SELECT 1 FROM public.backup_restore_receipts) AND coalesce(current_setting('phase3_p11.drop_receipts', true), '') <> 'on' THEN
    RAISE EXCEPTION 'P11 rollback: restore receipts exist; export them and obtain KK approval, then SET LOCAL phase3_p11.drop_receipts = ''on''';
  END IF;
END $pre$;

DO $r$
DECLARE d text;
BEGIN
  SELECT definition INTO d FROM phase3_p11.saved_functions WHERE signature = 'restore_finance_backup(jsonb,text)';
  IF d IS NULL THEN RAISE EXCEPTION 'P11 rollback: saved definition of restore_finance_backup is missing'; END IF;
  EXECUTE d;
END $r$;

DROP FUNCTION public.restore_finance_backup_checked(jsonb, text, text);
DROP TABLE public.backup_restore_receipts;
DROP SCHEMA phase3_p11 CASCADE;
COMMIT;
