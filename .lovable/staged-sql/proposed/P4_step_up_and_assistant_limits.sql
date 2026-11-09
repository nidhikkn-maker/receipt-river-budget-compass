-- ============================================================================================
-- P4_step_up_and_assistant_limits.sql (PROPOSED ONLY: NOT APPLIED to Lovable Cloud, Live or any hosted DB)
-- Prepared 2026-11-09 for KK review. Implements docs/plans/PHASE1_SECURITY_CONTRACT_2026-11-09.md
-- (database side). See docs/plans/SECURITY_MIGRATION_PLAN_2026-11-09.md section 13.
-- Requires P1_security_containment.sql and P2_v31_role_model.sql (preflight checks both).
-- Rollback: P4_step_up_and_assistant_limits.rollback.sql (restores the exact P1+P2 objects; archives
-- step_up_grants and revoked_assistant_clients, never drops their rows).
-- Data: changes NO existing row value. Adds one column (device_passkeys.id, a new random uuid per
-- existing passkey, needed by the contract's remove_device_passkey(_id uuid)); every other change is
-- functions, policies, grants and two new tables.
--
--  1. Step-up ("re-confirmation") enforced in the database:
--       step_up_grants, record_step_up (service_role only), has_recent_step_up,
--       require_recent_step_up  -> raises 'STEP_UP_REQUIRED: <action>' (SQLSTATE 42501), and always
--       for external-assistant sessions.
--  2. External assistants (OAuth tokens carrying a client_id claim):
--       is_assistant_session, refuse_assistant_session ('ASSISTANT_READ_ONLY: <action>', 42501),
--       revoked_assistant_clients + revoke_assistant_client, assistant_client_revoked,
--       RESTRICTIVE policies on every RLS table in public (and storage.objects): no INSERT/UPDATE/
--       DELETE for assistant sessions; no SELECT for an assistant whose client the caller or the row's
--       owner revoked.
--  3. Guarded functions keep their names, signatures, return types, SECURITY mode and EXECUTE grants.
--       * SECURITY DEFINER originals: renamed to <name>__unguarded (EXECUTE revoked from PUBLIC, anon
--         and authenticated) and replaced by a SECURITY DEFINER wrapper that runs the check and then
--         delegates to <name>__unguarded with the same arguments.
--       * SECURITY INVOKER originals (restore_finance_backup and the invoker money-movers): a definer
--         wrapper would run the body as the table owner and bypass RLS, and an invoker wrapper cannot
--         call an __unguarded copy that clients may not execute. So the original is still renamed to
--         <name>__unguarded (clients lose EXECUTE; kept unchanged for rollback/audit) and the public
--         name is re-created from the original definition with the check inserted as the first
--         statement of its body. Behaviour, RLS and grants are otherwise identical.
--  4. Audit history (transaction_audit, role_permission_audit, access_grant_audit,
--     period_close_evidence, imported_period_history, preference_approvals) is append-only for
--     clients (RESTRICTIVE UPDATE/DELETE deny). delete_my_finance_data (SECURITY DEFINER, now
--     step-up guarded) keeps its erasure behaviour (KK decision C13 pending).
--  5. Device passkeys can be removed only through remove_device_passkey (step-up guarded).
-- Every object is created in dependency order below; nothing relies on alphabetical order.
-- ============================================================================================
BEGIN;

-- 0. Preflight
DO $pre$
BEGIN
  IF to_regprocedure('public.guard_shared_document_edit()') IS NULL THEN
    RAISE EXCEPTION 'P4 requires P1_security_containment.sql';
  END IF;
  IF to_regprocedure('public.has_permission(uuid,text,text)') IS NULL OR to_regclass('public.access_grants') IS NULL THEN
    RAISE EXCEPTION 'P4 requires P2_v31_role_model.sql';
  END IF;
  IF to_regclass('public.step_up_grants') IS NOT NULL OR to_regnamespace('security_p4') IS NOT NULL THEN
    RAISE EXCEPTION 'P4 is already installed';
  END IF;
END $pre$;

-- --------------------------------------------------------------------------------------------
-- 1. Session helpers
-- --------------------------------------------------------------------------------------------
-- An external assistant's OAuth access token carries a client_id claim; first-party sessions do not.
CREATE FUNCTION public.is_assistant_session() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT coalesce(auth.jwt()->>'client_id', '') <> ''
$$;

-- --------------------------------------------------------------------------------------------
-- 2. Step-up grants
-- --------------------------------------------------------------------------------------------
CREATE TABLE public.step_up_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('passkey', 'password')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '5 minutes')
);
CREATE INDEX step_up_grants_owner_idx ON public.step_up_grants(owner_id, expires_at DESC);
COMMENT ON TABLE public.step_up_grants IS 'P4: recent re-confirmations (passkey/password) recorded by server functions via record_step_up. Clients read their own rows only.';
-- Supabase default privileges grant ALL on new tables to anon/authenticated: remove them explicitly.
REVOKE ALL ON public.step_up_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.step_up_grants TO authenticated;
GRANT ALL ON public.step_up_grants TO service_role;
ALTER TABLE public.step_up_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own step-up grants" ON public.step_up_grants FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

