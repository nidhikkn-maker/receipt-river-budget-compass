-- Owner-scoped transfer approval safeguards; no existing financial rows are changed by installing these functions.
CREATE OR REPLACE FUNCTION public.confirm_transfer(_id uuid, _debit uuid, _debit_rev bigint, _dest uuid, _credit uuid, _credit_rev bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); d public.expenses; c public.expenses; src public.accounts; dst public.accounts; link public.transfer_links;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF _id IS NULL OR _debit IS NULL OR _dest IS NULL THEN RAISE EXCEPTION 'Transfer identifiers required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  SELECT * INTO link FROM public.transfer_links WHERE id = _id;
  IF FOUND THEN
    IF link.owner_id <> uid OR link.debit_id <> _debit OR link.dest_account <> _dest THEN RAISE EXCEPTION 'Transfer identifier already used'; END IF;
    IF link.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'This transfer was cancelled; prepare a new one'; END IF;
    IF link.credit_id IS NOT DISTINCT FROM _credit OR _credit IS NULL THEN RETURN _id; END IF;
    IF link.credit_id IS NOT NULL THEN RAISE EXCEPTION 'Transfer already has a receiving entry'; END IF;
  END IF;

  SELECT * INTO d FROM public.expenses WHERE id = _debit AND employee_id = uid FOR UPDATE;
  IF NOT FOUND OR d.correction_revision IS DISTINCT FROM _debit_rev THEN RAISE EXCEPTION 'Source entry changed; prepare a new preview'; END IF;
  IF d.transfer_counterpart_of IS NOT NULL THEN RAISE EXCEPTION 'Source entry is already the receiving side of another transfer'; END IF;
  SELECT * INTO src FROM public.accounts WHERE id = d.account_id AND owner_id = uid AND NOT archived;
  SELECT * INTO dst FROM public.accounts WHERE id = _dest AND owner_id = uid AND NOT archived;
  IF src.id IS NULL OR dst.id IS NULL OR src.id = dst.id THEN RAISE EXCEPTION 'Choose two different active accounts you own'; END IF;
  IF src.kind NOT IN ('savings','current','cash','wallet') OR dst.kind NOT IN ('savings','current','cash','wallet') THEN RAISE EXCEPTION 'Card payments, loans and investments require their dedicated review'; END IF;
  IF d.amount IS NULL OR d.amount<=0 OR d.amount::text IN ('NaN','Infinity','-Infinity') OR COALESCE(d.original_amount,d.amount)<=0 OR COALESCE(d.original_amount,d.amount)::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid source amount'; END IF;
  IF jsonb_array_length(d.splits)>0 OR jsonb_array_length(d.allocations)>0 OR jsonb_array_length(d.workspace_allocations)>0 OR d.reimbursement_status IS DISTINCT FROM 'none' OR COALESCE(d.reimbursement,'{}')<>'{}'::jsonb OR d.trip_id IS NOT NULL OR EXISTS(SELECT 1 FROM unnest(d.tags) tag WHERE tag LIKE 'Trip:%') OR EXISTS(SELECT 1 FROM public.loans WHERE owner_id=uid AND source_transaction_id=d.id) OR d.description LIKE 'Scheduled occurrence:%' OR d.description LIKE 'Reimbursed entries:%' THEN RAISE EXCEPTION 'Source has linked financial details; review individually'; END IF;
  IF link.id IS NOT NULL AND (link.before->'afterDebit' IS NULL OR to_jsonb(d) IS DISTINCT FROM link.before->'afterDebit') THEN RAISE EXCEPTION 'Source entry changed since linking; prepare an individual review'; END IF;

  IF link.id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.transfer_links WHERE cancelled_at IS NULL AND (debit_id = _debit OR credit_id = _debit)) THEN RAISE EXCEPTION 'Source entry is already linked to a transfer'; END IF;
    IF d.txn_type NOT IN ('expense', 'transfer') THEN RAISE EXCEPTION 'Only outgoing expense or transfer entries can start a transfer'; END IF;
    IF d.txn_type = 'transfer' AND d.to_account_id IS DISTINCT FROM _dest AND d.to_account_id IS NOT NULL THEN RAISE EXCEPTION 'Entry already moves money to a different account'; END IF;
    IF jsonb_array_length(d.splits) > 0 OR jsonb_array_length(d.allocations) > 0 OR jsonb_array_length(d.workspace_allocations) > 0 OR d.reimbursement_status <> 'none' OR d.trip_id IS NOT NULL THEN RAISE EXCEPTION 'Claims, trips and split entries need individual review first'; END IF;
  ELSIF link.dest_account <> _dest THEN RAISE EXCEPTION 'Receiving account differs from the saved transfer';
  END IF;

  IF _credit IS NOT NULL THEN
    SELECT * INTO c FROM public.expenses WHERE id = _credit AND employee_id = uid FOR UPDATE;
    IF NOT FOUND OR c.correction_revision IS DISTINCT FROM _credit_rev THEN RAISE EXCEPTION 'Receiving entry changed; prepare a new preview'; END IF;
    IF c.id = d.id OR c.account_id IS DISTINCT FROM _dest THEN RAISE EXCEPTION 'Receiving entry must be on the destination account'; END IF;
    IF c.txn_type NOT IN ('income', 'refund') OR c.transfer_counterpart_of IS NOT NULL THEN RAISE EXCEPTION 'Receiving entry is not an unlinked incoming entry'; END IF;
    IF EXISTS (SELECT 1 FROM public.transfer_links WHERE cancelled_at IS NULL AND (debit_id = _credit OR credit_id = _credit)) THEN RAISE EXCEPTION 'Receiving entry is already linked to a transfer'; END IF;
    IF c.expense_date IS DISTINCT FROM d.expense_date THEN RAISE EXCEPTION 'Different posting dates require individual review'; END IF;
    IF jsonb_array_length(c.splits)>0 OR jsonb_array_length(c.allocations)>0 OR jsonb_array_length(c.workspace_allocations)>0 OR c.reimbursement_status IS DISTINCT FROM 'none' OR COALESCE(c.reimbursement,'{}')<>'{}'::jsonb OR c.trip_id IS NOT NULL OR EXISTS(SELECT 1 FROM unnest(c.tags) tag WHERE tag LIKE 'Trip:%') OR EXISTS(SELECT 1 FROM public.loans WHERE owner_id=uid AND source_transaction_id=c.id) OR c.description LIKE 'Scheduled occurrence:%' OR c.description LIKE 'Reimbursed entries:%' THEN RAISE EXCEPTION 'Receiving entry has linked financial details'; END IF;
    IF c.amount IS NULL OR c.amount<=0 OR c.amount::text IN ('NaN','Infinity','-Infinity') OR COALESCE(c.original_amount,c.amount)<=0 OR COALESCE(c.original_amount,c.amount)::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid receiving amount'; END IF;
    IF c.currency IS DISTINCT FROM d.currency OR abs(c.amount-d.amount)>=0.005 THEN RAISE EXCEPTION 'Independent currency values differ'; END IF;
    IF c.currency = d.currency AND abs(COALESCE(c.original_amount, c.amount) - COALESCE(d.original_amount, d.amount)) >= 0.005 THEN RAISE EXCEPTION 'Amounts differ; review fees or partial transfers individually'; END IF;
  END IF;

  IF link.id IS NULL THEN
    INSERT INTO public.transfer_links (id, owner_id, debit_id, credit_id, source_account, dest_account, source_amount, dest_amount, source_currency, dest_currency, status, before)
    VALUES (_id, uid, d.id, c.id, src.id, dst.id, COALESCE(d.original_amount, d.amount), COALESCE(c.original_amount, c.amount), d.currency, c.currency,
      CASE WHEN c.id IS NULL THEN 'awaiting_destination' ELSE 'matched' END,
      jsonb_build_object('debit', to_jsonb(d), 'credit', CASE WHEN c.id IS NULL THEN NULL ELSE to_jsonb(c) END));
    UPDATE public.expenses SET txn_type = 'transfer', to_account_id = _dest, reconciled_at = CASE WHEN d.txn_type = 'transfer' THEN reconciled_at ELSE NULL END WHERE id = d.id;
  ELSE
    UPDATE public.transfer_links SET credit_id = c.id, dest_amount = COALESCE(c.original_amount, c.amount), dest_currency = c.currency, status = 'matched', updated_at = now(),
      before = before || jsonb_build_object('credit', to_jsonb(c)) WHERE id = _id;
  END IF;
  IF c.id IS NOT NULL THEN UPDATE public.expenses SET transfer_counterpart_of = d.id WHERE id = c.id; END IF;
  UPDATE public.transfer_links SET before=before||jsonb_build_object('afterDebit',(SELECT to_jsonb(e) FROM public.expenses e WHERE e.id=d.id),'afterCredit',CASE WHEN c.id IS NULL THEN NULL ELSE (SELECT to_jsonb(e) FROM public.expenses e WHERE e.id=c.id) END) WHERE id=_id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_transfer(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); link public.transfer_links; d public.expenses; c public.expenses;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  SELECT * INTO link FROM public.transfer_links WHERE id = _id AND owner_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF link.cancelled_at IS NOT NULL THEN RETURN; END IF;
  SELECT * INTO d FROM public.expenses WHERE id = link.debit_id AND employee_id = uid FOR UPDATE;
  IF NOT FOUND OR link.before->'afterDebit' IS NULL OR to_jsonb(d) IS DISTINCT FROM link.before->'afterDebit' THEN RAISE EXCEPTION 'Source entry was edited later or is unavailable; restore it individually'; END IF;
  IF link.credit_id IS NOT NULL THEN
    SELECT * INTO c FROM public.expenses WHERE id=link.credit_id AND employee_id=uid FOR UPDATE;
    IF NOT FOUND OR link.before->'afterCredit' IS NULL OR to_jsonb(c) IS DISTINCT FROM link.before->'afterCredit' THEN RAISE EXCEPTION 'Receiving entry was edited later'; END IF;
  END IF;
  UPDATE public.expenses SET txn_type = COALESCE(link.before->'debit'->>'txn_type', 'transfer'), to_account_id = NULLIF(link.before->'debit'->>'to_account_id', '')::uuid, reconciled_at=NULLIF(link.before->'debit'->>'reconciled_at','')::timestamptz WHERE id = d.id;
  IF link.credit_id IS NOT NULL THEN UPDATE public.expenses SET transfer_counterpart_of = NULL WHERE id = link.credit_id AND employee_id = uid AND transfer_counterpart_of = link.debit_id; END IF;
  UPDATE public.transfer_links SET cancelled_at = now(), status = 'cancelled', updated_at = now() WHERE id = _id;
END $$;

REVOKE ALL ON FUNCTION public.confirm_transfer(uuid, uuid, bigint, uuid, uuid, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_transfer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_transfer(uuid, uuid, bigint, uuid, uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_transfer(uuid) TO authenticated;