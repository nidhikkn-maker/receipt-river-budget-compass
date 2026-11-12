-- ============================================================================================
-- P20_claim_receipt_correction.sql (PROPOSED ONLY: NOT APPLIED to Lovable Cloud, Live or any hosted DB).
-- Prepared 11 Nov 2026 (Track A) for KK review. Tested only in isolated PGlite:
-- src/lib/p20-claim-receipt-correction-sql.test.ts (applied schema + P19, and the whole proposed stack P1..P19,
-- each followed by P20; rollback restores the previous catalog except the retained read-only audit trail; re-install).
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
--       reason, actor, operation key, time); readable by the owner only, written only by this workflow (K8).
--   The money-back entry rr itself is never changed: the correction only changes how much of it this claim cites.
--
-- K8 the audit trail survives its claim (lead ruling 11 Nov 2026, transaction_audit precedent, 0009): claim_id is a plain
--    uuid (indexed), NOT a foreign key, so deleting a claim row never removes its corrections. Signed-in deletes of a
--    corrected claim (the 0002 "Own expenses: delete" and 0066 "Team expenses: delete" policies while P10/P13 are not
--    installed), operator deletes and statement undo of never-posted rows all leave the corrections in place.
--    phase3_p20_audit.guard() refuses every UPDATE and TRUNCATE, refuses INSERT except inside the finance workflow
--    (P19 authority row), and refuses DELETE except:
--      E1 confirmed erasure of the caller's own data: the row's owner_id = auth.uid() AND the erasure is authorised
--         (phase3_p18.erasure_authorised() when P18 is installed; otherwise ledgerline.erasing = 'on', exactly as the
--         P10/P13/P15 guards read it before P18). The read follows the P18 rewrite pattern exactly: installed before
--         P18, removal_allowed() reads the setting and P18's install rewrites it (saving the original for P18's
--         rollback); installed or re-installed after P18, P20 applies the same rewrite itself and saves the original in
--         phase3_p18.saved_functions, so no installed function reads ledgerline.erasing once P18 is in place. delete_my_finance_data (applied 0058 / P1 / P18 wrapper; not edited)
--         does not know this table, so phase3_p20_audit.follow_erasure() (AFTER DELETE ... FOR EACH STATEMENT on
--         public.expenses; every erasure body deletes the caller's expenses) removes ALL of the caller's corrections in
--         that statement under the same E1 condition; outside E1 it does nothing.
--      E2 the service / operator path (no auth.uid(), not the anon/authenticated role) for an anonymous demo guest
--         (public.demo_sessions row AND auth.users.is_anonymous): the hourly demo cleanup
--         (src/routes/api/public/jobs/cleanup-demos.ts, steps in src/lib/demo-cleanup.ts) deletes the guest's corrections
--         by owner_id. service_role holds SELECT and DELETE (RLS: guest rows only); any other owner's row is refused.
--    These guards stop DML only. The table owner / a superuser can still change or bypass them with DDL (ALTER TABLE ...
--    DISABLE TRIGGER, DROP TABLE/TRIGGER/POLICY) or session_replication_role = replica; that is outside what SQL inside
--    this database can prevent. FORCE ROW LEVEL SECURITY is NOT set: the SECURITY DEFINER workflow writes as the table
--    owner, and forcing RLS would need owner policies that add nothing over the guard trigger.
--
-- Install AFTER P19 (needs phase3_p19 and P19's reviewed finance_operation bodies, checked by md5). Roll back P20
-- FIRST: P20_claim_receipt_correction.rollback.sql restores the saved finance_operation definitions, drops the
-- function and the phase3_p20 schema, and RETAINS the audit table read-only together with phase3_p20_audit (guard and
-- erasure follow-up) and a phase3_p20_retained record of the rollback (table oid, owner, row count, content md5).
-- While retained, every DELETE statement on the trail runs phase3_p20_audit.track_retained (definer, AFTER DELETE
-- statement trigger with the deleted rows as a transition table). It rebuilds the rows as they were just before that
-- statement (remaining + deleted) and refreshes the record to the remaining rows ONLY if that pre-delete content matches
-- the record exactly and both guard triggers are enabled ('O'). Otherwise (rows changed around the guards, e.g. with
-- triggers disabled, or the guards are not enabled now) it marks the record stale, and a stale record is never
-- refreshed again, so a later permitted E1/E2 delete cannot fold a tampered row into a fresh md5 and re-install refuses.
-- Re-install after a rollback is supported: the retained table is adopted only if it is the same table (oid and owner
-- recorded by the rollback), its rows still match the recorded row count and content md5 (any change made around the
-- guards, e.g. with triggers disabled, is refused), with exactly the P20 shape (columns, types incl. numeric(14,2), NOT NULL, defaults, every
-- CHECK / PRIMARY KEY / UNIQUE (owner_id, operation_key), no foreign key) and only P20's triggers, policies and grants;
-- its rows are kept and new corrections append.
-- When applied, classify public.claim_receipt_corrections in backup-schema.ts (excluded: audit history, like
-- transaction_audit).
-- ============================================================================================
BEGIN;

DO $pre$
DECLARE f record; t oid := to_regclass('public.claim_receipt_corrections'); r record;
BEGIN
  IF to_regnamespace('phase3_p20') IS NOT NULL THEN RAISE EXCEPTION 'P20 is already installed'; END IF;
  IF to_regnamespace('phase3_p19') IS NULL THEN RAISE EXCEPTION 'P20 requires P19 (finance operation authority)'; END IF;
  -- An existing audit table (or audit guard schema) is accepted only as the trail a P20 rollback retained AND recorded:
  -- the same table (oid) with the same owner, and the guard schemas owned by that owner (shape checked below).
  IF t IS NOT NULL OR to_regnamespace('phase3_p20_audit') IS NOT NULL THEN
    IF to_regclass('phase3_p20_retained.rollback') IS NULL THEN
      RAISE EXCEPTION 'P20: public.claim_receipt_corrections exists but is not an audit trail retained by a P20 rollback';
    END IF;
    SELECT * INTO r FROM phase3_p20_retained.rollback;
    IF (SELECT count(*) FROM phase3_p20_retained.rollback) <> 1 OR t IS DISTINCT FROM r.table_oid
       OR (SELECT c.relowner FROM pg_class c WHERE c.oid = t) IS DISTINCT FROM r.table_owner
       OR (SELECT n.nspowner FROM pg_namespace n WHERE n.nspname = 'phase3_p20_audit') IS DISTINCT FROM r.table_owner
       OR (SELECT n.nspowner FROM pg_namespace n WHERE n.nspname = 'phase3_p20_retained') IS DISTINCT FROM r.table_owner THEN
      RAISE EXCEPTION 'P20: public.claim_receipt_corrections is not the audit trail the P20 rollback retained (table or owner changed)';
    END IF;
    -- The retained rows must be exactly the rows the rollback recorded (kept current by permitted E1/E2 deletes).
    IF (SELECT count(*) FROM public.claim_receipt_corrections) IS DISTINCT FROM r.rows
       OR (SELECT md5(coalesce(string_agg(c::text, E'\n' ORDER BY c.id), '')) FROM public.claim_receipt_corrections c) IS DISTINCT FROM r.content_md5 THEN
      RAISE EXCEPTION 'P20: the retained audit rows changed since the P20 rollback (recorded % rows, md5 %); review before re-installing', r.rows, r.content_md5;
    END IF;
  END IF;
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

-- K7 audit trail (kept, with its rows, when re-installing after a rollback). K8: claim_id is NOT a foreign key.
-- The same definition also builds phase3_p20.shape_reference, the exact shape a retained table must still have.
DO $ddl$
DECLARE ddl constant text := $t$CREATE TABLE IF NOT EXISTS %s (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  claim_id uuid NOT NULL,
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
)$t$;
BEGIN
  EXECUTE format(ddl, 'public.claim_receipt_corrections');
  EXECUTE format(ddl, 'phase3_p20.shape_reference');
END $ddl$;
-- Columns (type with typmod, NOT NULL, default), every constraint definition (PK, UNIQUE, CHECKs; a foreign key would
-- show here and be refused), plain permanent table, no inheritance, no rules.
CREATE FUNCTION phase3_p20.shape(_t regclass) RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT concat_ws(E'\n',
    (SELECT string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
        || coalesce(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), ''), ', ' ORDER BY a.attnum)
       FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = _t AND a.attnum > 0 AND NOT a.attisdropped),
    (SELECT string_agg(x.def, '; ' ORDER BY x.def) FROM (SELECT c.contype::text || ' ' || pg_get_constraintdef(c.oid) def FROM pg_constraint c WHERE c.conrelid = _t) x),
    (SELECT c.relkind::text || c.relpersistence::text || c.relispartition::text FROM pg_class c WHERE c.oid = _t),
    (SELECT 'inherits ' || count(*) FROM pg_inherits i WHERE i.inhrelid = _t OR i.inhparent = _t),
    (SELECT 'rules ' || count(*) FROM pg_rewrite w WHERE w.ev_class = _t))
