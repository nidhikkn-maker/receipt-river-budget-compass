-- ============================================================================================
-- P13_team_change_requests.sql (PROPOSED ONLY: NOT APPLIED to Lovable Cloud, Live or any hosted DB).
-- Prepared 11 Nov 2026 (P0 closure, Track A) for KK review. (P12 is the security workstream's session lock.)
-- Tested only in isolated PGlite: src/lib/p13-team-requests-sql.test.ts (SQL level) and
-- src/lib/failure-injection.test.ts T1-T4 (PostgREST-shaped requests as each signed-in user).
--
-- KK (binding, P0-022): "Team users cannot permanently delete financial records or audit history. Allow
-- permission-scoped requests for withdrawal or correction, with authorised approval where consequential. Enforce
-- permissions server-side and preserve entity separation."
--
-- Depends on the applied migrations 0000-0088 and on P10 (withdrawal; P13 refuses to install without it).
-- Works with or without P1 (entity-scoped team access): where public.can_access_expense(uuid, text, text) exists
-- (P1) every permission is checked for the entry's company (entity); otherwise the applied person-level check.
-- Rollback: P13_team_change_requests.rollback.sql (exact pre-P13 catalog; refuses while requests exist unless
-- approved). No existing row value changes; one NULL-able column is added (transaction_audit.actor_id).
--
-- A. Audit history is never deleted or rewritten by signed-in users: BEFORE UPDATE/DELETE and TRUNCATE guards on
--    transaction_audit, expense_history, role_permission_audit, period_close_evidence, imported_period_history,
--    preference_approvals and (when present) access_grant_audit, security_events, backup_restore_receipts and the new
--    entry_change_requests decisions. Allowed: confirmed erasure of the caller's own data (ledgerline.erasing, KK C13
--    pending, as P4/P9/P10) and the service / operator path. transaction_audit gains actor_id (who changed it;
--    default auth.uid(); NULL on rows written before P13 = not recorded).
-- B. Team members never delete entries: the "Team expenses: delete" policy is dropped (P10 already refuses every
--    signed-in DELETE). A team member's direct edit of a consequential field (amount, currency, rate, date, type,
--    accounts, category splits, member/workspace splits, loan parts, receipts, statement match) is refused
--    (P13_REQUEST_REQUIRED); descriptive fields and the existing category switch keep working.
-- C. entry_change_requests: a team member with the switch for the entry's company asks; the owner, or a verified
--    Finance user with "approve" for that company who is not the requester, decides with a reason.
--      request_entry_change(entry, kind 'withdraw'|'correct', reason, changes)  -- 'delete_expenses' / 'edit_expenses'
--      decide_entry_change(request, approve, reason)                             -- applies on approval, revision-checked
--      cancel_entry_change(request, reason)                                      -- the requester
--    Withdraw follows P10 (unposted, unreconciled, no reversal history, no linked transfer; the event records the
--    approver and the request). Correct changes only title, merchant, category, description, date and, for INR
--    entries, amount; posted entries are corrected by reversal (owner), reconciled ones keep amount and date.
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase3_p10') IS NULL THEN RAISE EXCEPTION 'P13 requires P10 (unposted entry withdrawal)'; END IF;
  IF to_regnamespace('phase3_p13') IS NOT NULL THEN RAISE EXCEPTION 'P13 is already installed'; END IF;
END $pre$;

CREATE SCHEMA phase3_p13;
REVOKE ALL ON SCHEMA phase3_p13 FROM PUBLIC, anon, authenticated;
CREATE TABLE phase3_p13.saved_policies (tbl text NOT NULL, name text NOT NULL, cmd text NOT NULL, roles text NOT NULL, qual text, with_check text, permissive text NOT NULL, PRIMARY KEY (tbl, name));
CREATE TABLE phase3_p13.audit_tables (tbl text PRIMARY KEY);

