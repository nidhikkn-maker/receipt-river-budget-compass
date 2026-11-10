-- ============================================================================================
-- P16_statement_undo_withdraw.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores the exact pre-P16 catalog: P7's reverse_statement_upload body verbatim (into P4's __unguarded body when P4
-- is installed), the probe and the phase3_p16 schema dropped. Every expenses row stays exactly as stored: entries an
-- Undo withdrew stay withdrawn with their full history (valid P10 history), restorable through Restore entry.
-- Run it BEFORE the P10 rollback. After it, with P10 still installed, an Undo whose upload created never-posted rows
-- fails closed again (P10_WITHDRAW_ONLY), and the app refuses it (no statement_undo_withdraws probe).
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase3_p16') IS NULL THEN RAISE EXCEPTION 'P16 is not installed'; END IF;
END $pre$;

DROP FUNCTION IF EXISTS public.statement_undo_withdraws();

DO $d$
DECLARE target text := CASE WHEN to_regprocedure('public.reverse_statement_upload__unguarded(uuid,uuid,jsonb,text)') IS NOT NULL
                            THEN 'reverse_statement_upload__unguarded' ELSE 'reverse_statement_upload' END;
BEGIN
  EXECUTE replace($body$
CREATE OR REPLACE FUNCTION public.__TARGET__(_request uuid, _upload uuid, _items jsonb, _reason text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); prev public.statement_upload_reversals; item jsonb; row_now jsonb; up jsonb; eid uuid; ev uuid; sha text;
  reversed jsonb := '[]'::jsonb; deleted jsonb := '[]'::jsonb; unmatched jsonb := '[]'::jsonb; r jsonb; result jsonb; rr text := btrim(coalesce(_reason, ''));
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
        DELETE FROM public.expenses WHERE id = eid AND employee_id = uid; -- never posted: today's rule
        deleted := deleted || to_jsonb(eid);
      END IF;
    ELSE
      UPDATE public.expenses SET statement_ref = NULL, reconciled_at = NULL WHERE id = eid AND employee_id = uid;
      unmatched := unmatched || to_jsonb(eid);
    END IF;
  END LOOP;
  result := jsonb_build_object('request', _request, 'upload', _upload, 'reversed', reversed, 'deleted', deleted, 'unreconciled', unmatched, 'replayed', false);
  PERFORM phase3_p7.grant_authority('writer');
  INSERT INTO public.statement_upload_reversals(id, owner_id, upload_id, items_sha256, result, reason, actor_id, session_id)
  VALUES (_request, uid, _upload, sha, result, rr, uid, public.jwt_session_id());
  PERFORM phase3_p7.end_authority('writer');
  RETURN result;
END $$;
$body$, '__TARGET__', target);
END $d$;
DROP SCHEMA phase3_p16 CASCADE;
COMMIT;
