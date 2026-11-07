CREATE TABLE public.receipt_problem_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('zoom','pan','double-tap','blurry','stuck','other')),
  note text NOT NULL DEFAULT '',
  receipt_name text NOT NULL DEFAULT '',
  receipt_type text NOT NULL DEFAULT '',
  facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  emailed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX receipt_problem_reports_owner ON public.receipt_problem_reports(owner_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_problem_reports TO authenticated;
GRANT ALL ON public.receipt_problem_reports TO service_role;
ALTER TABLE public.receipt_problem_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own problem reports read" ON public.receipt_problem_reports FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "own problem reports add" ON public.receipt_problem_reports FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "own problem reports mark" ON public.receipt_problem_reports FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "own problem reports delete" ON public.receipt_problem_reports FOR DELETE TO authenticated USING (owner_id = auth.uid());