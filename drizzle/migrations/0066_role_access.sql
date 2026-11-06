CREATE TABLE IF NOT EXISTS public.app_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_admins TO authenticated;
GRANT ALL ON public.app_admins TO service_role;
ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read own admin row" ON public.app_admins;
CREATE POLICY "Admins read own admin row" ON public.app_admins FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role public.app_role NOT NULL,
  action text NOT NULL CHECK (action IN ('view_expenses','edit_expenses','delete_expenses','change_category','approve','view_receipts','view_company_tax','edit_budgets')),
  allowed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (role, action)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in users read role switches" ON public.role_permissions;
CREATE POLICY "Signed-in users read role switches" ON public.role_permissions FOR SELECT TO authenticated USING (true);

INSERT INTO public.role_permissions(role, action, allowed) VALUES
  ('manager','view_expenses',true),('manager','edit_expenses',false),('manager','delete_expenses',false),('manager','change_category',false),
  ('manager','approve',false),('manager','view_receipts',true),('manager','view_company_tax',false),('manager','edit_budgets',false),
  ('finance','view_expenses',true),('finance','edit_expenses',false),('finance','delete_expenses',false),('finance','change_category',false),
  ('finance','approve',false),('finance','view_receipts',true),('finance','view_company_tax',true),('finance','edit_budgets',true),
  ('employee','view_expenses',false),('employee','edit_expenses',false),('employee','delete_expenses',false),('employee','change_category',false),
  ('employee','approve',false),('employee','view_receipts',false),('employee','view_company_tax',false),('employee','edit_budgets',false)
ON CONFLICT (role, action) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.role_permission_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  change text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.role_permission_audit TO authenticated;
GRANT ALL ON public.role_permission_audit TO service_role;
ALTER TABLE public.role_permission_audit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid())
$$;
DROP POLICY IF EXISTS "Admins read access history" ON public.role_permission_audit;
CREATE POLICY "Admins read access history" ON public.role_permission_audit FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.can_do(_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r JOIN public.role_permissions p ON p.role = r.role
    WHERE r.user_id = auth.uid() AND p.action = _action AND p.allowed)
$$;

CREATE OR REPLACE FUNCTION public.can_access_expense(_employee uuid, _action text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _employee IS DISTINCT FROM auth.uid() AND EXISTS (
    SELECT 1 FROM public.user_roles r JOIN public.role_permissions p ON p.role = r.role AND p.action = _action AND p.allowed
    WHERE r.user_id = auth.uid() AND (
      r.role = 'finance'::public.app_role
      OR (r.role = 'manager'::public.app_role AND (SELECT department FROM public.profiles WHERE id = _employee) = (SELECT department FROM public.profiles WHERE id = auth.uid()))
    ))
$$;

ALTER POLICY "Expense linked records belong to owner" ON public.expenses
  USING (employee_id = auth.uid() OR public.can_access_expense(employee_id, 'view_expenses'))
  WITH CHECK (((account_id IS NULL) OR (EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = expenses.account_id AND a.owner_id = expenses.employee_id)))
    AND ((to_account_id IS NULL) OR (EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = expenses.to_account_id AND a.owner_id = expenses.employee_id)))
    AND (NOT (EXISTS (SELECT 1 FROM jsonb_array_elements(expenses.splits) s(value)
      WHERE (s.value ->> 'memberId') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.family_members f WHERE f.id::text = (s.value ->> 'memberId') AND f.owner_id = expenses.employee_id))))
    AND (NOT (EXISTS (SELECT 1 FROM jsonb_array_elements(expenses.receipts) r(value)
      WHERE split_part((r.value ->> 'path'), '/', 1) IS DISTINCT FROM expenses.employee_id::text))));
DROP POLICY IF EXISTS "Team expenses: read" ON public.expenses;
CREATE POLICY "Team expenses: read" ON public.expenses FOR SELECT TO authenticated USING (public.can_access_expense(employee_id, 'view_expenses'));
DROP POLICY IF EXISTS "Team expenses: edit" ON public.expenses;
CREATE POLICY "Team expenses: edit" ON public.expenses FOR UPDATE TO authenticated
  USING (public.can_access_expense(employee_id, 'edit_expenses')) WITH CHECK (public.can_access_expense(employee_id, 'edit_expenses'));
DROP POLICY IF EXISTS "Team expenses: delete" ON public.expenses;
CREATE POLICY "Team expenses: delete" ON public.expenses FOR DELETE TO authenticated USING (public.can_access_expense(employee_id, 'delete_expenses'));