-- --------------------------------------------------------------------------------------------
-- Permission helper: entity-scoped where P1 is installed.
-- --------------------------------------------------------------------------------------------
CREATE FUNCTION phase3_p13.may(_owner uuid, _action text, _entity text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ok boolean;
BEGIN
  IF to_regprocedure('public.can_access_expense(uuid,text,text)') IS NOT NULL THEN
    EXECUTE 'SELECT public.can_access_expense($1, $2, $3)' INTO ok USING _owner, _action, _entity;
  ELSE
    ok := public.can_access_expense(_owner, _action);
  END IF;
  RETURN coalesce(ok, false);
END $$;
CREATE FUNCTION phase3_p13.is_finance(_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _user AND r.role = 'finance'::public.app_role)
$$;

-- --------------------------------------------------------------------------------------------
-- A. Audit history
-- --------------------------------------------------------------------------------------------
ALTER TABLE public.transaction_audit ADD COLUMN actor_id uuid DEFAULT auth.uid();

CREATE FUNCTION phase3_p13.guard_audit() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  -- Confirmed erasure (delete_my_finance_data sets ledgerline.erasing and deletes only the caller's rows; audit tables use
  -- different owner columns and expense_history follows its entry by cascade, so the flag itself is the exemption, as in P4).
  IF TG_OP = 'DELETE' AND current_setting('ledgerline.erasing', true) = 'on' THEN RETURN OLD; END IF;
  IF auth.uid() IS NULL AND current_user NOT IN ('authenticated', 'anon') THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_TABLE_NAME = 'entry_change_requests' AND TG_OP = 'UPDATE' AND coalesce(current_setting('phase3_p13.deciding', true), '') = OLD.id::text THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'P13_AUDIT_KEPT: % is audit history; it is never changed or deleted', TG_TABLE_NAME USING ERRCODE = '42501';
END $$;
CREATE FUNCTION phase3_p13.guard_audit_truncate() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') OR auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'P13_AUDIT_KEPT: % cannot be truncated', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END $$;

-- --------------------------------------------------------------------------------------------
-- B. Team members: no deletes, consequential edits only through approved requests
-- --------------------------------------------------------------------------------------------
INSERT INTO phase3_p13.saved_policies
  SELECT tablename, policyname, cmd, array_to_string(roles, ','), qual, with_check, permissive FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'expenses' AND policyname = 'Team expenses: delete';
DROP POLICY IF EXISTS "Team expenses: delete" ON public.expenses;

CREATE FUNCTION phase3_p13.guard_team_financial_edit() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR OLD.employee_id = auth.uid() THEN RETURN NEW; END IF;
  IF coalesce(current_setting('phase3_p13.applying', true), '') = OLD.id::text THEN RETURN NEW; END IF;
  IF (NEW.amount, NEW.original_amount, NEW.currency, NEW.fx_rate, NEW.expense_date, NEW.txn_type, NEW.account_id, NEW.to_account_id,
      NEW.adjustment_sign, NEW.principal, NEW.interest, NEW.allocations, NEW.splits, NEW.workspace_allocations, NEW.receipts,
      NEW.statement_ref, NEW.reconciled_at, NEW.transfer_counterpart_of, NEW.member_id, NEW.entity_id)
     IS DISTINCT FROM (OLD.amount, OLD.original_amount, OLD.currency, OLD.fx_rate, OLD.expense_date, OLD.txn_type, OLD.account_id, OLD.to_account_id,
      OLD.adjustment_sign, OLD.principal, OLD.interest, OLD.allocations, OLD.splits, OLD.workspace_allocations, OLD.receipts,
      OLD.statement_ref, OLD.reconciled_at, OLD.transfer_counterpart_of, OLD.member_id, OLD.entity_id) THEN
    RAISE EXCEPTION 'P13_REQUEST_REQUIRED: a team member changes money, dates, accounts or evidence of another person''s entry only through a correction request the owner or Finance approves' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER p13_team_financial_edit BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION phase3_p13.guard_team_financial_edit();

-- --------------------------------------------------------------------------------------------
-- C. Requests
-- --------------------------------------------------------------------------------------------
CREATE TABLE public.entry_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  entity_id text,
  kind text NOT NULL CHECK (kind IN ('withdraw', 'correct')),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  changes jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(changes) = 'object'),
  entry_revision bigint NOT NULL,
  entry_snapshot jsonb NOT NULL,
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  result jsonb,
  CHECK ((status = 'pending') = (decided_at IS NULL))
);
CREATE UNIQUE INDEX entry_change_requests_one_pending ON public.entry_change_requests (entry_id) WHERE status = 'pending';
CREATE INDEX entry_change_requests_owner_idx ON public.entry_change_requests (owner_id, status, requested_at);
ALTER TABLE public.entry_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.entry_change_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.entry_change_requests TO authenticated;
GRANT ALL ON public.entry_change_requests TO service_role;
-- Owner, requester, and approvers for that company see a request; writes only through the functions below.
CREATE POLICY "Change requests: owner, requester and approvers read" ON public.entry_change_requests FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR requested_by = auth.uid() OR (phase3_p13.is_finance(auth.uid()) AND phase3_p13.may(owner_id, 'approve', entity_id)));

