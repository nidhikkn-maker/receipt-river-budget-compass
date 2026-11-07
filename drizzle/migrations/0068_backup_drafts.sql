CREATE OR REPLACE FUNCTION public.restore_finance_backup(payload jsonb, display_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); t text; r jsonb; cols text; updates text; conflict_cols text; owner_col text; counts jsonb:='{}'; n integer;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to restore a backup'; END IF;
 IF jsonb_typeof(payload)<>'object' OR octet_length(payload::text)>20000000 THEN RAISE EXCEPTION 'Invalid or oversized backup records'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 FOREACH t IN ARRAY ARRAY['family_members','accounts','finance_preferences','category_budgets','expenses','expense_drafts','commitments','loans','goals','asset_valuations','documents'] LOOP
  IF payload ? t AND jsonb_typeof(payload->t)<>'array' THEN RAISE EXCEPTION 'Invalid backup record list'; END IF;
  n:=0; owner_col:=CASE WHEN t='expenses' THEN 'employee_id' ELSE 'owner_id' END;
  conflict_cols:=CASE WHEN t='finance_preferences' THEN 'owner_id' WHEN t='category_budgets' THEN 'owner_id, category' ELSE 'id' END;
  FOR r IN SELECT value FROM jsonb_array_elements(COALESCE(payload->t,'[]'::jsonb)) LOOP
   IF jsonb_typeof(r)<>'object' THEN RAISE EXCEPTION 'Invalid backup record'; END IF;
   r:=r || jsonb_build_object(owner_col,uid);
   SELECT string_agg(format('%I',c.column_name),', ' ORDER BY c.ordinal_position), string_agg(format('%I = EXCLUDED.%I',c.column_name,c.column_name),', ' ORDER BY c.ordinal_position)
   INTO cols,updates FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t AND r ? c.column_name;
   IF cols IS NULL THEN RAISE EXCEPTION 'Invalid backup columns'; END IF;
   EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) ON CONFLICT (%s) DO UPDATE SET %s',t,cols,cols,t,conflict_cols,updates) USING r;
   n:=n+1;
  END LOOP;
  counts:=counts || jsonb_build_object(t,n);
 END LOOP;
 IF nullif(trim(display_name),'') IS NOT NULL THEN UPDATE public.profiles SET full_name=left(trim(display_name),120) WHERE id=uid; END IF;
 RETURN jsonb_build_object('counts',counts);
END $$;
REVOKE ALL ON FUNCTION public.restore_finance_backup(jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restore_finance_backup(jsonb,text) TO authenticated;