-- ============================================================================================
-- P5b_restore_investments.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores restore_finance_backup exactly as P4 left it (saved definition; same oid and grants) and
-- drops the phase2_p5b schema. No data is changed: restored investment rows stay. Run BEFORE the P4
-- rollback (which refuses while P5b is installed).
-- ============================================================================================
BEGIN;
DO $rb$
DECLARE s record;
BEGIN
  IF to_regnamespace('phase2_p5b') IS NULL THEN RAISE EXCEPTION 'P5b is not installed'; END IF;
  FOR s IN SELECT * FROM phase2_p5b.saved_functions LOOP EXECUTE s.definition; END LOOP;
END $rb$;
DROP SCHEMA phase2_p5b CASCADE;
COMMIT;
