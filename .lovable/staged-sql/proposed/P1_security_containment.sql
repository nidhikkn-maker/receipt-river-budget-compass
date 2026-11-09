-- ============================================================================================
-- P1_security_containment.sql (PROPOSED ONLY: NOT APPLIED to Lovable Cloud, Live or any hosted DB)
-- Prepared 2026-11-09 for KK review. See docs/plans/SECURITY_MIGRATION_PLAN_2026-11-09.md.
-- Precondition: drizzle/migrations 0000-0088 applied; staged company-bound-uploads.sql and
-- document-storage-boundary.sql NOT applied (this file supersedes both; never apply them after it).
-- Rollback: P1_security_containment.rollback.sql restores the exact 0088 definitions.
-- Data: changes NO rows. Only functions, policies, triggers, one index and EXECUTE grants change.
--
--  1. H-1 / H-2 / L-3 / L-4  legacy team roles (user_roles + role_permissions) no longer reach another
--     owner's rows, files or company tax data unless that owner granted the caller an active
--     entity_members grant for the row's company. Rows with no entity_id are never team-reachable.
--     Function names and signatures are kept; one 3-argument overload is added.
--  2. H-3   BEFORE UPDATE guards keyed on OLD stop owner/employee/company/file re-pointing.
--  3. M-1 / M-2  company editors write only <owner>/companies/<hex entity>/<file> for granted
--     companies; documents can reference only the editor's own unlinked upload in that namespace.
--  4. Erasure coverage: delete_my_finance_data clears the owner-linked tables added after 0058.
-- Object order below is explicit and dependency-ordered; nothing depends on alphabetical file order.
-- ============================================================================================
BEGIN;

-- 0. Preflight: refuse to run on an unexpected schema.
DO $pre$
BEGIN
  IF to_regprocedure('public.can_access_entity(uuid,text,boolean)') IS NULL
     OR to_regclass('public.entity_members') IS NULL
     OR to_regprocedure('public.can_access_expense(uuid,text)') IS NULL
     OR to_regprocedure('public.team_company_tax()') IS NULL
     OR to_regclass('public.preference_approvals') IS NULL THEN
    RAISE EXCEPTION 'P1 requires migrations 0000-0088';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'guard_company_document_path' AND tgrelid = 'public.documents'::regclass) THEN
    RAISE EXCEPTION 'Staged company-bound-uploads.sql is installed; roll it back before applying P1';
  END IF;
END $pre$;

-- --------------------------------------------------------------------------------------------
-- 1. H-1: team roles require an explicit, active, company-scoped owner grant
-- --------------------------------------------------------------------------------------------

-- Row-level check (new overload). True only when ALL hold:
--   caller signed in and not the owner; the row belongs to a company (entity_id NOT NULL);
--   caller holds finance/manager AND the role switch allows _action;
--   the owner granted the caller this exact company (active entity_members row), with can_write
--   for any non-view action. profiles.department is no longer consulted.
CREATE OR REPLACE FUNCTION public.can_access_expense(_employee uuid, _action text, _entity text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL
    AND _employee IS NOT NULL AND _employee <> auth.uid()
    AND _entity IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.user_roles r
                JOIN public.role_permissions p ON p.role = r.role AND p.action = _action AND p.allowed
                WHERE r.user_id = auth.uid() AND r.role IN ('finance'::public.app_role, 'manager'::public.app_role))
    AND EXISTS (SELECT 1 FROM public.entity_members m
                WHERE m.owner_id = _employee AND m.entity_id = _entity AND m.member_id = auth.uid()
                  AND m.revoked_at IS NULL
                  AND (m.can_write OR _action IN ('view_expenses', 'view_receipts', 'view_company_tax')))
$$;

