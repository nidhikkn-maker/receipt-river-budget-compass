-- ============================================================================================
-- P1_security_containment.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores the exact 0088 definitions of every object P1 changed. Changes NO rows.
-- Function bodies below are copied verbatim from drizzle/migrations 0000, 0058, 0066 and 0078 so
-- pg_get_functiondef / pg_policies match the pre-P1 snapshot (verified in
-- src/lib/security-proposed-sql.test.ts). If P2 is installed, run P2 rollback FIRST.
-- WARNING: rollback re-opens H-1, H-3, M-1, M-2 and L-3. Use only on KK instruction.
-- ============================================================================================
BEGIN;
DO $pre$
BEGIN
  IF to_regclass('public.access_grants') IS NOT NULL THEN
    RAISE EXCEPTION 'Roll back P2 (P2_v31_role_model.rollback.sql) before rolling back P1';
  END IF;
END $pre$;

-- Section 2 (H-3) guards
DROP TRIGGER IF EXISTS zz_guard_shared_document_edit ON public.documents;
DROP TRIGGER IF EXISTS zz_guard_shared_expense_edit ON public.expenses;
DROP FUNCTION IF EXISTS public.guard_shared_document_edit();
DROP FUNCTION IF EXISTS public.guard_shared_expense_edit();

-- Section 3 (M-1/M-2) storage boundary; re-create the 0078 upload policy verbatim
DROP POLICY IF EXISTS "DocuRepo originals require current document access" ON storage.objects;
DROP POLICY IF EXISTS "Entity editors read own pending uploads" ON storage.objects;
DROP POLICY IF EXISTS "Entity editors clean unlinked company uploads" ON storage.objects;
DROP INDEX IF EXISTS public.documents_file_path_idx;
DROP POLICY IF EXISTS "Entity editors upload document files" ON storage.objects;
CREATE POLICY "Entity editors upload document files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND split_part(name, '/', 1) <> auth.uid()::text AND EXISTS (
    SELECT 1 FROM public.entity_members m
    WHERE m.owner_id = split_part(name, '/', 1)::uuid AND m.member_id = auth.uid() AND m.revoked_at IS NULL AND m.can_write));
DROP FUNCTION IF EXISTS public.is_own_unlinked_company_upload(text);
DROP FUNCTION IF EXISTS public.is_unlinked_company_file(text);
DROP FUNCTION IF EXISTS public.can_upload_company_file(text);

-- Section 1 (H-1) policies first (they reference the 3-argument overload), from 0066 lines 65-79, 93-99 and 0017
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
DROP POLICY IF EXISTS "Read team receipts" ON storage.objects;
CREATE POLICY "Read team receipts" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_expense(split_part(name, '/', 1)::uuid, 'view_receipts'));

ALTER POLICY "Finance updates budgets" ON public.department_budgets USING (public.can_do('edit_budgets')) WITH CHECK (public.can_do('edit_budgets') AND amount >= 0);
ALTER POLICY "Finance inserts budgets" ON public.department_budgets WITH CHECK (public.can_do('edit_budgets'));
ALTER POLICY "Anyone signed in can view budgets" ON public.department_budgets USING (department = public.my_department() OR public.has_role(auth.uid(), 'finance'::public.app_role));

DROP FUNCTION IF EXISTS public.can_read_team_receipt(text);
DROP FUNCTION IF EXISTS public.can_access_expense(uuid, text, text);
CREATE OR REPLACE FUNCTION public.can_access_expense(_employee uuid, _action text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _employee IS DISTINCT FROM auth.uid() AND EXISTS (
    SELECT 1 FROM public.user_roles r JOIN public.role_permissions p ON p.role = r.role AND p.action = _action AND p.allowed
    WHERE r.user_id = auth.uid() AND (
      r.role = 'finance'::public.app_role
      OR (r.role = 'manager'::public.app_role AND (SELECT department FROM public.profiles WHERE id = _employee) = (SELECT department FROM public.profiles WHERE id = auth.uid()))
    ))
$$;
CREATE OR REPLACE FUNCTION public.guard_team_expense_edit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR OLD.employee_id = auth.uid() THEN RETURN NEW; END IF;
  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN RAISE EXCEPTION 'A team expense cannot be moved to another person'; END IF;
  IF NEW.category IS DISTINCT FROM OLD.category AND NOT public.can_access_expense(OLD.employee_id, 'change_category') THEN
    RAISE EXCEPTION 'Changing the category of a team expense is switched off';
  END IF;
  RETURN NEW;
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
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.delete_my_finance_data()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 PERFORM set_config('ledgerline.erasing', 'on', true);
 DELETE FROM public.family_requests WHERE owner_id=uid OR requester_id=uid;
 DELETE FROM public.family_invites WHERE owner_id=uid;
 UPDATE public.family_invites SET accepted_by=NULL, accepted_at=NULL, revoked=true WHERE accepted_by=uid;
 DELETE FROM public.documents WHERE owner_id=uid;
 DELETE FROM public.asset_valuations WHERE owner_id=uid;
 DELETE FROM public.loans WHERE owner_id=uid;
 DELETE FROM public.expenses WHERE employee_id=uid;
 DELETE FROM public.commitments WHERE owner_id=uid;
 DELETE FROM public.goals WHERE owner_id=uid;
 DELETE FROM public.category_budgets WHERE owner_id=uid;
 DELETE FROM public.accounts WHERE owner_id=uid;
 DELETE FROM public.family_members WHERE owner_id=uid;
 DELETE FROM public.finance_preferences WHERE owner_id=uid;
 DELETE FROM public.push_subscriptions WHERE owner_id=uid;
 DELETE FROM public.push_reminder_log WHERE owner_id=uid;
 DELETE FROM public.transaction_audit WHERE owner_id=uid;
 DELETE FROM public.finance_operations WHERE owner_id=uid;
 DELETE FROM public.monthly_reviews WHERE owner_id=uid;
 DELETE FROM public.category_batches WHERE owner_id=uid;
 DELETE FROM public.statement_line_imports WHERE owner_id=uid;
 DELETE FROM public.expense_drafts WHERE owner_id=uid;
 DELETE FROM public.report_history WHERE owner_id=uid;
END $function$;

-- Section 5: EXECUTE privileges back to the 0088 state
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role), public.my_department(), public.is_admin(),
  public.can_do(text), public.can_access_expense(uuid, text), public.guard_team_expense_edit() TO PUBLIC, anon;
COMMIT;
