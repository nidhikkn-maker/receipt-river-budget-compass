CREATE FUNCTION public.revise_import_rows(_batch uuid, _items jsonb, _patch jsonb, _decision text DEFAULT NULL) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.import_batches; r public.import_rows; x jsonb; p jsonb; changes jsonb := '[]'; n integer:=0;
BEGIN
 IF auth.uid() IS NULL OR COALESCE((auth.jwt()->>'is_anonymous')::boolean,false) THEN RAISE EXCEPTION 'Sign in to review imports'; END IF;
 SELECT * INTO b FROM public.import_batches WHERE id=_batch AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Import not found'; END IF;
 IF jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items)<1 OR jsonb_array_length(_items)>500 OR jsonb_typeof(_patch) IS DISTINCT FROM 'object' OR (_decision IS NOT NULL AND _decision NOT IN ('review','approved','excluded')) THEN RAISE EXCEPTION 'Invalid review changes'; END IF;
 IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(_items))<>jsonb_array_length(_items) THEN RAISE EXCEPTION 'Duplicate selection'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(_patch) k WHERE k NOT IN ('title','merchant','category','scope','memberId','paymentMethod','txnType','accountId','toAccountId','description','tags','reviewed','categoryConfirmed','duplicateOverride','reimbursable','organisation','subcategory','reimbursementOrganisation')) THEN RAISE EXCEPTION 'Only classification fields can change'; END IF;
 IF _patch ? 'tags' AND jsonb_typeof(_patch->'tags') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid tags'; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(_items) ORDER BY value->>'id' LOOP
  SELECT * INTO r FROM public.import_rows WHERE id=(x->>'id')::uuid AND batch_id=b.id AND owner_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected transaction not found'; END IF;
  IF r.proposal IS DISTINCT FROM x->'proposal' OR r.decision IS DISTINCT FROM x->>'decision' THEN RAISE EXCEPTION 'Review changed. Refresh and select again'; END IF;
  IF EXISTS(SELECT 1 FROM public.import_posts WHERE owner_id=auth.uid() AND account_id=b.account_id AND fingerprint=r.fingerprint) THEN RAISE EXCEPTION 'Posted records cannot be changed'; END IF;
  IF r.duplicate_kind='exact' AND _decision IS DISTINCT FROM 'excluded' THEN RAISE EXCEPTION 'Already recorded'; END IF;
  p:=r.proposal || _patch;
  IF _patch ? 'category' AND (_patch->>'category') IS DISTINCT FROM r.proposal->>'category' THEN p:=p || jsonb_build_object('categoryConfirmed',COALESCE((_patch->>'categoryConfirmed')::boolean,false)); END IF;
  IF _patch ? 'tags' THEN p:=jsonb_set(p,'{tags}',(SELECT COALESCE(jsonb_agg(t),'[]') FROM (SELECT DISTINCT value AS t FROM jsonb_array_elements(COALESCE(r.proposal->'tags','[]') || (_patch->'tags'))) tags)); END IF;
  IF _decision='approved' THEN
   IF NOT COALESCE((p->>'reviewed')::boolean,false) OR p->>'category' ~* 'miscellaneous\s*[—–-]\s*check' OR (lower(trim(p->>'category'))='miscellaneous' AND NOT COALESCE((p->>'categoryConfirmed')::boolean,false)) THEN RAISE EXCEPTION 'Confirm a final classification'; END IF;
   IF r.duplicate_kind IN ('likely','possible') AND NOT COALESCE((p->>'duplicateOverride')::boolean,false) THEN RAISE EXCEPTION 'Review duplicate individually'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=NULLIF(p->>'accountId','')::uuid AND owner_id=auth.uid() AND NOT archived) THEN RAISE EXCEPTION 'Confirm account'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.finance_preferences f,jsonb_array_elements(f.data->'categories') c WHERE f.owner_id=auth.uid() AND c->>'name'=p->>'category' AND NOT COALESCE((c->>'archived')::boolean,false)) THEN RAISE EXCEPTION 'Choose an active category'; END IF;
   IF p->>'txnType' IN ('transfer','card_payment','loan_repayment','investment') AND (NULLIF(p->>'toAccountId','') IS NULL OR p->>'accountId'=p->>'toAccountId' OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=(p->>'toAccountId')::uuid AND owner_id=auth.uid() AND NOT archived)) THEN RAISE EXCEPTION 'Confirm destination account'; END IF;
  END IF;
  changes:=changes || jsonb_build_array(jsonb_build_object('id',r.id,'before',r.proposal,'after',p,'previousDecision',r.decision,'decision',COALESCE(_decision,'review')));
  UPDATE public.import_rows SET proposal=p,decision=COALESCE(_decision,'review'),updated_at=now() WHERE id=r.id;
  n:=n+1;
 END LOOP;
 INSERT INTO public.import_audit(owner_id,batch_id,action,details) VALUES(auth.uid(),b.id,'review_changes',jsonb_build_object('changes',changes,'count',n));
 RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.revise_import_rows(uuid,jsonb,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revise_import_rows(uuid,jsonb,jsonb,text) TO authenticated;
DO $migration$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.post_import_rows_secure(uuid,uuid,jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'p:=r.proposal; tid:=r.id;', $guard$p:=r.proposal; tid:=r.id;
 IF p->>'category' ~* 'miscellaneous\s*[—–-]\s*check' OR (lower(trim(p->>'category'))='miscellaneous' AND NOT COALESCE((p->>'categoryConfirmed')::boolean,false)) THEN RAISE EXCEPTION 'Explicitly confirm a final category'; END IF;
 $guard$);
 EXECUTE definition;
END; $migration$;