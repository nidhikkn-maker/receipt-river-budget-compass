-- ============================================================================================
-- P19_finance_operation_authority.sql (PROPOSED ONLY: NOT APPLIED to Lovable Cloud, Live or any hosted DB).
-- Prepared 10 Nov 2026 (P0-038 row 13, Track A, owner decision KK: Option 1) for KK review. Tested only in isolated
-- PGlite: src/lib/p19-finance-operation-authority-sql.test.ts (applied schema, and the whole proposed stack P1..P18
-- followed by P19; catalog-exact rollback). Review: docs/security/p0-038/P19_REVIEW.md.
--
-- Finding (docs/security/p0-038/GUC_INVENTORY.md row 13): applied 0012 lets a client INSERT its own
-- public.finance_operations idempotency records when the session setting app.finance_owner = its uid, and applied 0015
-- lets public.receive_claim_receipt run whenever that setting is set. Any role can set a custom setting
-- (SET / set_config), so a signed-in client in plain SQL could
--   (a) forge an idempotency record: a later real money movement with that key returns the forged result as a replay
--       and saves nothing (P7 record_card_payment reads the same table), and
--   (b) call receive_claim_receipt outside the money-movement workflow (no idempotency key, no per-owner lock).
-- Both functions were SECURITY INVOKER, so any authority writer they could call was callable by the client too.
--
-- Fix (forward only; applied migration files are not edited):
--  A. public.finance_operation(text, jsonb) and public.receive_claim_receipt(uuid, numeric, date, uuid, text) become
--     SECURITY DEFINER with SET search_path = public, pg_temp; every table reference is schema-qualified. Same names,
--     signatures, return types and behaviour. EXECUTE: finance_operation for authenticated only (the app's only caller
--     is src/lib/store.tsx `supabase.rpc("finance_operation")` with the user's session); receive_claim_receipt for no
--     client or service role (only finance_operation calls it, as the function owner). When P4 is installed its
--     __unguarded copies get the same new bodies (without the assistant check, as before) and no EXECUTE grant.
--  B. app.finance_owner is gone: finance_operation writes a transaction-bound authority row (phase3_p19.authority:
--     transaction_id = txid_current(), actor_id = auth.uid()) right before its money branches and removes it before it
--     returns; receive_claim_receipt requires phase3_p19.authorised() (row for txid_current() AND auth.uid()). The
--     0012 policy that trusted the setting is dropped; clients lose INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on
--     public.finance_operations (anon loses everything) and RESTRICTIVE policies refuse any client-role write, so an
--     idempotency record is written only by the SECURITY DEFINER workflows (finance_operation, P7 record_card_payment).
--     The install refuses if any function or policy still reads app.finance_owner afterwards.
--  C. Strict idempotency: finance_operations.request_sha256 = sha256 of the canonical request
--     jsonb_build_object('action', action, 'payload', payload)::text (jsonb text is canonical: sorted keys, normalised
--     spacing). Same key + same request returns the stored result with replayed = true and makes no change; same key +
--     different request raises P19_IDEMPOTENCY_CONFLICT and makes no change. Records written before P19 (NULL hash)
--     replay as before. The per-owner advisory lock (pg_advisory_xact_lock(hashtextextended(uid::text, 0))) is still
--     taken before the record is read, and the (owner_id, operation_key) primary key still refuses a second record,
--     so concurrent identical requests serialise to one effect. Every failure raises, so the transaction (one RPC)
--     rolls back the effect, the record and the authority row together.
--  D. The original bodies (0011 + 0012 + 0015 replacements, and P4's inline assistant check when installed) are
--     re-implemented line by line. The install refuses unless the current bodies are exactly the reviewed ones (md5 of
--     prosrc), so an unreviewed hosted body is never replaced blindly.
--
-- Ownership predicates carried over (RLS no longer applies inside a definer function, so each is explicit):
--   All operations
--    P1  auth.uid() IS NOT NULL ('Sign in to continue').
--    P2  P4 (when installed): public.refuse_assistant_session(<function>) first, as P4's inline guard did; P4's
--        RESTRICTIVE assistant table policies no longer apply inside the definer, this check replaces them.
--    P3  finance_operations read/write only for owner_id = uid (was policy "Own finance operations").
--    P4  every public.expenses row written (INSERT ... RETURNING / UPDATE ... RETURNING) passes
--        phase3_p19.check_entry(row, uid): employee_id = uid; member_id NULL or a family_members row of uid
--        (policies "Own expenses: add" / "Own expenses: edit"); account_id and to_account_id NULL or accounts of
--        employee_id; every splits[].memberId a family member of employee_id; every receipts[].path under
--        employee_id/ (RESTRICTIVE "Expense linked records belong to owner"); public.can_access_entity(employee_id,
--        entity_id, true) (write access to the row's company; the 0075 entity rule, true for the owner).
--    P5  every public.loans row written passes phase3_p19.check_loan: owner_id = uid; account_id NULL or an account of
--        uid; source_transaction_id NULL or an entry of uid ("Own loans", RESTRICTIVE "Loan links belong to owner").
--    P6  every public.commitments row written passes phase3_p19.check_commitment: owner_id = uid; account_id NULL or
--        an account of uid ("Own commitments", RESTRICTIVE "Commitment account belongs to owner").
--    P7  public.accounts rows are written only with owner_id = uid ("Own accounts"); finance_preferences only for
--        owner_id = uid ("Own finance preferences").
--   claim_receipt / receive_claim_receipt (0015)
--    R1  only inside finance_operation's transaction: phase3_p19.authorised() (replaces app.finance_owner).
--    R2  the claim: expenses.id = expense_id AND employee_id = uid, locked FOR UPDATE; txn_type 'expense';
--        reimbursement_status 'pending'; stage not rejected / written_off.
--    R3  write access to the claim's company: public.can_access_entity(e.employee_id, e.entity_id, true).
--    R4  amount: finite, two decimals, > 0, <= outstanding claim (reimbursable or amount, minus receipts so far).
--    R5  date not NULL and not in the future.
--    R6  receipt account: accounts.id = receipt_account AND owner_id = uid AND NOT archived AND kind in savings,
--        current, cash, wallet.
--    R7  the receipt entry is appended to reimbursement.receipts (history kept); the claim UPDATE is limited to
--        id = e.id AND employee_id = uid.
--   reimbursement (0015)
--    B1  ids are the caller's: expenses WHERE id = ANY(ids) AND employee_id = uid ORDER BY id FOR UPDATE; every id
--        must exist for uid ('Claim not found'); each pending expense; each receipt through R1..R7.
--   commitment (0011 + 0012)
--    C1  commitments WHERE id AND owner_id = uid FOR UPDATE; active; next_due = expectedDue.
--    C2  amount > 0 and <= 10,00,00,000 (two decimals).
--    C3  payment account (payload or the schedule's) NULL or accounts of uid, not archived, kind savings, current,
--        cash, wallet or credit_card.
--    C4  the schedule UPDATE is limited to id = c.id AND owner_id = uid.
--   loan_payment (0011 + 0012)
--    L1  loans WHERE id AND owner_id = uid FOR UPDATE; active; next_due = expectedDue; account_id NOT NULL.
--    L2  the loan account is an account of uid (liability kinds loan / other_liability for a loan; the card for a card
--        EMI; for the card EMI this was enforced by RLS only and is now explicit).
--    L3  outstanding is computed only from entries of uid (0012's added predicate).
--    L4  paying account: accounts of uid, not archived, kind savings, current, cash or wallet.
--    L5  the loan UPDATE is limited to id = l.id AND owner_id = uid.
--   convert_emi (0011)
--    E1  expenses WHERE id AND employee_id = uid FOR UPDATE; txn_type 'expense'; on a credit_card account of uid.
--    E2  not already on EMI (now checked across all owners' loans: stricter than the RLS-filtered check).
--    E3  statement_day read only from that account of uid.
--   create_loan (0011)
--    N1  the liability account and the loan are created for uid; loan type never credit_card_emi.
--   confirm_irregular (0015)
--    I1  the commitment and the finance_preferences upsert are for uid.
--  Operation-level permission: 0011/0012/0015 and every later applied or proposed migration let only the record
--  owner run these operations (no team, entity-member or Finance-role path: every read is filtered to owner = uid);
--  P19 keeps exactly that. Period-close, P7 posting, P9/P10/P13/P14 guards are triggers and still run.
--
-- Order: install AFTER the applied migrations and after any of P1..P18 that will be installed (P4 changes the bodies
-- this file replaces). Roll back FIRST. Rollback: P19_finance_operation_authority.rollback.sql (exact previous
-- functions, grants, policy, table privileges; drops the request hash column and the phase3_p19 schema). The
-- rollback RE-OPENS row 13.
-- ============================================================================================
BEGIN;

DO $pre$
DECLARE f record; known text[];
BEGIN
  IF to_regnamespace('phase3_p19') IS NOT NULL THEN RAISE EXCEPTION 'P19 is already installed'; END IF;
  IF to_regprocedure('public.finance_operation(text,jsonb)') IS NULL OR to_regprocedure('public.receive_claim_receipt(uuid,numeric,date,uuid,text)') IS NULL
     OR to_regclass('public.finance_operations') IS NULL THEN
    RAISE EXCEPTION 'P19 requires the applied finance workflow (0011, 0012, 0015)';
  END IF;
  -- Only the reviewed bodies are replaced: applied 0015 (finance_operation, receive_claim_receipt and P4's
  -- __unguarded copies of them) and P4's inline-guarded versions.
  known := ARRAY['2b41516713c2b4af9280af5fe62379de', '771787b73ff077fc3c82ba86d23cd1e4', 'aaa77831feb99b7899f818eb9b257280', 'bdc47f3757c1ccc0469f6c18f6cffd6e'];
  FOR f IN SELECT p.oid::regprocedure::text sig, md5(p.prosrc) m, p.prosecdef FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('finance_operation', 'finance_operation__unguarded', 'receive_claim_receipt', 'receive_claim_receipt__unguarded') LOOP
    IF NOT f.m = ANY (known) OR f.prosecdef THEN
      RAISE EXCEPTION 'P19: % is not the reviewed body (md5 %); review the hosted definition before installing', f.sig, f.m;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.finance_operations'::regclass AND attname = 'request_sha256' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'P19: finance_operations.request_sha256 already exists';
  END IF;
END $pre$;

CREATE SCHEMA phase3_p19;
REVOKE ALL ON SCHEMA phase3_p19 FROM PUBLIC, anon, authenticated, service_role;

-- Saved for the rollback: every function this file replaces (definition and ACL), the table ACL.
CREATE TABLE phase3_p19.saved_functions (signature text PRIMARY KEY, definition text NOT NULL, prosrc_md5 text NOT NULL, acl aclitem[]);
CREATE TABLE phase3_p19.saved_table_acl (relation text PRIMARY KEY, acl aclitem[]);
INSERT INTO phase3_p19.saved_functions(signature, definition, prosrc_md5, acl)
  SELECT p.oid::regprocedure::text, pg_get_functiondef(p.oid), md5(p.prosrc), p.proacl FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('finance_operation', 'finance_operation__unguarded', 'receive_claim_receipt', 'receive_claim_receipt__unguarded');
INSERT INTO phase3_p19.saved_table_acl(relation, acl) SELECT 'public.finance_operations', relacl FROM pg_class WHERE oid = 'public.finance_operations'::regclass;
REVOKE ALL ON phase3_p19.saved_functions, phase3_p19.saved_table_acl FROM PUBLIC, anon, authenticated, service_role;

-- --------------------------------------------------------------------------------------------
-- B. Transaction-bound authority (replaces app.finance_owner)
-- --------------------------------------------------------------------------------------------
-- A row here is written only by public.finance_operation (SECURITY DEFINER) inside its own transaction, is checked as
-- transaction_id = txid_current() AND actor_id = auth.uid(), and is removed before finance_operation returns. A 64-bit
-- txid is never reused, so a row never authorises a later transaction; an error rolls the row back with the work. No
-- client or service role can use the schema, the table or the functions.
CREATE TABLE phase3_p19.authority (transaction_id bigint NOT NULL, scope text NOT NULL, actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY (transaction_id, scope));
REVOKE ALL ON phase3_p19.authority FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION phase3_p19.grant_authority(_scope text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO phase3_p19.authority(transaction_id, scope, actor_id) VALUES (txid_current(), _scope, auth.uid())
  ON CONFLICT (transaction_id, scope) DO UPDATE SET actor_id = EXCLUDED.actor_id, created_at = EXCLUDED.created_at
$$;
CREATE FUNCTION phase3_p19.end_authority(_scope text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM phase3_p19.authority WHERE transaction_id = txid_current() AND scope = _scope
$$;
CREATE FUNCTION phase3_p19.authorised(_scope text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM phase3_p19.authority a
    WHERE a.transaction_id = txid_current() AND a.scope = _scope AND a.actor_id = auth.uid())
$$;

-- Canonical request fingerprint for strict idempotency.
CREATE FUNCTION phase3_p19.request_sha(_action text, _payload jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT encode(sha256(convert_to(jsonb_build_object('action', _action, 'payload', _payload)::text, 'UTF8')), 'hex')
$$;

-- P4 (when installed): the same assistant refusal P4 injected inline into both functions.
DO $p4$
BEGIN
  IF to_regprocedure('public.refuse_assistant_session(text)') IS NOT NULL
     AND (SELECT prosrc FROM pg_proc WHERE oid = 'public.finance_operation(text,jsonb)'::regprocedure) LIKE '%PERFORM public.refuse_assistant_session(''finance_operation'');%' THEN
    EXECUTE $f$CREATE FUNCTION phase3_p19.refuse_assistant(_fn text) RETURNS void LANGUAGE plpgsql VOLATILE SET search_path = public, pg_temp AS $b$
BEGIN
  PERFORM public.refuse_assistant_session(_fn);
END $b$$f$;
  ELSE
    EXECUTE $f$CREATE FUNCTION phase3_p19.refuse_assistant(_fn text) RETURNS void LANGUAGE plpgsql VOLATILE SET search_path = public, pg_temp AS $b$
BEGIN
  RETURN; -- P4 is not installed: no assistant sessions exist
END $b$$f$;
  END IF;
END $p4$;

-- Ownership checks on every row the definer writes (RLS WITH CHECK, re-implemented; see the header list P4..P6).
CREATE FUNCTION phase3_p19.check_entry(_e public.expenses, _uid uuid) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF _uid IS NULL OR _e.employee_id IS DISTINCT FROM _uid
     OR (_e.member_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.family_members f WHERE f.id = _e.member_id AND f.owner_id = _uid))
     OR (_e.account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = _e.account_id AND a.owner_id = _e.employee_id))
     OR (_e.to_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = _e.to_account_id AND a.owner_id = _e.employee_id))
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_e.splits) = 'array' THEN _e.splits ELSE '[]'::jsonb END) s
                 WHERE s->>'memberId' IS NOT NULL
                   AND NOT EXISTS (SELECT 1 FROM public.family_members f WHERE f.id::text = s->>'memberId' AND f.owner_id = _e.employee_id))
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_e.receipts) = 'array' THEN _e.receipts ELSE '[]'::jsonb END) r
                 WHERE split_part(r->>'path', '/', 1) IS DISTINCT FROM _e.employee_id::text)
     OR NOT public.can_access_entity(_e.employee_id, _e.entity_id, true) THEN
    RAISE EXCEPTION 'P19_NOT_OWNER: the entry and its linked records must belong to you' USING ERRCODE = '42501';
  END IF;
