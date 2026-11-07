CREATE TABLE public.demat_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  broker text NOT NULL DEFAULT '',
  dp_id text NOT NULL DEFAULT '',
  client_id text NOT NULL DEFAULT '',
  holder text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, dp_id, client_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demat_accounts TO authenticated;
GRANT ALL ON public.demat_accounts TO service_role;
ALTER TABLE public.demat_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage demat accounts" ON public.demat_accounts FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.security_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  demat_id uuid NOT NULL REFERENCES public.demat_accounts(id) ON DELETE CASCADE,
  isin text NOT NULL,
  name text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 0,
  as_of date,
  statement_value numeric,
  lots jsonb NOT NULL DEFAULT '[]'::jsonb,
  gains jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, demat_id, isin)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_holdings TO authenticated;
GRANT ALL ON public.security_holdings TO service_role;
ALTER TABLE public.security_holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage holdings" ON public.security_holdings FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid() AND EXISTS (SELECT 1 FROM public.demat_accounts d WHERE d.id = demat_id AND d.owner_id = auth.uid()));