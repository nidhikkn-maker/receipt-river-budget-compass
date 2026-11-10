-- ============================================================================================
-- P10_unposted_entry_withdrawal.sql (PROPOSED ONLY: NOT APPLIED to Lovable Cloud, Live or any hosted DB).
-- Prepared 11 Nov 2026 (P0 closure, Track A) for KK review. Tested only in isolated PGlite:
-- src/lib/withdrawal-api.test.ts (with and without P7/P9; catalog-exact rollback).
--
-- KK (binding): "For unposted financial records, implement a recoverable Withdraw action with reason, retained
-- evidence and audit history. Posted and reconciled records require proper reversal/correction workflows. Enforce
-- the distinction server-side." and decision 1 (a financial record is never physically removed by the user).
--
-- Depends on the applied migrations 0000-0088 only. Independent of P1-P9 (P7 is detected at run time: when
-- public.posting_events exists, any posting event for the entry means "posted"). Re-running it is safe.
-- Rollback: P10_unposted_entry_withdrawal.rollback.sql. No column is added and no existing row or value is
-- changed: the withdrawal lives where the app already writes it (expenses.receipt_details.withdrawal), so the
-- app path works before P10 and P10 only makes it database-enforced.
--
-- Representation (same reasoning as P9 for recordArchive): receipt_details.withdrawal =
--   { state: withdrawn|restored, at, by, reason, history: [{action, at, by, reason}, ...] }
-- Columns were considered (withdrawn_at / withdrawn_by / withdraw_reason) and not chosen: the readers already
-- read receipt_details (narrow alias receipt_details->withdrawal), the app must be safe before any SQL is
-- applied, and a second source of truth during rollout is avoided. Every expense UPDATE bumps
-- correction_revision (0041), so revision-checked flows refuse to act on an entry withdrawn after their preview.
--
-- A. withdraw_entry(entry, reason) / restore_entry(entry, reason): SECURITY DEFINER, the caller's own entry
--    only (FOR UPDATE), reason >= 5 characters, history appended with by = auth.uid(), at = now().
--    Withdraw is refused for: posted entries (P10_POSTED -> Reverse entry), reconciled / statement-matched
--    entries (P10_RECONCILED -> correction workflow), reversal history (P10_REVERSAL_HISTORY), linked
--    transfers (P10_LINKED_TRANSFER). A repeat of the stored last event returns {replayed:true} (idempotent).
-- B. p10_guard_withdrawal BEFORE UPDATE on expenses: only A may change receipt_details.withdrawal; an update
--    that drops it keeps the stored value (an older client's edit can never reinstate a withdrawn entry or
--    erase its history); while withdrawn, money, account, date, category, receipt and statement columns are
--    frozen (P10_WITHDRAWN) until restored. INSERT keeps a withdrawal only as a full valid history (backup
--    restore of history; events keep their original actor), else it is refused.
-- C. p10_withdraw_only BEFORE DELETE on expenses: refuses deletes by signed-in users (P10_WITHDRAW_ONLY).
--    Allowed: confirmed erasure of the caller's own data (ledgerline.erasing, as P7/P9) and the service /
--    operator path (no auth.uid() and not the authenticated/anon role: demo cleanup cron, auth-user cascades).
--    TRUNCATE by signed-in roles refused. Consequences recorded in p0_defects.tsv P0-034: the staged
--    undo_statement_rows and P7 reverse_statement_upload "never posted -> DELETE" branches then fail closed
--    (atomic, nothing changed) until they withdraw instead (KK decision pending).
-- D. undo_opening_balances (applied, 0061) is replaced so Undo withdraws the opening entries it created
--    (reason "Opening balances undone") instead of deleting them; same edit check as before.
-- Open item for KK (R-P10-1): a P7 backfill run after P10 must leave withdrawn entries unposted; P7's
-- backfill preview does not read receipt_details.withdrawal today.
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regclass('public.expenses') IS NULL OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.expenses'::regclass AND attname = 'correction_revision') THEN
    RAISE EXCEPTION 'P10 requires migration 0041 (expenses.correction_revision)';
  END IF;
  IF to_regclass('public.opening_postings') IS NULL THEN RAISE EXCEPTION 'P10 requires migration 0061 (opening_postings)'; END IF;
END $pre$;

CREATE SCHEMA IF NOT EXISTS phase3_p10;
REVOKE ALL ON SCHEMA phase3_p10 FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS phase3_p10.installed (installed_at timestamptz NOT NULL DEFAULT clock_timestamp());
INSERT INTO phase3_p10.installed SELECT WHERE NOT EXISTS (SELECT 1 FROM phase3_p10.installed);