END $$;
CREATE FUNCTION phase3_p19.check_loan(_l public.loans, _uid uuid) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF _uid IS NULL OR _l.owner_id IS DISTINCT FROM _uid
     OR (_l.account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = _l.account_id AND a.owner_id = _uid))
     OR (_l.source_transaction_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.expenses x WHERE x.id = _l.source_transaction_id AND x.employee_id = _uid)) THEN
    RAISE EXCEPTION 'P19_NOT_OWNER: the loan and its linked records must belong to you' USING ERRCODE = '42501';
  END IF;
END $$;
CREATE FUNCTION phase3_p19.check_commitment(_c public.commitments, _uid uuid) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF _uid IS NULL OR _c.owner_id IS DISTINCT FROM _uid
     OR (_c.account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = _c.account_id AND a.owner_id = _uid)) THEN
    RAISE EXCEPTION 'P19_NOT_OWNER: the payment schedule and its account must belong to you' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION phase3_p19.grant_authority(text), phase3_p19.end_authority(text), phase3_p19.authorised(text), phase3_p19.request_sha(text, jsonb),
  phase3_p19.refuse_assistant(text), phase3_p19.check_entry(public.expenses, uuid), phase3_p19.check_loan(public.loans, uuid),
  phase3_p19.check_commitment(public.commitments, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- --------------------------------------------------------------------------------------------
-- C. Idempotency records: written only by the definer workflows, bound to the canonical request
-- --------------------------------------------------------------------------------------------
ALTER TABLE public.finance_operations ADD COLUMN request_sha256 text;
DROP POLICY "Operations only recorded by finance workflow" ON public.finance_operations;
REVOKE ALL ON public.finance_operations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.finance_operations FROM authenticated;
CREATE POLICY "P19 operations recorded only by the finance workflow" ON public.finance_operations AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "P19 operation records cannot be changed" ON public.finance_operations AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "P19 operation records cannot be deleted" ON public.finance_operations AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- --------------------------------------------------------------------------------------------
-- A. The claim receipt step (0015), definer, callable only inside finance_operation
-- --------------------------------------------------------------------------------------------
DO $rcpt$
DECLARE body text; sig text;
BEGIN
  body := $body$
DECLARE uid uuid := auth.uid(); e public.expenses%ROWTYPE; w public.expenses%ROWTYPE; claim numeric; got numeric; remaining numeric; tid uuid; info jsonb;
BEGIN
 /*P4*/
 IF uid IS NULL OR NOT phase3_p19.authorised('finance_operation') THEN RAISE EXCEPTION 'Use the payment workflow' USING ERRCODE = '42501'; END IF;
 SELECT * INTO e FROM public.expenses x WHERE x.id = expense_id AND x.employee_id = uid FOR UPDATE;
 IF NOT FOUND OR e.txn_type <> 'expense' OR e.reimbursement_status <> 'pending' OR e.reimbursement->>'stage' IN ('rejected', 'written_off') THEN RAISE EXCEPTION 'This claim is no longer pending'; END IF;
 IF NOT public.can_access_entity(e.employee_id, e.entity_id, true) THEN RAISE EXCEPTION 'This claim is no longer pending'; END IF;
 claim := least(e.amount, COALESCE((e.reimbursement->>'reimbursable')::numeric, e.amount));
 SELECT COALESCE(sum((r->>'amount')::numeric), 0) INTO got FROM jsonb_array_elements(COALESCE(e.reimbursement->'receipts', '[]'::jsonb)) r;
 remaining := round(claim - got, 2);
 IF receipt_amount IS NULL OR receipt_amount::text IN ('NaN', 'Infinity', '-Infinity') OR receipt_amount <> round(receipt_amount, 2) OR receipt_amount <= 0 OR receipt_amount > remaining THEN
  RAISE EXCEPTION 'Receipt must be positive and no more than the outstanding claim (%)', remaining;
 END IF;
 IF receipt_date IS NULL OR receipt_date > current_date THEN RAISE EXCEPTION 'Choose a valid payment date, not in the future'; END IF;
 IF receipt_account IS NULL OR NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = receipt_account AND a.owner_id = uid AND NOT a.archived AND a.kind IN ('savings', 'current', 'cash', 'wallet')) THEN
  RAISE EXCEPTION 'Choose a cash or bank account';
 END IF;
 INSERT INTO public.expenses(employee_id, title, merchant, category, scope, member_id, amount, original_amount, currency, fx_rate, fx_date, expense_date, payment_method, txn_type, account_id, description)
 VALUES (uid, left('Reimbursement: ' || e.title, 200), nullif(e.reimbursement->>'payer', ''), e.category, e.scope, e.member_id, receipt_amount, receipt_amount, 'INR', 1, receipt_date, receipt_date,
         'bank_transfer', 'reimbursement', receipt_account, COALESCE(receipt_note, '')) RETURNING * INTO w;
 PERFORM phase3_p19.check_entry(w, uid);
 tid := w.id;
 info := e.reimbursement || jsonb_build_object('receipts', COALESCE(e.reimbursement->'receipts', '[]'::jsonb)
   || jsonb_build_array(jsonb_build_object('id', tid, 'txnId', tid, 'date', receipt_date, 'amount', receipt_amount, 'note', COALESCE(receipt_note, ''))));
 UPDATE public.expenses x SET reimbursement = info, reimbursement_status = CASE WHEN got + receipt_amount >= claim THEN 'received' ELSE 'pending' END
  WHERE x.id = e.id AND x.employee_id = uid RETURNING * INTO w;
 IF NOT FOUND THEN RAISE EXCEPTION 'This claim is no longer pending'; END IF;
 PERFORM phase3_p19.check_entry(w, uid);
 RETURN jsonb_build_object('id', tid, 'amount', receipt_amount);