$$;
DO $shape$
DECLARE t constant regclass := 'public.claim_receipt_corrections'::regclass;
BEGIN
  IF phase3_p20.shape(t) IS DISTINCT FROM phase3_p20.shape('phase3_p20.shape_reference'::regclass) THEN
    RAISE EXCEPTION 'P20: public.claim_receipt_corrections does not have the P20 audit shape';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = t AND NOT g.tgisinternal
              AND NOT ((g.tgname IN ('claim_receipt_corrections_guard', 'claim_receipt_corrections_no_truncate')
                        AND g.tgfoid = to_regprocedure('phase3_p20_audit.guard()'))
                    OR (g.tgname = 'claim_receipt_corrections_retained_record' AND g.tgfoid = to_regprocedure('phase3_p20_audit.track_retained()'))))
     OR EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = t AND p.polname NOT IN ('Owner reads claim receipt corrections',
              'P20 corrections recorded only by the finance workflow', 'P20 corrections cannot be changed', 'P20 corrections cannot be deleted',
              'P20 service reads claim receipt corrections', 'P20 demo cleanup removes guest corrections')) THEN
    RAISE EXCEPTION 'P20: public.claim_receipt_corrections has triggers or policies P20 did not create';
  END IF;
  IF obj_description(t, 'pg_class') IS NOT NULL THEN
    EXECUTE format('COMMENT ON TABLE public.claim_receipt_corrections IS %L', obj_description(t, 'pg_class')
      || format('; P20 re-installed %s: earlier rows kept, new corrections append', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
  END IF;
END $shape$;
DROP FUNCTION phase3_p20.shape(regclass);
DROP TABLE phase3_p20.shape_reference;
-- The retained trail is adopted: its rollback record goes (the table, its rows and phase3_p20_audit stay).
DO $adopt$
BEGIN
  IF to_regnamespace('phase3_p20_retained') IS NOT NULL THEN
    DROP TABLE phase3_p20_retained.rollback;
    DROP SCHEMA phase3_p20_retained RESTRICT;
  END IF;
END $adopt$;
CREATE INDEX IF NOT EXISTS claim_receipt_corrections_claim ON public.claim_receipt_corrections(claim_id, created_at);

-- K8 guards (kept by the rollback, so a retained trail keeps them)
CREATE SCHEMA IF NOT EXISTS phase3_p20_audit;
REVOKE ALL ON SCHEMA phase3_p20_audit FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA phase3_p20_audit TO anon, authenticated, service_role; -- the invoker guards call removal_allowed()
-- E2: an anonymous demo guest (demo_sessions row and still-anonymous identity), as the demo cleanup decides.
CREATE OR REPLACE FUNCTION phase3_p20_audit.demo_guest(_owner uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.demo_sessions d WHERE d.owner_id = _owner)
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _owner AND u.is_anonymous IS TRUE)
$$;
-- May this transaction remove _owner's corrections? E1 (confirmed erasure of the caller's own data) or E2. SECURITY
-- INVOKER on purpose: the role check reads the caller's current_user, as the P10/P13/P15 guards do.
CREATE OR REPLACE FUNCTION phase3_p20_audit.removal_allowed(_owner uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE erasing boolean;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF _owner IS DISTINCT FROM auth.uid() THEN RETURN false; END IF;
    erasing := current_setting('ledgerline.erasing', true) = 'on'; -- before P18, as P10/P13/P15; rewritten below / by P18
    RETURN coalesce(erasing, false);
  END IF;
  IF current_user IN ('authenticated', 'anon') THEN RETURN false; END IF;
  RETURN phase3_p20_audit.demo_guest(_owner);
END $$;
CREATE OR REPLACE FUNCTION phase3_p20_audit.guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' AND phase3_p20_audit.removal_allowed(OLD.owner_id) THEN RETURN OLD; END IF;
  IF to_regnamespace('phase3_p20_retained') IS NOT NULL THEN
    RAISE EXCEPTION 'Claim receipt corrections are retained audit history (P20 rolled back); they cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF phase3_p19.authorised('finance_operation') THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'P20_AUDIT_KEPT: claim receipt corrections are recorded only by the claim correction workflow' USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'P20_AUDIT_KEPT: claim receipt corrections are audit history; they are never changed or deleted' USING ERRCODE = '42501';
END $$;
-- P18 already installed (install or re-install after P18): apply P18's rewrite to removal_allowed() exactly as P18's
-- install does for every guard (same patterns), saving the original so P18's rollback restores the setting read.
DO $p18$
DECLARE sig constant text := 'phase3_p20_audit.removal_allowed(uuid)'; def text; nd text;
BEGIN
  IF to_regclass('phase3_p18.saved_functions') IS NULL THEN RETURN; END IF;
  def := pg_get_functiondef(to_regprocedure(sig));
  nd := regexp_replace(def, 'coalesce\(current_setting\(''ledgerline\.erasing'',\s*true\),\s*''''\)\s*<>\s*''on''', 'NOT phase3_p18.erasure_authorised()', 'gi');
  nd := regexp_replace(nd, 'current_setting\(''ledgerline\.erasing'',\s*true\)\s*IS\s+DISTINCT\s+FROM\s*''on''', 'NOT phase3_p18.erasure_authorised()', 'gi');
  nd := regexp_replace(nd, 'coalesce\(current_setting\(''ledgerline\.erasing'',\s*true\),\s*''''\)\s*=\s*''on''', 'phase3_p18.erasure_authorised()', 'gi');
  nd := regexp_replace(nd, 'current_setting\(''ledgerline\.erasing'',\s*true\)\s*=\s*''on''', 'phase3_p18.erasure_authorised()', 'gi');
  IF nd LIKE '%current_setting(''ledgerline.erasing''%' OR nd IS NOT DISTINCT FROM def THEN
    RAISE EXCEPTION 'P20: % could not be moved to the P18 erasure authority', sig;
  END IF;
  INSERT INTO phase3_p18.saved_functions(signature, definition) VALUES (sig, def)
    ON CONFLICT (signature) DO UPDATE SET definition = EXCLUDED.definition;
  EXECUTE nd;
END $p18$;
-- R4 record upkeep while retained (see the header): refresh only from a verified pre-delete state, else mark stale.
CREATE OR REPLACE FUNCTION phase3_p20_audit.track_retained() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; before_n bigint; before_h text;
BEGIN
  IF to_regclass('phase3_p20_retained.rollback') IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO r FROM phase3_p20_retained.rollback FOR UPDATE; -- serialises record upkeep
  IF r.content_md5 LIKE 'stale%' THEN RETURN NULL; END IF;  -- never refreshed again
  SELECT count(*), md5(coalesce(string_agg(x::text, E'\n' ORDER BY x.id), '')) INTO before_n, before_h
    FROM (SELECT * FROM public.claim_receipt_corrections UNION ALL SELECT * FROM p20_removed) x;
  IF before_n IS DISTINCT FROM r.rows OR before_h IS DISTINCT FROM r.content_md5
     OR (SELECT count(*) FROM pg_trigger g WHERE g.tgrelid = 'public.claim_receipt_corrections'::regclass AND g.tgenabled = 'O'
          AND g.tgname IN ('claim_receipt_corrections_guard', 'claim_receipt_corrections_no_truncate')
          AND g.tgfoid = 'phase3_p20_audit.guard()'::regprocedure) <> 2 THEN
    UPDATE phase3_p20_retained.rollback SET content_md5 = format('stale since %s: rows changed outside the guards (record %s rows md5 %s; before delete %s rows md5 %s)',
      to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), r.rows, r.content_md5, before_n, before_h);
    RETURN NULL;
  END IF;
  UPDATE phase3_p20_retained.rollback SET rows = (SELECT count(*) FROM public.claim_receipt_corrections),
    content_md5 = (SELECT md5(coalesce(string_agg(c::text, E'\n' ORDER BY c.id), '')) FROM public.claim_receipt_corrections c);
  RETURN NULL;
