CREATE FUNCTION public.validate_intake_records(_old jsonb,_new jsonb,_type text) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE field text; a jsonb; b jsonb; item jsonb; prior jsonb; key text; kind text; date_value text;
BEGIN
 IF jsonb_typeof(_new) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid intake preferences'; END IF;
 IF _new ? 'books' AND jsonb_typeof(_new->'books') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid intake books'; END IF;
 FOREACH field IN ARRAY ARRAY['entities','assets','properties','leases','fyRecords','gstInvoices','taxCredits','salaryEvidence','holdings','quotes'] LOOP
  IF field IN ('entities','assets') THEN a:=_old->field; b:=_new->field; ELSE a:=_old->'books'->field; b:=_new->'books'->field; END IF;
  IF a IS NOT DISTINCT FROM b THEN CONTINUE; END IF;
  IF b IS NULL THEN b:='[]'; END IF;
  IF a IS NULL THEN a:='[]'; END IF;
  IF jsonb_typeof(b) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid % record list',field; END IF;
  IF jsonb_array_length(b)>10000 THEN RAISE EXCEPTION 'Too many intake records'; END IF;
  IF field='entities' AND _type NOT IN ('incorporation','pan_gst_registration') OR
   field='assets' AND _type NOT IN ('asset_invoice','warranty','property_deed','utility_bill','maintenance') OR
   field='properties' AND _type NOT IN ('property_deed','utility_bill') OR field='leases' AND _type<>'lease_agreement' OR
   field='fyRecords' AND _type NOT IN ('audited_financials','trial_balance','tax_return','depreciation_schedule') OR
   field='gstInvoices' AND _type NOT IN ('gst_return','invoice') OR
   field IN ('taxCredits','salaryEvidence') AND _type<>'tax_statement' OR
   field IN ('holdings','quotes') AND _type NOT IN ('mutual_fund_statement','demat_statement','transaction_statement','capital_gains_statement') THEN
   RAISE EXCEPTION '% records do not match this document type',field;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(b) LOOP
   IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid % record',field; END IF;
   IF a @> jsonb_build_array(item) THEN CONTINUE; END IF;
   key:=CASE WHEN field='quotes' THEN 'key' WHEN field='salaryEvidence' THEN 'entityId' ELSE 'id' END;
   IF jsonb_typeof(item->key) IS DISTINCT FROM 'string' OR length(item->>key)=0 THEN RAISE EXCEPTION '% record needs a valid identifier',field; END IF;
   IF field IN ('entities','assets','properties','holdings') AND jsonb_typeof(item->'name') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid record name'; END IF;
   IF field='entities' THEN
    IF coalesce(item->>'kind','') NOT IN ('individual','proprietor','partnership','llp','company','huf','trust','other') THEN RAISE EXCEPTION 'Invalid company type'; END IF;
    IF item ? 'gstins' AND jsonb_typeof(item->'gstins') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid GST registration list'; END IF;
   END IF;
   FOREACH key IN ARRAY ARRAY['cost','rent','quantity','sharePct','usefulLifeYears','residualPct','deposit','dueDay','noticeDays','escalationPct','escalationEveryMonths','taxable','igst','cgst','sgst','cess','amount','price'] LOOP
    IF item ? key AND item->key<>'null'::jsonb THEN
     IF jsonb_typeof(item->key) IS DISTINCT FROM 'number' OR (item->>key)::numeric<0 THEN RAISE EXCEPTION 'Invalid % in % record',key,field; END IF;
     IF key IN ('sharePct','residualPct') AND (item->>key)::numeric>100 THEN RAISE EXCEPTION 'Ownership/residual percentage exceeds 100'; END IF;
     IF key='dueDay' AND ((item->>key)::numeric<1 OR (item->>key)::numeric>31 OR (item->>key)::numeric<>trunc((item->>key)::numeric)) THEN RAISE EXCEPTION 'Invalid rent due day'; END IF;
    END IF;
   END LOOP;
   FOREACH key IN ARRAY ARRAY['inUse','purchaseDate','capitalisedOn','start','end','date'] LOOP
    IF item ? key AND item->key<>'null'::jsonb THEN
     date_value:=item->>key;
     IF jsonb_typeof(item->key) IS DISTINCT FROM 'string' OR date_value !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Invalid % date',key; END IF;
     BEGIN PERFORM date_value::date; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid % calendar date',key; END;
    END IF;
   END LOOP;
   IF field='assets' AND (jsonb_typeof(item->'cost') IS DISTINCT FROM 'number' OR item->>'inUse' IS NULL OR coalesce(item->>'kind','') NOT IN ('property','building','vehicle','machinery','computer','furniture','other') OR coalesce(item->>'bookMethod','') NOT IN ('slm','wdv')) THEN RAISE EXCEPTION 'Invalid asset facts'; END IF;
   IF field='leases' AND (jsonb_typeof(item->'rent') IS DISTINCT FROM 'number' OR item->>'start' IS NULL OR item->>'end' IS NULL OR item->>'start'>item->>'end' OR coalesce(item->>'propertyId','')='') THEN RAISE EXCEPTION 'Invalid lease facts'; END IF;
   IF field IN ('fyRecords','taxCredits','salaryEvidence') AND coalesce(item->>'fy','') !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'Invalid financial year'; END IF;
   IF field='gstInvoices' AND (jsonb_typeof(item->'taxable') IS DISTINCT FROM 'number' OR item->>'date' IS NULL OR coalesce(item->>'number','')='' OR coalesce(item->>'kind','') NOT IN ('sales','purchase')) THEN RAISE EXCEPTION 'Invalid GST invoice'; END IF;
   IF field='taxCredits' AND (coalesce(item->>'kind','') NOT IN ('tds','tcs','advance','self_assessment') OR jsonb_typeof(item->'amount') IS DISTINCT FROM 'number') THEN RAISE EXCEPTION 'Invalid tax credit'; END IF;
   IF field='salaryEvidence' AND jsonb_typeof(item->'amount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid salary evidence'; END IF;
   IF field='holdings' AND (jsonb_typeof(item->'quantity') IS DISTINCT FROM 'number' OR coalesce(item->>'kind','') NOT IN ('mutual_fund','etf','gold_etf','sgb','physical_gold','bond','broker_cash','other')) THEN RAISE EXCEPTION 'Invalid investment holding'; END IF;
   IF field='quotes' AND (jsonb_typeof(item->'price') IS DISTINCT FROM 'number' OR (item->>'price')::numeric<=0 OR coalesce(item->>'freshness','') NOT IN ('live','delayed','eod','nav','manual','statement')) THEN RAISE EXCEPTION 'Invalid investment price'; END IF;
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.validate_intake_records(jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.commit_document_intake_reviewed(_id uuid,_document uuid,_data jsonb,_lock boolean,_expected bigint) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); rev bigint; doc public.documents; old public.document_intake_commits; req jsonb; previous jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF _id IS NULL OR _document IS NULL OR jsonb_typeof(_data) IS DISTINCT FROM 'object' OR _lock IS NULL THEN RAISE EXCEPTION 'Invalid intake request'; END IF;
 SELECT revision,data INTO rev,previous FROM public.finance_preferences WHERE owner_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Refresh owner records before saving'; END IF;
 req:=jsonb_build_object('document',_document,'data',_data,'lock',_lock);
 SELECT * INTO old FROM public.document_intake_commits WHERE id=_id;
 IF FOUND THEN IF old.owner_id<>uid OR old.request<>req THEN RAISE EXCEPTION 'Intake operation ID already used'; END IF; RETURN old.result_revision; END IF;
 IF rev IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Records changed; refresh and review the document again'; END IF;
 SELECT * INTO doc FROM public.documents WHERE id=_document AND owner_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owner document not found'; END IF;
 IF doc.evidence_locked THEN RAISE EXCEPTION 'Document evidence is locked; use a new reviewed correction'; END IF;
 PERFORM public.validate_intake_records(previous,_data,doc.doc_type);
 UPDATE public.finance_preferences SET data=_data WHERE owner_id=uid RETURNING revision INTO rev;
 IF _lock THEN UPDATE public.documents SET evidence_locked=true WHERE id=_document AND owner_id=uid; END IF;
 INSERT INTO public.document_intake_commits(id,owner_id,document_id,request,result_revision) VALUES(_id,uid,_document,req,rev);
 RETURN rev;
END $$;
REVOKE ALL ON FUNCTION public.commit_document_intake_reviewed(uuid,uuid,jsonb,boolean,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commit_document_intake_reviewed(uuid,uuid,jsonb,boolean,bigint) TO authenticated;