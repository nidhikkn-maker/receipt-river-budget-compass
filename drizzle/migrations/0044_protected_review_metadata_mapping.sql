CREATE FUNCTION public.apply_review_metadata(_id uuid,_items jsonb,_config jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); prior public.financial_corrections; e public.expenses; item jsonb; patch jsonb; prefs jsonb; instrument jsonb; a public.accounts; next_row jsonb; snapshots jsonb:='[]'; request_data jsonb; next_tags text[];
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF _id IS NULL OR jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items) NOT BETWEEN 1 AND 500 OR jsonb_typeof(_config) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid mapping selection'; END IF;
 IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(_items) x)<>jsonb_array_length(_items) THEN RAISE EXCEPTION 'Duplicate selection'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 request_data:=jsonb_build_object('kind','review_metadata','items',_items,'config',_config);
 SELECT * INTO prior FROM public.financial_corrections WHERE id=_id FOR UPDATE;
 IF FOUND THEN
  IF prior.owner_id<>uid OR prior.request<>request_data THEN RAISE EXCEPTION 'Mapping identifier already used'; END IF;
  IF prior.undone_at IS NOT NULL THEN RAISE EXCEPTION 'Mapping was already restored'; END IF;
  RETURN _id;
 END IF;
 SELECT data INTO prefs FROM public.finance_preferences WHERE owner_id=uid FOR UPDATE;
 IF NOT FOUND OR jsonb_build_object('tags',COALESCE(prefs->'tags','[]'::jsonb),'categories',COALESCE(prefs->'categories','[]'::jsonb),'paymentInstruments',COALESCE(prefs->'paymentInstruments','[]'::jsonb))<>_config THEN RAISE EXCEPTION 'Configuration changed; prepare a new preview'; END IF;
 PERFORM 1 FROM public.accounts WHERE owner_id=uid ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.expenses WHERE employee_id=uid ORDER BY id FOR UPDATE;
 FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
  patch:=item->'patch';
  IF jsonb_typeof(patch) IS DISTINCT FROM 'object' OR patch='{}'::jsonb OR EXISTS(SELECT 1 FROM jsonb_object_keys(patch) k WHERE k NOT IN ('organisation','scope','paymentInstrumentId','category','tag')) THEN RAISE EXCEPTION 'Unsupported mapping'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(patch) p WHERE jsonb_typeof(p.value)<>'string' OR p.value='""'::jsonb) THEN RAISE EXCEPTION 'Mapping values required'; END IF;
  SELECT * INTO e FROM public.expenses WHERE id=(item->>'id')::uuid AND employee_id=uid;
  IF NOT FOUND OR e.correction_revision IS DISTINCT FROM (item->>'revision')::bigint THEN RAISE EXCEPTION 'Transaction changed; prepare a new preview'; END IF;
  IF e.txn_type<>'expense' THEN RAISE EXCEPTION 'Resolve financial type before expense mapping'; END IF;
  IF jsonb_array_length(e.splits)>0 OR jsonb_array_length(e.workspace_allocations)>0 OR jsonb_array_length(e.allocations)>0 OR e.reimbursement_status<>'none' OR COALESCE(e.reimbursement,'{}'::jsonb)<>'{}'::jsonb THEN RAISE EXCEPTION 'Claims or split responsibility require individual review'; END IF;
  IF EXISTS(SELECT 1 FROM public.loans WHERE owner_id=uid AND source_transaction_id=e.id) OR e.description LIKE 'Scheduled occurrence:%' OR e.description LIKE 'Reimbursed entries:%' THEN RAISE EXCEPTION 'Linked financial workflow requires individual review'; END IF;
  IF patch ? 'organisation' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(prefs->'tags','[]')) t WHERE t->>'group'='Organisation' AND t->>'name'=patch->>'organisation') THEN RAISE EXCEPTION 'Choose configured organisation'; END IF;
  IF patch ? 'scope' AND patch->>'scope' NOT IN ('personal','family','business','official') THEN RAISE EXCEPTION 'Choose valid workspace'; END IF;
  IF patch ? 'category' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(prefs->'categories','[]')) c WHERE c->>'name'=patch->>'category' AND NOT COALESCE((c->>'archived')::boolean,false)) THEN RAISE EXCEPTION 'Choose active category'; END IF;
  IF patch ? 'tag' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(prefs->'tags','[]')) t WHERE t->>'group' IN ('Project','Event','Purpose','Client') AND (t->>'group')||': '||(t->>'name')=patch->>'tag') THEN RAISE EXCEPTION 'Choose configured activity'; END IF;
  IF patch ? 'paymentInstrumentId' THEN
   SELECT value INTO instrument FROM jsonb_array_elements(COALESCE(prefs->'paymentInstruments','[]')) WHERE value->>'id'=patch->>'paymentInstrumentId' AND NOT COALESCE((value->>'archived')::boolean,false);
   IF NOT FOUND OR (instrument->>'accountId')::uuid IS DISTINCT FROM e.account_id THEN RAISE EXCEPTION 'Payment mapping must preserve the source account; use financial correction for account changes'; END IF;
   SELECT * INTO a FROM public.accounts WHERE id=e.account_id AND owner_id=uid AND NOT archived;
   IF NOT FOUND OR NOT (
    instrument->>'type' IN ('upi','debit_card','net_banking','cheque') AND a.kind IN ('savings','current') OR
    instrument->>'type'='upi_lite' AND a.kind IN ('savings','current','wallet') OR
    instrument->>'type' IN ('credit_card','rupay_upi') AND a.kind='credit_card' OR
    instrument->>'type'='cash' AND a.kind='cash' OR instrument->>'type'='wallet' AND a.kind='wallet' OR
    instrument->>'type'='forex_card' AND a.kind IN ('wallet','savings','current','other_asset') OR
    instrument->>'type'='company_card' AND a.kind IN ('credit_card','savings','current','other_liability')
   ) THEN RAISE EXCEPTION 'Payment method incompatible with active account'; END IF;
  END IF;
  next_tags:=e.tags;
  IF patch ? 'tag' AND NOT (patch->>'tag'=ANY(next_tags)) THEN next_tags:=array_append(next_tags,patch->>'tag'); END IF;
  IF (NOT patch ? 'organisation' OR e.department IS NOT DISTINCT FROM patch->>'organisation') AND (NOT patch ? 'scope' OR e.scope=patch->>'scope') AND (NOT patch ? 'category' OR e.category=patch->>'category') AND (NOT patch ? 'paymentInstrumentId' OR e.payment_instrument_id IS NOT DISTINCT FROM patch->>'paymentInstrumentId') AND e.tags=next_tags THEN RAISE EXCEPTION 'No mapping changes selected'; END IF;
  UPDATE public.expenses SET department=CASE WHEN patch ? 'organisation' THEN patch->>'organisation' ELSE department END,
   scope=COALESCE(patch->>'scope',scope),category=COALESCE(patch->>'category',category),tags=next_tags,
   payment_instrument_id=COALESCE(patch->>'paymentInstrumentId',payment_instrument_id),
   payment_method=CASE WHEN patch ? 'paymentInstrumentId' THEN CASE instrument->>'type' WHEN 'upi' THEN 'upi' WHEN 'upi_lite' THEN 'upi' WHEN 'rupay_upi' THEN 'credit_card' WHEN 'net_banking' THEN 'bank_transfer' WHEN 'cheque' THEN 'bank_transfer' WHEN 'wallet' THEN 'other' ELSE instrument->>'type' END ELSE payment_method END
   WHERE id=e.id AND employee_id=uid RETURNING to_jsonb(expenses) INTO next_row;
  snapshots:=snapshots||jsonb_build_array(jsonb_build_object('before',to_jsonb(e),'after',next_row));
 END LOOP;
 INSERT INTO public.financial_corrections(id,owner_id,request,entries) VALUES(_id,uid,request_data,snapshots);
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.apply_review_metadata(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_review_metadata(uuid,jsonb,jsonb) TO authenticated;
CREATE FUNCTION public.undo_review_metadata(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); batch public.financial_corrections; item jsonb; e public.expenses; old public.expenses;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 SELECT * INTO batch FROM public.financial_corrections WHERE id=_id AND owner_id=uid AND request->>'kind'='review_metadata' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mapping unavailable'; END IF;
 IF batch.undone_at IS NOT NULL THEN RETURN; END IF;
 PERFORM 1 FROM public.accounts WHERE owner_id=uid ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.expenses WHERE employee_id=uid ORDER BY id FOR UPDATE;
 FOR item IN SELECT value FROM jsonb_array_elements(batch.entries) LOOP
  SELECT * INTO e FROM public.expenses WHERE id=(item->'after'->>'id')::uuid AND employee_id=uid;
  IF NOT FOUND OR e.correction_revision<>(item->'after'->>'correction_revision')::bigint THEN RAISE EXCEPTION 'Later edit prevents restoration'; END IF;
  old:=jsonb_populate_record(NULL::public.expenses,item->'before');
  UPDATE public.expenses SET department=old.department,scope=old.scope,category=old.category,tags=old.tags,payment_instrument_id=old.payment_instrument_id,payment_method=old.payment_method WHERE id=e.id AND employee_id=uid;
 END LOOP;
 UPDATE public.financial_corrections SET undone_at=now() WHERE id=_id AND owner_id=uid;
END $$;
REVOKE ALL ON FUNCTION public.undo_review_metadata(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.undo_review_metadata(uuid) TO authenticated;