-- --------------------------------------------------------------------------------------------
-- Helpers
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION phase3_p10.entry_posted(_entry uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE hit boolean := false;
BEGIN
  IF to_regclass('public.posting_events') IS NULL THEN RETURN false; END IF;
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.posting_events WHERE event_key = $1)' INTO hit USING 'ledger_entry:' || _entry::text;
  RETURN hit;
END $$;

-- A withdrawal value is valid when its history alternates withdrawn/restored (starting with withdrawn), every
-- event has a time, an actor and a reason >= 5 characters, and the status fields match the last event.
CREATE OR REPLACE FUNCTION phase3_p10.valid_withdrawal(_w jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE h jsonb; i integer; ev jsonb; last text := 'restored'; lastev jsonb;
BEGIN
  IF jsonb_typeof(_w) IS DISTINCT FROM 'object' OR jsonb_typeof(_w->'history') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  h := _w->'history';
  IF jsonb_array_length(h) = 0 THEN RETURN false; END IF;
  FOR i IN 0 .. jsonb_array_length(h) - 1 LOOP
    ev := h->i;
    IF jsonb_typeof(ev) IS DISTINCT FROM 'object' OR coalesce(ev->>'action', '') NOT IN ('withdrawn', 'restored') OR ev->>'action' = last
       OR coalesce(ev->>'at', '') = '' OR coalesce(ev->>'by', '') = '' OR length(btrim(coalesce(ev->>'reason', ''))) < 5 THEN RETURN false; END IF;
    last := ev->>'action';
  END LOOP;
  lastev := h->(jsonb_array_length(h) - 1);
  RETURN _w->>'state' = last AND _w->>'at' IS NOT DISTINCT FROM lastev->>'at' AND _w->>'by' IS NOT DISTINCT FROM lastev->>'by'
     AND _w->>'reason' IS NOT DISTINCT FROM lastev->>'reason';
END $$;

-- --------------------------------------------------------------------------------------------
-- A. Withdraw / Restore
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION phase3_p10.change(_entry uuid, _reason text, _action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); e public.expenses; w jsonb; h jsonb; last jsonb; ev jsonb; reason text := btrim(coalesce(_reason, ''));
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF length(reason) < 5 OR length(reason) > 500 THEN RAISE EXCEPTION 'P10_REASON: give a reason of at least 5 characters.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO e FROM public.expenses WHERE id = _entry AND employee_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'P10_NOT_FOUND: that entry was not found among your records. Nothing was changed.' USING ERRCODE = 'P0002'; END IF;
  w := CASE WHEN jsonb_typeof(e.receipt_details) = 'object' THEN e.receipt_details->'withdrawal' END;
  h := CASE WHEN jsonb_typeof(w->'history') = 'array' THEN w->'history' ELSE '[]'::jsonb END;
  last := CASE WHEN jsonb_array_length(h) > 0 THEN h->(jsonb_array_length(h) - 1) END;
  IF last IS NOT NULL AND last->>'action' = _action AND last->>'by' = uid::text AND last->>'reason' = reason THEN
    RETURN jsonb_build_object('entry', e.id, 'state', _action, 'replayed', true);
  END IF;
  IF _action = 'restored' THEN
    IF coalesce(w->>'state', '') <> 'withdrawn' THEN RAISE EXCEPTION 'P10_NOT_WITHDRAWN: this entry is not withdrawn, so there is nothing to restore.' USING ERRCODE = '42501'; END IF;
  ELSE
    IF w->>'state' = 'withdrawn' THEN RETURN jsonb_build_object('entry', e.id, 'state', 'withdrawn', 'replayed', true); END IF;
    IF jsonb_typeof(e.receipt_details) = 'object' AND e.receipt_details ? 'reversal'
       OR EXISTS (SELECT 1 FROM public.expenses r WHERE r.employee_id = uid AND jsonb_typeof(r.receipt_details) = 'object' AND r.receipt_details->'reversal'->>'of' = e.id::text) THEN
      RAISE EXCEPTION 'P10_REVERSAL_HISTORY: reversal history is kept as it is; it cannot be withdrawn.' USING ERRCODE = '42501';
    END IF;
    IF phase3_p10.entry_posted(e.id) THEN
      RAISE EXCEPTION 'P10_POSTED: this entry is posted to your books. Reverse it with a reason instead (Reverse entry); it is never withdrawn.' USING ERRCODE = '42501';
    END IF;
    IF e.reconciled_at IS NOT NULL OR nullif(btrim(coalesce(e.statement_ref, '')), '') IS NOT NULL THEN
      RAISE EXCEPTION 'P10_RECONCILED: this entry is matched to a bank statement line. Correct it through the correction workflow (or clear the statement match there first); it is not withdrawn.' USING ERRCODE = '42501';
    END IF;
    IF e.transfer_counterpart_of IS NOT NULL OR EXISTS (SELECT 1 FROM public.expenses c WHERE c.employee_id = uid AND c.transfer_counterpart_of = e.id) THEN
      RAISE EXCEPTION 'P10_LINKED_TRANSFER: this transfer is linked to its other side. Undo the transfer link first; nothing was changed.' USING ERRCODE = '42501';
    END IF;
  END IF;
  ev := jsonb_build_object('action', _action, 'at', to_jsonb(clock_timestamp())#>>'{}', 'by', uid::text, 'reason', reason);
  w := jsonb_build_object('state', _action, 'at', ev->'at', 'by', ev->'by', 'reason', ev->'reason', 'history', h || jsonb_build_array(ev));
  PERFORM set_config('phase3_p10.writing', e.id::text, true);
  UPDATE public.expenses SET receipt_details = jsonb_set(CASE WHEN jsonb_typeof(receipt_details) = 'object' THEN receipt_details ELSE '{}'::jsonb END, '{withdrawal}', w)
   WHERE id = e.id;
  PERFORM set_config('phase3_p10.writing', '', true);
  RETURN jsonb_build_object('entry', e.id, 'state', _action, 'replayed', false);
END $$;

CREATE OR REPLACE FUNCTION public.withdraw_entry(p_entry uuid, p_reason text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT phase3_p10.change(p_entry, p_reason, 'withdrawn') $$;
CREATE OR REPLACE FUNCTION public.restore_entry(p_entry uuid, p_reason text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT phase3_p10.change(p_entry, p_reason, 'restored') $$;

-- --------------------------------------------------------------------------------------------
-- B. Only A changes a withdrawal; a withdrawn entry is frozen until restored
-- --------------------------------------------------------------------------------------------
-- SECURITY DEFINER (like P9 keep_record_archive): it calls phase3_p10 helpers, whose schema signed-in roles cannot use.
CREATE OR REPLACE FUNCTION phase3_p10.guard_withdrawal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ow jsonb; nw jsonb;
BEGIN
  IF current_setting('ledgerline.erasing', true) = 'on' THEN RETURN NEW; END IF;
  nw := CASE WHEN jsonb_typeof(NEW.receipt_details) = 'object' THEN NEW.receipt_details->'withdrawal' END;
  IF TG_OP = 'INSERT' THEN
    IF nw IS NOT NULL THEN
      IF NOT phase3_p10.valid_withdrawal(nw) THEN RAISE EXCEPTION 'P10_WITHDRAWAL_ONLY_BY_FUNCTION: an entry is withdrawn only by Withdraw entry (reason, who and when recorded)' USING ERRCODE = '42501'; END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF coalesce(current_setting('phase3_p10.writing', true), '') = OLD.id::text THEN RETURN NEW; END IF;
  ow := CASE WHEN jsonb_typeof(OLD.receipt_details) = 'object' THEN OLD.receipt_details->'withdrawal' END;
  IF nw IS NULL AND ow IS NOT NULL THEN
    -- dropped (e.g. an edit that rewrote receipt_details): the stored withdrawal and its history stay
    NEW.receipt_details := jsonb_set(CASE WHEN jsonb_typeof(NEW.receipt_details) = 'object' THEN NEW.receipt_details ELSE '{}'::jsonb END, '{withdrawal}', ow);
    nw := ow;
  END IF;
  IF nw IS DISTINCT FROM ow THEN
    RAISE EXCEPTION 'P10_WITHDRAWAL_ONLY_BY_FUNCTION: an entry is withdrawn or restored only by Withdraw entry / Restore entry (reason, who and when recorded)' USING ERRCODE = '42501';
  END IF;
  IF ow->>'state' = 'withdrawn' AND (NEW.amount, NEW.original_amount, NEW.currency, NEW.fx_rate, NEW.expense_date, NEW.txn_type, NEW.account_id,
      NEW.to_account_id, NEW.adjustment_sign, NEW.principal, NEW.interest, NEW.allocations, NEW.splits, NEW.workspace_allocations, NEW.category,
      NEW.receipts, NEW.statement_ref, NEW.reconciled_at, NEW.employee_id, NEW.transfer_counterpart_of)
     IS DISTINCT FROM (OLD.amount, OLD.original_amount, OLD.currency, OLD.fx_rate, OLD.expense_date, OLD.txn_type, OLD.account_id,
      OLD.to_account_id, OLD.adjustment_sign, OLD.principal, OLD.interest, OLD.allocations, OLD.splits, OLD.workspace_allocations, OLD.category,
      OLD.receipts, OLD.statement_ref, OLD.reconciled_at, OLD.employee_id, OLD.transfer_counterpart_of) THEN
    RAISE EXCEPTION 'P10_WITHDRAWN: this entry is withdrawn. Restore it before changing it.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS p10_guard_withdrawal ON public.expenses;
CREATE TRIGGER p10_guard_withdrawal BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION phase3_p10.guard_withdrawal();

-- --------------------------------------------------------------------------------------------
-- C. No deletes of expenses by signed-in users
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION phase3_p10.guard_expense_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_setting('ledgerline.erasing', true) = 'on' AND (auth.uid() IS NULL OR OLD.employee_id = auth.uid()) THEN RETURN OLD; END IF;
  IF auth.uid() IS NULL AND current_user NOT IN ('authenticated', 'anon') THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'P10_WITHDRAW_ONLY: entries are withdrawn (unposted) or reversed (posted), never deleted. Both keep who, when and why.' USING ERRCODE = '42501';
END $$;
CREATE OR REPLACE FUNCTION phase3_p10.guard_expense_truncate() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') OR auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'P10_WITHDRAW_ONLY: expenses cannot be truncated' USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS p10_withdraw_only ON public.expenses;
CREATE TRIGGER p10_withdraw_only BEFORE DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION phase3_p10.guard_expense_delete();
DROP TRIGGER IF EXISTS p10_no_truncate ON public.expenses;
CREATE TRIGGER p10_no_truncate BEFORE TRUNCATE ON public.expenses FOR EACH STATEMENT EXECUTE FUNCTION phase3_p10.guard_expense_truncate();

-- --------------------------------------------------------------------------------------------
-- D. Opening-balance Undo withdraws instead of deleting
-- --------------------------------------------------------------------------------------------
-- Where P4 (step-up) is installed, undo_opening_balances is its step-up wrapper and the 0061 body lives in
-- undo_opening_balances__unguarded: P10 replaces that body and keeps the wrapper (the step-up check stays).
DO $d$
DECLARE target text := CASE WHEN to_regprocedure('public.undo_opening_balances__unguarded(uuid)') IS NOT NULL
                            THEN 'undo_opening_balances__unguarded' ELSE 'undo_opening_balances' END;
BEGIN
  EXECUTE format($f$
CREATE OR REPLACE FUNCTION public.%I(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); p public.opening_postings; eid uuid;
BEGIN
  SELECT * INTO p FROM public.opening_postings WHERE id = _id AND owner_id = uid AND undone_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nothing to undo'; END IF;
  IF EXISTS (SELECT 1 FROM public.expenses WHERE id = ANY(p.txn_ids) AND (updated_at > p.posted_at + interval '5 seconds' OR employee_id <> uid)) THEN
    RAISE EXCEPTION 'An opening entry was edited after posting — change it directly instead';
  END IF;
  -- P10: withdrawn with a reason (kept with history, left out of figures), never deleted
  FOREACH eid IN ARRAY coalesce(p.txn_ids, '{}') LOOP
    IF EXISTS (SELECT 1 FROM public.expenses WHERE id = eid AND employee_id = uid) THEN
      PERFORM phase3_p10.change(eid, 'Opening balances undone', 'withdrawn');
    END IF;
  END LOOP;
  UPDATE public.opening_postings SET undone_at = now(), undone_by = uid WHERE id = _id;
END $$;$f$, target);
END $d$;

-- --------------------------------------------------------------------------------------------
-- Grants
-- --------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.withdraw_entry(uuid, text), public.restore_entry(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_entry(uuid, text), public.restore_entry(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION phase3_p10.entry_posted(uuid), phase3_p10.valid_withdrawal(jsonb), phase3_p10.change(uuid, text, text),
  phase3_p10.guard_withdrawal(), phase3_p10.guard_expense_delete(), phase3_p10.guard_expense_truncate() FROM PUBLIC, anon, authenticated;
COMMIT;