-- Person-level check (existing signature, kept for team_names and any caller). It no longer
-- matches by department: true only if the person granted the caller at least one active company
-- grant (write grant for non-view actions) and the caller's role switch allows _action.
-- No row policy uses this overload after P1, so it cannot expose a row by itself.
CREATE OR REPLACE FUNCTION public.can_access_expense(_employee uuid, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL
    AND _employee IS NOT NULL AND _employee <> auth.uid()
    AND EXISTS (SELECT 1 FROM public.user_roles r
                JOIN public.role_permissions p ON p.role = r.role AND p.action = _action AND p.allowed
                WHERE r.user_id = auth.uid() AND r.role IN ('finance'::public.app_role, 'manager'::public.app_role))
    AND EXISTS (SELECT 1 FROM public.entity_members m
                WHERE m.owner_id = _employee AND m.member_id = auth.uid() AND m.revoked_at IS NULL
                  AND (m.can_write OR _action IN ('view_expenses', 'view_receipts', 'view_company_tax')))
$$;

ALTER POLICY "Expense linked records belong to owner" ON public.expenses
  USING (employee_id = auth.uid() OR public.can_access_expense(employee_id, 'view_expenses', entity_id));
DROP POLICY IF EXISTS "Team expenses: read" ON public.expenses;
CREATE POLICY "Team expenses: read" ON public.expenses FOR SELECT TO authenticated
  USING (public.can_access_expense(employee_id, 'view_expenses', entity_id));
DROP POLICY IF EXISTS "Team expenses: edit" ON public.expenses;
CREATE POLICY "Team expenses: edit" ON public.expenses FOR UPDATE TO authenticated
  USING (public.can_access_expense(employee_id, 'edit_expenses', entity_id))
  WITH CHECK (public.can_access_expense(employee_id, 'edit_expenses', entity_id));
DROP POLICY IF EXISTS "Team expenses: delete" ON public.expenses;
CREATE POLICY "Team expenses: delete" ON public.expenses FOR DELETE TO authenticated
  USING (public.can_access_expense(employee_id, 'delete_expenses', entity_id));

-- Same name and behaviour as 0066, but the category switch is now checked against the row's company.
CREATE OR REPLACE FUNCTION public.guard_team_expense_edit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR OLD.employee_id = auth.uid() THEN RETURN NEW; END IF;
  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN RAISE EXCEPTION 'A team expense cannot be moved to another person'; END IF;
  IF NEW.category IS DISTINCT FROM OLD.category AND NOT public.can_access_expense(OLD.employee_id, 'change_category', OLD.entity_id) THEN
    RAISE EXCEPTION 'Changing the category of a team expense is switched off';
  END IF;
  RETURN NEW;
END $$;

-- Team receipt files: only a file that a team-visible company expense actually references,
-- never the owner's whole receipts/ prefix (statements, vault documents, reports, drafts).
CREATE OR REPLACE FUNCTION public.can_read_team_receipt(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND _path IS NOT NULL
    AND split_part(_path, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(_path, '/', 1) <> auth.uid()::text
    AND EXISTS (SELECT 1 FROM public.expenses e
                WHERE e.employee_id = split_part(_path, '/', 1)::uuid
                  AND e.entity_id IS NOT NULL
                  AND e.receipts @> jsonb_build_array(jsonb_build_object('path', _path))
                  AND public.can_access_expense(e.employee_id, 'view_receipts', e.entity_id))
$$;
DROP POLICY IF EXISTS "Read team receipts" ON storage.objects;
CREATE POLICY "Read team receipts" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND public.can_read_team_receipt(name));

-- Company tax: only owners who granted the caller, only the granted companies and their profiles.
CREATE OR REPLACE FUNCTION public.team_company_tax() RETURNS TABLE(owner_id uuid, owner_name text, entities jsonb, profiles jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles r JOIN public.role_permissions p ON p.role = r.role AND p.action = 'view_company_tax' AND p.allowed
      WHERE r.user_id = uid AND r.role = 'finance'::public.app_role) THEN
    RAISE EXCEPTION 'Company tax view is not permitted for your role';
  END IF;
  RETURN QUERY SELECT f.owner_id, pr.full_name,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.v->>'id', 'name', e.v->>'name', 'kind', e.v->>'kind') ORDER BY e.n)
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(f.data->'entities') = 'array' THEN f.data->'entities' ELSE '[]'::jsonb END) WITH ORDINALITY e(v, n)
      WHERE COALESCE(e.v->>'kind', '') <> 'individual'
        AND EXISTS (SELECT 1 FROM public.entity_members m WHERE m.owner_id = f.owner_id AND m.member_id = uid AND m.revoked_at IS NULL AND m.entity_id = e.v->>'id')), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t.v ORDER BY t.n)
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(f.data->'books'->'entityTaxProfiles') = 'array' THEN f.data->'books'->'entityTaxProfiles' ELSE '[]'::jsonb END) WITH ORDINALITY t(v, n)
      WHERE EXISTS (SELECT 1 FROM public.entity_members m WHERE m.owner_id = f.owner_id AND m.member_id = uid AND m.revoked_at IS NULL AND m.entity_id = t.v->>'entityId')), '[]'::jsonb)
  FROM public.finance_preferences f JOIN public.profiles pr ON pr.id = f.owner_id
  WHERE f.owner_id <> uid
    AND NOT EXISTS (SELECT 1 FROM public.demo_sessions d WHERE d.owner_id = f.owner_id)
    AND EXISTS (SELECT 1 FROM public.entity_members m WHERE m.owner_id = f.owner_id AND m.member_id = uid AND m.revoked_at IS NULL);
