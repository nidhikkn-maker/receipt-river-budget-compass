ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS allocations jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS reimbursement jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.expenses.allocations IS 'Category split lines [{category,amount,tags,memberId,note}]; sum must equal amount; reports use these instead of category';
COMMENT ON COLUMN public.expenses.reimbursement IS 'Reimbursement tracking details: stage, payer, purpose, dates, receipts, remarks';

CREATE TABLE public.monthly_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  month text NOT NULL,
  figures jsonb NOT NULL,
  data_hash text NOT NULL,
  narrative text NOT NULL DEFAULT '',
  data_cutoff timestamptz NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monthly_reviews_month_check CHECK (month ~ '^\d{4}-\d{2}$')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_reviews TO authenticated;
GRANT ALL ON public.monthly_reviews TO service_role;
ALTER TABLE public.monthly_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read reviews" ON public.monthly_reviews FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owners add reviews" ON public.monthly_reviews FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners update reviews" ON public.monthly_reviews FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners delete reviews" ON public.monthly_reviews FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE INDEX monthly_reviews_owner_month ON public.monthly_reviews(owner_id, month, generated_at DESC);