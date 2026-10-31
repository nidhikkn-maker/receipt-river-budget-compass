CREATE TABLE public.statement_line_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  account_key text NOT NULL,
  fingerprint text NOT NULL,
  line_date date NOT NULL,
  batch_id uuid NOT NULL,
  file_label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, account_key, fingerprint)
);
CREATE INDEX statement_line_imports_owner_idx ON public.statement_line_imports (owner_id, account_key, line_date DESC);
GRANT SELECT, INSERT, DELETE ON public.statement_line_imports TO authenticated;
GRANT ALL ON public.statement_line_imports TO service_role;
ALTER TABLE public.statement_line_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own statement imports" ON public.statement_line_imports FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());