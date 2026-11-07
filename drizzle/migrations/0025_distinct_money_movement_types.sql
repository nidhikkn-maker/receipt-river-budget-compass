CREATE OR REPLACE FUNCTION public.validate_finance_links() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='expenses' THEN
  IF jsonb_typeof(NEW.splits)<>'array' OR jsonb_typeof(NEW.receipts)<>'array' THEN RAISE EXCEPTION 'Shares and receipts must be lists'; END IF;
  IF NEW.txn_type NOT IN ('expense','income','transfer','refund','reimbursement','adjustment','card_payment','loan_repayment','investment','advance','advance_settlement') THEN RAISE EXCEPTION 'Unknown entry type'; END IF;
  IF NEW.txn_type IN ('transfer','card_payment','loan_repayment','investment') AND (NEW.account_id IS NULL OR NEW.to_account_id IS NULL OR NEW.account_id=NEW.to_account_id) THEN RAISE EXCEPTION 'Select two different accounts'; END IF;
  IF NEW.txn_type IN ('card_payment','loan_repayment','investment') AND NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=NEW.to_account_id AND kind = ANY(CASE NEW.txn_type WHEN 'card_payment' THEN ARRAY['credit_card'] WHEN 'loan_repayment' THEN ARRAY['loan','other_liability'] ELSE ARRAY['investment','fixed_deposit','other_asset'] END)) THEN RAISE EXCEPTION 'Destination account type does not match this entry type'; END IF;
  IF NEW.amount<=0 OR NEW.amount>100000000 OR NEW.amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF NEW.account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=NEW.account_id AND owner_id=NEW.employee_id) THEN RAISE EXCEPTION 'Invalid account'; END IF;
  IF NEW.to_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=NEW.to_account_id AND owner_id=NEW.employee_id) THEN RAISE EXCEPTION 'Invalid destination account'; END IF;
 ELSIF TG_TABLE_NAME='loans' THEN
  IF NEW.loan_type NOT IN ('home','vehicle','personal','education','gold','business','credit_card_emi','borrowing','other') OR NEW.annual_rate<0 OR NEW.annual_rate>60 OR NEW.foreclosure_pct<0 OR NEW.foreclosure_pct>20 OR NEW.emi<=0 THEN RAISE EXCEPTION 'Invalid loan terms'; END IF;
 END IF;
 RETURN NEW;
END $$;