ALTER TABLE public.accounts ADD COLUMN credit_limit numeric;
ALTER TABLE public.accounts ADD COLUMN due_day integer;
ALTER TABLE public.accounts ADD COLUMN min_balance numeric NOT NULL DEFAULT 0;

CREATE TABLE public.commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'bill',
  direction text NOT NULL DEFAULT 'out',
  amount numeric NOT NULL,
  frequency text NOT NULL DEFAULT 'monthly',
  interval_days integer,
  next_due date NOT NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'Bills & Utilities',
  confirmed boolean NOT NULL DEFAULT true,
  essential boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commitments TO authenticated;
GRANT ALL ON public.commitments TO service_role;
ALTER TABLE public.commitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own commitments" ON public.commitments FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  principal_outstanding numeric NOT NULL,
  annual_rate numeric NOT NULL,
  emi numeric NOT NULL,
  next_due date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loans TO authenticated;
GRANT ALL ON public.loans TO service_role;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own loans" ON public.loans FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  target numeric NOT NULL,
  saved numeric NOT NULL DEFAULT 0,
  monthly numeric NOT NULL DEFAULT 0,
  reserve boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
GRANT ALL ON public.goals TO service_role;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own goals" ON public.goals FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());