// Dedicated atomic ledger corrections. This same SQL is executed in isolated PostgreSQL regression tests.
export const financialCorrectionsSql = `
ALTER TABLE public.expenses ADD COLUMN correction_revision bigint NOT NULL DEFAULT 0;
CREATE FUNCTION public.bump_correction_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.correction_revision:=OLD.correction_revision+1; RETURN NEW; END $$;
CREATE TRIGGER correction_revision_before_update BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.bump_correction_revision();
CREATE TABLE public.financial_corrections (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES public.finance_preferences(owner_id) ON DELETE CASCADE,
 request jsonb NOT NULL, entries jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), undone_at timestamptz
);
GRANT SELECT ON public.financial_corrections TO authenticated;
GRANT ALL ON public.financial_corrections TO service_role;
ALTER TABLE public.financial_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads financial corrections" ON public.financial_corrections FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE FUNCTION public.correct_financial_entries(_id uuid,_items jsonb,_choice jsonb,_accounts jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); item jsonb; existing public.financial_corrections; e public.expenses; a public.accounts; dest public.accounts;
 next_type text; source_id uuid; dest_id uuid; p numeric; i numeric; snapshots jsonb:='[]'; result_row jsonb; request_data jsonb; changed boolean:=false;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF _id IS NULL OR jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items) NOT BETWEEN 1 AND 500 OR jsonb_typeof(_choice) IS DISTINCT FROM 'object' OR jsonb_typeof(_accounts) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid correction selection'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(_choice) k WHERE k NOT IN ('txnType','accountId','toAccountId','principal','interest')) THEN RAISE EXCEPTION 'Unsupported financial change'; END IF;
 IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(_items) x)<>jsonb_array_length(_items) THEN RAISE EXCEPTION 'Duplicate selection'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 request_data:=jsonb_build_object('items',_items,'choice',_choice,'accounts',_accounts);
 SELECT * INTO existing FROM public.financial_corrections WHERE id=_id FOR UPDATE;
 IF FOUND THEN
  IF existing.owner_id<>uid OR existing.request<>request_data THEN RAISE EXCEPTION 'Correction identifier already used'; END IF;
  IF existing.undone_at IS NOT NULL THEN RAISE EXCEPTION 'Correction was already restored'; END IF;
  RETURN _id;
 END IF;
 PERFORM 1 FROM public.accounts WHERE owner_id=uid ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.expenses WHERE employee_id=uid ORDER BY id FOR UPDATE;
 FOR item IN SELECT value FROM jsonb_array_elements(_accounts) LOOP
  SELECT * INTO a FROM public.accounts WHERE id=(item->>'id')::uuid AND owner_id=uid;
  IF NOT FOUND OR jsonb_build_object('id',a.id,'name',a.name,'kind',a.kind,'archived',a.archived)<>item THEN RAISE EXCEPTION 'Account changed; review the latest preview'; END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
  SELECT * INTO e FROM public.expenses WHERE id=(item->>'id')::uuid AND employee_id=uid;
  IF NOT FOUND OR e.correction_revision IS DISTINCT FROM (item->>'revision')::bigint THEN RAISE EXCEPTION 'Transaction changed; review the latest preview'; END IF;
  next_type:=COALESCE(_choice->>'txnType',e.txn_type);
  IF next_type NOT IN ('expense','income','refund','transfer','card_payment','loan_repayment','investment') OR e.txn_type NOT IN ('expense','income','refund','transfer','card_payment','loan_repayment','investment') THEN RAISE EXCEPTION 'Claims, adjustments and advances require dedicated review'; END IF;
  source_id:=COALESCE((_choice->>'accountId')::uuid,e.account_id);
  dest_id:=CASE WHEN next_type IN ('transfer','card_payment','loan_repayment','investment') THEN COALESCE((_choice->>'toAccountId')::uuid,e.to_account_id) ELSE NULL END;
  SELECT * INTO a FROM public.accounts WHERE id=source_id AND owner_id=uid AND NOT archived;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_accounts) x WHERE x->>'id'=source_id::text) THEN RAISE EXCEPTION 'Confirm an active source account'; END IF;
  IF e.account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_accounts) x WHERE x->>'id'=e.account_id::text) THEN RAISE EXCEPTION 'Original account preview missing'; END IF;
  IF e.to_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_accounts) x WHERE x->>'id'=e.to_account_id::text) THEN RAISE EXCEPTION 'Original receiving account preview missing'; END IF;
  IF next_type IN ('transfer','card_payment','loan_repayment','investment') THEN
   SELECT * INTO dest FROM public.accounts WHERE id=dest_id AND owner_id=uid AND NOT archived;
   IF NOT FOUND OR dest_id=source_id OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_accounts) x WHERE x->>'id'=dest_id::text) THEN RAISE EXCEPTION 'Confirm two different active accounts'; END IF;
   IF (next_type='card_payment' AND dest.kind<>'credit_card') OR (next_type='loan_repayment' AND dest.kind NOT IN ('loan','other_liability')) OR (next_type='investment' AND dest.kind NOT IN ('investment','fixed_deposit','other_asset')) THEN RAISE EXCEPTION 'Receiving account does not match transaction type'; END IF;
  END IF;
  IF e.payment_instrument_id IS NOT NULL AND source_id IS DISTINCT FROM e.account_id THEN RAISE EXCEPTION 'Review linked payment method individually'; END IF;
  IF EXISTS(SELECT 1 FROM public.loans l WHERE l.owner_id=uid AND l.source_transaction_id=e.id) OR e.description LIKE 'Scheduled occurrence:%' OR e.description LIKE 'Reimbursed entries:%' THEN RAISE EXCEPTION 'Linked financial workflow requires individual review'; END IF;
  IF next_type<>e.txn_type THEN
   IF e.reimbursement_status<>'none' OR COALESCE(e.reimbursement,'{}'::jsonb)<>'{}'::jsonb OR jsonb_array_length(e.allocations)>0 OR jsonb_array_length(e.workspace_allocations)>0 OR jsonb_array_length(e.splits)>0 OR e.trip_id IS NOT NULL OR EXISTS(SELECT 1 FROM unnest(e.tags) tag WHERE tag LIKE 'Trip:%') THEN RAISE EXCEPTION 'Linked claims, trips and splits require individual review'; END IF;
   IF next_type IN ('transfer','card_payment','loan_repayment','investment') AND EXISTS(SELECT 1 FROM public.expenses t WHERE t.employee_id=uid AND t.id<>e.id AND t.account_id=dest_id AND t.currency=e.currency AND abs(COALESCE(t.original_amount,t.amount)-COALESCE(e.original_amount,e.amount))<0.005 AND abs(t.expense_date-e.expense_date)<=2 AND t.txn_type IN ('income','refund','reimbursement','advance')) THEN RAISE EXCEPTION 'Possible receiving-side entry exists; review pair individually'; END IF;
  END IF;
  p:=CASE WHEN next_type='loan_repayment' THEN COALESCE((_choice->>'principal')::numeric,e.principal) ELSE NULL END;
  i:=CASE WHEN next_type='loan_repayment' THEN COALESCE((_choice->>'interest')::numeric,e.interest) ELSE NULL END;
  IF next_type='loan_repayment' AND (p IS NULL OR i IS NULL OR p<0 OR i<0 OR p::text IN ('NaN','Infinity','-Infinity') OR i::text IN ('NaN','Infinity','-Infinity') OR round(p+i,2)<>round(COALESCE(e.original_amount,e.amount),2)) THEN RAISE EXCEPTION 'Confirm original-currency principal and interest'; END IF;
  IF (e.txn_type,e.account_id,e.to_account_id,e.principal,e.interest) IS DISTINCT FROM (next_type,source_id,dest_id,p,i) THEN changed:=true; END IF;
  UPDATE public.expenses SET txn_type=next_type,account_id=source_id,to_account_id=dest_id,principal=p,interest=i,reconciled_at=NULL,reconciled_by=NULL WHERE id=e.id AND employee_id=uid RETURNING to_jsonb(expenses) INTO result_row;
  snapshots:=snapshots||jsonb_build_array(jsonb_build_object('before',to_jsonb(e),'after',result_row));
 END LOOP;
 IF NOT changed THEN RAISE EXCEPTION 'No financial changes selected'; END IF;
 INSERT INTO public.financial_corrections(id,owner_id,request,entries) VALUES(_id,uid,request_data,snapshots);
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.correct_financial_entries(uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.correct_financial_entries(uuid,jsonb,jsonb,jsonb) TO authenticated;
CREATE FUNCTION public.undo_financial_correction(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); batch public.financial_corrections; item jsonb; e public.expenses; old public.expenses;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 SELECT * INTO batch FROM public.financial_corrections WHERE id=_id AND owner_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Correction unavailable'; END IF;
 IF batch.undone_at IS NOT NULL THEN RETURN; END IF;
 PERFORM 1 FROM public.accounts WHERE owner_id=uid ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.expenses WHERE employee_id=uid ORDER BY id FOR UPDATE;
 FOR item IN SELECT value FROM jsonb_array_elements(batch.entries) LOOP
  SELECT * INTO e FROM public.expenses WHERE id=(item->'after'->>'id')::uuid AND employee_id=uid;
  IF NOT FOUND OR e.correction_revision<>(item->'after'->>'correction_revision')::bigint THEN RAISE EXCEPTION 'Later edit prevents restoration'; END IF;
  old:=jsonb_populate_record(NULL::public.expenses,item->'before');
  IF EXISTS(SELECT 1 FROM public.accounts WHERE owner_id=uid AND id IN (old.account_id,old.to_account_id) AND archived) THEN RAISE EXCEPTION 'Original account is archived; review individually'; END IF;
  UPDATE public.expenses SET txn_type=old.txn_type,account_id=old.account_id,to_account_id=old.to_account_id,principal=old.principal,interest=old.interest,reconciled_at=old.reconciled_at,reconciled_by=old.reconciled_by WHERE id=e.id AND employee_id=uid;
 END LOOP;
 UPDATE public.financial_corrections SET undone_at=now() WHERE id=_id AND owner_id=uid;
END $$;
REVOKE ALL ON FUNCTION public.undo_financial_correction(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.undo_financial_correction(uuid) TO authenticated;
`;