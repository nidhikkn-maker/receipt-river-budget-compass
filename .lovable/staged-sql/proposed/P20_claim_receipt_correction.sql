-- ============================================================================================
-- P20_claim_receipt_correction.sql (PROPOSED ONLY: NOT APPLIED to Lovable Cloud, Live or any hosted DB).
-- Prepared 11 Nov 2026 (Track A) for KK review. Tested only in isolated PGlite:
-- src/lib/p20-claim-receipt-correction-sql.test.ts (applied schema + P19, and the whole proposed stack P1..P19,
-- each followed by P20; catalog-exact rollback).
--
-- Problem ("case J"): one money-back entry rr (5,000) is cited by two claims (hotel and visa). Money-back is allocated
-- once across claims, so visa's citation is "already counted on hotel" and visa is really still owed 5,000, but
-- visa's own receipts total 5,000, so a new receipt is (correctly) refused. The app had no audited way to correct a
-- citation: updateReimbursement deliberately keeps the saved receipts, so "Remove this reference" was a no-op.
--
-- Fix: a new finance_operation action 'correct_claim_receipt' (same transaction, per-owner advisory lock and strict
-- idempotency record as every other money movement, P19) that REDUCES one receipt citation on one claim:
--   payload { operationId, id (claim), receiptId, expectedAmount, newAmount, reason }
--    K1 only those keys: txnId, date, account (or anything else) can never be changed by a correction.
--    K2 claim: expenses.id = id AND employee_id = auth.uid() FOR UPDATE, txn_type 'expense' (another owner's claim
--       reads as 'Claim not found'); write access to its company (can_access_entity).
--    K3 receipt: exactly one reimbursement.receipts[] element with that id; its current amount must equal
--       expectedAmount (the amount the user saw), otherwise "This claim changed" and nothing is saved.
--    K4 newAmount: a JSON number, two decimals, >= 0 and strictly below the current amount (reduce only; increases
--       stay with claim_receipt). 0 removes the citation from receipts; any other value keeps id, txnId, date, note.
--    K5 reason: non-empty after trimming, at most 500 characters.
--    K6 reimbursement_status is recomputed exactly as reimbursements.ts statusColumn does with receipt lines present:
--       stage rejected/written_off -> 'none'; received >= claimable > 0 -> 'received'; otherwise 'pending'.
--    K7 audit: one public.claim_receipt_corrections row (before/after amount and status, the receipt as it was,
--       reason, actor, operation key, time); readable by the owner only, written only by this workflow.
--   The money-back entry rr itself is never changed: the correction only changes how much of it this claim cites.
--
-- Install AFTER P19 (needs phase3_p19 and P19's reviewed finance_operation bodies, checked by md5). Roll back P20
-- FIRST: P20_claim_receipt_correction.rollback.sql restores the saved finance_operation definitions and drops the
-- function, the audit table (its rows are lost) and the phase3_p20 schema.
-- When applied, classify public.claim_receipt_corrections in backup-schema.ts (excluded: audit history, like
-- transaction_audit). Erasure: rows cascade with the claim (claim_id REFERENCES expenses ON DELETE CASCADE).
-- ============================================================================================
BEGIN;

DO $pre$
DECLARE f record;
BEGIN
  IF to_regnamespace('phase3_p20') IS NOT NULL THEN RAISE EXCEPTION 'P20 is already installed'; END IF;
  IF to_regnamespace('phase3_p19') IS NULL THEN RAISE EXCEPTION 'P20 requires P19 (finance operation authority)'; END IF;
  -- Only P19's reviewed bodies are extended.
  FOR f IN SELECT p.oid::regprocedure::text sig, md5(p.prosrc) m, p.prosecdef FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('finance_operation', 'finance_operation__unguarded') LOOP
    IF NOT f.m = ANY (ARRAY['6eadbed38c6f46a6f76ae452377b6fc3', 'f0386c8ced16fae414d5a1d7bc0f5032']) OR NOT f.prosecdef THEN
      RAISE EXCEPTION 'P20: % is not the reviewed P19 body (md5 %); review the hosted definition before installing', f.sig, f.m;
    END IF;
  END LOOP;
END $pre$;

CREATE SCHEMA phase3_p20;
REVOKE ALL ON SCHEMA phase3_p20 FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE phase3_p20.saved_functions (signature text PRIMARY KEY, definition text NOT NULL, prosrc_md5 text NOT NULL);
INSERT INTO phase3_p20.saved_functions(signature, definition, prosrc_md5)
  SELECT p.oid::regprocedure::text, pg_get_functiondef(p.oid), md5(p.prosrc) FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('finance_operation', 'finance_operation__unguarded');
REVOKE ALL ON phase3_p20.saved_functions FROM PUBLIC, anon, authenticated, service_role;

-- K7 audit trail
CREATE TABLE public.claim_receipt_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  claim_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  receipt_id text NOT NULL,
  txn_id text,
  before_amount numeric(14,2) NOT NULL CHECK (before_amount > 0),
  after_amount numeric(14,2) NOT NULL CHECK (after_amount >= 0 AND after_amount < before_amount),
  before_status text NOT NULL,
  after_status text NOT NULL,
  receipt jsonb NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  actor_id uuid NOT NULL,
  operation_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (owner_id, operation_key)
);
CREATE INDEX claim_receipt_corrections_claim ON public.claim_receipt_corrections(claim_id, created_at);
ALTER TABLE public.claim_receipt_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.claim_receipt_corrections FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.claim_receipt_corrections TO authenticated;
GRANT SELECT ON public.claim_receipt_corrections TO service_role;
CREATE POLICY "Owner reads claim receipt corrections" ON public.claim_receipt_corrections FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "P20 corrections recorded only by the finance workflow" ON public.claim_receipt_corrections AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "P20 corrections cannot be changed" ON public.claim_receipt_corrections AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "P20 corrections cannot be deleted" ON public.claim_receipt_corrections AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- The correction step: definer, callable only inside finance_operation's transaction (P19 authority row).
CREATE FUNCTION public.correct_claim_receipt(payload jsonb, operation_key text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  uid uuid := auth.uid(); e public.expenses%ROWTYPE; w public.expenses%ROWTYPE; info jsonb; receipts jsonb; old_r jsonb; pos integer; matches integer;
  before_amt numeric; new_amt numeric; expected numeric; reason text; claim numeric; got numeric; st text; cid uuid;
BEGIN
  PERFORM phase3_p19.refuse_assistant('correct_claim_receipt');
  IF uid IS NULL OR NOT phase3_p19.authorised('finance_operation') THEN RAISE EXCEPTION 'Use the payment workflow' USING ERRCODE = '42501'; END IF;
  -- K1
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('operationId', 'id', 'receiptId', 'expectedAmount', 'newAmount', 'reason')) THEN
    RAISE EXCEPTION 'A correction only reduces the amount; the money entry, date and account stay as recorded';
  END IF;
  -- K5
  reason := btrim(COALESCE(payload->>'reason', ''));
  IF reason = '' OR length(reason) > 500 THEN RAISE EXCEPTION 'Give a reason for this correction'; END IF;
  -- K4 (shape)
  IF jsonb_typeof(payload->'newAmount') IS DISTINCT FROM 'number' OR jsonb_typeof(payload->'expectedAmount') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Enter the corrected amount';
  END IF;
  new_amt := (payload->>'newAmount')::numeric; expected := (payload->>'expectedAmount')::numeric;
  IF new_amt < 0 OR new_amt <> round(new_amt, 2) THEN RAISE EXCEPTION 'Enter zero or a positive amount with no more than two decimal places'; END IF;
  -- K2
  SELECT * INTO e FROM public.expenses x WHERE x.id = (payload->>'id')::uuid AND x.employee_id = uid FOR UPDATE;
  IF NOT FOUND OR e.txn_type <> 'expense' THEN RAISE EXCEPTION 'Claim not found'; END IF;
  IF NOT public.can_access_entity(e.employee_id, e.entity_id, true) THEN RAISE EXCEPTION 'Claim not found'; END IF;
  info := CASE WHEN jsonb_typeof(e.reimbursement) = 'object' THEN e.reimbursement ELSE '{}'::jsonb END;
  receipts := CASE WHEN jsonb_typeof(info->'receipts') = 'array' THEN info->'receipts' ELSE '[]'::jsonb END;
  -- K3
  SELECT count(*), min(o - 1) INTO matches, pos FROM jsonb_array_elements(receipts) WITH ORDINALITY r(v, o) WHERE r.v->>'id' = payload->>'receiptId';
  IF matches <> 1 THEN RAISE EXCEPTION 'This receipt is not on the claim'; END IF;
  old_r := receipts->pos;
  before_amt := (old_r->>'amount')::numeric;
  IF before_amt IS DISTINCT FROM expected THEN RAISE EXCEPTION 'This claim changed — refresh before correcting it'; END IF;
  IF new_amt >= before_amt THEN RAISE EXCEPTION 'A correction can only reduce what this claim cites; record more money received instead'; END IF;
  receipts := CASE WHEN new_amt = 0 THEN receipts - pos ELSE jsonb_set(receipts, ARRAY[pos::text, 'amount'], to_jsonb(new_amt)) END;
  info := info || jsonb_build_object('receipts', receipts);
  -- K6
  claim := least(e.amount, COALESCE((info->>'reimbursable')::numeric, e.amount));
  SELECT COALESCE(sum((r->>'amount')::numeric), 0) INTO got FROM jsonb_array_elements(receipts) r;
  st := CASE WHEN info->>'stage' IN ('rejected', 'written_off') THEN 'none' WHEN claim > 0 AND got >= claim THEN 'received' ELSE 'pending' END;
  UPDATE public.expenses x SET reimbursement = info, reimbursement_status = st WHERE x.id = e.id AND x.employee_id = uid RETURNING * INTO w;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim not found'; END IF;
  PERFORM phase3_p19.check_entry(w, uid);
  -- K7
  INSERT INTO public.claim_receipt_corrections(owner_id, claim_id, receipt_id, txn_id, before_amount, after_amount, before_status, after_status, receipt, reason, actor_id, operation_key)
  VALUES (uid, e.id, payload->>'receiptId', old_r->>'txnId', before_amt, new_amt, COALESCE(e.reimbursement_status, 'none'), st, old_r, reason, uid, operation_key) RETURNING id INTO cid;
  RETURN jsonb_build_object('id', e.id, 'receiptId', payload->>'receiptId', 'before', before_amt, 'after', new_amt, 'status', st, 'correctionId', cid);
