-- Credit card and investment details on accounts
ALTER TABLE public.accounts ADD COLUMN issuer text NOT NULL DEFAULT '';
ALTER TABLE public.accounts ADD COLUMN last_four text;
ALTER TABLE public.accounts ADD COLUMN statement_day integer;
ALTER TABLE public.accounts ADD COLUMN interest_rate numeric;
ALTER TABLE public.accounts ADD COLUMN include_in_cash boolean NOT NULL DEFAULT true;
ALTER TABLE public.accounts ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_last_four_format CHECK (last_four IS NULL OR last_four ~ '^[0-9]{4}$');
ALTER TABLE public.accounts ADD CONSTRAINT accounts_statement_day_range CHECK (statement_day IS NULL OR statement_day BETWEEN 1 AND 31);

-- Full loan details, linked ledger account and an instalment log
ALTER TABLE public.loans ADD COLUMN provider text NOT NULL DEFAULT '';
ALTER TABLE public.loans ADD COLUMN loan_type text NOT NULL DEFAULT 'personal';
ALTER TABLE public.loans ADD COLUMN original_principal numeric;
ALTER TABLE public.loans ADD COLUMN start_date date;
ALTER TABLE public.loans ADD COLUMN prepayment_terms text NOT NULL DEFAULT '';
ALTER TABLE public.loans ADD COLUMN foreclosure_pct numeric NOT NULL DEFAULT 0;
ALTER TABLE public.loans ADD COLUMN account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.loans ADD COLUMN source_transaction_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;
ALTER TABLE public.loans ADD COLUMN payments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.loans ADD COLUMN status text NOT NULL DEFAULT 'active';
UPDATE public.loans SET original_principal = principal_outstanding WHERE original_principal IS NULL;
-- Every existing loan becomes its own liability account so balances stay ledger-derived
DO $$
DECLARE r record; aid uuid;
BEGIN
  FOR r IN SELECT id, owner_id, name, principal_outstanding FROM public.loans WHERE account_id IS NULL LOOP
    INSERT INTO public.accounts (owner_id, name, kind, opening_balance) VALUES (r.owner_id, r.name, 'loan', r.principal_outstanding) RETURNING id INTO aid;
    UPDATE public.loans SET account_id = aid WHERE id = r.id;
  END LOOP;
END $$;
COMMENT ON COLUMN public.loans.payments IS 'Instalment log [{date, principal, interest, total}] in INR';

-- Reimbursement tracking
ALTER TABLE public.expenses ADD COLUMN reimbursement_status text NOT NULL DEFAULT 'none';
ALTER TABLE public.expenses ADD CONSTRAINT expenses_reimbursement_status_check CHECK (reimbursement_status IN ('none','pending','received'));

-- Investment and asset valuations (date + source)
CREATE TABLE public.asset_valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  value numeric NOT NULL,
  valued_on date NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX asset_valuations_account_idx ON public.asset_valuations (account_id, valued_on DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_valuations TO authenticated;
GRANT ALL ON public.asset_valuations TO service_role;
ALTER TABLE public.asset_valuations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own valuations" ON public.asset_valuations FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid() AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.owner_id = auth.uid()));

-- Document vault
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  title text NOT NULL,
  doc_type text NOT NULL DEFAULT 'other',
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL DEFAULT '',
  size_bytes integer NOT NULL DEFAULT 0,
  doc_date date,
  amount numeric,
  currency text NOT NULL DEFAULT 'INR',
  merchant text,
  notes text NOT NULL DEFAULT '',
  extracted_text text NOT NULL DEFAULT '',
  transaction_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  loan_id uuid REFERENCES public.loans(id) ON DELETE SET NULL,
  expires_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documents_path_owner CHECK (split_part(file_path, '/', 1) = owner_id::text)
);
CREATE INDEX documents_owner_idx ON public.documents (owner_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own documents" ON public.documents FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (
    owner_id = auth.uid()
    AND (transaction_id IS NULL OR EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = transaction_id AND e.employee_id = auth.uid()))
    AND (account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.owner_id = auth.uid()))
    AND (loan_id IS NULL OR EXISTS (SELECT 1 FROM public.loans l WHERE l.id = loan_id AND l.owner_id = auth.uid()))
  );

