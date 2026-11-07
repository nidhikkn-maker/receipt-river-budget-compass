CREATE OR REPLACE FUNCTION public.receive_claim_receipt(expense_id uuid, receipt_amount numeric, receipt_date date, receipt_account uuid, receipt_note text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); e public.expenses%ROWTYPE; claim numeric; got numeric; remaining numeric; tid uuid; info jsonb;
BEGIN
 IF uid IS NULL OR current_setting('app.finance_owner',true) IS DISTINCT FROM uid::text THEN RAISE EXCEPTION 'Use the payment workflow'; END IF;
 SELECT * INTO e FROM public.expenses WHERE id=expense_id AND employee_id=uid FOR UPDATE;
 IF NOT FOUND OR e.txn_type<>'expense' OR e.reimbursement_status<>'pending' OR e.reimbursement->>'stage' IN ('rejected','written_off') THEN RAISE EXCEPTION 'This claim is no longer pending'; END IF;
 claim:=least(e.amount,COALESCE((e.reimbursement->>'reimbursable')::numeric,e.amount));
 SELECT COALESCE(sum((r->>'amount')::numeric),0) INTO got FROM jsonb_array_elements(COALESCE(e.reimbursement->'receipts','[]'::jsonb)) r;
 remaining:=round(claim-got,2);
 IF receipt_amount IS NULL OR receipt_amount::text IN ('NaN','Infinity','-Infinity') OR receipt_amount<>round(receipt_amount,2) OR receipt_amount<=0 OR receipt_amount>remaining THEN RAISE EXCEPTION 'Receipt must be positive and no more than the outstanding claim (%)',remaining; END IF;
 IF receipt_date IS NULL OR receipt_date>current_date THEN RAISE EXCEPTION 'Choose a valid payment date, not in the future'; END IF;
 IF receipt_account IS NULL OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=receipt_account AND owner_id=uid AND NOT archived AND kind IN ('savings','current','cash','wallet')) THEN RAISE EXCEPTION 'Choose a cash or bank account'; END IF;
 INSERT INTO public.expenses(employee_id,title,merchant,category,scope,member_id,amount,original_amount,currency,fx_rate,fx_date,expense_date,payment_method,txn_type,account_id,description)
 VALUES(uid,left('Reimbursement: '||e.title,200),nullif(e.reimbursement->>'payer',''),e.category,e.scope,e.member_id,receipt_amount,receipt_amount,'INR',1,receipt_date,receipt_date,'bank_transfer','reimbursement',receipt_account,COALESCE(receipt_note,'')) RETURNING id INTO tid;
 info:=e.reimbursement||jsonb_build_object('receipts',COALESCE(e.reimbursement->'receipts','[]'::jsonb)||jsonb_build_array(jsonb_build_object('id',tid,'txnId',tid,'date',receipt_date,'amount',receipt_amount,'note',COALESCE(receipt_note,''))));
 UPDATE public.expenses SET reimbursement=info,reimbursement_status=CASE WHEN got+receipt_amount>=claim THEN 'received' ELSE 'pending' END WHERE id=e.id;
 RETURN jsonb_build_object('id',tid,'amount',receipt_amount);
