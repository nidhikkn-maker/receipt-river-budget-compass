-- ============================================================================================
-- P5b_restore_investments.sql (PROPOSED ONLY: NOT APPLIED to Lovable Cloud, Live or any hosted DB)
-- Prepared 2026-11-09 for KK review (Phase 2; backup format 3). Plan: docs/plans/PHASE2_MIGRATION_PLAN_2026-11-09.md §12.
-- Order: 0000-0088 -> P1 -> P2 -> P4 -> (P5, optional) -> P5b. Independent of P5. Rollback:
-- P5b_restore_investments.rollback.sql, run BEFORE the P4 rollback (which refuses while P5b is installed).
--
-- restore_finance_backup (0072; re-created by P4 with the step-up check as its first statement) now
-- also restores demat_accounts and security_holdings, after documents, in the SAME transaction, so a
-- failure anywhere rolls back every table (today the app writes these two tables in a separate client
-- step after the RPC; settings.tsx skips that step when the RPC reports their counts, which it now
-- always does, also as 0 for v1/v2 backups).
--   * Same owner override and RLS behaviour as every other table (SECURITY INVOKER, owner column
--     forced to auth.uid(); ids arrive already remapped by the app for a cross-account restore).
--   * Natural keys: demat_accounts (owner, dp_id, client_id) and security_holdings (owner, demat_id,
--     isin). When the incoming row's natural key already exists under a DIFFERENT id, the existing row
--     is kept (its values are never overwritten), the incoming id is remapped to it (holdings follow
--     their demat account) and any differing values are reported in investmentConflicts. Same id =
--     ordinary restore upsert, exactly like every other table.
-- Everything else in the function is the applied 0072 body, unchanged; the P4 step-up check stays the
-- first statement; signature, return type, SECURITY INVOKER, search_path and grants are unchanged.
-- Data: changes no existing row on apply.
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regclass('security_p4.guarded_functions') IS NULL
     OR NOT EXISTS (SELECT 1 FROM security_p4.guarded_functions WHERE proname = 'restore_finance_backup' AND technique = 'inline') THEN
    RAISE EXCEPTION 'P5b requires P4_step_up_and_assistant_limits.sql';
  END IF;
  IF to_regnamespace('phase2_p5b') IS NOT NULL THEN RAISE EXCEPTION 'P5b is already installed'; END IF;
  -- exactly the P4 form of 0072 (step-up check injected); a hosted hot-fix must be reviewed first
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.restore_finance_backup(jsonb,text)')) IS DISTINCT FROM '88091cfa9fdc2a7a1f9612cb6cfa392c' THEN
    RAISE EXCEPTION 'P5b: restore_finance_backup differs from 0072 as guarded by P4; review before applying';
  END IF;
END $pre$;

CREATE SCHEMA phase2_p5b;
REVOKE ALL ON SCHEMA phase2_p5b FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE phase2_p5b.saved_functions (sig text PRIMARY KEY, definition text NOT NULL);
REVOKE ALL ON phase2_p5b.saved_functions FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO phase2_p5b.saved_functions(sig, definition)
SELECT p.oid::regprocedure::text, pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.oid = to_regprocedure('public.restore_finance_backup(jsonb,text)');

CREATE OR REPLACE FUNCTION public.restore_finance_backup(payload jsonb, display_name text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); t text; r jsonb; cols text; updates text; conflict_cols text; owner_col text; counts jsonb:='{}'; n integer; current_books jsonb; incoming_books jsonb; history jsonb; incoming_data jsonb;
 idmap jsonb:='{}'; conflicts jsonb:='[]'; ex jsonb; existing_id uuid; diff jsonb; fields text[];
