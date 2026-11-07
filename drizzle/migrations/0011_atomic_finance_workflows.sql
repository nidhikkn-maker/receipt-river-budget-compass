CREATE TABLE public.finance_operations (owner_id uuid NOT NULL, operation_key text NOT NULL, result jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,operation_key));
GRANT SELECT, INSERT ON public.finance_operations TO authenticated;
GRANT ALL ON public.finance_operations TO service_role;
ALTER TABLE public.finance_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own finance operations" ON public.finance_operations FOR ALL TO authenticated USING (owner_id=auth.uid()) WITH CHECK (owner_id=auth.uid());

CREATE POLICY "Expense linked records belong to owner" ON public.expenses AS RESTRICTIVE FOR ALL TO authenticated USING (employee_id=auth.uid()) WITH CHECK (
 (account_id IS NULL OR EXISTS(SELECT 1 FROM public.accounts a WHERE a.id=expenses.account_id AND a.owner_id=auth.uid()))
 AND (to_account_id IS NULL OR EXISTS(SELECT 1 FROM public.accounts a WHERE a.id=expenses.to_account_id AND a.owner_id=auth.uid()))
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(splits) s WHERE s->>'memberId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.family_members f WHERE f.id::text=s->>'memberId' AND f.owner_id=auth.uid()))
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(receipts) r WHERE split_part(r->>'path','/',1) IS DISTINCT FROM auth.uid()::text)
);
CREATE POLICY "Commitment account belongs to owner" ON public.commitments AS RESTRICTIVE FOR ALL TO authenticated USING(owner_id=auth.uid()) WITH CHECK(account_id IS NULL OR EXISTS(SELECT 1 FROM public.accounts a WHERE a.id=commitments.account_id AND a.owner_id=auth.uid()));
CREATE POLICY "Loan links belong to owner" ON public.loans AS RESTRICTIVE FOR ALL TO authenticated USING(owner_id=auth.uid()) WITH CHECK((account_id IS NULL OR EXISTS(SELECT 1 FROM public.accounts a WHERE a.id=loans.account_id AND a.owner_id=auth.uid())) AND (source_transaction_id IS NULL OR EXISTS(SELECT 1 FROM public.expenses e WHERE e.id=loans.source_transaction_id AND e.employee_id=auth.uid())));