END $$;
-- E1 follow-up: every erasure body deletes the caller's expenses; in that statement the caller's corrections go too.
CREATE OR REPLACE FUNCTION phase3_p20_audit.follow_erasure() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND phase3_p20_audit.removal_allowed(auth.uid()) THEN
    DELETE FROM public.claim_receipt_corrections c WHERE c.owner_id = auth.uid();
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION phase3_p20_audit.demo_guest(uuid), phase3_p20_audit.removal_allowed(uuid), phase3_p20_audit.guard(), phase3_p20_audit.follow_erasure(),
  phase3_p20_audit.track_retained() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION phase3_p20_audit.removal_allowed(uuid) TO anon, authenticated, service_role; -- read-only answer for the caller
GRANT EXECUTE ON FUNCTION phase3_p20_audit.demo_guest(uuid) TO service_role;
DROP TRIGGER IF EXISTS claim_receipt_corrections_guard ON public.claim_receipt_corrections;
CREATE TRIGGER claim_receipt_corrections_guard BEFORE INSERT OR UPDATE OR DELETE ON public.claim_receipt_corrections
  FOR EACH ROW EXECUTE FUNCTION phase3_p20_audit.guard();
DROP TRIGGER IF EXISTS claim_receipt_corrections_no_truncate ON public.claim_receipt_corrections;
CREATE TRIGGER claim_receipt_corrections_no_truncate BEFORE TRUNCATE ON public.claim_receipt_corrections
  FOR EACH STATEMENT EXECUTE FUNCTION phase3_p20_audit.guard();
