-- ============================================================================================
-- P16_statement_undo_withdraw.sql (PROPOSED ONLY: NOT APPLIED to Lovable Cloud, Live or any hosted DB).
-- Prepared 11 Nov 2026 (P0-034, Track A) for KK review. Tested only in isolated PGlite:
-- src/lib/p16-statement-undo-sql.test.ts (applied schema + P1..P10 + P16; catalog-exact rollback) and
-- src/lib/failure-injection.test.ts "P0-034" (the real Statement Desk Undo server function over PGlite).
--
-- KK decision (P0-034, approved): Statement Desk Undo uses recoverable Withdraw for unposted, unreconciled entries
-- the upload created; posted entries get the authorised linked reversal (P7); reconciled entries go through the
-- controlled correction path, never a silent withdrawal. Before P16, P7 reverse_statement_upload DELETEd the rows an
-- upload created that never posted ("today's rule"); with P10 that DELETE is refused and the whole Undo rolls back.
--
-- Requires: P7 (reverse_statement_upload, statement_upload_reversals, phase3_p7) and P10 (phase3_p10). Re-running is
-- safe. Rollback: P16_statement_undo_withdraw.rollback.sql (restores P7's body verbatim; run it before P10's rollback).
--
-- What changes (only the never-posted branch and two refusals; everything else is P7's body verbatim):
--  A. phase3_p16.withdraw_upload_entry: withdraws ONE row the upload created (the caller passes only manifest rows the
--     saved upload lists as created, "posted"), with reason 'Statement upload undone: <reason>', actor auth.uid() and
--     time, appended to receipt_details.withdrawal.history exactly as P10 withdraw_entry does, plus the event's source
--     {kind: statement_undo, upload, request, statementRef, reconciledAt}. The row, its receipts, statement_ref and
--     reconciled_at are untouched (P10 freezes them while withdrawn). Refused: posted (P16_POSTED), statement evidence
--     other than this upload's own reference (P16_RECONCILED), reversal history, linked transfers, closed periods
--     (P16_CLOSED_PERIOD, conservative: any closed period covering the date), already withdrawn (P16_WITHDRAWN).
--     The upload's own statement match is its source evidence, not an independent reconciliation, so P10's
--     P10_RECONCILED rule (for entries matched by a later statement) does not apply to it; anything else does.
--  B. reverse_statement_upload: unposted created rows -> A (never DELETE); the result lists them under "withdrawn"
--     ("deleted" stays [] for older readers). Before any write, a withdrawn manifest row (P16_WITHDRAWN) or a created
--     row now carrying other statement evidence (P16_RECONCILED) refuses the whole Undo. Matched pre-existing rows
--     still only lose this upload's match ("unreconciled"); they are never withdrawn or reversed.
--  C. public.statement_undo_withdraws(): STABLE probe (true) so the app offers Undo of created rows only when B is
--     installed; without it the app refuses (no sequential fallback, no DELETE path).
-- Idempotency is P7's: one transaction, replay by request id from statement_upload_reversals (reason, actor, session,
-- time), so a repeat Undo, a retry after a lost response or an interrupted call changes nothing twice.
-- P9 statement line claims (statement_line_imports) are NOT released: Statement Desk does not write them, and the
-- Inbox flow keeps them so a re-import of an undone line meets its withdrawn entry by stable id and is refused with
-- "restore instead" (fx.functions saveExpense), never duplicated and never silently reactivated.
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase3_p7') IS NULL OR to_regclass('public.statement_upload_reversals') IS NULL THEN
    RAISE EXCEPTION 'P16 requires P7 (reverse_statement_upload, statement_upload_reversals)';
  END IF;
  IF to_regnamespace('phase3_p10') IS NULL OR to_regprocedure('phase3_p10.entry_posted(uuid)') IS NULL THEN
    RAISE EXCEPTION 'P16 requires P10 (unposted entry withdrawal)';
  END IF;
  IF to_regprocedure('public.reverse_statement_upload__unguarded(uuid,uuid,jsonb,text)') IS NULL
     AND to_regprocedure('public.reverse_statement_upload(uuid,uuid,jsonb,text)') IS NULL THEN
    RAISE EXCEPTION 'P16 requires public.reverse_statement_upload';
  END IF;
END $pre$;

