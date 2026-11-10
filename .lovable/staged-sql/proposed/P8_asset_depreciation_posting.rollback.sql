-- ============================================================================================
-- P8_asset_depreciation_posting.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores the exact P6 + P7 catalog: the P7 hook phase3_p7.classify_adjustment returns to its P7 body
-- (classifies nothing), the two P8 triggers and the phase3_p8 schema are dropped. Run BEFORE the P7,
-- P6 and P5 rollbacks (each refuses while P8 is installed).
-- Posted depreciation batches are immutable P7 records and stay. After this rollback a later change to
-- such an entry would re-derive it as an 'unclassified_adjustment' and REVERSE its depreciation posting,
-- so the rollback refuses while depreciation postings exist unless the operator sets, in the same
-- transaction and with KK approval: SET LOCAL phase3_p8.rollback_with_postings = 'on'.
-- No existing column value changes.
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase3_p8') IS NULL THEN RAISE EXCEPTION 'P8 is not installed'; END IF;
  IF EXISTS (SELECT 1 FROM public.posting_lines l WHERE l.code = 'expense:Depreciation')
     AND coalesce(current_setting('phase3_p8.rollback_with_postings', true), '') <> 'on' THEN
    RAISE EXCEPTION 'P8 rollback: depreciation postings exist; obtain KK approval and SET LOCAL phase3_p8.rollback_with_postings = ''on''';
  END IF;
END $pre$;

DROP TRIGGER zz_p8_sync_depreciation ON public.finance_preferences;
DROP TRIGGER zz_p8_sync_depreciation ON public.depreciation_journals;

CREATE OR REPLACE FUNCTION phase3_p7.classify_adjustment(_e public.expenses, _account_entity uuid, _account_role text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT NULL::jsonb
$$;
REVOKE ALL ON FUNCTION phase3_p7.classify_adjustment(public.expenses, uuid, text) FROM PUBLIC, anon, authenticated, service_role;

DROP SCHEMA phase3_p8 CASCADE;
COMMIT;
