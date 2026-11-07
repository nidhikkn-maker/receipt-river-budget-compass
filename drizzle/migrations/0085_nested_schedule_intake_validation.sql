CREATE OR REPLACE FUNCTION public.validate_intake_records(_old jsonb,_new jsonb,_type text) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE field text; a jsonb; b jsonb; item jsonb; key text; date_value text; sched jsonb; sline jsonb;
BEGIN
 IF jsonb_typeof(_new) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid intake preferences'; END IF;
 IF _new ? 'books' AND jsonb_typeof(_new->'books') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid intake books'; END IF;
 FOREACH field IN ARRAY ARRAY['entities','assets','properties','leases','fyRecords','gstInvoices','taxCredits','salaryEvidence','holdings','quotes'] LOOP
 IF field IN ('entities','assets') THEN a:=_old->field; b:=_new->field; ELSE a:=_old->'books'->field; b:=_new->'books'->field; END IF;
 IF a IS NOT DISTINCT FROM b THEN CONTINUE; END IF;
 IF b IS NULL THEN b:='[]'; END IF; IF a IS NULL THEN a:='[]'; END IF; IF a=b THEN CONTINUE; END IF;
 IF jsonb_typeof(b) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid % record list',field; END IF;
 IF jsonb_array_length(b)>10000 THEN RAISE EXCEPTION 'Too many intake records'; END IF;
 IF field='entities' AND _type NOT IN ('incorporation','pan_gst_registration') OR field='assets' AND _type NOT IN ('asset_invoice','warranty','property_deed','utility_bill','maintenance') OR field='properties' AND _type NOT IN ('property_deed','utility_bill') OR field='leases' AND _type<>'lease_agreement' OR field='fyRecords' AND _type NOT IN ('audited_financials','trial_balance','tax_return','depreciation_schedule') OR field='gstInvoices' AND _type NOT IN ('gst_return','invoice') OR field IN ('taxCredits','salaryEvidence') AND _type<>'tax_statement' OR field IN ('holdings','quotes') AND _type NOT IN ('mutual_fund_statement','demat_statement','transaction_statement','capital_gains_statement') THEN RAISE EXCEPTION '% records do not match this document type',field; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(b) LOOP
 IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid % record',field; END IF;
 IF a @> jsonb_build_array(item) THEN CONTINUE; END IF;
 key:=CASE WHEN field='quotes' THEN 'key' WHEN field='salaryEvidence' THEN 'entityId' ELSE 'id' END;
 IF jsonb_typeof(item->key) IS DISTINCT FROM 'string' OR length(item->>key)=0 THEN RAISE EXCEPTION '% record needs a valid identifier',field; END IF;
 IF field IN ('entities','assets','properties','holdings') AND jsonb_typeof(item->'name') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid record name'; END IF;
 IF field='entities' THEN IF coalesce(item->>'kind','') NOT IN ('individual','proprietorship','partnership','llp','company','huf','trust') THEN RAISE EXCEPTION 'Invalid company type'; END IF; IF item ? 'gstins' AND jsonb_typeof(item->'gstins') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid GST registration list'; END IF; END IF;
 FOREACH key IN ARRAY ARRAY['cost','rent','quantity','sharePct','usefulLifeYears','residualPct','deposit','dueDay','noticeDays','escalationPct','escalationEveryMonths','taxable','igst','cgst','sgst','cess','amount','price'] LOOP
 IF item ? key AND item->key<>'null'::jsonb THEN
 IF jsonb_typeof(item->key) IS DISTINCT FROM 'number' OR (item->>key)::numeric<0 THEN RAISE EXCEPTION 'Invalid % in % record',key,field; END IF;
 IF key IN ('sharePct','residualPct') AND (item->>key)::numeric>100 THEN RAISE EXCEPTION 'Ownership/residual percentage exceeds 100'; END IF;
 IF key='dueDay' AND ((item->>key)::numeric<1 OR (item->>key)::numeric>31 OR (item->>key)::numeric<>trunc((item->>key)::numeric)) THEN RAISE EXCEPTION 'Invalid rent due day'; END IF; END IF; END LOOP;
 FOREACH key IN ARRAY ARRAY['inUse','purchaseDate','capitalisedOn','start','end','date'] LOOP
 IF item ? key AND item->key<>'null'::jsonb THEN date_value:=item->>key; IF jsonb_typeof(item->key) IS DISTINCT FROM 'string' OR date_value !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Invalid % date',key; END IF; BEGIN PERFORM date_value::date; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid % calendar date',key; END; END IF; END LOOP;
 IF field='assets' AND (jsonb_typeof(item->'cost') IS DISTINCT FROM 'number' OR item->>'inUse' IS NULL OR coalesce(item->>'kind','') NOT IN ('property','building','vehicle','machinery','computer','furniture','other') OR coalesce(item->>'bookMethod','') NOT IN ('slm','wdv')) THEN RAISE EXCEPTION 'Invalid asset facts'; END IF;
 IF field='leases' AND (jsonb_typeof(item->'rent') IS DISTINCT FROM 'number' OR item->>'start' IS NULL OR item->>'end' IS NULL OR item->>'start'>item->>'end' OR coalesce(item->>'propertyId','')='') THEN RAISE EXCEPTION 'Invalid lease facts'; END IF;
 IF field IN ('fyRecords','taxCredits','salaryEvidence') AND coalesce(item->>'fy','') !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'Invalid financial year'; END IF;
 IF field='gstInvoices' AND (jsonb_typeof(item->'taxable') IS DISTINCT FROM 'number' OR item->>'date' IS NULL OR coalesce(item->>'number','')='' OR coalesce(item->>'kind','') NOT IN ('sales','purchase')) THEN RAISE EXCEPTION 'Invalid GST invoice'; END IF;
 IF field='taxCredits' AND (coalesce(item->>'kind','') NOT IN ('tds','tcs','advance','self_assessment') OR jsonb_typeof(item->'amount') IS DISTINCT FROM 'number') THEN RAISE EXCEPTION 'Invalid tax credit'; END IF;
 IF field='salaryEvidence' AND jsonb_typeof(item->'amount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid salary evidence'; END IF;
 IF field='holdings' AND (jsonb_typeof(item->'quantity') IS DISTINCT FROM 'number' OR coalesce(item->>'kind','') NOT IN ('mutual_fund','etf','gold_etf','sgb','physical_gold','bond','broker_cash','other')) THEN RAISE EXCEPTION 'Invalid investment holding'; END IF;
 IF field='quotes' AND (jsonb_typeof(item->'price') IS DISTINCT FROM 'number' OR (item->>'price')::numeric<=0 OR coalesce(item->>'freshness','') NOT IN ('live','delayed','eod','nav','manual','statement')) THEN RAISE EXCEPTION 'Invalid investment price'; END IF;
 IF field='fyRecords' THEN
  IF item ? 'audited' AND item->'audited' IS NOT NULL AND item->'audited'<>'null'::jsonb THEN
   IF jsonb_typeof(item->'audited') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid audited heads'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_each(item->'audited') h WHERE h.key NOT IN ('bank','cash','investments','fixedAssets','accumulatedDepreciation','capitalReserves','loans','receivables','payables','taxBalances','other') OR jsonb_typeof(h.value) IS DISTINCT FROM 'number' OR (h.value#>>'{}')::numeric<0) THEN RAISE EXCEPTION 'Invalid audited head figure'; END IF;
  END IF;
  IF item ? 'details' AND item->'details' IS NOT NULL AND item->'details'<>'null'::jsonb THEN
   IF jsonb_typeof(item->'details') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'details')>50 THEN RAISE EXCEPTION 'Invalid schedule list'; END IF;
   FOR sched IN SELECT value FROM jsonb_array_elements(item->'details') LOOP
    IF jsonb_typeof(sched) IS DISTINCT FROM 'object' OR coalesce(sched->>'schedule','') NOT IN ('balanceSheet','profitLoss','trialBalance','cashFlow','notes','auditorReport','fixedAssetRegister','depreciation','loanSchedule','receivables','payables','investments','taxComputation','gstReconciliation') THEN RAISE EXCEPTION 'Invalid schedule'; END IF;
    IF jsonb_typeof(sched->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(sched->'lines')>500 THEN RAISE EXCEPTION 'Invalid schedule lines'; END IF;
    FOR sline IN SELECT value FROM jsonb_array_elements(sched->'lines') LOOP
     IF jsonb_typeof(sline) IS DISTINCT FROM 'object' OR coalesce(sline->>'label','')='' OR jsonb_typeof(sline->'amount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid schedule line'; END IF;
     IF sline ? 'page' AND sline->'page' IS NOT NULL AND sline->'page'<>'null'::jsonb AND jsonb_typeof(sline->'page') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid schedule line page'; END IF;
     IF sline ? 'quote' AND sline->'quote' IS NOT NULL AND sline->'quote'<>'null'::jsonb AND jsonb_typeof(sline->'quote') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid schedule line quote'; END IF;
    END LOOP;
   END LOOP;
  END IF;
  IF item ? 'lossesCarriedForward' AND item->'lossesCarriedForward' IS NOT NULL AND item->'lossesCarriedForward'<>'null'::jsonb THEN
   IF jsonb_typeof(item->'lossesCarriedForward') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid carried-forward losses'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(item->'lossesCarriedForward') l WHERE jsonb_typeof(l.value) IS DISTINCT FROM 'object' OR coalesce(l.value->>'fromFy','') !~ '^\d{4}-\d{2}$' OR coalesce(l.value->>'kind','') NOT IN ('business','capital','depreciation','house') OR jsonb_typeof(l.value->'amount') IS DISTINCT FROM 'number' OR (l.value->>'amount')::numeric<0) THEN RAISE EXCEPTION 'Invalid carried-forward loss'; END IF;
  END IF;
  IF item ? 'filedReturns' AND item->'filedReturns' IS NOT NULL AND item->'filedReturns'<>'null'::jsonb THEN
   IF jsonb_typeof(item->'filedReturns') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid filed return list'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(item->'filedReturns') f WHERE jsonb_typeof(f.value) IS DISTINCT FROM 'object' OR coalesce(f.value->>'form','')='' OR coalesce(f.value->>'ack','')='' OR coalesce(f.value->>'filedOn','') !~ '^\d{4}-\d{2}-\d{2}$') THEN RAISE EXCEPTION 'Invalid filed return'; END IF;
  END IF;
  IF item ? 'versions' AND item->'versions' IS NOT NULL AND item->'versions'<>'null'::jsonb THEN
   IF jsonb_typeof(item->'versions') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid version history'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(item->'versions') v WHERE jsonb_typeof(v.value) IS DISTINCT FROM 'object' OR coalesce(v.value->>'at','')='' OR coalesce(v.value->>'reason','')='' OR jsonb_typeof(v.value->'audited') IS DISTINCT FROM 'object') THEN RAISE EXCEPTION 'Invalid earlier version'; END IF;
  END IF;
 END IF;
 END LOOP; END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.validate_intake_records(jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
COMMENT ON FUNCTION public.validate_intake_records(jsonb,jsonb,text) IS 'Typed intake validation including nested financial-year schedules: details lines, audited heads, carried-forward losses, filed returns and earlier versions are validated record by record.';