CREATE FUNCTION public.request_entry_change(p_entry uuid, p_kind text, p_reason text, p_changes jsonb DEFAULT '{}'::jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); e public.expenses; rid uuid; why text := btrim(coalesce(p_reason, '')); k text; allowed text[] := ARRAY['title', 'merchant', 'category', 'description', 'expense_date', 'amount'];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF p_kind NOT IN ('withdraw', 'correct') THEN RAISE EXCEPTION 'P13_INVALID: a request is a withdrawal or a correction' USING ERRCODE = '22023'; END IF;
  IF length(why) < 5 OR length(why) > 500 THEN RAISE EXCEPTION 'P13_REASON: give a reason of at least 5 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO e FROM public.expenses WHERE id = p_entry FOR UPDATE;
  -- Same answer for "no such entry" and "not yours to ask about": no existence leak across people or companies.
  IF NOT FOUND OR e.employee_id = uid OR NOT phase3_p13.may(e.employee_id, CASE p_kind WHEN 'withdraw' THEN 'delete_expenses' ELSE 'edit_expenses' END, e.entity_id) THEN
    RAISE EXCEPTION 'P13_NOT_PERMITTED: you cannot ask for this change (the owner changes their own entries directly)' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'correct' THEN
    IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object' OR p_changes = '{}'::jsonb THEN RAISE EXCEPTION 'P13_INVALID: say what should change' USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(p_changes) LOOP
      IF NOT k = ANY (allowed) THEN RAISE EXCEPTION 'P13_INVALID: % cannot be changed by a correction request', k USING ERRCODE = '22023'; END IF;
    END LOOP;
  ELSE p_changes := '{}'::jsonb;
  END IF;
  INSERT INTO public.entry_change_requests(owner_id, entry_id, entity_id, kind, reason, changes, entry_revision, entry_snapshot, requested_by)
  VALUES (e.employee_id, e.id, e.entity_id, p_kind, why, p_changes, e.correction_revision, to_jsonb(e), uid)
  RETURNING id INTO rid;
  RETURN rid;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'P13_PENDING: this entry already has a request waiting for a decision' USING ERRCODE = '23505';
END $$;