BEGIN PERFORM public.require_recent_step_up('restore_finance_backup');
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to restore a backup'; END IF;
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR octet_length(payload::text)>20000000 THEN RAISE EXCEPTION 'Invalid or oversized backup records'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 SELECT coalesce(data->'books','{}') INTO current_books FROM public.finance_preferences WHERE owner_id=uid FOR UPDATE;
 current_books:=coalesce(current_books,'{}');
 FOREACH t IN ARRAY ARRAY['family_members','accounts','finance_preferences','category_budgets','expenses','expense_drafts','commitments','loans','goals','asset_valuations','documents'] LOOP
 IF payload ? t AND jsonb_typeof(payload->t)<>'array' THEN RAISE EXCEPTION 'Invalid backup record list'; END IF;
 n:=0; owner_col:=CASE WHEN t='expenses' THEN 'employee_id' ELSE 'owner_id' END; conflict_cols:=CASE WHEN t='finance_preferences' THEN 'owner_id' WHEN t='category_budgets' THEN 'owner_id, category' ELSE 'id' END;
 FOR r IN SELECT value FROM jsonb_array_elements(COALESCE(payload->t,'[]'::jsonb)) LOOP
 IF jsonb_typeof(r)<>'object' THEN RAISE EXCEPTION 'Invalid backup record'; END IF;
 r:=r || jsonb_build_object(owner_col,uid);
 IF t='finance_preferences' THEN
 incoming_data:=r->'data'; IF jsonb_typeof(incoming_data) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid backup preferences'; END IF;
 incoming_books:=coalesce(incoming_data->'books','{}'); IF jsonb_typeof(incoming_books) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid backup books'; END IF;
 r:=jsonb_set(r,'{data}',jsonb_set(incoming_data,'{books}',incoming_books||jsonb_build_object('closedPeriods',coalesce(current_books->'closedPeriods','[]'),'periodLog',coalesce(current_books->'periodLog','[]')))); END IF;
 SELECT string_agg(format('%I',c.column_name),', ' ORDER BY c.ordinal_position), string_agg(format('%I = EXCLUDED.%I',c.column_name,c.column_name),', ' ORDER BY c.ordinal_position) INTO cols,updates FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t AND r ? c.column_name AND c.column_name<>'revision';
 IF cols IS NULL THEN RAISE EXCEPTION 'Invalid backup columns'; END IF;
 IF t='finance_preferences' AND EXISTS(SELECT 1 FROM public.finance_preferences WHERE owner_id=uid) THEN UPDATE public.finance_preferences SET data=r->'data',updated_at=now() WHERE owner_id=uid;
 ELSE EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) ON CONFLICT (%s) DO UPDATE SET %s',t,cols,cols,t,conflict_cols,updates) USING r; END IF;
 n:=n+1; END LOOP; counts:=counts || jsonb_build_object(t,n); END LOOP;
 -- P5b: investments (backup format 3), after documents, in this same transaction. Natural keys:
 -- demat_accounts (owner, dp_id, client_id); security_holdings (owner, demat_id, isin). An existing row
 -- with the same natural key and another id is kept unchanged; the incoming id maps to it and differing
 -- values are reported, never written.
 FOREACH t IN ARRAY ARRAY['demat_accounts','security_holdings'] LOOP
 IF payload ? t AND jsonb_typeof(payload->t)<>'array' THEN RAISE EXCEPTION 'Invalid backup record list'; END IF;
 n:=0;
 fields:=CASE WHEN t='demat_accounts' THEN ARRAY['broker','holder'] ELSE ARRAY['name','quantity','as_of','statement_value','lots','gains','sources','events'] END;
 FOR r IN SELECT value FROM jsonb_array_elements(COALESCE(payload->t,'[]'::jsonb)) LOOP
 IF jsonb_typeof(r)<>'object' OR jsonb_typeof(r->'id') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid backup record'; END IF;
 r:=r || jsonb_build_object('owner_id',uid);
 IF t='security_holdings' AND idmap ? (r->>'demat_id') THEN r:=r || jsonb_build_object('demat_id',idmap->(r->>'demat_id')); END IF;
 IF t='demat_accounts' THEN
  SELECT to_jsonb(d) INTO ex FROM public.demat_accounts d WHERE d.owner_id=uid AND d.dp_id=coalesce(r->>'dp_id','') AND d.client_id=coalesce(r->>'client_id','');
 ELSE
  SELECT to_jsonb(h) INTO ex FROM public.security_holdings h WHERE h.owner_id=uid AND h.demat_id::text=r->>'demat_id' AND h.isin=r->>'isin';
 END IF;
 existing_id:=(ex->>'id')::uuid;
 IF ex IS NOT NULL AND existing_id IS DISTINCT FROM (r->>'id')::uuid THEN
  idmap:=idmap || jsonb_build_object(r->>'id',existing_id);
  SELECT coalesce(jsonb_object_agg(f, jsonb_build_object('kept',ex->f,'backup',r->f)),'{}') INTO diff FROM unnest(fields) f
   WHERE r ? f AND (CASE WHEN jsonb_typeof(ex->f)='number' AND jsonb_typeof(r->f)='number' THEN (ex->>f)::numeric IS DISTINCT FROM (r->>f)::numeric ELSE ex->f IS DISTINCT FROM r->f END);
  IF diff<>'{}' THEN conflicts:=conflicts || jsonb_build_array(jsonb_build_object('table',t,'backupId',r->>'id','keptId',existing_id,'differences',diff)); END IF;
 ELSE
  SELECT string_agg(format('%I',c.column_name),', ' ORDER BY c.ordinal_position), string_agg(format('%I = EXCLUDED.%I',c.column_name,c.column_name),', ' ORDER BY c.ordinal_position) INTO cols,updates FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t AND r ? c.column_name;
  EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) ON CONFLICT (id) DO UPDATE SET %s',t,cols,cols,t,updates) USING r;
 END IF;
 n:=n+1; END LOOP; counts:=counts || jsonb_build_object(t,n); END LOOP;
 history:=jsonb_build_object('preferenceHistory',(SELECT coalesce(jsonb_agg(jsonb_build_object('closedPeriods',value->'data'->'books'->'closedPeriods','periodLog',value->'data'->'books'->'periodLog')),'[]') FROM jsonb_array_elements(coalesce(payload->'finance_preferences','[]'))),'savedEvidence',coalesce(payload->'period_close_evidence','[]'),'previousImports',coalesce(payload->'imported_period_history','[]'));
 IF EXISTS(SELECT 1 FROM public.finance_preferences WHERE owner_id=uid) AND (EXISTS(SELECT 1 FROM jsonb_array_elements(history->'preferenceHistory') h WHERE coalesce(h->'closedPeriods','null') NOT IN ('null','[]') OR coalesce(h->'periodLog','null') NOT IN ('null','[]')) OR history->'savedEvidence'<>'[]' OR history->'previousImports'<>'[]') THEN PERFORM public.archive_backup_period_history(history); END IF;
 IF nullif(trim(display_name),'') IS NOT NULL THEN UPDATE public.profiles SET full_name=left(trim(display_name),120) WHERE id=uid; END IF;
 RETURN jsonb_build_object('counts',counts,'closingHistory','Imported history is unverified; current closures and evidence are unchanged','investmentConflicts',conflicts,'investmentIdMap',idmap); END $$;
-- CREATE OR REPLACE keeps the oid, owner and EXECUTE grants of the P4 function.

COMMIT;