END
$body$;
  FOREACH sig IN ARRAY ARRAY['receive_claim_receipt', 'receive_claim_receipt__unguarded'] LOOP
    IF to_regprocedure(format('public.%I(uuid,numeric,date,uuid,text)', sig)) IS NOT NULL THEN
      EXECUTE format($c$CREATE OR REPLACE FUNCTION public.%I(expense_id uuid, receipt_amount numeric, receipt_date date, receipt_account uuid, receipt_note text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS %L$c$, sig,
        replace(body, '/*P4*/', CASE WHEN sig = 'receive_claim_receipt' THEN 'PERFORM phase3_p19.refuse_assistant(''receive_claim_receipt'');' ELSE '-- (P4 copy: no assistant check, as before)' END));
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(uuid,numeric,date,uuid,text) FROM PUBLIC, anon, authenticated, service_role', sig);
    END IF;
  END LOOP;
END $rcpt$;

-- --------------------------------------------------------------------------------------------
-- A + B + C. The money-movement entry point (0011 + 0012 + 0015), definer
-- --------------------------------------------------------------------------------------------
DO $fo$
DECLARE body text; sig text;
BEGIN
  body := $body$
DECLARE
 uid uuid := auth.uid(); key text; sha text; done public.finance_operations%ROWTYPE; prior jsonb; result jsonb; aid uuid; lid uuid; tid uuid; from_id uuid; on_date date;
 c public.commitments%ROWTYPE; l public.loans%ROWTYPE; e public.expenses%ROWTYPE; w public.expenses%ROWTYPE; acc public.accounts%ROWTYPE;
 total numeric; principal numeric; interest numeric; outstanding numeric; rate numeric; months integer; fee numeric; next_date date; ids uuid[]; cnt integer; v numeric;
BEGIN
 /*P4*/
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to continue'; END IF;
 IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN RAISE EXCEPTION 'Missing operation identifier'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
 on_date := COALESCE((payload->>'date')::date, current_date);
 IF on_date > current_date THEN RAISE EXCEPTION 'Payment date cannot be in the future'; END IF;
 IF action = 'commitment' THEN key := 'commitment:' || (payload->>'id') || ':' || (payload->>'expectedDue');
 ELSIF action = 'loan_payment' THEN key := 'loan:' || (payload->>'id') || ':' || (payload->>'expectedDue');
 ELSIF action = 'convert_emi' THEN key := 'emi:' || (payload->>'id');
 ELSE key := action || ':' || (payload->>'operationId'); END IF;
 IF key IS NULL OR length(key) > 250 OR (action NOT IN ('commitment', 'loan_payment', 'convert_emi') AND nullif(trim(payload->>'operationId'), '') IS NULL) THEN
  RAISE EXCEPTION 'Missing operation identifier';
 END IF;
 sha := phase3_p19.request_sha(action, payload);
 SELECT * INTO done FROM public.finance_operations o WHERE o.owner_id = uid AND o.operation_key = key;
 IF FOUND THEN
  IF done.request_sha256 IS NOT NULL AND done.request_sha256 <> sha THEN
   RAISE EXCEPTION 'P19_IDEMPOTENCY_CONFLICT: this operation id was already used for a different request; nothing was saved' USING ERRCODE = '22023';
  END IF;
  RETURN done.result || jsonb_build_object('replayed', true);
 END IF;

 PERFORM phase3_p19.grant_authority('finance_operation');
 IF action = 'claim_receipt' THEN
  result := public.receive_claim_receipt((payload->>'id')::uuid, (payload->>'amount')::numeric, on_date, (payload->>'accountId')::uuid, payload->>'note');

 ELSIF action = 'reimbursement' THEN
  SELECT array_agg(DISTINCT x::uuid) INTO ids FROM jsonb_array_elements_text(payload->'ids') x;
  IF COALESCE(array_length(ids, 1), 0) = 0 THEN RAISE EXCEPTION 'Select pending expenses'; END IF;
  total := 0; result := '{"receipts":[]}'::jsonb;
  FOR e IN SELECT * FROM public.expenses x WHERE x.id = ANY(ids) AND x.employee_id = uid ORDER BY x.id FOR UPDATE LOOP
   IF e.txn_type <> 'expense' OR e.reimbursement_status <> 'pending' THEN RAISE EXCEPTION 'An expense is no longer pending'; END IF;
   SELECT least(e.amount, COALESCE((e.reimbursement->>'reimbursable')::numeric, e.amount)) - COALESCE(sum((r->>'amount')::numeric), 0) INTO outstanding
     FROM jsonb_array_elements(COALESCE(e.reimbursement->'receipts', '[]'::jsonb)) r;
   prior := public.receive_claim_receipt(e.id, round(outstanding, 2), on_date, (payload->>'accountId')::uuid, 'Remaining claim received');
   total := total + outstanding;
   result := jsonb_set(result, '{receipts}', (result->'receipts') || jsonb_build_array(prior));
  END LOOP;
  IF (SELECT count(*) FROM public.expenses x WHERE x.id = ANY(ids) AND x.employee_id = uid) <> array_length(ids, 1) THEN RAISE EXCEPTION 'Claim not found'; END IF;
  result := result || jsonb_build_object('amount', total);

 ELSIF action = 'confirm_irregular' THEN
  IF nullif(trim(payload->>'candidateKey'), '') IS NULL OR nullif(trim(payload->>'name'), '') IS NULL THEN RAISE EXCEPTION 'Choose a bill'; END IF;
  total := (payload->>'amount')::numeric; next_date := (payload->>'nextDue')::date;
  IF total IS NULL OR total <= 0 OR total::text IN ('NaN', 'Infinity', '-Infinity') OR total > 100000000 OR next_date IS NULL OR payload->>'frequency' NOT IN ('yearly', 'half_yearly') THEN
   RAISE EXCEPTION 'Enter a valid amount, due date and frequency';
  END IF;
  INSERT INTO public.commitments(owner_id, name, kind, direction, amount, frequency, next_due, category, confirmed, essential, status)
  VALUES (uid, trim(payload->>'name'), COALESCE(payload->>'kind', 'other'), 'out', total, payload->>'frequency', next_date, payload->>'category', true, true, 'active') RETURNING * INTO c;
  PERFORM phase3_p19.check_commitment(c, uid);
  tid := c.id;
  INSERT INTO public.finance_preferences(owner_id, data) VALUES (uid, jsonb_build_object('irregularConfirmed', jsonb_build_array(payload->>'candidateKey')))
  ON CONFLICT (owner_id) DO UPDATE SET data = jsonb_set(public.finance_preferences.data, '{irregularConfirmed}',
    COALESCE(public.finance_preferences.data->'irregularConfirmed', '[]'::jsonb) || jsonb_build_array(payload->>'candidateKey')), updated_at = now()
  WHERE public.finance_preferences.owner_id = uid;
  result := jsonb_build_object('id', tid, 'amount', total);

 ELSIF action = 'commitment' THEN
  SELECT * INTO c FROM public.commitments x WHERE x.id = (payload->>'id')::uuid AND x.owner_id = uid FOR UPDATE;
  IF NOT FOUND OR c.status <> 'active' OR c.next_due IS DISTINCT FROM (payload->>'expectedDue')::date THEN RAISE EXCEPTION 'This payment schedule changed — refresh first'; END IF;
  total := round((payload->>'amount')::numeric, 2);
  IF total IS NULL OR total <= 0 OR total > 100000000 THEN RAISE EXCEPTION 'Enter a positive amount'; END IF;
  aid := COALESCE((payload->>'accountId')::uuid, c.account_id);
  IF aid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = aid AND a.owner_id = uid AND NOT a.archived AND a.kind IN ('savings', 'current', 'cash', 'wallet', 'credit_card')) THEN
   RAISE EXCEPTION 'Choose an active payment account';
  END IF;
  INSERT INTO public.expenses(employee_id, title, merchant, category, amount, original_amount, currency, fx_rate, fx_date, expense_date, payment_method, txn_type, account_id, description)
   VALUES (uid, c.name, c.name, c.category, total, total, 'INR', 1, on_date, on_date, 'bank_transfer', CASE WHEN c.direction = 'in' THEN 'income' ELSE 'expense' END, aid, 'Scheduled occurrence: ' || c.next_due)
   RETURNING * INTO w;
  PERFORM phase3_p19.check_entry(w, uid);
  tid := w.id;
  next_date := CASE c.frequency WHEN 'once' THEN c.next_due WHEN 'daily' THEN c.next_due + 1 WHEN 'weekly' THEN c.next_due + 7 WHEN 'monthly' THEN (c.next_due + interval '1 month')::date
    WHEN 'quarterly' THEN (c.next_due + interval '3 months')::date WHEN 'half_yearly' THEN (c.next_due + interval '6 months')::date WHEN 'yearly' THEN (c.next_due + interval '1 year')::date
    ELSE c.next_due + greatest(1, COALESCE(c.interval_days, 30)) END;
  UPDATE public.commitments x SET next_due = next_date, status = CASE WHEN c.frequency = 'once' THEN 'completed' ELSE 'active' END
   WHERE x.id = c.id AND x.owner_id = uid RETURNING * INTO c;
  IF NOT FOUND THEN RAISE EXCEPTION 'This payment schedule changed — refresh first'; END IF;
  PERFORM phase3_p19.check_commitment(c, uid);
  result := jsonb_build_object('id', tid, 'amount', total);

 ELSIF action = 'loan_payment' THEN
  SELECT * INTO l FROM public.loans x WHERE x.id = (payload->>'id')::uuid AND x.owner_id = uid FOR UPDATE;
  IF NOT FOUND OR l.status <> 'active' OR l.next_due IS DISTINCT FROM (payload->>'expectedDue')::date THEN RAISE EXCEPTION 'Loan changed — refresh before recording payment'; END IF;
  IF l.account_id IS NULL THEN RAISE EXCEPTION 'Missing loan account'; END IF;
  IF l.loan_type = 'credit_card_emi' THEN
   IF NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = l.account_id AND a.owner_id = uid) THEN RAISE EXCEPTION 'Missing loan account'; END IF;
   outstanding := l.principal_outstanding;
  ELSE
   SELECT a.opening_balance INTO outstanding FROM public.accounts a WHERE a.id = l.account_id AND a.owner_id = uid AND a.kind IN ('loan', 'other_liability');
   IF NOT FOUND THEN RAISE EXCEPTION 'Missing loan liability account'; END IF;
   SELECT outstanding + COALESCE(sum(CASE WHEN x.account_id = l.account_id THEN CASE WHEN x.txn_type IN ('expense', 'transfer') THEN x.amount WHEN x.txn_type = 'adjustment' THEN x.amount * x.adjustment_sign ELSE -x.amount END
     WHEN x.txn_type = 'transfer' AND x.to_account_id = l.account_id THEN -x.amount ELSE 0 END), 0) INTO outstanding
     FROM public.expenses x WHERE x.employee_id = uid AND (x.account_id = l.account_id OR x.to_account_id = l.account_id);
  END IF;
  interest := COALESCE((payload->>'interest')::numeric, round(outstanding * l.annual_rate / 1200, 2));
  principal := COALESCE((payload->>'principal')::numeric, least(outstanding, greatest(0, l.emi - interest)));
  principal := round(principal, 2); interest := round(interest, 2);
  IF principal < 0 OR interest < 0 OR principal + interest <= 0 OR principal > outstanding OR principal + interest > 100000000 THEN RAISE EXCEPTION 'Invalid principal or interest payment'; END IF;
  IF l.loan_type <> 'credit_card_emi' THEN
   from_id := (payload->>'fromAccountId')::uuid;
   IF from_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = from_id AND a.owner_id = uid AND NOT a.archived AND a.kind IN ('savings', 'current', 'cash', 'wallet')) THEN
    RAISE EXCEPTION 'Choose the bank or cash account used to pay';
   END IF;
   IF principal > 0 THEN
    INSERT INTO public.expenses(employee_id, title, category, amount, original_amount, currency, fx_rate, fx_date, expense_date, payment_method, txn_type, account_id, to_account_id)
    VALUES (uid, l.name || ' — principal', 'Loan repayment', principal, principal, 'INR', 1, on_date, on_date, 'bank_transfer', 'transfer', from_id, l.account_id) RETURNING * INTO w;
    PERFORM phase3_p19.check_entry(w, uid);
   END IF;
  ELSE from_id := l.account_id; END IF;
  IF interest > 0 THEN
   INSERT INTO public.expenses(employee_id, title, category, amount, original_amount, currency, fx_rate, fx_date, expense_date, payment_method, txn_type, account_id)
   VALUES (uid, l.name || ' — interest', 'Financial charges', interest, interest, 'INR', 1, on_date, on_date, CASE WHEN l.loan_type = 'credit_card_emi' THEN 'credit_card' ELSE 'bank_transfer' END, 'expense', from_id)
   RETURNING * INTO w;
   PERFORM phase3_p19.check_entry(w, uid);
  END IF;
  UPDATE public.loans x SET payments = x.payments || jsonb_build_array(jsonb_build_object('date', on_date, 'principal', principal, 'interest', interest, 'total', principal + interest)),
    principal_outstanding = greatest(0, outstanding - principal), next_due = (x.next_due + interval '1 month')::date,
    status = CASE WHEN outstanding - principal <= 0.01 THEN 'closed' ELSE 'active' END
   WHERE x.id = l.id AND x.owner_id = uid RETURNING * INTO l;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan changed — refresh before recording payment'; END IF;
  PERFORM phase3_p19.check_loan(l, uid);
  result := jsonb_build_object('id', l.id, 'principal', principal, 'interest', interest);

 ELSIF action = 'convert_emi' THEN
  SELECT * INTO e FROM public.expenses x WHERE x.id = (payload->>'id')::uuid AND x.employee_id = uid FOR UPDATE;
  IF NOT FOUND OR e.txn_type <> 'expense' OR NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = e.account_id AND a.owner_id = uid AND a.kind = 'credit_card') THEN
   RAISE EXCEPTION 'Select a purchase on your credit card';
  END IF;
  IF EXISTS (SELECT 1 FROM public.loans x WHERE x.source_transaction_id = e.id AND x.loan_type = 'credit_card_emi') THEN RAISE EXCEPTION 'This purchase is already on EMI'; END IF;
  months := (payload->>'months')::integer; rate := (payload->>'rate')::numeric; fee := round((payload->>'fee')::numeric, 2);
  IF months IS NULL OR months < 2 OR months > 60 OR rate IS NULL OR rate < 0 OR rate > 60 OR fee IS NULL OR fee < 0 OR fee > 100000000 THEN RAISE EXCEPTION 'Enter a valid EMI term, rate and fee'; END IF;
  v := rate / 1200;
  total := round(CASE WHEN v = 0 THEN e.amount / months ELSE e.amount * v * power(1 + v, months) / (power(1 + v, months) - 1) END, 2);
  next_date := (on_date + interval '1 month')::date;
  SELECT a.statement_day INTO cnt FROM public.accounts a WHERE a.id = e.account_id AND a.owner_id = uid;
  IF cnt IS NOT NULL THEN
   next_date := (date_trunc('month', on_date) + interval '1 month')::date + least(cnt, extract(day FROM (date_trunc('month', on_date) + interval '2 months-1 day'))::integer) - 1;
  END IF;
  INSERT INTO public.loans(owner_id, name, provider, loan_type, principal_outstanding, original_principal, annual_rate, emi, next_due, start_date, account_id, source_transaction_id, prepayment_terms)
  VALUES (uid, e.title || ' EMI', COALESCE(e.merchant, ''), 'credit_card_emi', e.amount, e.amount, rate, total, next_date, on_date, e.account_id, e.id, months || '-month card EMI') RETURNING * INTO l;
  PERFORM phase3_p19.check_loan(l, uid);
  lid := l.id;
  IF fee > 0 THEN
   INSERT INTO public.expenses(employee_id, title, category, amount, original_amount, currency, fx_rate, fx_date, expense_date, payment_method, txn_type, account_id, scope)
   VALUES (uid, e.title || ' — EMI processing fee', 'Financial charges', fee, fee, 'INR', 1, on_date, on_date, 'credit_card', 'expense', e.account_id, e.scope) RETURNING * INTO w;
   PERFORM phase3_p19.check_entry(w, uid);
  END IF;
  result := jsonb_build_object('id', lid, 'emi', total);

 ELSIF action = 'create_loan' THEN
  principal := round((payload->>'principal')::numeric, 2); total := round((payload->>'emi')::numeric, 2); rate := (payload->>'rate')::numeric;
  IF principal IS NULL OR principal <= 0 OR total IS NULL OR total <= 0 OR rate IS NULL OR rate < 0 OR rate > 60 OR nullif(trim(payload->>'name'), '') IS NULL THEN RAISE EXCEPTION 'Enter valid loan details'; END IF;
  IF payload->>'loanType' = 'credit_card_emi' THEN RAISE EXCEPTION 'Convert a card purchase to EMI instead'; END IF;
  INSERT INTO public.accounts(owner_id, name, kind, opening_balance, issuer, interest_rate)
  VALUES (uid, trim(payload->>'name'), CASE WHEN payload->>'loanType' = 'borrowing' THEN 'other_liability' ELSE 'loan' END, principal, COALESCE(payload->>'provider', ''), rate) RETURNING * INTO acc;
  IF acc.owner_id IS DISTINCT FROM uid THEN RAISE EXCEPTION 'P19_NOT_OWNER: the account must belong to you' USING ERRCODE = '42501'; END IF;
  aid := acc.id;
  INSERT INTO public.loans(owner_id, name, principal_outstanding, annual_rate, emi, next_due, provider, loan_type, original_principal, start_date, prepayment_terms, foreclosure_pct, account_id)
  VALUES (uid, trim(payload->>'name'), principal, rate, total, (payload->>'nextDue')::date, COALESCE(payload->>'provider', ''), COALESCE(payload->>'loanType', 'personal'),
    COALESCE((payload->>'original')::numeric, principal), (payload->>'startDate')::date, COALESCE(payload->>'prepaymentTerms', ''), COALESCE((payload->>'foreclosurePct')::numeric, 0), aid) RETURNING * INTO l;
  PERFORM phase3_p19.check_loan(l, uid);
  result := jsonb_build_object('id', l.id);
 ELSE RAISE EXCEPTION 'Unknown operation'; END IF;

 INSERT INTO public.finance_operations(owner_id, operation_key, result, request_sha256) VALUES (uid, key, result, sha);
 PERFORM phase3_p19.end_authority('finance_operation');
 RETURN result;