END $$;

-- L-3: has_role answers only for the caller (it was an anon-callable oracle for any user id).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND _user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- L-4 / H-2: department budgets are a shared, owner-less table. Legacy (possibly self-assigned)
-- finance rows no longer read every department or change limits everyone sees; app admins
-- (rows only the service role can create) keep managing them. Rows are untouched.
ALTER POLICY "Anyone signed in can view budgets" ON public.department_budgets
  USING (department = public.my_department() OR public.is_admin());
ALTER POLICY "Finance inserts budgets" ON public.department_budgets
  WITH CHECK (public.is_admin() AND public.can_do('edit_budgets'));
ALTER POLICY "Finance updates budgets" ON public.department_budgets
  USING (public.is_admin() AND public.can_do('edit_budgets'))
  WITH CHECK (public.is_admin() AND public.can_do('edit_budgets') AND amount >= 0);

-- --------------------------------------------------------------------------------------------
-- 3 (before 2, because the document guard calls these). M-1 / M-2 company upload namespace.
-- Merges staged company-bound-uploads.sql + document-storage-boundary.sql with review fixes.
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_upload_company_file(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND _path IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.entity_members m
    JOIN public.finance_preferences p ON p.owner_id = m.owner_id
    WHERE m.member_id = auth.uid() AND m.revoked_at IS NULL AND m.can_write
      AND split_part(_path, '/', 1) = m.owner_id::text
      AND split_part(_path, '/', 2) = 'companies'
      AND split_part(_path, '/', 3) = encode(convert_to(m.entity_id, 'UTF8'), 'hex')
      AND array_length(string_to_array(_path, '/'), 1) = 4
      AND split_part(_path, '/', 4) ~ '^[a-zA-Z0-9_.-]+$'
      AND split_part(_path, '/', 4) NOT IN ('.', '..')
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p.data->'entities', '[]'::jsonb)) e WHERE e->>'id' = m.entity_id))
$$;

-- Reference check bypasses RLS on purpose: a hidden/retagged document still counts as linked.
CREATE OR REPLACE FUNCTION public.is_unlinked_company_file(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.can_upload_company_file(_path) AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.file_path = _path)
$$;

-- The caller's own, still-unlinked upload (storage.objects.owner_id is set by the Storage API).
CREATE OR REPLACE FUNCTION public.is_own_unlinked_company_upload(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.is_unlinked_company_file(_path) AND EXISTS (
    SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'receipts' AND o.name = _path AND o.owner_id = auth.uid()::text)
$$;

DROP POLICY IF EXISTS "Entity editors upload document files" ON storage.objects;
CREATE POLICY "Entity editors upload document files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND owner_id = auth.uid()::text AND public.can_upload_company_file(name));
DROP POLICY IF EXISTS "Entity editors clean unlinked company uploads" ON storage.objects;
CREATE POLICY "Entity editors clean unlinked company uploads" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'receipts' AND owner_id = auth.uid()::text AND public.is_unlinked_company_file(name));
DROP POLICY IF EXISTS "Entity editors read own pending uploads" ON storage.objects;
CREATE POLICY "Entity editors read own pending uploads" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND owner_id = auth.uid()::text AND public.is_unlinked_company_file(name));

-- RESTRICTIVE: ANDs with every permissive receipts read. Private DocuRepo/company originals of
-- another owner are readable only through a currently visible document row with a company grant.
DROP POLICY IF EXISTS "DocuRepo originals require current document access" ON storage.objects;
CREATE POLICY "DocuRepo originals require current document access" ON storage.objects
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    bucket_id <> 'receipts'
    OR split_part(name, '/', 1) = auth.uid()::text
    OR (split_part(name, '/', 2) NOT IN ('docs', 'companies')
        AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.file_path = storage.objects.name))
    OR EXISTS (SELECT 1 FROM public.documents d WHERE d.file_path = storage.objects.name
               AND d.entity_id IS NOT NULL AND public.can_access_entity(d.owner_id, d.entity_id, false))
    OR (owner_id = auth.uid()::text AND public.is_unlinked_company_file(name)));