CREATE OR REPLACE FUNCTION public.finance_operation(action text, payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
 uid uuid:=auth.uid(); key text; prior jsonb; result jsonb; aid uuid; lid uuid; tid uuid; from_id uuid; on_date date;
 c public.commitments%ROWTYPE; l public.loans%ROWTYPE; e public.expenses%ROWTYPE;
 total numeric; principal numeric; interest numeric; outstanding numeric; rate numeric; months integer; fee numeric; next_date date; ids uuid[]; cnt integer; row_count integer; v numeric;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to continue'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 on_date:=COALESCE((payload->>'date')::date,current_date);
 IF on_date>current_date THEN RAISE EXCEPTION 'Payment date cannot be in the future'; END IF;
 IF action='commitment' THEN key:='commitment:'||(payload->>'id')||':'||(payload->>'expectedDue');
 ELSIF action='loan_payment' THEN key:='loan:'||(payload->>'id')||':'||(payload->>'expectedDue');
 ELSIF action='convert_emi' THEN key:='emi:'||(payload->>'id');
 ELSE key:=action||':'||(payload->>'operationId'); END IF;
 IF key IS NULL OR length(key)>250 THEN RAISE EXCEPTION 'Missing operation identifier'; END IF;
 SELECT o.result INTO prior FROM public.finance_operations o WHERE o.owner_id=uid AND o.operation_key=key;
 IF FOUND THEN RETURN prior||jsonb_build_object('replayed',true); END IF;

 IF action='reimbursement' THEN
  SELECT array_agg(DISTINCT x::uuid) INTO ids FROM jsonb_array_elements_text(payload->'ids') x;
  IF COALESCE(array_length(ids,1),0)=0 THEN RAISE EXCEPTION 'Select pending expenses'; END IF;
  PERFORM 1 FROM public.expenses WHERE id=ANY(ids) AND employee_id=uid FOR UPDATE;
  SELECT count(*),sum(amount) INTO cnt,total FROM public.expenses WHERE id=ANY(ids) AND employee_id=uid AND txn_type='expense' AND reimbursement_status='pending';
  IF cnt<>array_length(ids,1) THEN RAISE EXCEPTION 'An expense is no longer pending'; END IF;
  aid:=(payload->>'accountId')::uuid;
  IF aid IS NULL OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=aid AND owner_id=uid AND NOT archived AND kind IN('savings','current','cash','wallet')) THEN RAISE EXCEPTION 'Choose a cash or bank account'; END IF;
  INSERT INTO public.expenses(employee_id,title,category,amount,original_amount,currency,fx_rate,fx_date,expense_date,payment_method,txn_type,account_id,description)
   VALUES(uid,'Reimbursement — '||cnt||' expenses','Reimbursement',total,total,'INR',1,on_date,on_date,'bank_transfer','reimbursement',aid,'Reimbursed entries: '||array_to_string(ids,',')) RETURNING id INTO tid;
  UPDATE public.expenses SET reimbursement_status='received' WHERE id=ANY(ids) AND employee_id=uid;
  result:=jsonb_build_object('id',tid,'amount',total);

 ELSIF action='commitment' THEN
  SELECT * INTO c FROM public.commitments WHERE id=(payload->>'id')::uuid AND owner_id=uid FOR UPDATE;
  IF NOT FOUND OR c.status<>'active' OR c.next_due IS DISTINCT FROM (payload->>'expectedDue')::date THEN RAISE EXCEPTION 'This payment schedule changed — refresh first'; END IF;
  total:=round((payload->>'amount')::numeric,2);
  IF total IS NULL OR total<=0 OR total>100000000 THEN RAISE EXCEPTION 'Enter a positive amount'; END IF;
  aid:=COALESCE((payload->>'accountId')::uuid,c.account_id);
  INSERT INTO public.expenses(employee_id,title,merchant,category,amount,original_amount,currency,fx_rate,fx_date,expense_date,payment_method,txn_type,account_id,description)
   VALUES(uid,c.name,c.name,c.category,total,total,'INR',1,on_date,on_date,'bank_transfer',CASE WHEN c.direction='in' THEN 'income' ELSE 'expense' END,aid,'Scheduled occurrence: '||c.next_due) RETURNING id INTO tid;
  next_date:=CASE c.frequency WHEN 'once' THEN c.next_due WHEN 'daily' THEN c.next_due+1 WHEN 'weekly' THEN c.next_due+7 WHEN 'monthly' THEN (c.next_due+interval '1 month')::date WHEN 'quarterly' THEN (c.next_due+interval '3 months')::date WHEN 'half_yearly' THEN (c.next_due+interval '6 months')::date WHEN 'yearly' THEN (c.next_due+interval '1 year')::date ELSE c.next_due+greatest(1,COALESCE(c.interval_days,30)) END;
  UPDATE public.commitments SET next_due=next_date,status=CASE WHEN c.frequency='once' THEN 'completed' ELSE 'active' END WHERE id=c.id;
  result:=jsonb_build_object('id',tid,'amount',total);

 ELSIF action='loan_payment' THEN
  SELECT * INTO l FROM public.loans WHERE id=(payload->>'id')::uuid AND owner_id=uid FOR UPDATE;
  IF NOT FOUND OR l.status<>'active' OR l.next_due IS DISTINCT FROM (payload->>'expectedDue')::date THEN RAISE EXCEPTION 'Loan changed — refresh before recording payment'; END IF;
  IF l.loan_type='credit_card_emi' THEN outstanding:=l.principal_outstanding;
  ELSE
   SELECT opening_balance INTO outstanding FROM public.accounts WHERE id=l.account_id AND owner_id=uid AND kind IN('loan','other_liability');
   IF NOT FOUND THEN RAISE EXCEPTION 'Missing loan liability account'; END IF;
   SELECT outstanding+COALESCE(sum(CASE WHEN account_id=l.account_id THEN CASE WHEN txn_type IN('expense','transfer') THEN amount WHEN txn_type='adjustment' THEN amount*adjustment_sign ELSE -amount END WHEN txn_type='transfer' AND to_account_id=l.account_id THEN -amount ELSE 0 END),0) INTO outstanding FROM public.expenses WHERE account_id=l.account_id OR to_account_id=l.account_id;
  END IF;
  interest:=COALESCE((payload->>'interest')::numeric,round(outstanding*l.annual_rate/1200,2));
  principal:=COALESCE((payload->>'principal')::numeric,least(outstanding,greatest(0,l.emi-interest)));
  principal:=round(principal,2); interest:=round(interest,2);
  IF principal<0 OR interest<0 OR principal+interest<=0 OR principal>outstanding OR principal+interest>100000000 THEN RAISE EXCEPTION 'Invalid principal or interest payment'; END IF;
  IF l.loan_type<>'credit_card_emi' THEN
   from_id:=(payload->>'fromAccountId')::uuid;
   IF from_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=from_id AND owner_id=uid AND NOT archived AND kind IN('savings','current','cash','wallet')) THEN RAISE EXCEPTION 'Choose the bank or cash account used to pay'; END IF;
   IF principal>0 THEN INSERT INTO public.expenses(employee_id,title,category,amount,original_amount,currency,fx_rate,fx_date,expense_date,payment_method,txn_type,account_id,to_account_id) VALUES(uid,l.name||' — principal','Loan repayment',principal,principal,'INR',1,on_date,on_date,'bank_transfer','transfer',from_id,l.account_id); END IF;
  ELSE from_id:=l.account_id; END IF;
  IF interest>0 THEN INSERT INTO public.expenses(employee_id,title,category,amount,original_amount,currency,fx_rate,fx_date,expense_date,payment_method,txn_type,account_id) VALUES(uid,l.name||' — interest','Financial charges',interest,interest,'INR',1,on_date,on_date,CASE WHEN l.loan_type='credit_card_emi' THEN 'credit_card' ELSE 'bank_transfer' END,'expense',from_id); END IF;
  UPDATE public.loans SET payments=payments||jsonb_build_array(jsonb_build_object('date',on_date,'principal',principal,'interest',interest,'total',principal+interest)),principal_outstanding=greatest(0,outstanding-principal),next_due=(next_due+interval '1 month')::date,status=CASE WHEN outstanding-principal<=0.01 THEN 'closed' ELSE 'active' END WHERE id=l.id;
  result:=jsonb_build_object('id',l.id,'principal',principal,'interest',interest);

 ELSIF action='convert_emi' THEN
  SELECT * INTO e FROM public.expenses WHERE id=(payload->>'id')::uuid AND employee_id=uid FOR UPDATE;
  IF NOT FOUND OR e.txn_type<>'expense' OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=e.account_id AND owner_id=uid AND kind='credit_card') THEN RAISE EXCEPTION 'Select a purchase on your credit card'; END IF;
  IF EXISTS(SELECT 1 FROM public.loans WHERE source_transaction_id=e.id AND loan_type='credit_card_emi') THEN RAISE EXCEPTION 'This purchase is already on EMI'; END IF;
  months:=(payload->>'months')::integer; rate:=(payload->>'rate')::numeric; fee:=round((payload->>'fee')::numeric,2);
  IF months IS NULL OR months<2 OR months>60 OR rate IS NULL OR rate<0 OR rate>60 OR fee IS NULL OR fee<0 OR fee>100000000 THEN RAISE EXCEPTION 'Enter a valid EMI term, rate and fee'; END IF;
  v:=rate/1200;
  total:=round(CASE WHEN v=0 THEN e.amount/months ELSE e.amount*v*power(1+v,months)/(power(1+v,months)-1) END,2);
  next_date:=(on_date+interval '1 month')::date;
  SELECT statement_day INTO cnt FROM public.accounts WHERE id=e.account_id;
  IF cnt IS NOT NULL THEN next_date:=(date_trunc('month',on_date)+interval '1 month')::date+least(cnt,extract(day FROM (date_trunc('month',on_date)+interval '2 months-1 day'))::integer)-1; END IF;
  INSERT INTO public.loans(owner_id,name,provider,loan_type,principal_outstanding,original_principal,annual_rate,emi,next_due,start_date,account_id,source_transaction_id,prepayment_terms) VALUES(uid,e.title||' EMI',COALESCE(e.merchant,''),'credit_card_emi',e.amount,e.amount,rate,total,next_date,on_date,e.account_id,e.id,months||'-month card EMI') RETURNING id INTO lid;
  IF fee>0 THEN INSERT INTO public.expenses(employee_id,title,category,amount,original_amount,currency,fx_rate,fx_date,expense_date,payment_method,txn_type,account_id,scope) VALUES(uid,e.title||' — EMI processing fee','Financial charges',fee,fee,'INR',1,on_date,on_date,'credit_card','expense',e.account_id,e.scope); END IF;
  result:=jsonb_build_object('id',lid,'emi',total);

 ELSIF action='create_loan' THEN
  principal:=round((payload->>'principal')::numeric,2); total:=round((payload->>'emi')::numeric,2); rate:=(payload->>'rate')::numeric;
  IF principal IS NULL OR principal<=0 OR total IS NULL OR total<=0 OR rate IS NULL OR rate<0 OR rate>60 OR nullif(trim(payload->>'name'),'') IS NULL THEN RAISE EXCEPTION 'Enter valid loan details'; END IF;
  IF payload->>'loanType'='credit_card_emi' THEN RAISE EXCEPTION 'Convert a card purchase to EMI instead'; END IF;
  INSERT INTO public.accounts(owner_id,name,kind,opening_balance,issuer,interest_rate) VALUES(uid,trim(payload->>'name'),CASE WHEN payload->>'loanType'='borrowing' THEN 'other_liability' ELSE 'loan' END,principal,COALESCE(payload->>'provider',''),rate) RETURNING id INTO aid;
  INSERT INTO public.loans(owner_id,name,principal_outstanding,annual_rate,emi,next_due,provider,loan_type,original_principal,start_date,prepayment_terms,foreclosure_pct,account_id) VALUES(uid,trim(payload->>'name'),principal,rate,total,(payload->>'nextDue')::date,COALESCE(payload->>'provider',''),COALESCE(payload->>'loanType','personal'),COALESCE((payload->>'original')::numeric,principal),(payload->>'startDate')::date,COALESCE(payload->>'prepaymentTerms',''),COALESCE((payload->>'foreclosurePct')::numeric,0),aid) RETURNING id INTO lid;
  result:=jsonb_build_object('id',lid);
 ELSE RAISE EXCEPTION 'Unknown operation'; END IF;
 INSERT INTO public.finance_operations(owner_id,operation_key,result) VALUES(uid,key,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.finance_operation(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_operation(text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_my_finance_data() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 DELETE FROM public.documents WHERE owner_id=uid;
 DELETE FROM public.asset_valuations WHERE owner_id=uid;
 DELETE FROM public.loans WHERE owner_id=uid;
 DELETE FROM public.expenses WHERE employee_id=uid;
 DELETE FROM public.commitments WHERE owner_id=uid;
 DELETE FROM public.goals WHERE owner_id=uid;
 DELETE FROM public.category_budgets WHERE owner_id=uid;
 DELETE FROM public.accounts WHERE owner_id=uid;
 DELETE FROM public.family_members WHERE owner_id=uid;
 DELETE FROM public.finance_preferences WHERE owner_id=uid;
 DELETE FROM public.push_subscriptions WHERE owner_id=uid;
 DELETE FROM public.push_reminder_log WHERE owner_id=uid;
 DELETE FROM public.transaction_audit WHERE owner_id=uid;
 DELETE FROM public.finance_operations WHERE owner_id=uid;
END $$;
REVOKE ALL ON FUNCTION public.delete_my_finance_data() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_my_finance_data() TO authenticated;