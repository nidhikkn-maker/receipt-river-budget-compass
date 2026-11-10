-- ============================================================================================
-- P15_export_authorisation.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores the exact pre-P15 catalog: authorise_export, the export audit and phase3_p15 are dropped. The export
-- audit is evidence: the rollback refuses while it holds rows unless the operator (KK approval, after exporting it)
-- sets in the same transaction: SET LOCAL phase3_p15.drop_audit = 'on'.
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase3_p15') IS NULL THEN RAISE EXCEPTION 'P15 is not installed'; END IF;
  IF EXISTS (SELECT 1 FROM public.export_audit) AND coalesce(current_setting('phase3_p15.drop_audit', true), '') <> 'on' THEN
    RAISE EXCEPTION 'P15 rollback: export audit rows exist; export them and obtain KK approval, then SET LOCAL phase3_p15.drop_audit = ''on''';
  END IF;
END $pre$;

DROP FUNCTION public.authorise_export(text, uuid, text, text, integer, bigint, text);
DROP TABLE public.export_audit CASCADE;
DROP SCHEMA phase3_p15 CASCADE;
COMMIT;
