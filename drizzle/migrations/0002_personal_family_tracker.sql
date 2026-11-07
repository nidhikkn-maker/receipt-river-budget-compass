CREATE TABLE public.family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  relation text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_members TO authenticated;
GRANT ALL ON public.family_members TO service_role;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own family members" ON public.family_members FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.category_budgets (
  owner_id uuid NOT NULL,
  category text NOT NULL,
  monthly_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (monthly_amount >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, category)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_budgets TO authenticated;
GRANT ALL ON public.category_budgets TO service_role;
ALTER TABLE public.category_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own budgets" ON public.category_budgets FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

ALTER TABLE public.expenses
  ADD COLUMN scope text NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal','business')),
  ADD COLUMN member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.expenses ALTER COLUMN status SET DEFAULT 'recorded';
ALTER TABLE public.expenses ALTER COLUMN department DROP NOT NULL;
COMMENT ON COLUMN public.expenses.status IS 'DEPRECATED: approval workflow removed';
COMMENT ON COLUMN public.expenses.department IS 'DEPRECATED: approval workflow removed';
COMMENT ON TABLE public.department_budgets IS 'DEPRECATED: replaced by category_budgets';
COMMENT ON TABLE public.expense_history IS 'DEPRECATED: approval workflow removed';
COMMENT ON TABLE public.user_roles IS 'DEPRECATED: roles removed (personal tracker)';

GRANT UPDATE, DELETE ON public.expenses TO authenticated;
DROP POLICY IF EXISTS "View own, department (manager), or all (finance)" ON public.expenses;
DROP POLICY IF EXISTS "Employees submit their own" ON public.expenses;
CREATE POLICY "Own expenses: read" ON public.expenses FOR SELECT TO authenticated USING (employee_id = auth.uid());
CREATE POLICY "Own expenses: add" ON public.expenses FOR INSERT TO authenticated WITH CHECK (
  employee_id = auth.uid()
  AND (member_id IS NULL OR EXISTS (SELECT 1 FROM public.family_members f WHERE f.id = member_id AND f.owner_id = auth.uid()))
);
CREATE POLICY "Own expenses: edit" ON public.expenses FOR UPDATE TO authenticated USING (employee_id = auth.uid()) WITH CHECK (
  employee_id = auth.uid()
  AND (member_id IS NULL OR EXISTS (SELECT 1 FROM public.family_members f WHERE f.id = member_id AND f.owner_id = auth.uid()))
);
CREATE POLICY "Own expenses: delete" ON public.expenses FOR DELETE TO authenticated USING (employee_id = auth.uid());

DROP TRIGGER IF EXISTS expense_submitted ON public.expenses;
REVOKE EXECUTE ON FUNCTION public.review_expense(uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_expense(uuid, text) FROM authenticated;

DROP POLICY IF EXISTS "Read receipts you may review" ON storage.objects;
CREATE POLICY "Read own receipts" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Delete own receipts" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);