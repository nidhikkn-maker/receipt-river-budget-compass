-- ============================================================================================
-- P14_asset_disposal_approval.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores the exact pre-P14 catalog: guards, functions (incl. preview_asset_disposal and the P14-a book-value working in
-- phase3_p14), the request table and phase3_p14 are dropped, and
-- phase3_p7.classify_adjustment (P8's hook, if P14 wrapped it) gets back the definition saved at install. Assets
-- disposed through P14 keep their soldOn / saleValue / disposal record and their disposal entries (app data).
-- Disposal requests are audit evidence: the rollback refuses while any exist unless the operator (KK approval, after
-- exporting them) sets in the same transaction: SET LOCAL phase3_p14.drop_requests = 'on'. Roll back P14 before P8.
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase3_p14') IS NULL THEN RAISE EXCEPTION 'P14 is not installed'; END IF;
  IF EXISTS (SELECT 1 FROM public.asset_disposal_requests) AND coalesce(current_setting('phase3_p14.drop_requests', true), '') <> 'on' THEN
    RAISE EXCEPTION 'P14 rollback: disposal requests exist; export them and obtain KK approval, then SET LOCAL phase3_p14.drop_requests = ''on''';
  END IF;
END $pre$;

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
DROP FUNCTION public.request_asset_disposal(text, text, date, numeric, uuid, uuid[], text, numeric, uuid, jsonb);
DROP FUNCTION public.decide_asset_disposal(uuid, boolean, text, numeric);
DROP FUNCTION public.cancel_asset_disposal(uuid, text);
DROP FUNCTION public.preview_asset_disposal(text, date, numeric);
DROP TABLE public.asset_disposal_requests CASCADE;
DROP SCHEMA phase3_p14 CASCADE;
COMMIT;