END $$;
REVOKE ALL ON FUNCTION public.receive_claim_receipt(uuid,numeric,date,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.receive_claim_receipt(uuid,numeric,date,uuid,text) TO authenticated;
DO $outer$
DECLARE definition text; start_at integer; end_at integer;
BEGIN
 SELECT pg_get_functiondef('public.finance_operation(text,jsonb)'::regprocedure) INTO definition;
 start_at:=strpos(definition,' IF action=''reimbursement'' THEN');
 end_at:=strpos(definition,' ELSIF action=''commitment'' THEN');
 IF start_at=0 OR end_at<=start_at THEN RAISE EXCEPTION 'Finance workflow branch not found'; END IF;
 definition:=substring(definition FROM 1 FOR start_at-1)||$branch$
 IF action='claim_receipt' THEN
  result:=public.receive_claim_receipt((payload->>'id')::uuid,(payload->>'amount')::numeric,on_date,(payload->>'accountId')::uuid,payload->>'note');
 ELSIF action='reimbursement' THEN
  SELECT array_agg(DISTINCT x::uuid) INTO ids FROM jsonb_array_elements_text(payload->'ids') x;
  IF COALESCE(array_length(ids,1),0)=0 THEN RAISE EXCEPTION 'Select pending expenses'; END IF;
  total:=0; result:='{"receipts":[]}'::jsonb;
  FOR e IN SELECT * FROM public.expenses WHERE id=ANY(ids) AND employee_id=uid ORDER BY id FOR UPDATE LOOP
   IF e.txn_type<>'expense' OR e.reimbursement_status<>'pending' THEN RAISE EXCEPTION 'An expense is no longer pending'; END IF;
   SELECT least(e.amount,COALESCE((e.reimbursement->>'reimbursable')::numeric,e.amount))-COALESCE(sum((r->>'amount')::numeric),0) INTO outstanding FROM jsonb_array_elements(COALESCE(e.reimbursement->'receipts','[]'::jsonb)) r;
   prior:=public.receive_claim_receipt(e.id,round(outstanding,2),on_date,(payload->>'accountId')::uuid,'Remaining claim received');
   total:=total+outstanding;
   result:=jsonb_set(result,'{receipts}',(result->'receipts')||jsonb_build_array(prior));
  END LOOP;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF (SELECT count(*) FROM public.expenses WHERE id=ANY(ids) AND employee_id=uid)<>array_length(ids,1) THEN RAISE EXCEPTION 'Claim not found'; END IF;
  result:=result||jsonb_build_object('amount',total);
 ELSIF action='confirm_irregular' THEN
  IF nullif(trim(payload->>'candidateKey'),'') IS NULL OR nullif(trim(payload->>'name'),'') IS NULL THEN RAISE EXCEPTION 'Choose a bill'; END IF;
  total:=(payload->>'amount')::numeric; next_date:=(payload->>'nextDue')::date;
  IF total IS NULL OR total<=0 OR total::text IN ('NaN','Infinity','-Infinity') OR total>100000000 OR next_date IS NULL OR payload->>'frequency' NOT IN ('yearly','half_yearly') THEN RAISE EXCEPTION 'Enter a valid amount, due date and frequency'; END IF;
  INSERT INTO public.commitments(owner_id,name,kind,direction,amount,frequency,next_due,category,confirmed,essential,status)
  VALUES(uid,trim(payload->>'name'),COALESCE(payload->>'kind','other'),'out',total,payload->>'frequency',next_date,payload->>'category',true,true,'active') RETURNING id INTO tid;
  INSERT INTO public.finance_preferences(owner_id,data) VALUES(uid,jsonb_build_object('irregularConfirmed',jsonb_build_array(payload->>'candidateKey')))
  ON CONFLICT(owner_id) DO UPDATE SET data=jsonb_set(finance_preferences.data,'{irregularConfirmed}',COALESCE(finance_preferences.data->'irregularConfirmed','[]'::jsonb)||jsonb_build_array(payload->>'candidateKey')),updated_at=now();
  result:=jsonb_build_object('id',tid,'amount',total);
$branch$||substring(definition FROM end_at);
 EXECUTE definition;
END $outer$;
CREATE OR REPLACE FUNCTION public.validate_category_allocations() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE line jsonb; total numeric:=0; value numeric;
BEGIN
 IF jsonb_typeof(NEW.allocations) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Category splits must be a list'; END IF;
 IF jsonb_array_length(NEW.allocations)=0 THEN RETURN NEW; END IF;
 IF NEW.txn_type<>'expense' OR jsonb_array_length(NEW.allocations)<2 THEN RAISE EXCEPTION 'An expense split needs at least two lines'; END IF;
 FOR line IN SELECT * FROM jsonb_array_elements(NEW.allocations) LOOP
  value:=(line->>'amount')::numeric;
  IF nullif(trim(line->>'category'),'') IS NULL OR value IS NULL OR value<=0 OR value::text IN ('NaN','Infinity','-Infinity') OR value<>round(value,2) THEN RAISE EXCEPTION 'Each split needs a category and a positive amount in cents'; END IF;
  IF nullif(line->>'memberId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.family_members WHERE id::text=line->>'memberId' AND owner_id=NEW.employee_id) THEN RAISE EXCEPTION 'Invalid split person'; END IF;
  total:=total+value;
 END LOOP;
 IF total<>NEW.amount THEN RAISE EXCEPTION 'Category splits must equal the transaction amount'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_category_allocations BEFORE INSERT OR UPDATE OF allocations,amount,txn_type ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.validate_category_allocations();