CREATE SCHEMA IF NOT EXISTS phase3_p16;
REVOKE ALL ON SCHEMA phase3_p16 FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------------------------
-- A. Withdraw one row an upload created (internal; called only by B)
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION phase3_p16.withdraw_upload_entry(_uid uuid, _entry uuid, _reason text, _upload uuid, _request uuid, _ref text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE e public.expenses; w jsonb; h jsonb; ev jsonb; periods jsonb; reason text := left(btrim(coalesce(_reason, '')), 500);
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF length(reason) < 5 THEN RAISE EXCEPTION 'P10_REASON: give a reason of at least 5 characters.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO e FROM public.expenses WHERE id = _entry AND employee_id = _uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'P10_NOT_FOUND: that entry was not found among your records. Nothing was changed.' USING ERRCODE = 'P0002'; END IF;
  w := CASE WHEN jsonb_typeof(e.receipt_details) = 'object' THEN e.receipt_details->'withdrawal' END;
  IF w->>'state' = 'withdrawn' THEN
    RAISE EXCEPTION 'P16_WITHDRAWN: an entry from this upload was withdrawn. It is kept in history and Undo changes nothing; restore or review that entry first.' USING ERRCODE = '42501';
  END IF;
  IF phase3_p10.entry_posted(e.id) THEN
    RAISE EXCEPTION 'P16_POSTED: an entry from this upload is posted to your books; it is reversed, never withdrawn. Review it individually.' USING ERRCODE = '42501';
  END IF;
  IF e.statement_ref IS DISTINCT FROM _ref THEN
    RAISE EXCEPTION 'P16_RECONCILED: an entry from this upload has been matched to other statement evidence since. Correct it through the correction workflow; Undo changed nothing.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(e.receipt_details) = 'object' AND e.receipt_details ? 'reversal'
     OR EXISTS (SELECT 1 FROM public.expenses r WHERE r.employee_id = _uid AND jsonb_typeof(r.receipt_details) = 'object' AND r.receipt_details->'reversal'->>'of' = e.id::text) THEN
    RAISE EXCEPTION 'P10_REVERSAL_HISTORY: reversal history is kept as it is; it cannot be withdrawn.' USING ERRCODE = '42501';
  END IF;
  IF e.transfer_counterpart_of IS NOT NULL OR EXISTS (SELECT 1 FROM public.expenses c WHERE c.employee_id = _uid AND c.transfer_counterpart_of = e.id) THEN
    RAISE EXCEPTION 'P10_LINKED_TRANSFER: this transfer is linked to its other side. Undo the transfer link first; nothing was changed.' USING ERRCODE = '42501';
  END IF;
  SELECT p.data->'books'->'closedPeriods' INTO periods FROM public.finance_preferences p WHERE p.owner_id = _uid;
  IF jsonb_typeof(periods) = 'array' AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(periods) p
       WHERE (p->>'from') ~ '^\d{4}-\d{2}-\d{2}$' AND (p->>'to') ~ '^\d{4}-\d{2}-\d{2}$' AND e.expense_date BETWEEN (p->>'from')::date AND (p->>'to')::date) THEN
    RAISE EXCEPTION 'P16_CLOSED_PERIOD: an entry from this upload is dated % in a closed period. Correct it through the correction workflow (reopen the period on the Audit page first); Undo changed nothing.', e.expense_date USING ERRCODE = '42501';
  END IF;
  h := CASE WHEN jsonb_typeof(w->'history') = 'array' THEN w->'history' ELSE '[]'::jsonb END;
  ev := jsonb_build_object('action', 'withdrawn', 'at', to_jsonb(clock_timestamp())#>>'{}', 'by', _uid::text, 'reason', reason,
    'source', jsonb_build_object('kind', 'statement_undo', 'upload', _upload, 'request', _request, 'statementRef', e.statement_ref, 'reconciledAt', e.reconciled_at));
  w := jsonb_build_object('state', 'withdrawn', 'at', ev->'at', 'by', ev->'by', 'reason', ev->'reason', 'history', h || jsonb_build_array(ev));
  PERFORM phase3_p10.grant_authority('writing', e.id::text);
  UPDATE public.expenses SET receipt_details = jsonb_set(CASE WHEN jsonb_typeof(receipt_details) = 'object' THEN receipt_details ELSE '{}'::jsonb END, '{withdrawal}', w)
   WHERE id = e.id;
  PERFORM phase3_p10.end_authority('writing', e.id::text);
