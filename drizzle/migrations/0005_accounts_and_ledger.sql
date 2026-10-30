CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'savings',
  opening_balance numeric NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own accounts" ON public.accounts FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

ALTER TABLE public.expenses ADD COLUMN txn_type text NOT NULL DEFAULT 'expense';
ALTER TABLE public.expenses ADD COLUMN account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN to_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN tags text[] NOT NULL DEFAULT '{}';