CREATE OR REPLACE FUNCTION public.guard_team_expense_edit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR OLD.employee_id = auth.uid() THEN RETURN NEW; END IF;
  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN RAISE EXCEPTION 'A team expense cannot be moved to another person'; END IF;
  IF NEW.category IS DISTINCT FROM OLD.category AND NOT public.can_access_expense(OLD.employee_id, 'change_category') THEN
    RAISE EXCEPTION 'Changing the category of a team expense is switched off';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_team_expense_edit ON public.expenses;
CREATE TRIGGER guard_team_expense_edit BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.guard_team_expense_edit();

DROP POLICY IF EXISTS "Read team receipts" ON storage.objects;
CREATE POLICY "Read team receipts" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_expense(split_part(name, '/', 1)::uuid, 'view_receipts'));

ALTER POLICY "Finance updates budgets" ON public.department_budgets USING (public.can_do('edit_budgets')) WITH CHECK (public.can_do('edit_budgets') AND amount >= 0);
ALTER POLICY "Finance inserts budgets" ON public.department_budgets WITH CHECK (public.can_do('edit_budgets'));

CREATE OR REPLACE FUNCTION public.admin_team() RETURNS TABLE(user_id uuid, full_name text, email text, department text, role text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only an admin can view team access'; END IF;
  RETURN QUERY SELECT p.id, p.full_name, u.email::text, p.department, (SELECT r.role::text FROM public.user_roles r WHERE r.user_id = p.id LIMIT 1)
    FROM public.profiles p JOIN auth.users u ON u.id = p.id
    WHERE NOT EXISTS (SELECT 1 FROM public.demo_sessions d WHERE d.owner_id = p.id)
    ORDER BY p.full_name;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_member(_user uuid, _role text, _department text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only an admin can change roles'; END IF;
  IF _role IS NOT NULL AND _role NOT IN ('employee','manager','finance') THEN RAISE EXCEPTION 'Unknown role'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _user;
  IF _role IS NOT NULL THEN INSERT INTO public.user_roles(user_id, role) VALUES (_user, _role::public.app_role); END IF;
  IF _department IS NOT NULL AND length(trim(_department)) > 0 THEN UPDATE public.profiles SET department = left(trim(_department), 80) WHERE id = _user; END IF;
  INSERT INTO public.role_permission_audit(actor_id, change, details) VALUES (auth.uid(), 'member', jsonb_build_object('user', _user, 'role', _role, 'department', _department));
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_permission(_role text, _action text, _allowed boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only an admin can change access switches'; END IF;
  UPDATE public.role_permissions SET allowed = _allowed, updated_at = now(), updated_by = auth.uid() WHERE role = _role::public.app_role AND action = _action;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown switch'; END IF;
  INSERT INTO public.role_permission_audit(actor_id, change, details) VALUES (auth.uid(), 'switch', jsonb_build_object('role', _role, 'action', _action, 'allowed', _allowed));
END $$;

CREATE OR REPLACE FUNCTION public.team_company_tax() RETURNS TABLE(owner_id uuid, owner_name text, entities jsonb, profiles jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles r JOIN public.role_permissions p ON p.role = r.role AND p.action = 'view_company_tax' AND p.allowed
      WHERE r.user_id = auth.uid() AND r.role = 'finance'::public.app_role) THEN
    RAISE EXCEPTION 'Company tax view is not permitted for your role';
  END IF;
  RETURN QUERY SELECT f.owner_id, pr.full_name,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e->>'id', 'name', e->>'name', 'kind', e->>'kind')) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(f.data->'entities') = 'array' THEN f.data->'entities' ELSE '[]'::jsonb END) e
      WHERE COALESCE(e->>'kind', '') <> 'individual'), '[]'::jsonb),
    CASE WHEN jsonb_typeof(f.data->'books'->'entityTaxProfiles') = 'array' THEN f.data->'books'->'entityTaxProfiles' ELSE '[]'::jsonb END
  FROM public.finance_preferences f JOIN public.profiles pr ON pr.id = f.owner_id
  WHERE f.owner_id <> auth.uid() AND NOT EXISTS (SELECT 1 FROM public.demo_sessions d WHERE d.owner_id = f.owner_id);
END $$;

REVOKE ALL ON FUNCTION public.admin_team(), public.admin_set_member(uuid, text, text), public.admin_set_permission(text, text, boolean), public.team_company_tax() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_team(), public.admin_set_member(uuid, text, text), public.admin_set_permission(text, text, boolean), public.team_company_tax(), public.is_admin(), public.can_do(text), public.can_access_expense(uuid, text) TO authenticated;