CREATE FUNCTION phase3_p13.apply(r public.entry_change_requests, _actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE e public.expenses; w jsonb; h jsonb; ev jsonb; c jsonb := r.changes; amt numeric;
BEGIN
  SELECT * INTO e FROM public.expenses WHERE id = r.entry_id AND employee_id = r.owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'P13_CHANGED: the entry no longer exists' USING ERRCODE = 'P0002'; END IF;
  IF e.correction_revision <> r.entry_revision THEN RAISE EXCEPTION 'P13_CHANGED: the entry changed after the request; ask again' USING ERRCODE = '40001'; END IF;
  IF jsonb_typeof(e.receipt_details) = 'object' AND e.receipt_details ? 'reversal'
     OR EXISTS (SELECT 1 FROM public.expenses x WHERE x.employee_id = r.owner_id AND jsonb_typeof(x.receipt_details) = 'object' AND x.receipt_details->'reversal'->>'of' = e.id::text) THEN
    RAISE EXCEPTION 'P10_REVERSAL_HISTORY: reversal history is kept as it is' USING ERRCODE = '42501';
  END IF;
  IF phase3_p10.entry_posted(e.id) THEN
    RAISE EXCEPTION 'P10_POSTED: this entry is posted to the books; the owner corrects it by reversal' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(e.receipt_details) = 'object' AND e.receipt_details->'withdrawal'->>'state' = 'withdrawn' THEN
    RAISE EXCEPTION 'P13_CHANGED: the entry is withdrawn' USING ERRCODE = '40001';
  END IF;
  IF r.kind = 'withdraw' THEN
    IF e.reconciled_at IS NOT NULL OR nullif(btrim(coalesce(e.statement_ref, '')), '') IS NOT NULL THEN
      RAISE EXCEPTION 'P10_RECONCILED: this entry is matched to a bank statement line; it is corrected, not withdrawn' USING ERRCODE = '42501';
    END IF;
    IF e.transfer_counterpart_of IS NOT NULL OR EXISTS (SELECT 1 FROM public.expenses x WHERE x.employee_id = r.owner_id AND x.transfer_counterpart_of = e.id) THEN
      RAISE EXCEPTION 'P10_LINKED_TRANSFER: this transfer is linked to its other side' USING ERRCODE = '42501';
    END IF;
    w := CASE WHEN jsonb_typeof(e.receipt_details) = 'object' THEN e.receipt_details->'withdrawal' END;
    h := CASE WHEN jsonb_typeof(w->'history') = 'array' THEN w->'history' ELSE '[]'::jsonb END;
    ev := jsonb_build_object('action', 'withdrawn', 'at', to_jsonb(clock_timestamp())#>>'{}', 'by', _actor::text, 'reason', r.reason,
                             'requestId', r.id::text, 'requestedBy', r.requested_by::text);
    w := jsonb_build_object('state', 'withdrawn', 'at', ev->'at', 'by', ev->'by', 'reason', ev->'reason', 'history', h || jsonb_build_array(ev));
    PERFORM set_config('phase3_p10.writing', e.id::text, true);
    PERFORM set_config('phase3_p13.applying', e.id::text, true);
    UPDATE public.expenses SET receipt_details = jsonb_set(CASE WHEN jsonb_typeof(receipt_details) = 'object' THEN receipt_details ELSE '{}'::jsonb END, '{withdrawal}', w) WHERE id = e.id;
  ELSE
    IF (c ? 'amount' OR c ? 'expense_date') AND (e.reconciled_at IS NOT NULL OR nullif(btrim(coalesce(e.statement_ref, '')), '') IS NOT NULL) THEN
      RAISE EXCEPTION 'P10_RECONCILED: amount and date of a statement-matched entry follow the statement' USING ERRCODE = '42501';
    END IF;
    IF c ? 'amount' THEN
      IF e.currency <> 'INR' THEN RAISE EXCEPTION 'P13_INVALID: foreign-currency amounts are re-entered by the owner (the rate is set by the server)' USING ERRCODE = '22023'; END IF;
      amt := (c->>'amount')::numeric;
      IF amt IS NULL OR amt <= 0 OR amt > 100000000 THEN RAISE EXCEPTION 'P13_INVALID: amount' USING ERRCODE = '22023'; END IF;
      IF jsonb_array_length(coalesce(e.allocations, '[]')) > 0 OR jsonb_array_length(coalesce(e.splits, '[]')) > 0 THEN
        RAISE EXCEPTION 'P13_INVALID: a split entry''s amount is re-entered by the owner' USING ERRCODE = '22023';
      END IF;
    END IF;
    PERFORM set_config('phase3_p13.applying', e.id::text, true);
    UPDATE public.expenses SET
      title = CASE WHEN c ? 'title' THEN left(c->>'title', 200) ELSE title END,
      merchant = CASE WHEN c ? 'merchant' THEN left(c->>'merchant', 200) ELSE merchant END,
      category = CASE WHEN c ? 'category' THEN left(c->>'category', 60) ELSE category END,
      description = CASE WHEN c ? 'description' THEN left(c->>'description', 2000) ELSE description END,
      expense_date = CASE WHEN c ? 'expense_date' THEN (c->>'expense_date')::date ELSE expense_date END,
      amount = CASE WHEN c ? 'amount' THEN amt ELSE amount END,
      original_amount = CASE WHEN c ? 'amount' THEN amt ELSE original_amount END,
      updated_at = now()
    WHERE id = e.id;
  END IF;
  PERFORM set_config('phase3_p13.applying', '', true);
  PERFORM set_config('phase3_p10.writing', '', true);
  RETURN jsonb_build_object('entry', e.id, 'kind', r.kind, 'before', to_jsonb(e), 'changes', c);
END $$;

CREATE FUNCTION public.decide_entry_change(p_request uuid, p_approve boolean, p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); r public.entry_change_requests; why text := btrim(coalesce(p_reason, '')); res jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF length(why) < 5 OR length(why) > 500 THEN RAISE EXCEPTION 'P13_REASON: give a reason of at least 5 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM public.entry_change_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR NOT (r.owner_id = uid OR (phase3_p13.is_finance(uid) AND phase3_p13.may(r.owner_id, 'approve', r.entity_id))) THEN
    RAISE EXCEPTION 'P13_NOT_PERMITTED: only the owner or Finance with approval rights for that company decides' USING ERRCODE = '42501';
  END IF;
  IF r.requested_by = uid THEN RAISE EXCEPTION 'P13_NOT_PERMITTED: a request is decided by someone other than the requester' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'pending' THEN
    RETURN jsonb_build_object('request', r.id, 'status', r.status, 'decidedAt', r.decided_at, 'decidedBy', r.decided_by, 'replayed', true);
  END IF;
  IF p_approve THEN res := phase3_p13.apply(r, uid); END IF;
  PERFORM set_config('phase3_p13.deciding', r.id::text, true);
  UPDATE public.entry_change_requests SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    decided_by = uid, decided_at = clock_timestamp(), decision_reason = why, result = res WHERE id = r.id;
  PERFORM set_config('phase3_p13.deciding', '', true);
  RETURN jsonb_build_object('request', r.id, 'status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, 'replayed', false);
END $$;

CREATE FUNCTION public.cancel_entry_change(p_request uuid, p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); r public.entry_change_requests; why text := btrim(coalesce(p_reason, ''));
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF length(why) < 5 THEN RAISE EXCEPTION 'P13_REASON: give a reason of at least 5 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM public.entry_change_requests WHERE id = p_request AND requested_by = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'P13_NOT_PERMITTED: only the requester cancels a request' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'pending' THEN RETURN jsonb_build_object('request', r.id, 'status', r.status, 'replayed', true); END IF;
  PERFORM set_config('phase3_p13.deciding', r.id::text, true);
  UPDATE public.entry_change_requests SET status = 'cancelled', decided_by = uid, decided_at = clock_timestamp(), decision_reason = why WHERE id = r.id;
  PERFORM set_config('phase3_p13.deciding', '', true);
  RETURN jsonb_build_object('request', r.id, 'status', 'cancelled', 'replayed', false);
END $$;

-- Audit guards (A), including the new request table: decisions are history too.
DO $a$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transaction_audit', 'expense_history', 'role_permission_audit', 'period_close_evidence', 'imported_period_history',
                           'preference_approvals', 'access_grant_audit', 'security_events', 'backup_restore_receipts', 'entry_change_requests'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    INSERT INTO phase3_p13.audit_tables VALUES (t);
    EXECUTE format('CREATE TRIGGER p13_audit_kept BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION phase3_p13.guard_audit()', t);
    EXECUTE format('CREATE TRIGGER p13_audit_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION phase3_p13.guard_audit_truncate()', t);
  END LOOP;
END $a$;

REVOKE ALL ON FUNCTION public.request_entry_change(uuid, text, text, jsonb), public.decide_entry_change(uuid, boolean, text), public.cancel_entry_change(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_entry_change(uuid, text, text, jsonb), public.decide_entry_change(uuid, boolean, text), public.cancel_entry_change(uuid, text) TO authenticated;
GRANT USAGE ON SCHEMA phase3_p13 TO authenticated; -- the SELECT policy calls the two helpers
REVOKE ALL ON FUNCTION phase3_p13.apply(public.entry_change_requests, uuid), phase3_p13.guard_audit(), phase3_p13.guard_audit_truncate(),
  phase3_p13.guard_team_financial_edit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION phase3_p13.may(uuid, text, text), phase3_p13.is_finance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION phase3_p13.may(uuid, text, text), phase3_p13.is_finance(uuid) TO authenticated;
REVOKE ALL ON phase3_p13.saved_policies, phase3_p13.audit_tables FROM PUBLIC, anon, authenticated;
COMMIT;