DROP TRIGGER IF EXISTS claim_receipt_corrections_retained_record ON public.claim_receipt_corrections;
CREATE TRIGGER claim_receipt_corrections_retained_record AFTER DELETE ON public.claim_receipt_corrections
  REFERENCING OLD TABLE AS p20_removed FOR EACH STATEMENT EXECUTE FUNCTION phase3_p20_audit.track_retained();
DROP TRIGGER IF EXISTS p20_claim_corrections_follow_erasure ON public.expenses;
CREATE TRIGGER p20_claim_corrections_follow_erasure AFTER DELETE ON public.expenses
  FOR EACH STATEMENT EXECUTE FUNCTION phase3_p20_audit.follow_erasure();

ALTER TABLE public.claim_receipt_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.claim_receipt_corrections FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.claim_receipt_corrections TO authenticated;
GRANT SELECT, DELETE ON public.claim_receipt_corrections TO service_role; -- DELETE: E2 demo cleanup only (RLS + guard)
DROP POLICY IF EXISTS "Owner reads claim receipt corrections" ON public.claim_receipt_corrections;
CREATE POLICY "Owner reads claim receipt corrections" ON public.claim_receipt_corrections FOR SELECT TO authenticated USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "P20 corrections recorded only by the finance workflow" ON public.claim_receipt_corrections;
CREATE POLICY "P20 corrections recorded only by the finance workflow" ON public.claim_receipt_corrections AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "P20 corrections cannot be changed" ON public.claim_receipt_corrections;
CREATE POLICY "P20 corrections cannot be changed" ON public.claim_receipt_corrections AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "P20 corrections cannot be deleted" ON public.claim_receipt_corrections;
CREATE POLICY "P20 corrections cannot be deleted" ON public.claim_receipt_corrections AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);
DROP POLICY IF EXISTS "P20 service reads claim receipt corrections" ON public.claim_receipt_corrections;
CREATE POLICY "P20 service reads claim receipt corrections" ON public.claim_receipt_corrections FOR SELECT TO service_role USING (true);
DROP POLICY IF EXISTS "P20 demo cleanup removes guest corrections" ON public.claim_receipt_corrections;
CREATE POLICY "P20 demo cleanup removes guest corrections" ON public.claim_receipt_corrections FOR DELETE TO service_role USING (phase3_p20_audit.demo_guest(owner_id));

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
  -- Only the table owner, authenticated (SELECT) and service_role (SELECT, DELETE) hold any privilege on the trail.
  IF EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) x WHERE c.oid = 'public.claim_receipt_corrections'::regclass AND x.grantee <> c.relowner
              AND NOT ((x.grantee = 'authenticated'::regrole AND x.privilege_type = 'SELECT')
                    OR (x.grantee = 'service_role'::regrole AND x.privilege_type IN ('SELECT', 'DELETE')))) THEN
    RAISE EXCEPTION 'P20: unexpected privilege on public.claim_receipt_corrections';
  END IF;
  IF (SELECT count(*) FROM pg_constraint c WHERE c.conrelid = 'public.claim_receipt_corrections'::regclass AND c.contype = 'f') <> 0 THEN
    RAISE EXCEPTION 'P20: the audit trail must not depend on the claim row (K8)';
  END IF;
END $post$;
COMMIT;
