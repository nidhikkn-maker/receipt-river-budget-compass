ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS transfer_counterpart_of uuid;
COMMENT ON COLUMN public.expenses.transfer_counterpart_of IS 'Receiving-side statement evidence of an internal transfer; excluded from balances/cashflow so the movement counts once.';

CREATE TABLE public.transfer_links (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  debit_id uuid NOT NULL,
  credit_id uuid,
  source_account uuid NOT NULL,
  dest_account uuid NOT NULL,
  source_amount numeric NOT NULL,
  dest_amount numeric,
  source_currency text NOT NULL,
  dest_currency text,
  status text NOT NULL DEFAULT 'awaiting_destination',
  before jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz
);
GRANT SELECT ON public.transfer_links TO authenticated;
GRANT ALL ON public.transfer_links TO service_role;
ALTER TABLE public.transfer_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their transfer links" ON public.transfer_links FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE UNIQUE INDEX transfer_links_active_debit ON public.transfer_links(debit_id) WHERE cancelled_at IS NULL;
CREATE UNIQUE INDEX transfer_links_active_credit ON public.transfer_links(credit_id) WHERE cancelled_at IS NULL AND credit_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.confirm_transfer(_id uuid, _debit uuid, _debit_rev bigint, _dest uuid, _credit uuid, _credit_rev bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); d public.expenses; c public.expenses; src public.accounts; dst public.accounts; link public.transfer_links;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  SELECT * INTO link FROM public.transfer_links WHERE id = _id;
  IF FOUND THEN
    IF link.owner_id <> uid OR link.debit_id <> _debit THEN RAISE EXCEPTION 'Transfer identifier already used'; END IF;
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
    IF c.txn_type NOT IN ('income', 'refund', 'transfer') OR c.transfer_counterpart_of IS NOT NULL THEN RAISE EXCEPTION 'Receiving entry is not an unlinked incoming entry'; END IF;
    IF EXISTS (SELECT 1 FROM public.transfer_links WHERE cancelled_at IS NULL AND (debit_id = _credit OR credit_id = _credit)) THEN RAISE EXCEPTION 'Receiving entry is already linked to a transfer'; END IF;
    IF abs(c.expense_date - d.expense_date) > 5 THEN RAISE EXCEPTION 'Entries are more than five days apart'; END IF;
    IF c.currency = d.currency AND abs(COALESCE(c.original_amount, c.amount) - COALESCE(d.original_amount, d.amount)) > 0.005 THEN RAISE EXCEPTION 'Amounts differ; review fees or partial transfers individually'; END IF;
  END IF;

  IF link.id IS NULL THEN
    INSERT INTO public.transfer_links (id, owner_id, debit_id, credit_id, source_account, dest_account, source_amount, dest_amount, source_currency, dest_currency, status, before)
    VALUES (_id, uid, d.id, c.id, src.id, dst.id, COALESCE(d.original_amount, d.amount), COALESCE(c.original_amount, c.amount), d.currency, c.currency,
      CASE WHEN c.id IS NULL THEN 'awaiting_destination' ELSE 'matched' END,
      jsonb_build_object('debit', jsonb_build_object('txn_type', d.txn_type, 'to_account_id', d.to_account_id), 'credit', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id', c.id) END));
    UPDATE public.expenses SET txn_type = 'transfer', to_account_id = _dest, reconciled_at = CASE WHEN d.txn_type = 'transfer' THEN reconciled_at ELSE NULL END WHERE id = d.id;
  ELSE
    UPDATE public.transfer_links SET credit_id = c.id, dest_amount = COALESCE(c.original_amount, c.amount), dest_currency = c.currency, status = 'matched', updated_at = now(),
      before = before || jsonb_build_object('credit', jsonb_build_object('id', c.id)) WHERE id = _id;
  END IF;
  IF c.id IS NOT NULL THEN UPDATE public.expenses SET transfer_counterpart_of = d.id WHERE id = c.id; END IF;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_transfer(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); link public.transfer_links; d public.expenses;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  SELECT * INTO link FROM public.transfer_links WHERE id = _id AND owner_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF link.cancelled_at IS NOT NULL THEN RETURN; END IF;
  SELECT * INTO d FROM public.expenses WHERE id = link.debit_id AND employee_id = uid FOR UPDATE;
  IF FOUND THEN
    IF d.txn_type <> 'transfer' OR d.to_account_id IS DISTINCT FROM link.dest_account THEN RAISE EXCEPTION 'Source entry was edited later; restore it individually'; END IF;
    UPDATE public.expenses SET txn_type = COALESCE(link.before->'debit'->>'txn_type', 'transfer'), to_account_id = NULLIF(link.before->'debit'->>'to_account_id', '')::uuid WHERE id = d.id;
  END IF;
  IF link.credit_id IS NOT NULL THEN UPDATE public.expenses SET transfer_counterpart_of = NULL WHERE id = link.credit_id AND employee_id = uid AND transfer_counterpart_of = link.debit_id; END IF;
  UPDATE public.transfer_links SET cancelled_at = now(), status = 'cancelled', updated_at = now() WHERE id = _id;
END $$;

REVOKE ALL ON FUNCTION public.confirm_transfer(uuid, uuid, bigint, uuid, uuid, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_transfer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_transfer(uuid, uuid, bigint, uuid, uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_transfer(uuid) TO authenticated;