END $$;

-- --------------------------------------------------------------------------------------------
-- B. reverse_statement_upload: P7's body with the never-posted branch withdrawing (into P4's __unguarded body when
--    P4 guarded it, so the step-up wrapper stays)
-- --------------------------------------------------------------------------------------------
DO $d$
DECLARE target text := CASE WHEN to_regprocedure('public.reverse_statement_upload__unguarded(uuid,uuid,jsonb,text)') IS NOT NULL
                            THEN 'reverse_statement_upload__unguarded' ELSE 'reverse_statement_upload' END;
BEGIN
  EXECUTE replace($body$
CREATE OR REPLACE FUNCTION public.__TARGET__(_request uuid, _upload uuid, _items jsonb, _reason text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); prev public.statement_upload_reversals; item jsonb; row_now jsonb; up jsonb; eid uuid; ev uuid; sha text;
  reversed jsonb := '[]'::jsonb; withdrawn jsonb := '[]'::jsonb; unmatched jsonb := '[]'::jsonb; r jsonb; result jsonb; rr text := btrim(coalesce(_reason, ''));
BEGIN
  IF uid IS NULL OR phase3_p7.is_guest() THEN RAISE EXCEPTION 'P7_GUEST: sign in with a real account' USING ERRCODE = '42501'; END IF;
  IF _request IS NULL OR _upload IS NULL THEN RAISE EXCEPTION 'Request and upload required'; END IF;
  IF jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items) NOT BETWEEN 1 AND 3000
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(_items) x WHERE x->>'action' IS NULL OR x->>'action' NOT IN ('remove', 'unreconcile') OR jsonb_typeof(x->'snapshot') IS DISTINCT FROM 'object')
     OR (SELECT count(DISTINCT x->'snapshot'->>'id') FROM jsonb_array_elements(_items) x) <> jsonb_array_length(_items) THEN
    RAISE EXCEPTION 'Invalid Undo manifest';
  END IF;
  sha := public.legacy_sha256(jsonb_build_object('upload', _upload, 'items', (SELECT jsonb_agg(jsonb_build_array(x->>'action', x->'snapshot'->>'id', x->>'ref') ORDER BY x->'snapshot'->>'id') FROM jsonb_array_elements(_items) x)));
  PERFORM 1 FROM public.finance_preferences WHERE owner_id = uid FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  SELECT * INTO prev FROM public.statement_upload_reversals WHERE id = _request;
  IF FOUND THEN
    IF prev.owner_id <> uid OR prev.items_sha256 <> sha THEN RAISE EXCEPTION 'Undo identifier already used'; END IF;
    RETURN prev.result || jsonb_build_object('replayed', true);
  END IF;
  IF length(rr) < 5 THEN RAISE EXCEPTION 'A reason of at least five characters is required'; END IF;
  SELECT u INTO up FROM public.finance_preferences p, jsonb_array_elements(CASE WHEN jsonb_typeof(p.data->'statementUploads') = 'array' THEN p.data->'statementUploads' ELSE '[]'::jsonb END) u
  WHERE p.owner_id = uid AND u->>'id' = _upload::text LIMIT 1;
  IF up IS NULL THEN RAISE EXCEPTION 'Upload history is unavailable. Recovery is retained.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_items) x WHERE NOT (CASE WHEN x->>'action' = 'remove' THEN coalesce(up->'posted', '[]'::jsonb) ELSE coalesce(up->'reconciled', '[]'::jsonb) END ? (x->'snapshot'->>'id'))) THEN
    RAISE EXCEPTION 'Undo does not match the saved upload. Recovery is retained.';
  END IF;
  PERFORM 1 FROM public.expenses WHERE employee_id = uid AND id IN (SELECT (x->'snapshot'->>'id')::uuid FROM jsonb_array_elements(_items) x) ORDER BY id FOR UPDATE;
  FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    SELECT to_jsonb(e) INTO row_now FROM public.expenses e WHERE e.id = (item->'snapshot'->>'id')::uuid AND e.employee_id = uid;
    -- P16: a withdrawn entry is kept history; Undo never changes it (restore or review it individually first).
    IF FOUND AND row_now->'receipt_details'->'withdrawal'->>'state' = 'withdrawn' THEN
      RAISE EXCEPTION 'P16_WITHDRAWN: an entry from this upload was withdrawn. It is kept in history and Undo changes nothing; restore or review that entry first.';
    END IF;
    -- P16: a row this upload created that is now matched to other statement evidence was reconciled since: correction, never withdrawal.
    IF FOUND AND item->>'action' = 'remove' AND row_now->>'statement_ref' IS DISTINCT FROM item->>'ref' THEN
      RAISE EXCEPTION 'P16_RECONCILED: an entry from this upload has been matched to other statement evidence since. Correct it through the correction workflow; Undo changed nothing.';
    END IF;
    IF NOT FOUND OR row_now IS DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::public.expenses, item->'snapshot')) THEN
      RAISE EXCEPTION 'Record changed; Undo retained for fresh review';
    END IF;
    IF row_now->>'statement_ref' IS DISTINCT FROM item->>'ref' THEN RAISE EXCEPTION 'Source evidence changed'; END IF;
    IF row_now->>'transfer_counterpart_of' IS NOT NULL OR EXISTS (SELECT 1 FROM public.expenses e WHERE e.employee_id = uid AND e.transfer_counterpart_of = (item->'snapshot'->>'id')::uuid) THEN
      RAISE EXCEPTION 'Linked transfer requires individual review';
    END IF;
    IF row_now->>'reverses_entry_id' IS NOT NULL OR EXISTS (SELECT 1 FROM public.expenses e WHERE e.reverses_entry_id = (item->'snapshot'->>'id')::uuid) THEN
      RAISE EXCEPTION 'A record was already reversed; review it individually';
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(_items) ORDER BY value->'snapshot'->>'id' LOOP
    eid := (item->'snapshot'->>'id')::uuid;
    IF item->>'action' = 'remove' THEN
      SELECT id INTO ev FROM public.posting_events WHERE owner_id = uid AND event_key = 'ledger_entry:' || eid;
      IF phase3_p7.active(uid) AND ev IS NOT NULL AND phase3_p7.event_active(ev) THEN
        r := phase3_p7.reverse_entry(uid, md5(_request::text || ':' || eid::text)::uuid, eid, 'Statement upload undone: ' || rr, current_date,
               jsonb_build_object('statementUpload', _upload));
        reversed := reversed || jsonb_build_array(jsonb_build_object('entryId', eid, 'reversalEntryId', r->'reversalEntryId', 'correctionDate', r->'correctionDate'));
      ELSE
        -- P16 (P0-034): never posted -> recoverable Withdraw with the Undo's reason; the row, its receipts, statement
        -- reference and history stay; ledgerView leaves it out of every figure; Restore entry brings it back.
        PERFORM phase3_p16.withdraw_upload_entry(uid, eid, 'Statement upload undone: ' || rr, _upload, _request, item->>'ref');
        withdrawn := withdrawn || to_jsonb(eid);
      END IF;
    ELSE
      UPDATE public.expenses SET statement_ref = NULL, reconciled_at = NULL WHERE id = eid AND employee_id = uid;
      unmatched := unmatched || to_jsonb(eid);
    END IF;
  END LOOP;
  result := jsonb_build_object('request', _request, 'upload', _upload, 'reversed', reversed, 'withdrawn', withdrawn, 'deleted', '[]'::jsonb, 'unreconciled', unmatched, 'replayed', false);
  PERFORM phase3_p7.grant_authority('writer');
  INSERT INTO public.statement_upload_reversals(id, owner_id, upload_id, items_sha256, result, reason, actor_id, session_id)
  VALUES (_request, uid, _upload, sha, result, rr, uid, public.jwt_session_id());
  PERFORM phase3_p7.end_authority('writer');
  RETURN result;
END $$;
$body$, '__TARGET__', target);
END $d$;
-- --------------------------------------------------------------------------------------------
-- C. Capability probe (STABLE: reads nothing, changes nothing)
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.statement_undo_withdraws() RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$ SELECT true $$;

REVOKE ALL ON FUNCTION phase3_p16.withdraw_upload_entry(uuid, uuid, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.statement_undo_withdraws() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.statement_undo_withdraws() TO authenticated;
COMMIT;