CREATE INDEX IF NOT EXISTS documents_file_path_idx ON public.documents(file_path);

-- --------------------------------------------------------------------------------------------
-- 2. H-3: guards keyed on OLD. Named zz_* so they run after every other BEFORE trigger on the
--    table (PostgreSQL fires same-timing triggers in name order) and see the final NEW row.
--    Service-role work (auth.uid() IS NULL) is unaffected.
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_shared_document_edit() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      RAISE EXCEPTION 'A document cannot be moved to another person' USING ERRCODE = '42501';
    END IF;
    IF OLD.owner_id = uid THEN RETURN NEW; END IF;
    IF OLD.entity_id IS NULL OR NOT public.can_access_entity(OLD.owner_id, OLD.entity_id, true) THEN
      RAISE EXCEPTION 'Company edit access required' USING ERRCODE = '42501';
    END IF;
    IF NEW.entity_id IS DISTINCT FROM OLD.entity_id THEN
      RAISE EXCEPTION 'Only the owner can move a document to another company' USING ERRCODE = '42501';
    END IF;
    IF NEW.file_path IS DISTINCT FROM OLD.file_path THEN
      RAISE EXCEPTION 'Shared editors cannot replace source evidence' USING ERRCODE = '42501';
    END IF;
    IF (NEW.transaction_id, NEW.account_id, NEW.loan_id, NEW.replaces_id, NEW.evidence_locked)
       IS DISTINCT FROM (OLD.transaction_id, OLD.account_id, OLD.loan_id, OLD.replaces_id, OLD.evidence_locked) THEN
      RAISE EXCEPTION 'Only the owner can change document links or evidence locks' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  -- INSERT
  IF NEW.owner_id = uid THEN RETURN NEW; END IF;
  IF NEW.entity_id IS NULL OR NOT public.can_access_entity(NEW.owner_id, NEW.entity_id, true) THEN
    RAISE EXCEPTION 'Company edit access required' USING ERRCODE = '42501';
  END IF;
  IF NEW.transaction_id IS NOT NULL OR NEW.account_id IS NOT NULL OR NEW.loan_id IS NOT NULL OR NEW.replaces_id IS NOT NULL THEN
    RAISE EXCEPTION 'Shared editors cannot link documents to the owner''s records' USING ERRCODE = '42501';
  END IF;
  IF split_part(NEW.file_path, '/', 1) <> NEW.owner_id::text
     OR split_part(NEW.file_path, '/', 2) <> 'companies'
     OR split_part(NEW.file_path, '/', 3) <> encode(convert_to(NEW.entity_id, 'UTF8'), 'hex')
     OR NOT public.is_own_unlinked_company_upload(NEW.file_path) THEN
    RAISE EXCEPTION 'File must be your own new upload for this exact company' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_guard_shared_document_edit ON public.documents;
CREATE TRIGGER zz_guard_shared_document_edit BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_shared_document_edit();

CREATE OR REPLACE FUNCTION public.guard_shared_expense_edit() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
    RAISE EXCEPTION 'An entry cannot be moved to another person' USING ERRCODE = '42501';
  END IF;
  IF OLD.employee_id = uid THEN RETURN NEW; END IF;
  IF NEW.entity_id IS DISTINCT FROM OLD.entity_id THEN
    RAISE EXCEPTION 'Only the owner can move an entry to another company' USING ERRCODE = '42501';
  END IF;
  IF NEW.receipts IS DISTINCT FROM OLD.receipts OR NEW.member_id IS DISTINCT FROM OLD.member_id THEN
    RAISE EXCEPTION 'Only the owner can change receipt files or family links' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_guard_shared_expense_edit ON public.expenses;
CREATE TRIGGER zz_guard_shared_expense_edit BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_shared_expense_edit();