-- Audit history for every transaction change (written only by the trigger)
CREATE TABLE public.transaction_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  transaction_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transaction_audit_txn_idx ON public.transaction_audit (transaction_id, created_at DESC);
GRANT SELECT ON public.transaction_audit TO authenticated;
GRANT ALL ON public.transaction_audit TO service_role;
ALTER TABLE public.transaction_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own audit history" ON public.transaction_audit FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.log_transaction_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tracked text[] := ARRAY['title','merchant','category','amount','original_amount','currency','expense_date','txn_type','account_id','to_account_id','payment_method','scope','member_id','splits','tags','description','reimbursement_status','statement_ref'];
  diff jsonb := '{}'::jsonb;
  o jsonb; n jsonb; k text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.transaction_audit (owner_id, transaction_id, action, changes, summary)
    VALUES (NEW.employee_id, NEW.id, 'created', jsonb_build_object('amount', NEW.amount, 'expense_date', NEW.expense_date, 'txn_type', NEW.txn_type), left(NEW.title, 200));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.transaction_audit (owner_id, transaction_id, action, changes, summary)
    VALUES (OLD.employee_id, OLD.id, 'deleted', jsonb_build_object('amount', OLD.amount, 'expense_date', OLD.expense_date, 'txn_type', OLD.txn_type), left(OLD.title, 200));
    RETURN OLD;
  END IF;
  o := to_jsonb(OLD); n := to_jsonb(NEW);
  FOREACH k IN ARRAY tracked LOOP
    IF (o -> k) IS DISTINCT FROM (n -> k) THEN
      diff := diff || jsonb_build_object(k, jsonb_build_object('from', o -> k, 'to', n -> k));
    END IF;
  END LOOP;
  IF (o -> 'receipts') IS DISTINCT FROM (n -> 'receipts') THEN
    diff := diff || jsonb_build_object('receipts', jsonb_build_object('from', jsonb_array_length(coalesce(o -> 'receipts', '[]'::jsonb)), 'to', jsonb_array_length(coalesce(n -> 'receipts', '[]'::jsonb))));
  END IF;
  IF diff <> '{}'::jsonb THEN
    INSERT INTO public.transaction_audit (owner_id, transaction_id, action, changes, summary) VALUES (NEW.employee_id, NEW.id, 'updated', diff, left(NEW.title, 200));
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.log_transaction_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER expenses_audit AFTER INSERT OR UPDATE OR DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.log_transaction_change();

-- Web push subscriptions per device
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz,
  UNIQUE (owner_id, endpoint)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own push subscriptions" ON public.push_subscriptions FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- One reminder per item per day (written by the server dispatcher only)
CREATE TABLE public.push_reminder_log (
  owner_id uuid NOT NULL,
  sent_on date NOT NULL,
  item_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, sent_on, item_key)
);
GRANT ALL ON public.push_reminder_log TO service_role;
ALTER TABLE public.push_reminder_log ENABLE ROW LEVEL SECURITY;

-- Profiles are private to their owner; only the display name is editable
DROP POLICY IF EXISTS "Team members can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users update own name" ON public.profiles;
CREATE POLICY "Own profile: read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Own profile: update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;

-- Secure, complete deletion of the caller's financial records
CREATE OR REPLACE FUNCTION public.delete_my_finance_data()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  DELETE FROM public.documents WHERE owner_id = uid;
  DELETE FROM public.asset_valuations WHERE owner_id = uid;
  DELETE FROM public.loans WHERE owner_id = uid;
  DELETE FROM public.expenses WHERE employee_id = uid;
  DELETE FROM public.commitments WHERE owner_id = uid;
  DELETE FROM public.goals WHERE owner_id = uid;
  DELETE FROM public.category_budgets WHERE owner_id = uid;
  DELETE FROM public.accounts WHERE owner_id = uid;
  DELETE FROM public.family_members WHERE owner_id = uid;
  DELETE FROM public.finance_preferences WHERE owner_id = uid;
  DELETE FROM public.push_subscriptions WHERE owner_id = uid;
  DELETE FROM public.push_reminder_log WHERE owner_id = uid;
  DELETE FROM public.transaction_audit WHERE owner_id = uid;
END $$;
REVOKE ALL ON FUNCTION public.delete_my_finance_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_finance_data() TO authenticated;