-- Called by server functions (service role) after verifying a passkey or the account password.
-- The 4-digit device PIN never calls this (Decision 30).
CREATE FUNCTION public.record_step_up(_owner uuid, _method text, _seconds int DEFAULT 300) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF _owner IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _owner) THEN
    RAISE EXCEPTION 'Unknown account for step-up';
  END IF;
  IF _method IS NULL OR _method NOT IN ('passkey', 'password') THEN
    RAISE EXCEPTION 'Step-up method must be passkey or password';
  END IF;
  IF _seconds IS NULL OR _seconds < 1 OR _seconds > 300 THEN
    RAISE EXCEPTION 'Step-up lifetime must be between 1 and 300 seconds';
  END IF;
  INSERT INTO public.step_up_grants(owner_id, method, created_at, expires_at)
  VALUES (_owner, _method, clock_timestamp(), clock_timestamp() + make_interval(secs => _seconds));
END $$;

-- True when the caller (never an assistant session) holds an unexpired grant.
CREATE FUNCTION public.has_recent_step_up() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND NOT public.is_assistant_session()
    AND EXISTS (SELECT 1 FROM public.step_up_grants g WHERE g.owner_id = auth.uid() AND g.expires_at > clock_timestamp())
$$;

CREATE FUNCTION public.require_recent_step_up(_action text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.is_assistant_session() OR NOT public.has_recent_step_up() THEN
    RAISE EXCEPTION 'STEP_UP_REQUIRED: %', coalesce(_action, 'action') USING ERRCODE = '42501';
  END IF;
END $$;

-- --------------------------------------------------------------------------------------------
-- 3. Assistant revocation
-- --------------------------------------------------------------------------------------------
CREATE TABLE public.revoked_assistant_clients (
  owner_id uuid NOT NULL,
  client_id text NOT NULL CHECK (client_id = btrim(client_id) AND client_id <> '' AND length(client_id) <= 255),
  revoked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, client_id)
);
CREATE INDEX revoked_assistant_clients_client_idx ON public.revoked_assistant_clients(client_id, owner_id);
COMMENT ON TABLE public.revoked_assistant_clients IS 'P4: external assistant clients an owner revoked. Effective on the next statement; written only by revoke_assistant_client.';
REVOKE ALL ON public.revoked_assistant_clients FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.revoked_assistant_clients TO authenticated;
GRANT ALL ON public.revoked_assistant_clients TO service_role;
ALTER TABLE public.revoked_assistant_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own revoked assistants" ON public.revoked_assistant_clients FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