END
$body$;
  FOREACH sig IN ARRAY ARRAY['finance_operation', 'finance_operation__unguarded'] LOOP
    IF to_regprocedure(format('public.%I(text,jsonb)', sig)) IS NOT NULL THEN
      EXECUTE format($c$CREATE OR REPLACE FUNCTION public.%I(action text, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS %L$c$, sig,
        replace(body, '/*P4*/', CASE WHEN sig = 'finance_operation' THEN 'PERFORM phase3_p19.refuse_assistant(''finance_operation'');' ELSE '-- (P4 copy: no assistant check, as before)' END));
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(text,jsonb) FROM PUBLIC, anon, authenticated, service_role', sig);
    END IF;
  END LOOP;
  GRANT EXECUTE ON FUNCTION public.finance_operation(text, jsonb) TO authenticated; -- the app's only caller (store.tsx, user session)
END $fo$;

DO $post$
BEGIN
  -- No installed function or policy may still trust the client-settable setting.
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND p.prosrc LIKE '%app.finance_owner%') THEN
    RAISE EXCEPTION 'P19: a function still reads or sets app.finance_owner';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE coalesce(qual, '') LIKE '%app.finance_owner%' OR coalesce(with_check, '') LIKE '%app.finance_owner%') THEN
    RAISE EXCEPTION 'P19: a policy still reads app.finance_owner';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname IN ('finance_operation', 'finance_operation__unguarded', 'receive_claim_receipt', 'receive_claim_receipt__unguarded')
              AND (NOT p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp'])) THEN
    RAISE EXCEPTION 'P19: a finance workflow function is not SECURITY DEFINER with a pinned search_path';
  END IF;
  IF has_function_privilege('anon', 'public.finance_operation(text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.receive_claim_receipt(uuid,numeric,date,uuid,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.receive_claim_receipt(uuid,numeric,date,uuid,text)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.finance_operations', 'INSERT') OR has_table_privilege('authenticated', 'public.finance_operations', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.finance_operations', 'DELETE') THEN
    RAISE EXCEPTION 'P19: unexpected client privilege on the finance workflow';
  END IF;
END $post$;
COMMIT;
