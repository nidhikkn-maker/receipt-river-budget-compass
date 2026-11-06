CREATE TABLE public.imported_period_history (
 id text PRIMARY KEY, owner_id uuid NOT NULL REFERENCES public.finance_preferences(owner_id) ON DELETE CASCADE,
 imported_at timestamptz NOT NULL DEFAULT now(), history jsonb NOT NULL,
 verification text NOT NULL DEFAULT 'Imported backup history; unverified, not an authoritative closure'
);
GRANT SELECT ON public.imported_period_history TO authenticated;
GRANT ALL ON public.imported_period_history TO service_role;
ALTER TABLE public.imported_period_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.imported_period_history FOR SELECT TO authenticated USING(owner_id=auth.uid());

CREATE FUNCTION public.archive_backup_period_history(_history jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL OR jsonb_typeof(_history) IS DISTINCT FROM 'object' OR octet_length(_history::text)>20000000 THEN RAISE EXCEPTION 'Invalid imported history'; END IF;
 INSERT INTO public.imported_period_history(id,owner_id,history)
 VALUES(encode(sha256(convert_to(uid::text||_history::text,'UTF8')),'hex'),uid,_history) ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.archive_backup_period_history(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.archive_backup_period_history(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_finance_backup(payload jsonb, display_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); t text; r jsonb; cols text; updates text; conflict_cols text; owner_col text; counts jsonb:='{}'; n integer;
 current_books jsonb; incoming_books jsonb; history jsonb; incoming_data jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to restore a backup'; END IF;
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR octet_length(payload::text)>20000000 THEN RAISE EXCEPTION 'Invalid or oversized backup records'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 SELECT coalesce(data->'books','{}') INTO current_books FROM public.finance_preferences WHERE owner_id=uid FOR UPDATE;
 current_books:=coalesce(current_books,'{}');
 FOREACH t IN ARRAY ARRAY['family_members','accounts','finance_preferences','category_budgets','expenses','expense_drafts','commitments','loans','goals','asset_valuations','documents'] LOOP
  IF payload ? t AND jsonb_typeof(payload->t)<>'array' THEN RAISE EXCEPTION 'Invalid backup record list'; END IF;
  n:=0; owner_col:=CASE WHEN t='expenses' THEN 'employee_id' ELSE 'owner_id' END;
  conflict_cols:=CASE WHEN t='finance_preferences' THEN 'owner_id' WHEN t='category_budgets' THEN 'owner_id, category' ELSE 'id' END;
  FOR r IN SELECT value FROM jsonb_array_elements(COALESCE(payload->t,'[]'::jsonb)) LOOP
   IF jsonb_typeof(r)<>'object' THEN RAISE EXCEPTION 'Invalid backup record'; END IF;
   r:=r || jsonb_build_object(owner_col,uid);
   IF t='finance_preferences' THEN
    incoming_data:=r->'data';
    IF jsonb_typeof(incoming_data) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid backup preferences'; END IF;
    incoming_books:=coalesce(incoming_data->'books','{}');
    IF jsonb_typeof(incoming_books) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid backup books'; END IF;
    r:=jsonb_set(r,'{data}',jsonb_set(incoming_data,'{books}',incoming_books||jsonb_build_object('closedPeriods',coalesce(current_books->'closedPeriods','[]'),'periodLog',coalesce(current_books->'periodLog','[]'))));
   END IF;
   SELECT string_agg(format('%I',c.column_name),', ' ORDER BY c.ordinal_position), string_agg(format('%I = EXCLUDED.%I',c.column_name,c.column_name),', ' ORDER BY c.ordinal_position)
   INTO cols,updates FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t AND r ? c.column_name AND c.column_name<>'revision';
   IF cols IS NULL THEN RAISE EXCEPTION 'Invalid backup columns'; END IF;
   EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) ON CONFLICT (%s) DO UPDATE SET %s',t,cols,cols,t,conflict_cols,updates) USING r;
   n:=n+1;
  END LOOP;
  counts:=counts || jsonb_build_object(t,n);
 END LOOP;
 history:=jsonb_build_object('preferenceHistory',(SELECT coalesce(jsonb_agg(jsonb_build_object('closedPeriods',value->'data'->'books'->'closedPeriods','periodLog',value->'data'->'books'->'periodLog')),'[]') FROM jsonb_array_elements(coalesce(payload->'finance_preferences','[]'))),
  'savedEvidence',coalesce(payload->'period_close_evidence','[]'),'previousImports',coalesce(payload->'imported_period_history','[]'));
 IF EXISTS(SELECT 1 FROM public.finance_preferences WHERE owner_id=uid) AND
  (EXISTS(SELECT 1 FROM jsonb_array_elements(history->'preferenceHistory') h WHERE coalesce(h->'closedPeriods','null') NOT IN ('null','[]') OR coalesce(h->'periodLog','null') NOT IN ('null','[]')) OR history->'savedEvidence'<>'[]' OR history->'previousImports'<>'[]') THEN
  PERFORM public.archive_backup_period_history(history);
 END IF;
 IF nullif(trim(display_name),'') IS NOT NULL THEN UPDATE public.profiles SET full_name=left(trim(display_name),120) WHERE id=uid; END IF;
 RETURN jsonb_build_object('counts',counts,'closingHistory','Imported history is unverified; current closures and evidence are unchanged');
END $$;
REVOKE ALL ON FUNCTION public.restore_finance_backup(jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restore_finance_backup(jsonb,text) TO authenticated;

CREATE FUNCTION public.require_period_operation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_books jsonb; new_books jsonb;
BEGIN
 IF current_setting('ledgerline.erasing',true)='on' THEN RETURN coalesce(NEW,OLD); END IF;
 IF TG_OP='DELETE' THEN
  IF jsonb_array_length(coalesce(OLD.data->'books'->'closedPeriods','[]'))>0 OR EXISTS(SELECT 1 FROM public.period_close_evidence WHERE owner_id=OLD.owner_id) THEN
   RAISE EXCEPTION 'Use confirmed account deletion to remove closing history';
  END IF;
  RETURN OLD;
 END IF;
 IF current_setting('ledgerline.period_operation',true)='on' THEN RETURN NEW; END IF;
 old_books:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE coalesce(OLD.data->'books','{}') END;
 new_books:=coalesce(NEW.data->'books','{}');
 IF coalesce(old_books->'closedPeriods','[]') IS DISTINCT FROM coalesce(new_books->'closedPeriods','[]') OR
    coalesce(old_books->'periodLog','[]') IS DISTINCT FROM coalesce(new_books->'periodLog','[]') THEN
  RAISE EXCEPTION 'Close or reopen on Audit so evidence is retained';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER require_period_operation BEFORE INSERT OR UPDATE OR DELETE ON public.finance_preferences FOR EACH ROW EXECUTE FUNCTION public.require_period_operation();
ALTER FUNCTION public.change_accounting_period(uuid,text,text,date,date,text,jsonb) SET ledgerline.period_operation='on';