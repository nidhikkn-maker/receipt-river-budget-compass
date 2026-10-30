CREATE TYPE public.app_role AS ENUM ('employee','manager','finance');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT 'Engineering',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE OR REPLACE FUNCTION public.my_department()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT department FROM public.profiles WHERE id = auth.uid()
$$;

CREATE POLICY "Team members can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own name" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid() AND department = public.my_department());
CREATE POLICY "Team members can view roles" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _dept text := coalesce(NEW.raw_user_meta_data->>'department', 'Engineering');
  _role text := coalesce(NEW.raw_user_meta_data->>'role', 'employee');
BEGIN
  IF _dept NOT IN ('Engineering','Sales','Marketing','Operations') THEN _dept := 'Engineering'; END IF;
  IF _role NOT IN ('employee','manager','finance') THEN _role := 'employee'; END IF;
  INSERT INTO public.profiles (id, full_name, department)
  VALUES (NEW.id, coalesce(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), _dept);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role::public.app_role);
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.department_budgets (
  department text PRIMARY KEY,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.department_budgets TO authenticated;
GRANT ALL ON public.department_budgets TO service_role;
ALTER TABLE public.department_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can view budgets" ON public.department_budgets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Finance inserts budgets" ON public.department_budgets FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'finance'));
CREATE POLICY "Finance updates budgets" ON public.department_budgets FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'finance')) WITH CHECK (public.has_role(auth.uid(),'finance') AND amount >= 0);
INSERT INTO public.department_budgets (department, amount) VALUES ('Engineering',25000),('Sales',18000),('Marketing',15000),('Operations',8000);

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  department text NOT NULL,
  title text NOT NULL,
  merchant text,
  category text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  expense_date date NOT NULL,
  description text NOT NULL DEFAULT '',
  receipts jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending_manager',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View own, department (manager), or all (finance)" ON public.expenses FOR SELECT TO authenticated USING (
  employee_id = auth.uid()
  OR (public.has_role(auth.uid(),'manager') AND department = public.my_department())
  OR public.has_role(auth.uid(),'finance')
);
CREATE POLICY "Employees submit their own" ON public.expenses FOR INSERT TO authenticated WITH CHECK (
  employee_id = auth.uid() AND department = public.my_department() AND status = 'pending_manager'
  AND jsonb_array_length(receipts) > 0
);

CREATE TABLE public.expense_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.expense_history TO authenticated;
GRANT ALL ON public.expense_history TO service_role;
ALTER TABLE public.expense_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "History visible with the expense" ON public.expense_history FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id)
);

CREATE OR REPLACE FUNCTION public.log_expense_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.expense_history (expense_id, actor_id, action) VALUES (NEW.id, NEW.employee_id, 'submitted');
  RETURN NEW;
END $$;
CREATE TRIGGER expense_submitted AFTER INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.log_expense_submitted();

-- Workflow transitions: the only way to change status
CREATE OR REPLACE FUNCTION public.review_expense(_expense_id uuid, _decision text, _note text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.expenses; uid uuid := auth.uid(); new_status text; act text;
BEGIN
  SELECT * INTO e FROM public.expenses WHERE id = _expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;
  IF e.employee_id = uid THEN RAISE EXCEPTION 'You cannot review your own expense'; END IF;
  IF _decision = 'reimburse' THEN
    IF NOT public.has_role(uid,'finance') OR e.status <> 'approved' THEN RAISE EXCEPTION 'Only Finance can pay approved expenses'; END IF;
    new_status := 'reimbursed'; act := 'reimbursed';
  ELSIF e.status = 'pending_manager' THEN
    IF NOT (public.has_role(uid,'manager') AND e.department = public.my_department()) THEN RAISE EXCEPTION 'Only this department''s manager can review'; END IF;
    IF _decision = 'approve' THEN new_status := 'pending_finance'; act := 'manager_approved';
    ELSIF _decision = 'reject' THEN new_status := 'rejected'; act := 'rejected';
    ELSE RAISE EXCEPTION 'Invalid decision'; END IF;
  ELSIF e.status = 'pending_finance' THEN
    IF NOT public.has_role(uid,'finance') THEN RAISE EXCEPTION 'Only Finance can sign off'; END IF;
    IF _decision = 'approve' THEN new_status := 'approved'; act := 'finance_approved';
    ELSIF _decision = 'reject' THEN new_status := 'rejected'; act := 'rejected';
    ELSE RAISE EXCEPTION 'Invalid decision'; END IF;
  ELSE
    RAISE EXCEPTION 'This expense is not awaiting review';
  END IF;
  IF act = 'rejected' AND coalesce(trim(_note),'') = '' THEN RAISE EXCEPTION 'A reason is required to reject'; END IF;
  UPDATE public.expenses SET status = new_status WHERE id = _expense_id;
  INSERT INTO public.expense_history (expense_id, actor_id, action, note) VALUES (_expense_id, uid, act, nullif(trim(_note),''));
  RETURN new_status;
END $$;
REVOKE EXECUTE ON FUNCTION public.review_expense(uuid, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.review_expense(uuid, text, text) TO authenticated;

-- Receipt files: stored under <owner uid>/...
CREATE POLICY "Upload own receipts" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Read receipts you may review" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(),'finance')
    OR (public.has_role(auth.uid(),'manager') AND EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id::text = (storage.foldername(name))[1] AND p.department = public.my_department()))
  ));