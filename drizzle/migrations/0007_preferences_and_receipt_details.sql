CREATE TABLE public.finance_preferences (owner_id uuid PRIMARY KEY, data jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_preferences TO authenticated;
GRANT ALL ON public.finance_preferences TO service_role;
ALTER TABLE public.finance_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own finance preferences" ON public.finance_preferences FOR ALL TO authenticated USING (owner_id=auth.uid()) WITH CHECK (owner_id=auth.uid());
ALTER TABLE public.expenses ADD COLUMN receipt_details jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE OR REPLACE FUNCTION public.move_expense_category(source text, target text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$ BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
IF length(trim(target))=0 OR length(target)>60 THEN RAISE EXCEPTION 'Invalid category'; END IF;
UPDATE public.expenses SET category=trim(target) WHERE employee_id=auth.uid() AND category=source;
UPDATE public.commitments SET category=trim(target) WHERE owner_id=auth.uid() AND category=source;
INSERT INTO public.category_budgets(owner_id,category,monthly_amount) SELECT owner_id,trim(target),monthly_amount FROM public.category_budgets WHERE owner_id=auth.uid() AND category=source AND source<>trim(target) ON CONFLICT(owner_id,category) DO UPDATE SET monthly_amount=public.category_budgets.monthly_amount+excluded.monthly_amount;
DELETE FROM public.category_budgets WHERE owner_id=auth.uid() AND category=source AND source<>trim(target);
END; $$;
REVOKE ALL ON FUNCTION public.move_expense_category(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_expense_category(text,text) TO authenticated;