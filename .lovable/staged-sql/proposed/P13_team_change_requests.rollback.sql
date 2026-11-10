-- ============================================================================================
-- P13_team_change_requests.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores the exact pre-P13 catalog: triggers, functions, the request table and phase3_p13 are dropped,
-- transaction_audit.actor_id is dropped, and the "Team expenses: delete" policy saved at install is re-created
-- (P10, if still installed, keeps refusing deletes). Requests and audit actors are audit evidence: the rollback refuses
-- while any request exists or any audit row records an actor, unless the operator (KK approval, after exporting them)
-- sets in the same transaction: SET LOCAL phase3_p13.drop_requests = 'on'. Roll back P13 before P10.
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase3_p13') IS NULL THEN RAISE EXCEPTION 'P13 is not installed'; END IF;
  IF (EXISTS (SELECT 1 FROM public.entry_change_requests) OR EXISTS (SELECT 1 FROM public.transaction_audit WHERE actor_id IS NOT NULL))
     AND coalesce(current_setting('phase3_p13.drop_requests', true), '') <> 'on' THEN
    RAISE EXCEPTION 'P13 rollback: change requests or recorded audit actors exist; export them and obtain KK approval, then SET LOCAL phase3_p13.drop_requests = ''on''';
  END IF;
END $pre$;

DO $r$
DECLARE t text; p record;
BEGIN
  FOR t IN SELECT tbl FROM phase3_p13.audit_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS p13_audit_kept ON public.%I', t);
    EXECUTE format('DROP TRIGGER IF EXISTS p13_audit_no_truncate ON public.%I', t);
  END LOOP;
  FOR p IN SELECT * FROM phase3_p13.saved_policies LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s', p.name, p.tbl, p.permissive, p.cmd, p.roles,
      CASE WHEN p.qual IS NOT NULL THEN ' USING (' || p.qual || ')' ELSE '' END,
      CASE WHEN p.with_check IS NOT NULL THEN ' WITH CHECK (' || p.with_check || ')' ELSE '' END);
  END LOOP;
END $r$;

DROP TRIGGER IF EXISTS p13_team_financial_edit ON public.expenses;
DROP FUNCTION public.request_entry_change(uuid, text, text, jsonb);
DROP FUNCTION public.decide_entry_change(uuid, boolean, text);
DROP FUNCTION public.cancel_entry_change(uuid, text);
DROP TABLE public.entry_change_requests CASCADE;
ALTER TABLE public.transaction_audit DROP COLUMN actor_id;
DROP SCHEMA phase3_p13 CASCADE;
COMMIT;