END $$;
REVOKE ALL ON FUNCTION public.correct_claim_receipt(jsonb, text) FROM PUBLIC, anon, authenticated, service_role;

-- Add the action to finance_operation (and P4's __unguarded copy): same lock, idempotency record and authority row.
DO $splice$
DECLARE f record; def text; anchor text := ' ELSIF action = ''reimbursement'' THEN';
BEGIN
  FOR f IN SELECT * FROM phase3_p20.saved_functions LOOP
    def := f.definition;
    IF (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 THEN RAISE EXCEPTION 'P20: finance workflow branch not found in %', f.signature; END IF;
    def := replace(def, anchor, E' ELSIF action = ''correct_claim_receipt'' THEN\n  result := public.correct_claim_receipt(payload, key);\n\n' || anchor);
    EXECUTE def;
  END LOOP;
END $splice$;

DO $post$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('finance_operation', 'finance_operation__unguarded', 'correct_claim_receipt')
              AND (NOT p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp'])) THEN
    RAISE EXCEPTION 'P20: a finance workflow function is not SECURITY DEFINER with a pinned search_path';
  END IF;
  IF has_function_privilege('authenticated', 'public.correct_claim_receipt(jsonb,text)', 'EXECUTE') OR has_function_privilege('anon', 'public.correct_claim_receipt(jsonb,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.correct_claim_receipt(jsonb,text)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.claim_receipt_corrections', 'INSERT') OR has_table_privilege('authenticated', 'public.claim_receipt_corrections', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.claim_receipt_corrections', 'DELETE') OR has_table_privilege('anon', 'public.claim_receipt_corrections', 'SELECT')
     OR NOT has_function_privilege('authenticated', 'public.finance_operation(text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P20: unexpected client privilege on the claim receipt correction';
  END IF;
END $post$;
COMMIT;