-- True for an assistant session whose client was revoked by the caller or by _owner (the row's owner).
-- SECURITY DEFINER because another owner's revocation is not visible to the caller under RLS.
CREATE FUNCTION public.assistant_client_revoked(_owner uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.is_assistant_session() AND EXISTS (
    SELECT 1 FROM public.revoked_assistant_clients r
    WHERE r.client_id = auth.jwt()->>'client_id' AND (r.owner_id = auth.uid() OR r.owner_id = _owner))
$$;

CREATE FUNCTION public.refuse_assistant_session(_action text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.is_assistant_session() THEN
    RAISE EXCEPTION 'ASSISTANT_READ_ONLY: %', coalesce(_action, 'action') USING ERRCODE = '42501';
  END IF;
END $$;

CREATE FUNCTION public.refuse_revoked_assistant(_action text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.assistant_client_revoked(NULL) THEN
    RAISE EXCEPTION 'ASSISTANT_REVOKED: %', coalesce(_action, 'action') USING ERRCODE = '42501';
  END IF;
END $$;

CREATE FUNCTION public.revoke_assistant_client(_client_id text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); cid text := btrim(coalesce(_client_id, ''));
BEGIN
  PERFORM public.require_recent_step_up('revoke_assistant_client');
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF cid = '' OR length(cid) > 255 THEN RAISE EXCEPTION 'Unknown assistant'; END IF;
  INSERT INTO public.revoked_assistant_clients(owner_id, client_id) VALUES (uid, cid)
  ON CONFLICT (owner_id, client_id) DO NOTHING;
END $$;

-- --------------------------------------------------------------------------------------------
-- 4. Device passkeys: a stable id for removal, removal only through the guarded function
-- --------------------------------------------------------------------------------------------
ALTER TABLE public.device_passkeys ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX device_passkeys_id_idx ON public.device_passkeys(id);

CREATE FUNCTION public.remove_device_passkey(_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  PERFORM public.require_recent_step_up('remove_device_passkey');
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  DELETE FROM public.device_passkeys WHERE id = _id AND owner_id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Passkey not found'; END IF;
END $$;

-- Direct client deletes would bypass the step-up; registration (INSERT) and the counter UPDATE done
-- by the passkey server functions with the user's token keep working.
CREATE POLICY "P4 passkeys are removed through remove_device_passkey" ON public.device_passkeys
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- --------------------------------------------------------------------------------------------
-- 5. Grants on the new functions
-- --------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_assistant_session(), public.record_step_up(uuid, text, int), public.has_recent_step_up(),
  public.require_recent_step_up(text), public.assistant_client_revoked(uuid), public.refuse_assistant_session(text),
  public.refuse_revoked_assistant(text), public.revoke_assistant_client(text), public.remove_device_passkey(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_step_up(uuid, text, int) TO service_role;
-- Policy helpers must be executable by every role that RLS evaluates them for.
GRANT EXECUTE ON FUNCTION public.is_assistant_session(), public.assistant_client_revoked(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_recent_step_up(), public.require_recent_step_up(text), public.refuse_assistant_session(text),
  public.refuse_revoked_assistant(text), public.revoke_assistant_client(text), public.remove_device_passkey(uuid)
  TO authenticated, service_role;

-- --------------------------------------------------------------------------------------------
-- 6. Function guards (registry + generator in a private schema; dropped by the rollback)
-- --------------------------------------------------------------------------------------------
CREATE SCHEMA security_p4;
REVOKE ALL ON SCHEMA security_p4 FROM PUBLIC, anon, authenticated;
CREATE TABLE security_p4.guarded_functions (
  seq serial PRIMARY KEY,
  proname text NOT NULL,
  identity_args text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('step_up', 'step_up_if_approved', 'assistant', 'revoked_read')),
  technique text NOT NULL CHECK (technique IN ('delegate', 'inline')),
  original_acl aclitem[],
  UNIQUE (proname, identity_args)
);
REVOKE ALL ON security_p4.guarded_functions FROM PUBLIC, anon, authenticated;

CREATE FUNCTION security_p4.guard(_fn regprocedure, _mode text) RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $g$
DECLARE
  p pg_proc; ident text; fargs text; fres text; vol text; chk text; call_args text; delegate text;
  def text; body_at int; inj int; newsig regprocedure; a record; guarded text;
BEGIN
  SELECT * INTO p FROM pg_proc WHERE oid = _fn;
  IF NOT FOUND OR p.pronamespace <> 'public'::regnamespace OR p.prokind <> 'f' THEN
    RAISE EXCEPTION 'P4 guard: % is not a plain public function', _fn;
  END IF;
  IF p.proname LIKE '%\_\_unguarded' THEN RAISE EXCEPTION 'P4 guard: % is already guarded', _fn; END IF;
  -- Renaming keeps the oid: an object bound to the oid (policy, trigger, default, view) would follow
  -- the rename and silently skip the guard. Refuse instead.
  IF EXISTS (SELECT 1 FROM pg_depend d WHERE d.refclassid = 'pg_proc'::regclass AND d.refobjid = _fn AND d.deptype = 'n') THEN
    RAISE EXCEPTION 'P4 guard: other objects depend on %', _fn;
  END IF;
  ident := oidvectortypes(p.proargtypes); -- argument types only: usable by ALTER/DROP and to_regprocedure
  fargs := pg_get_function_arguments(_fn);
  fres := pg_get_function_result(_fn);
  vol := CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END;
  guarded := p.proname || '__unguarded';
  chk := CASE _mode
    WHEN 'step_up' THEN format('PERFORM public.require_recent_step_up(%L);', p.proname)
    WHEN 'assistant' THEN format('PERFORM public.refuse_assistant_session(%L);', p.proname)
    WHEN 'revoked_read' THEN format('PERFORM public.refuse_revoked_assistant(%L);', p.proname)
    WHEN 'step_up_if_approved' THEN format('IF $4 IS NOT FALSE THEN PERFORM public.require_recent_step_up(%L); ELSE PERFORM public.refuse_assistant_session(%L); END IF;', p.proname, p.proname)
  END;
  IF chk IS NULL THEN RAISE EXCEPTION 'P4 guard: unknown mode %', _mode; END IF;
  IF _mode = 'step_up_if_approved' AND (p.pronargs <> 4 OR p.proargtypes[3] <> 'boolean'::regtype) THEN
    RAISE EXCEPTION 'P4 guard: % has no 4th boolean _approved argument', _fn;
  END IF;
  def := pg_get_functiondef(_fn);
  INSERT INTO security_p4.guarded_functions(proname, identity_args, mode, technique, original_acl)
  VALUES (p.proname, ident, _mode, CASE WHEN p.prosecdef THEN 'delegate' ELSE 'inline' END, p.proacl);

  EXECUTE format('ALTER FUNCTION public.%I(%s) RENAME TO %I', p.proname, ident, guarded);
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', guarded, ident);

  IF p.prosecdef THEN
    SELECT coalesce(string_agg('$' || i, ', ' ORDER BY i), '') INTO call_args FROM generate_series(1, p.pronargs) i;
    delegate := CASE
      WHEN p.proretset THEN format('RETURN QUERY SELECT * FROM public.%I(%s);', guarded, call_args)
      WHEN p.prorettype = 'void'::regtype THEN format('PERFORM public.%I(%s);', guarded, call_args)
      ELSE format('RETURN public.%I(%s);', guarded, call_args) END;
    EXECUTE format('CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql %s SECURITY DEFINER SET search_path = public, pg_temp AS %L',
      p.proname, fargs, fres, vol, E'\nBEGIN\n  ' || chk || E'\n  ' || delegate || E'\nEND\n');
  ELSE
    IF p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') THEN
      RAISE EXCEPTION 'P4 guard: invoker function % is not plpgsql', _fn;
    END IF;
    body_at := strpos(def, 'AS $function$');
    IF body_at = 0 THEN RAISE EXCEPTION 'P4 guard: cannot locate the body of %', _fn; END IF;
    inj := regexp_instr(substr(def, body_at), '\mbegin\M', 1, 1, 1, 'i');
    IF inj = 0 THEN RAISE EXCEPTION 'P4 guard: cannot locate BEGIN in %', _fn; END IF;
    EXECUTE substr(def, 1, body_at + inj - 2) || ' ' || chk || substr(def, body_at + inj - 1);
  END IF;

  -- Same EXECUTE grants as the original (the owner keeps its implicit entry).
  newsig := to_regprocedure(format('public.%I(%s)', p.proname, ident));
  IF newsig IS NULL THEN RAISE EXCEPTION 'P4 guard: wrapper for % was not created', _fn; END IF;
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', newsig);
  FOR a IN SELECT * FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x WHERE x.grantee <> p.proowner AND x.privilege_type = 'EXECUTE' LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s%s', newsig,
      CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
      CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;
END $g$;
REVOKE ALL ON FUNCTION security_p4.guard(regprocedure, text) FROM PUBLIC, anon, authenticated, service_role;

DO $guard$
DECLARE f record; n int;
BEGIN
  -- 6a. Step-up (contract): company/admin access changes, erasure, restore, period close/reopen, V3.1
  --     invite/accept/revoke. change_accounting_period: every overload.
  FOR f IN
    SELECT p.oid::regprocedure sig, CASE WHEN p.proname = 'save_reviewed_preferences' THEN 'step_up_if_approved' ELSE 'step_up' END mode
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND p.proname IN (
      'grant_entity_access', 'revoke_entity_access', 'admin_set_member', 'admin_set_permission',
      'delete_my_finance_data', 'restore_finance_backup', 'change_accounting_period',
      'invite_access', 'accept_access', 'revoke_access', 'save_reviewed_preferences')
    ORDER BY p.proname, p.oid
  LOOP PERFORM security_p4.guard(f.sig, f.mode); END LOOP;
  SELECT count(*) INTO n FROM security_p4.guarded_functions;
  IF n < 11 THEN RAISE EXCEPTION 'P4: expected at least 11 step-up functions, found %', n; END IF;

  -- 6b. Writers callable by authenticated that must refuse assistant sessions (enumerated from the
  --     0088+P1+P2 catalog: SECURITY DEFINER or INVOKER, VOLATILE, not a trigger, EXECUTE for
  --     authenticated). INVOKER ones are also stopped by the RESTRICTIVE table policies (section 7);
  --     the guard gives a clear, early refusal.
  FOR f IN
    SELECT p.oid::regprocedure sig FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND p.proname IN (
      'accept_family_invite', 'apply_review_metadata', 'archive_backup_period_history', 'bulk_category_change',
      'cancel_transfer', 'commit_document_intake_reviewed', 'confirm_transfer', 'correct_financial_entries',
      'decide_family_request', 'finish_my_report_job', 'link_activity_expenses', 'manage_trip_expenses',
      'post_opening_balances', 'retry_my_report_job', 'review_statement_evidence', 'revise_import_rows',
      'save_claim_preparation', 'start_demo_workspace', 'undo_category_change', 'undo_financial_correction',
      'undo_opening_balances', 'undo_review_metadata',
      'finance_operation', 'move_expense_category', 'receive_claim_receipt', 'save_import_balance_review')
    ORDER BY p.proname, p.oid
  LOOP PERFORM security_p4.guard(f.sig, 'assistant'); END LOOP;

  -- 6c. Row-returning SECURITY DEFINER readers bypass RLS, so a revoked assistant is refused here too.
  FOR f IN
    SELECT p.oid::regprocedure sig FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND p.proname IN (
      'admin_team', 'my_access_invites', 'my_family_invites', 'my_shared_companies', 'team_company_tax', 'team_names')
    ORDER BY p.proname, p.oid
  LOOP PERFORM security_p4.guard(f.sig, 'revoked_read'); END LOOP;

  -- 6d. Fail closed on an unexpected catalog (e.g. a hosted-only function): every remaining client-
  --     callable volatile function that is not a trigger and not a P4 helper must be reviewed first.
  SELECT count(*) INTO n FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND p.provolatile = 'v'
    AND p.prorettype <> 'trigger'::regtype AND p.proname NOT LIKE '%\_\_unguarded'
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND p.proname NOT IN ('revoke_assistant_client', 'remove_device_passkey')
    AND NOT EXISTS (SELECT 1 FROM security_p4.guarded_functions g WHERE g.proname = p.proname);
  IF n > 0 THEN RAISE EXCEPTION 'P4: % unreviewed client-callable writer function(s) in public; review before applying', n; END IF;
END $guard$;

-- --------------------------------------------------------------------------------------------
-- 7. RESTRICTIVE assistant policies on every RLS table in public (+ storage.objects)
--    Owner column, first match: owner_id, employee_id, user_id, workspace_owner_id. Tables without
--    one (profiles, expense_history, department_budgets, job_state, market_quotes, regulatory_*,
--    role_permissions, role_permission_audit, access_role_permissions) still get the write denial;
--    their read revocation follows the caller's own revocations only.
-- --------------------------------------------------------------------------------------------
DO $pol$
DECLARE t record; oc text; rd text;
BEGIN
  FOR t IN SELECT c.oid, c.relname FROM pg_class c
           WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND c.relrowsecurity
           ORDER BY c.relname LOOP
    SELECT x.col INTO oc FROM unnest(ARRAY['owner_id', 'employee_id', 'user_id', 'workspace_owner_id']) WITH ORDINALITY x(col, n)
    WHERE EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = x.col AND a.atttypid = 'uuid'::regtype AND NOT a.attisdropped AND a.attnum > 0)
    ORDER BY x.n LIMIT 1;
    rd := format('(SELECT NOT public.is_assistant_session()) OR NOT public.assistant_client_revoked(%s)', coalesce(quote_ident(oc), 'NULL'));
    EXECUTE format('CREATE POLICY "P4 assistants cannot insert" ON public.%I AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (NOT (SELECT public.is_assistant_session()))', t.relname);
    EXECUTE format('CREATE POLICY "P4 assistants cannot update" ON public.%I AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (NOT (SELECT public.is_assistant_session())) WITH CHECK (NOT (SELECT public.is_assistant_session()))', t.relname);
    EXECUTE format('CREATE POLICY "P4 assistants cannot delete" ON public.%I AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (NOT (SELECT public.is_assistant_session()))', t.relname);
    EXECUTE format('CREATE POLICY "P4 revoked assistants cannot read" ON public.%I AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (%s)', t.relname, rd);
  END LOOP;
END $pol$;

CREATE POLICY "P4 assistants cannot write files" ON storage.objects AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (NOT (SELECT public.is_assistant_session()));
CREATE POLICY "P4 assistants cannot change files" ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (NOT (SELECT public.is_assistant_session())) WITH CHECK (NOT (SELECT public.is_assistant_session()));
CREATE POLICY "P4 assistants cannot delete files" ON storage.objects AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (NOT (SELECT public.is_assistant_session()));
CREATE POLICY "P4 revoked assistants cannot read files" ON storage.objects AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING ((SELECT NOT public.is_assistant_session()) OR NOT public.assistant_client_revoked(
    CASE WHEN split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN split_part(name, '/', 1)::uuid END));

-- --------------------------------------------------------------------------------------------
-- 8. Audit history is append-only for clients. SECURITY DEFINER writers (triggers, period and
--    access functions, delete_my_finance_data) and referential cascades are not subject to RLS.
-- --------------------------------------------------------------------------------------------
DO $audit$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transaction_audit', 'role_permission_audit', 'access_grant_audit', 'period_close_evidence', 'imported_period_history', 'preference_approvals'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN RAISE EXCEPTION 'P4: audit table % missing', t; END IF;
    EXECUTE format('CREATE POLICY "P4 audit history cannot be changed" ON public.%I AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false)', t);
    EXECUTE format('CREATE POLICY "P4 audit history cannot be deleted" ON public.%I AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false)', t);
  END LOOP;
END $audit$;

COMMIT;
