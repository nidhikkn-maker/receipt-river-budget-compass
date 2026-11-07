CREATE FUNCTION public.post_import_rows_secure(_owner uuid, _batch uuid, _rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.import_batches; r public.import_rows; x jsonb; p jsonb; tid uuid; inserted integer; total integer:=0; source uuid; dest uuid;
BEGIN
 IF _owner IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 SELECT * INTO b FROM public.import_batches WHERE id=_batch AND owner_id=_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Import not found'; END IF;
 IF jsonb_typeof(_rows)<>'array' OR jsonb_array_length(_rows)>100 THEN RAISE EXCEPTION 'Approve up to 100 rows at a time'; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(_rows) LOOP
  SELECT * INTO r FROM public.import_rows WHERE id=(x->>'id')::uuid AND batch_id=b.id AND owner_id=_owner FOR UPDATE;
  IF NOT FOUND OR r.decision<>'approved' THEN RAISE EXCEPTION 'Approve the reviewed transaction first'; END IF;
  p:=r.proposal; tid:=r.id;
  IF NOT COALESCE((p->>'reviewed')::boolean,false) THEN RAISE EXCEPTION 'Review classification before posting'; END IF;
  IF EXISTS(SELECT 1 FROM public.import_posts WHERE owner_id=_owner AND account_id=b.account_id AND fingerprint=r.fingerprint) THEN CONTINUE; END IF;
  source:=NULLIF(p->>'accountId','')::uuid; dest:=NULLIF(p->>'toAccountId','')::uuid;
  IF r.duplicate_kind='exact' OR (r.duplicate_kind IN ('likely','possible') AND COALESCE((p->>'duplicateOverride')::boolean,false)=false) THEN RAISE EXCEPTION 'Review possible duplicates individually'; END IF;
  IF source IS NULL OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=source AND owner_id=_owner) THEN RAISE EXCEPTION 'Confirm payment account'; END IF;
  IF (p->>'date')::date < DATE '2026-04-01' OR (p->>'date')::date > CURRENT_DATE OR (p->>'amount')::numeric<=0 THEN RAISE EXCEPTION 'Invalid historical date or amount'; END IF;
  IF p->>'txnType' NOT IN ('expense','income','refund','transfer','card_payment','loan_repayment','investment','reimbursement','advance','advance_settlement') THEN RAISE EXCEPTION 'Confirm transaction type'; END IF;
  IF p->>'txnType' IN ('transfer','card_payment','loan_repayment','investment') AND (dest IS NULL OR source=dest OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=dest AND owner_id=_owner)) THEN RAISE EXCEPTION 'Confirm two different owned accounts'; END IF;
  IF NULLIF(p->>'memberId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.family_members WHERE id=(p->>'memberId')::uuid AND owner_id=_owner) THEN RAISE EXCEPTION 'Invalid person'; END IF;
  IF p->>'scope' NOT IN ('personal','family','business','official') THEN RAISE EXCEPTION 'Confirm workspace'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.finance_preferences f, jsonb_array_elements(f.data->'categories') c WHERE f.owner_id=_owner AND c->>'name'=p->>'category' AND COALESCE((c->>'archived')::boolean,false)=false) THEN RAISE EXCEPTION 'Choose an active category'; END IF;
  IF (x->>'rate')::numeric<=0 OR (x->>'homeAmount')::numeric<=0 THEN RAISE EXCEPTION 'Invalid conversion'; END IF;
  INSERT INTO public.expenses(id,employee_id,title,merchant,category,amount,expense_date,description,currency,original_amount,fx_rate,fx_date,payment_method,scope,member_id,txn_type,account_id,to_account_id,tags,reimbursement_status,statement_ref)
  SELECT tid,_owner,p->>'title',p->>'merchant',p->>'category',(x->>'homeAmount')::numeric,(p->>'date')::date,left('Imported from '||b.file_name||' · '||(r.line->>'description'),2000),b.currency,(p->>'amount')::numeric,(x->>'rate')::numeric,(x->>'fxDate')::date,p->>'paymentMethod',p->>'scope',NULLIF(p->>'memberId','')::uuid,p->>'txnType',source,dest,ARRAY(SELECT jsonb_array_elements_text(COALESCE(p->'tags','[]'))),CASE WHEN p->>'reimbursable'='true' THEN 'pending' ELSE 'none' END,left(b.file_name||' · '||(r.line->>'ref')||' · '||(r.line->>'description'),300)
  WHERE NOT EXISTS(SELECT 1 FROM public.import_posts WHERE owner_id=_owner AND account_id=b.account_id AND fingerprint=r.fingerprint) ON CONFLICT(id) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  IF inserted=1 THEN
   INSERT INTO public.import_posts(owner_id,account_id,fingerprint,transaction_id,batch_id,original_line) VALUES(_owner,b.account_id,r.fingerprint,tid,b.id,r.line);
   IF p->>'reimbursementOrganisation' IS NOT NULL THEN UPDATE public.expenses SET reimbursement=jsonb_build_object('payer',p->>'reimbursementOrganisation','stage','not_submitted') WHERE id=tid AND employee_id=_owner; END IF;
   INSERT INTO public.statement_line_imports(owner_id,account_key,fingerprint,line_date,batch_id,file_label) VALUES(_owner,b.account_id::text,r.fingerprint,(r.line->>'date')::date,b.id,b.file_name) ON CONFLICT(owner_id,account_key,fingerprint) DO NOTHING;
   total:=total+1;
  END IF;
 END LOOP;
 INSERT INTO public.import_audit(owner_id,batch_id,action,details) VALUES(_owner,b.id,'posted',jsonb_build_object('count',total));
 RETURN total;
END;
$$;
REVOKE ALL ON FUNCTION public.post_import_rows(uuid,jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION public.post_import_rows_secure(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.post_import_rows_secure(uuid,uuid,jsonb) TO service_role;
CREATE FUNCTION public.cleanup_import_records() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN DELETE FROM public.import_batches WHERE owner_id=OLD.owner_id; DELETE FROM public.import_rules WHERE owner_id=OLD.owner_id; RETURN OLD; END; $$;
CREATE TRIGGER cleanup_import_on_preferences_delete AFTER DELETE ON public.finance_preferences FOR EACH ROW EXECUTE FUNCTION public.cleanup_import_records();