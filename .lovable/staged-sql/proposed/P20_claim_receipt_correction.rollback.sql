-- ============================================================================================
-- P20_claim_receipt_correction.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores finance_operation (and P4's __unguarded copy) to the saved P19 definitions (CREATE OR REPLACE keeps their
-- grants), drops public.correct_claim_receipt, the audit table public.claim_receipt_corrections (its rows are LOST:
-- export them first if they must be kept) and the phase3_p20 schema. Roll back P20 before P19. Claims already
-- corrected keep their corrected receipts; idempotency records of corrections stay (a retry replays, never re-applies).
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase3_p20') IS NULL THEN RAISE EXCEPTION 'P20 is not installed'; END IF;
END $pre$;

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
DROP TABLE public.claim_receipt_corrections;
DROP SCHEMA phase3_p20 CASCADE;
COMMIT;
