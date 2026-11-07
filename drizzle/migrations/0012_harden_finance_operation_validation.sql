CREATE OR REPLACE FUNCTION public.validate_finance_links() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='expenses' THEN
  IF jsonb_typeof(NEW.splits)<>'array' OR jsonb_typeof(NEW.receipts)<>'array' THEN RAISE EXCEPTION 'Shares and receipts must be lists'; END IF;
  IF NEW.txn_type='transfer' AND (NEW.account_id IS NULL OR NEW.to_account_id IS NULL OR NEW.account_id=NEW.to_account_id) THEN RAISE EXCEPTION 'Select two different accounts'; END IF;
  IF NEW.amount<=0 OR NEW.amount>100000000 OR NEW.amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF NEW.account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=NEW.account_id AND owner_id=NEW.employee_id) THEN RAISE EXCEPTION 'Invalid account'; END IF;
  IF NEW.to_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=NEW.to_account_id AND owner_id=NEW.employee_id) THEN RAISE EXCEPTION 'Invalid destination account'; END IF;
 ELSIF TG_TABLE_NAME='loans' THEN
  IF NEW.loan_type NOT IN ('home','vehicle','personal','education','gold','business','credit_card_emi','borrowing','other') OR NEW.annual_rate<0 OR NEW.annual_rate>60 OR NEW.foreclosure_pct<0 OR NEW.foreclosure_pct>20 OR NEW.emi<=0 THEN RAISE EXCEPTION 'Invalid loan terms'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_finance_expense BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.validate_finance_links();
CREATE TRIGGER validate_finance_loan BEFORE INSERT OR UPDATE ON public.loans FOR EACH ROW EXECUTE FUNCTION public.validate_finance_links();
CREATE POLICY "Operations only recorded by finance workflow" ON public.finance_operations AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(current_setting('app.finance_owner',true)=auth.uid()::text);
DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.finance_operation(text,jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));', 'PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0)); PERFORM set_config(''app.finance_owner'',uid::text,true);');
 definition:=replace(definition,'IF key IS NULL OR length(key)>250', 'IF key IS NULL OR length(key)>250 OR (action NOT IN (''commitment'',''loan_payment'',''convert_emi'') AND nullif(trim(payload->>''operationId''),'''') IS NULL)');
 definition:=replace(definition,'aid:=COALESCE((payload->>''accountId'')::uuid,c.account_id);', 'aid:=COALESCE((payload->>''accountId'')::uuid,c.account_id); IF aid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=aid AND owner_id=uid AND NOT archived AND kind IN(''savings'',''current'',''cash'',''wallet'',''credit_card'')) THEN RAISE EXCEPTION ''Choose an active payment account''; END IF;');
 definition:=replace(definition,'WHERE account_id=l.account_id OR to_account_id=l.account_id;', 'WHERE employee_id=uid AND (account_id=l.account_id OR to_account_id=l.account_id);');
 definition:=replace(definition,'IF l.loan_type=''credit_card_emi'' THEN outstanding:=l.principal_outstanding;', 'IF l.account_id IS NULL THEN RAISE EXCEPTION ''Missing loan account''; END IF; IF l.loan_type=''credit_card_emi'' THEN outstanding:=l.principal_outstanding;');
 EXECUTE definition;
END $$;