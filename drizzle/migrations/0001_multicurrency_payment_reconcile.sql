ALTER TABLE public.expenses
  ADD COLUMN currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN original_amount numeric(14,2),
  ADD COLUMN fx_rate numeric(18,8) NOT NULL DEFAULT 1,
  ADD COLUMN fx_date date,
  ADD COLUMN payment_method text NOT NULL DEFAULT 'other',
  ADD COLUMN reconciled_at timestamptz,
  ADD COLUMN reconciled_by uuid,
  ADD COLUMN statement_ref text;

CREATE OR REPLACE FUNCTION public.reconcile_expense(_expense_id uuid, _statement_ref text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'finance') THEN RAISE EXCEPTION 'Only Finance can reconcile'; END IF;
  UPDATE public.expenses
     SET reconciled_at = CASE WHEN _statement_ref IS NULL THEN NULL ELSE now() END,
         reconciled_by = CASE WHEN _statement_ref IS NULL THEN NULL ELSE auth.uid() END,
         statement_ref = left(_statement_ref, 300)
   WHERE id = _expense_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.reconcile_expense(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.reconcile_expense(uuid, text) TO authenticated;