-- --------------------------------------------------------------------------------------------
-- 4. Erasure coverage. Same contract (no arguments, returns void, owner from auth.uid()).
--    Kept on purpose: profiles, user_roles, app_admins, role_permission_audit and expense_history
--    rows the caller wrote on other people's records (identity / access history, KK decision),
--    demo_sessions (service cleanup), device_passkeys and passkey_challenges (device sign-in
--    factors, not finance data). Optional V3.1 tables (P2) are cleared when present.
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_my_finance_data()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 PERFORM set_config('ledgerline.erasing', 'on', true);
 DELETE FROM public.family_requests WHERE owner_id=uid OR requester_id=uid;
 DELETE FROM public.family_invites WHERE owner_id=uid;
 UPDATE public.family_invites SET accepted_by=NULL, accepted_at=NULL, revoked=true WHERE accepted_by=uid;
 -- company sharing (0075): grants the caller gave and grants the caller received
 DELETE FROM public.entity_members WHERE owner_id=uid OR member_id=uid;
 -- accountant links (0052) and their uploads/events
 DELETE FROM public.upload_link_events WHERE owner_id=uid;
 DELETE FROM public.accountant_uploads WHERE owner_id=uid;
 DELETE FROM public.upload_links WHERE owner_id=uid;
 DELETE FROM public.accountant_contacts WHERE owner_id=uid;
 -- statement import pipeline (rows without an account do not cascade)
 DELETE FROM public.statement_checkpoints WHERE owner_id=uid;
 DELETE FROM public.import_audit WHERE owner_id=uid;
 DELETE FROM public.import_pdf_pages WHERE owner_id=uid;
 DELETE FROM public.import_posts WHERE owner_id=uid;
 DELETE FROM public.import_rows WHERE owner_id=uid;
 DELETE FROM public.import_batches WHERE owner_id=uid;
 DELETE FROM public.import_rules WHERE owner_id=uid;
 DELETE FROM public.import_ai_state WHERE owner_id=uid;
 DELETE FROM public.transfer_links WHERE owner_id=uid;
 DELETE FROM public.opening_postings WHERE owner_id=uid;
 DELETE FROM public.period_operation_authority WHERE owner_id=uid;
 DELETE FROM public.document_runs WHERE owner_id=uid;
 DELETE FROM public.document_intake_commits WHERE owner_id=uid;
 DELETE FROM public.receipt_problem_reports WHERE owner_id=uid;
 DELETE FROM public.report_jobs WHERE owner_id=uid;
 DELETE FROM public.security_holdings WHERE owner_id=uid;
 DELETE FROM public.demat_accounts WHERE owner_id=uid;
 DELETE FROM public.preference_approvals WHERE owner_id=uid;
 DELETE FROM public.financial_corrections WHERE owner_id=uid;
 DELETE FROM public.claim_preparations WHERE owner_id=uid;
 DELETE FROM public.reimbursement_config_audit WHERE owner_id=uid;
 DELETE FROM public.period_close_evidence WHERE owner_id=uid;
 DELETE FROM public.imported_period_history WHERE owner_id=uid;
 -- 0058 coverage (unchanged order)
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
 -- V3.1 access model (P2), only when installed
 IF to_regclass('public.access_grant_audit') IS NOT NULL THEN
   EXECUTE 'DELETE FROM public.access_grant_audit WHERE workspace_owner_id = $1' USING uid;
 END IF;
 IF to_regclass('public.access_grants') IS NOT NULL THEN
   EXECUTE 'DELETE FROM public.access_grants WHERE workspace_owner_id = $1 OR grantee_id = $1' USING uid;
 END IF;
END $function$;

-- --------------------------------------------------------------------------------------------
-- 5. EXECUTE privileges (L-3). Helpers answer only for auth.uid(); anon and PUBLIC lose EXECUTE.
-- --------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION
  public.has_role(uuid, public.app_role), public.my_department(), public.is_admin(), public.can_do(text),
  public.can_access_expense(uuid, text), public.can_access_expense(uuid, text, text),
  public.can_read_team_receipt(text), public.can_upload_company_file(text), public.is_unlinked_company_file(text),
  public.is_own_unlinked_company_upload(text), public.guard_team_expense_edit(),
  public.guard_shared_document_edit(), public.guard_shared_expense_edit(),
  public.team_company_tax(), public.delete_my_finance_data()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.has_role(uuid, public.app_role), public.my_department(), public.is_admin(), public.can_do(text),
  public.can_access_expense(uuid, text), public.can_access_expense(uuid, text, text),
  public.can_read_team_receipt(text), public.can_upload_company_file(text), public.is_unlinked_company_file(text),
  public.is_own_unlinked_company_upload(text), public.team_company_tax(), public.delete_my_finance_data()
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  public.can_access_expense(uuid, text, text), public.can_read_team_receipt(text), public.can_upload_company_file(text),
  public.is_unlinked_company_file(text), public.is_own_unlinked_company_upload(text),
  public.guard_shared_document_edit(), public.guard_shared_expense_edit()
  TO service_role;

COMMIT;
