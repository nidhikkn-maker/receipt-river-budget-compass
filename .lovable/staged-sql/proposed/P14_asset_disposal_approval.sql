-- ============================================================================================
-- P14_asset_disposal_approval.sql (PROPOSED ONLY: NOT APPLIED to Lovable Cloud, Live or any hosted DB).
-- Prepared 11 Nov 2026 (P0 closure, Track A) for KK review. Tested only in isolated PGlite:
-- src/lib/p14-asset-disposal-sql.test.ts and src/lib/failure-injection.test.ts D1-D4 (API level).
-- Contract for the I05 screen (WS-E): docs/workstreams/contracts/disposal-approval.md.
--
-- KK (binding, P0-015): "Asset disposal requires owner or explicitly authorised financial approval, with source
-- evidence, reason, disposal date, proceeds, accounting entries and audit trail. Archiving never constitutes disposal."
--
-- Depends on the applied migrations 0000-0088. Works with or without P1/P4/P7/P8/P11:
--   * P4 installed: every decision needs a recent step-up (has_recent_step_up); P4 absent: approvals are refused (fail closed);
--   * P1 installed: Finance approval is checked for the asset's company (can_access_expense 3-argument form);
--   * P7 + P8 installed: phase3_p7.classify_adjustment (P8's hook) is wrapped so an APPROVED disposal entry posts a
--     balanced batch (Dr expense:Loss on asset disposal (book value) / Cr the asset's ledger account) in the asset
--     account's entity; any other disposal-tagged entry stays the P8 exception 'asset_disposal_workflow'. Apply P14
--     after P8 and roll it back before P8's rollback;
--   * P11 installed: a checked backup restore (P11's transaction-bound ticket) may carry disposals recorded in the backup.
-- Rollback: P14_asset_disposal_approval.rollback.sql (pre-P14 catalog except the RETAINED read-only audit trail
-- public.asset_disposal_requests, see D). No existing row or value is changed.
--
-- A. asset_disposal_requests: asset (owner-local id), method, disposal date, proceeds (+ optional link to the bank
--    receipt entry), source evidence (>= 1 of the owner's documents), reason, the book value / gain-or-loss and the
--    posting entry id worked out by the server from the stored register with the app's own rules
--    (assets-ledger.ts disposalResult / eventPostings / ownerPostingId), requester, decision (who, when, why).
--    Readable by the owner and Finance approvers for the asset's company; append-only for clients.
-- B. request_asset_disposal / decide_asset_disposal / cancel_asset_disposal (SECURITY DEFINER, all checks inside).
--    Approval: the owner (step-up where P4 is installed) or a Finance user with "approve" for that company who did
--    not make the request. On approval, in one transaction: the asset gets soldOn / saleValue / disposal {request,
--    method, approver, evidence, book value, gain}; the non-cash disposal entry (adjustment -1 on the asset's ledger
--    account, category "Asset disposal", tag disposal) is inserted under the agreed id; the request is closed. The
--    database re-derives the book value at approval; a register change since the request refuses (P14_BOOK_VALUE_CHANGED /
--    P14_CHANGED).
-- C. Guards: soldOn / saleValue / disposal of an asset change ONLY through B (P14_DISPOSAL_APPROVAL_REQUIRED), and a
--    disposal-tagged entry is inserted ONLY by B. Archiving (archived / archive status / recordArchive) never touches
--    these fields, so archiving can never dispose. Erasure and the service path are exempt from these two guards.
-- D. The request table is audit history (brief G9/G10, 12 Nov 2026; lead ruling by consistency with P20: "rollback must
--    preserve financial audit trails even if the feature is reverted"; retained rows are removable only by the owner's
--    own confirmed erasure and by demo-guest cleanup). phase3_p14_audit.guard() (a schema the rollback keeps) refuses
--    every UPDATE except decide/cancel's own transaction (phase3_p14.writing) and P11's checked restore, every TRUNCATE,
--    and every DELETE except:
--      E1 confirmed erasure of the caller's own data: row owner = auth.uid() AND the erasure is authorised (P18
--         erasure authority; ledgerline.erasing before P18, rewritten exactly as P20 K8 E1 does, in either install order).
--         delete_my_finance_data does not know this table, so phase3_p14_audit.follow_erasure() (AFTER DELETE ... FOR
--         EACH STATEMENT on public.expenses; every erasure body deletes the caller's expenses) removes ALL of the
--         caller's requests in that statement under the same condition; outside E1 it does nothing.
--      E2 the service / operator path (no auth.uid(), not anon/authenticated) for an anonymous demo guest
--         (public.demo_sessions row AND auth.users.is_anonymous): the hourly demo cleanup (src/lib/demo-cleanup.ts
--         DEMO_GUEST_STEPS) deletes the guest's requests by owner_id. service_role holds SELECT and DELETE only (RLS:
--         guest rows only); any other owner's row is refused, also for the operator.
--    Inserts stay as before (clients hold no INSERT; request_asset_disposal writes as the table owner).
--    These are DML guards: the table owner / a superuser can still bypass them with DDL or session_replication_role.
--    Rollback RETAINS the table read-only with phase3_p14_audit and a phase3_p14_retained record (table oid, owner,
--    row count, content md5; kept current by permitted E1/E2 deletes through phase3_p14_audit.track_retained, which
--    marks it stale for good if the rows changed around the guards). Re-installing P14 adopts the retained table only if
--    it is that same table with that owner, its rows match the record and it has exactly the P14 shape, triggers,
--    policies and grants; its rows are kept (a request still pending at rollback can be decided again) and new requests
--    append. Every content md5 pins TimeZone UTC, DateStyle 'ISO, MDY', IntervalStyle postgres, extra_float_digits 1.
--    Backup: classified in src/lib/backup.ts BACKUP_PROPOSED_EXCLUDED_TABLES (audit history, like transaction_audit).
-- P14-a (fixed 10 Nov 2026, WS-E batch 6-8 check): the database no longer trusts the caller's book value. It works the
--   book value out itself from the stored register (phase3_p14.book_value: the app's uniform monthly working at full
--   precision, KK decision 4) and refuses a request or approval whose figure differs by more than 0.50 + 0.005 per month
--   worked (P14_BOOK_VALUE); assets whose working it cannot reproduce (recorded prospective estimate changes, a property's
--   building policy, missing method/rate) are refused, never trusted (P14_UNVERIFIABLE). Approval needs a recent step-up:
--   with P4 every decision needs it; WITHOUT P4 approvals fail closed (P14_STEP_UP_UNAVAILABLE), rejections still work.
--   preview_asset_disposal (STABLE, read-only) returns the database's working for the I05 preview (R-E-I14).
--   decide/cancel mark their transaction in phase3_p14.writing (a table no client can write) instead of the session
--   setting phase3_p14.writing, which any role could set to open the guards in C.
-- P14-a residual (R-E-I15, fixed 11 Nov 2026, WS-E independent check): a caller's figure inside the tolerance was still
--   STORED as the request's book value and posted. Now request_asset_disposal / decide_asset_disposal store, post and
--   record in the asset's disposal ONLY the database's own figure (phase3_p14.book_value rounded to paise); p_book_value
--   is an optional, defaulted consistency check (request: last argument) - outside the tolerance P14_BOOK_VALUE, inside it
--   ignored. The decision re-derives the figure: any difference from the stored one (the register changed) refuses
--   (P14_BOOK_VALUE_CHANGED) instead of posting a stale value. preview_asset_disposal returns that same figure.
-- Known limit (KK review): the posted paise figure is the database's full-precision working rounded once; the app engine
-- (carried-forward paise) may differ from it by up to the tolerance above and is only checked against it. 0069's closed-period register guard still
-- applies to the asset change: an asset bought before a closed period cannot be changed (also not disposed) until
-- that period rule is made disposal-date aware.
-- ============================================================================================
BEGIN;

DO $pre$
DECLARE t oid := to_regclass('public.asset_disposal_requests'); r record;
BEGIN
  IF to_regnamespace('phase3_p14') IS NOT NULL THEN RAISE EXCEPTION 'P14 is already installed'; END IF;
  -- D: an existing request table (or audit guard schema) is accepted only as the trail a P14 rollback retained AND
  -- recorded: the same table (oid) with the same owner, and the guard schemas owned by that owner (shape checked below).
  IF t IS NOT NULL OR to_regnamespace('phase3_p14_audit') IS NOT NULL THEN
    IF to_regclass('phase3_p14_retained.rollback') IS NULL THEN
      RAISE EXCEPTION 'P14: public.asset_disposal_requests exists but is not an audit trail retained by a P14 rollback';
    END IF;
    SELECT * INTO r FROM phase3_p14_retained.rollback;
    IF (SELECT count(*) FROM phase3_p14_retained.rollback) <> 1 OR t IS DISTINCT FROM r.table_oid
       OR (SELECT c.relowner FROM pg_class c WHERE c.oid = t) IS DISTINCT FROM r.table_owner
       OR (SELECT n.nspowner FROM pg_namespace n WHERE n.nspname = 'phase3_p14_audit') IS DISTINCT FROM r.table_owner
       OR (SELECT n.nspowner FROM pg_namespace n WHERE n.nspname = 'phase3_p14_retained') IS DISTINCT FROM r.table_owner THEN
      RAISE EXCEPTION 'P14: public.asset_disposal_requests is not the audit trail the P14 rollback retained (table or owner changed)';
    END IF;
    -- The retained rows must be exactly the rows the rollback recorded (kept current by permitted E1/E2 deletes).
    -- Locked until commit so no delete lands between this check and the adoption; hashed with pinned settings.
    LOCK TABLE public.asset_disposal_requests IN SHARE ROW EXCLUSIVE MODE;
    SET LOCAL TimeZone = 'UTC';
    SET LOCAL DateStyle = 'ISO, MDY';
    SET LOCAL IntervalStyle = 'postgres';
    SET LOCAL extra_float_digits = 1;
    IF (SELECT count(*) FROM public.asset_disposal_requests) IS DISTINCT FROM r.rows
       OR (SELECT md5(coalesce(string_agg(c::text, E'\n' ORDER BY c.id), '')) FROM public.asset_disposal_requests c) IS DISTINCT FROM r.content_md5 THEN
      RAISE EXCEPTION 'P14: the retained disposal requests changed since the P14 rollback (recorded % rows, md5 %); review before re-installing', r.rows, r.content_md5;
    END IF;
  END IF;
END $pre$;

CREATE SCHEMA phase3_p14;
REVOKE ALL ON SCHEMA phase3_p14 FROM PUBLIC, anon, authenticated;
CREATE TABLE phase3_p14.saved_functions (signature text PRIMARY KEY, definition text NOT NULL);

CREATE FUNCTION phase3_p14.may_approve(_owner uuid, _entity text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ok boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'finance'::public.app_role) THEN RETURN false; END IF;
  IF to_regprocedure('public.can_access_expense(uuid,text,text)') IS NOT NULL THEN
    EXECUTE 'SELECT public.can_access_expense($1, ''approve'', $2)' INTO ok USING _owner, _entity;
  ELSE ok := public.can_access_expense(_owner, 'approve');
  END IF;
  RETURN coalesce(ok, false);
END $$;
CREATE FUNCTION phase3_p14.step_up_ok() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ok boolean;
BEGIN
  IF to_regprocedure('public.has_recent_step_up()') IS NULL THEN RETURN true; END IF;
  EXECUTE 'SELECT public.has_recent_step_up()' INTO ok;
  RETURN coalesce(ok, false);
END $$;
CREATE FUNCTION phase3_p14.asset_of(_owner uuid, _asset text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a FROM public.finance_preferences p, jsonb_array_elements(CASE WHEN jsonb_typeof(p.data->'assets') = 'array' THEN p.data->'assets' ELSE '[]'::jsonb END) a
   WHERE p.owner_id = _owner AND jsonb_typeof(a) = 'object' AND a->>'id' = _asset LIMIT 1
$$;
-- P14-a: the database derives the book value from the stored register itself and checks the server function's figure
-- against it (it never trusts a caller-supplied book value). Mirrors the app's uniform monthly working (books/
-- depreciation.ts monthlyBook; WS-E books/monthly-engine.ts uniformMonthlyBook): day-prorated first and disposal months,
-- straight line on (cost - residual) / life or cost x rate, written down on the carrying amount at the life-implied or
-- stated rate, never below residual, imported opening WDV, impairment / revaluation adjustments. It keeps full precision
-- (KK decision 4) and returns the carrying amount rounded to paise; the app posts paise with the rounding carried forward
-- (the retired engine rounded per month), so the check allows 0.50 + 0.005 per month worked. Shapes this working does not
-- reproduce (recorded prospective estimate changes, a property's building policy, missing/invalid inputs) return
-- 'unverifiable' and the request is refused (fail closed) rather than trusting the caller.
CREATE FUNCTION phase3_p14.num(_v jsonb) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$ SELECT CASE WHEN jsonb_typeof(_v) = 'number' THEN (_v #>> '{}')::numeric END $$;
CREATE FUNCTION phase3_p14.book_value(_a jsonb, _date date) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE cost numeric := phase3_p14.num(_a->'cost'); in_use date; method text := _a->>'bookMethod';
  rp numeric := coalesce(phase3_p14.num(_a->'residualPct'), 0); life numeric := coalesce(phase3_p14.num(_a->'usefulLifeYears'), 0);
  rate numeric := phase3_p14.num(_a->'bookRatePct'); residual numeric; annual numeric; wrate numeric := 0; x numeric; m date; start date;
  last date := date_trunc('month', _date)::date; dim int; dfrom int; dto int; raw numeric; d numeric; n int := 0; adj record; ob jsonb := _a->'openingWdv';
BEGIN
  IF cost IS NULL OR coalesce(_a->>'inUse', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN jsonb_build_object('unverifiable', 'the asset has no cost or put-to-use date'); END IF;
  in_use := (_a->>'inUse')::date;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_a->'policyHistory') = 'array' THEN _a->'policyHistory' ELSE '[]' END) c
              WHERE c->>'field' IN ('bookMethod', 'bookRatePct', 'usefulLifeYears', 'residualPct') AND coalesce(c->>'effectiveFrom', '') ~ '^\d{4}-\d{2}$' AND c ? 'toRaw') THEN
    RETURN jsonb_build_object('unverifiable', 'the asset has recorded prospective estimate changes');
  END IF;
  IF _a->>'kind' = 'property' THEN
    IF jsonb_typeof(_a->'buildingPolicy') = 'array' AND jsonb_array_length(_a->'buildingPolicy') > 0 THEN
      RETURN jsonb_build_object('unverifiable', 'the property has a building depreciation policy');
    END IF;
    RETURN jsonb_build_object('value', round(cost, 2), 'months', 0, 'tolerance', 0.50);   -- land / undepreciated property: cost
  END IF;
  IF cost <= 0 THEN RETURN jsonb_build_object('value', round(cost, 2), 'months', 0, 'tolerance', 0.50); END IF;
  IF method NOT IN ('slm', 'wdv') OR rp < 0 OR life < 0 OR (rate IS NULL AND NOT (life > 0)) OR (method = 'wdv' AND rate IS NULL AND NOT (life > 0 AND rp > 0)) THEN
    RETURN jsonb_build_object('unverifiable', 'the asset has no valid book method, useful life or rate');
  END IF;
  residual := round(cost * rp / 100, 2);
  annual := CASE WHEN life > 0 THEN (cost - residual) / life ELSE cost * rate / 100 END;
  IF method = 'wdv' THEN wrate := CASE WHEN life > 0 AND residual > 0 THEN 1 - power(residual / cost, 1 / life) ELSE rate / 100 END; END IF;
  x := cost; start := date_trunc('month', in_use)::date;
  IF jsonb_typeof(ob) = 'object' AND phase3_p14.num(ob->'book') >= 0 AND coalesce(ob->>'fy', '') ~ '^\d{4}-\d{2}$'
     AND make_date(left(ob->>'fy', 4)::int, 4, 1) > start THEN
    start := make_date(left(ob->>'fy', 4)::int, 4, 1); x := phase3_p14.num(ob->'book');
  END IF;
  m := start;
  WHILE m <= last AND n < 600 LOOP
    FOR adj IN SELECT phase3_p14.num(j->'amount') amount FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_a->'adjustments') = 'array' THEN _a->'adjustments' ELSE '[]' END) j
                WHERE left(coalesce(j->>'date', ''), 7) = to_char(m, 'YYYY-MM') AND phase3_p14.num(j->'amount') IS NOT NULL ORDER BY j->>'date' LOOP
      x := greatest(residual, x + adj.amount);
    END LOOP;
    dim := extract(day FROM (m + interval '1 month' - interval '1 day'))::int;
    dfrom := CASE WHEN m = date_trunc('month', in_use)::date THEN extract(day FROM in_use)::int ELSE 1 END;
    dto := CASE WHEN m = last THEN extract(day FROM _date)::int ELSE dim END;
    raw := CASE WHEN method = 'wdv' THEN x * wrate / 12 ELSE annual / 12 END * greatest(0, dto - dfrom + 1) / dim;
    d := least(greatest(raw, 0), greatest(x - residual, 0));
    x := x - d; n := n + 1;
    EXIT WHEN x <= residual + 0.0000000001;
    m := (m + interval '1 month')::date;
  END LOOP;
  RETURN jsonb_build_object('value', round(x, 2), 'months', n, 'tolerance', round(0.50 + 0.005 * n, 2));
END $$;

-- --------------------------------------------------------------------------------------------
-- A. Requests
-- --------------------------------------------------------------------------------------------
-- D: kept, with its rows, when re-installing after a rollback. The same definition builds phase3_p14.shape_reference,
-- the exact shape (columns, constraints, indexes) a retained table must still have.
DO $ddl$
DECLARE ddl constant text := $t$CREATE TABLE IF NOT EXISTS %s (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  asset_id text NOT NULL CHECK (length(asset_id) BETWEEN 1 AND 64),
  asset_name text NOT NULL,
  entity_id text,
  method text NOT NULL CHECK (method IN ('sale', 'scrap', 'write_off', 'donation', 'lost')),
  disposal_date date NOT NULL,
  proceeds numeric(14,2) NOT NULL CHECK (proceeds >= 0),
  proceeds_entry_id uuid,
  evidence_document_ids uuid[] NOT NULL CHECK (cardinality(evidence_document_ids) BETWEEN 1 AND 20),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  book_value numeric(14,2) NOT NULL CHECK (book_value >= 0),
  gain numeric(14,2) NOT NULL,
  entry_id uuid NOT NULL,
  inputs jsonb NOT NULL DEFAULT '{}',
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  CHECK ((status = 'pending') = (decided_at IS NULL)),
  CHECK (method <> 'sale' OR proceeds > 0),
  CHECK (gain = proceeds - book_value)
)$t$;
  fresh constant boolean := to_regclass('public.asset_disposal_requests') IS NULL;
BEGIN
  EXECUTE format(ddl, 'public.asset_disposal_requests');
  EXECUTE format(ddl, 'phase3_p14.shape_reference');
  -- a retained table must still have its index (checked below with the shape), never silently re-created
  IF fresh THEN
    CREATE UNIQUE INDEX asset_disposal_requests_one_open ON public.asset_disposal_requests (owner_id, asset_id) WHERE status IN ('pending', 'approved');
  END IF;
  CREATE UNIQUE INDEX shape_reference_one_open ON phase3_p14.shape_reference (owner_id, asset_id) WHERE status IN ('pending', 'approved');
END $ddl$;
-- Columns (type with typmod, NOT NULL, default), every constraint and index definition (names aside; a foreign key would
-- show here and be refused), plain permanent table, no inheritance, no rules.
CREATE FUNCTION phase3_p14.shape(_t regclass) RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT concat_ws(E'\n',
    (SELECT string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
        || coalesce(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), ''), ', ' ORDER BY a.attnum)
       FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = _t AND a.attnum > 0 AND NOT a.attisdropped),
    (SELECT string_agg(x.def, '; ' ORDER BY x.def) FROM (SELECT c.contype::text || ' ' || pg_get_constraintdef(c.oid) def FROM pg_constraint c WHERE c.conrelid = _t) x),
    (SELECT string_agg(x.def, '; ' ORDER BY x.def) FROM (SELECT regexp_replace(pg_get_indexdef(i.indexrelid), '^CREATE (UNIQUE )?INDEX \S+ ON \S+ ', 'CREATE \1INDEX ON t ') def
       FROM pg_index i WHERE i.indrelid = _t) x),
    (SELECT c.relkind::text || c.relpersistence::text || c.relispartition::text FROM pg_class c WHERE c.oid = _t),
    (SELECT 'inherits ' || count(*) FROM pg_inherits i WHERE i.inhrelid = _t OR i.inhparent = _t),
    (SELECT 'rules ' || count(*) FROM pg_rewrite w WHERE w.ev_class = _t))
$$;
DO $shape$
DECLARE t constant regclass := 'public.asset_disposal_requests'::regclass;
BEGIN
  IF phase3_p14.shape(t) IS DISTINCT FROM phase3_p14.shape('phase3_p14.shape_reference'::regclass) THEN
    RAISE EXCEPTION 'P14: public.asset_disposal_requests does not have the P14 audit shape';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = t AND NOT g.tgisinternal
              AND NOT ((g.tgname IN ('asset_disposal_requests_guard', 'asset_disposal_requests_no_truncate')
                        AND g.tgfoid = to_regprocedure('phase3_p14_audit.guard()'))
                    OR (g.tgname = 'asset_disposal_requests_retained_record' AND g.tgfoid = to_regprocedure('phase3_p14_audit.track_retained()'))))
     OR EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = t AND p.polname NOT IN ('Disposal requests: owner reads retained history',
              'P14 requests recorded only by the disposal workflow', 'P14 requests cannot be changed', 'P14 requests cannot be deleted',
              'P14 service reads disposal requests', 'P14 demo cleanup removes guest requests')) THEN
    RAISE EXCEPTION 'P14: public.asset_disposal_requests has triggers or policies P14 did not create';
  END IF;
  IF obj_description(t, 'pg_class') IS NOT NULL THEN
    EXECUTE format('COMMENT ON TABLE public.asset_disposal_requests IS %L', obj_description(t, 'pg_class')
      || format('; P14 re-installed %s: earlier requests kept, new requests append', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
  END IF;
END $shape$;
DROP FUNCTION phase3_p14.shape(regclass);
DROP TABLE phase3_p14.shape_reference;
-- The retained trail is adopted: its rollback record goes (the table, its rows and phase3_p14_audit stay).
DO $adopt$
BEGIN
  IF to_regnamespace('phase3_p14_retained') IS NOT NULL THEN
    DROP TABLE phase3_p14_retained.rollback;
    DROP SCHEMA phase3_p14_retained RESTRICT;
  END IF;
END $adopt$;
ALTER TABLE public.asset_disposal_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asset_disposal_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.asset_disposal_requests TO authenticated;
GRANT SELECT, DELETE ON public.asset_disposal_requests TO service_role; -- DELETE: E2 demo cleanup only (RLS + guard)
DROP POLICY IF EXISTS "Disposal requests: owner reads retained history" ON public.asset_disposal_requests;
CREATE POLICY "Disposal requests: owner and approvers read" ON public.asset_disposal_requests FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR phase3_p14.may_approve(owner_id, entity_id));

-- P14-a residual (R-E-I15): the request stores ONLY the database's own figure (phase3_p14.book_value). p_book_value is an
-- optional consistency check, kept (last, defaulted) so the server function can hand in the app engine's figure and a
-- divergence between the two workings is refused (P14_BOOK_VALUE) instead of passing silently; within tolerance it is
-- ignored and never stored or posted. Callers use named arguments (PostgREST rpc does).
CREATE FUNCTION public.request_asset_disposal(p_asset text, p_method text, p_date date, p_proceeds numeric, p_proceeds_entry uuid,
  p_evidence uuid[], p_reason text, p_entry uuid, p_inputs jsonb DEFAULT '{}'::jsonb, p_book_value numeric DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); a jsonb; why text := btrim(coalesce(p_reason, '')); rid uuid; acc uuid; b jsonb; bv numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  a := phase3_p14.asset_of(uid, p_asset);
  IF a IS NULL THEN RAISE EXCEPTION 'P14_NOT_FOUND: that asset is not in your register' USING ERRCODE = 'P0002'; END IF;
  IF nullif(a->>'soldOn', '') IS NOT NULL THEN RAISE EXCEPTION 'P14_ALREADY_DISPOSED: this asset was disposed on %', a->>'soldOn' USING ERRCODE = '42501'; END IF;
  IF length(why) < 5 OR length(why) > 500 THEN RAISE EXCEPTION 'P14_REASON: give a reason of at least 5 characters' USING ERRCODE = '22023'; END IF;
  IF p_method NOT IN ('sale', 'scrap', 'write_off', 'donation', 'lost') THEN RAISE EXCEPTION 'P14_INVALID: disposal method' USING ERRCODE = '22023'; END IF;
  IF p_date IS NULL OR p_date > current_date + 31 OR p_date < coalesce(nullif(a->>'inUse', '')::date, p_date) THEN
    RAISE EXCEPTION 'P14_INVALID: the disposal date must be on or after the date the asset was put to use' USING ERRCODE = '22023';
  END IF;
  IF p_proceeds IS NULL OR p_proceeds < 0 OR (p_method = 'sale' AND p_proceeds = 0) THEN RAISE EXCEPTION 'P14_INVALID: a sale needs its proceeds' USING ERRCODE = '22023'; END IF;
  -- P14-a: the database works the book value out from the stored register and records only that figure. A caller's figure
  -- (optional) is a consistency check: outside tolerance it is refused; inside tolerance it is ignored.
  b := phase3_p14.book_value(a, p_date);
  IF b ? 'unverifiable' THEN RAISE EXCEPTION 'P14_UNVERIFIABLE: the database cannot check this asset''s book value (%); nothing was requested', b->>'unverifiable' USING ERRCODE = '22023'; END IF;
  bv := round((b->>'value')::numeric, 2);
  IF bv < 0 THEN RAISE EXCEPTION 'P14_INVALID: book value' USING ERRCODE = '22023'; END IF;
  IF p_book_value IS NOT NULL AND abs(round(p_book_value, 2) - bv) > (b->>'tolerance')::numeric THEN
    RAISE EXCEPTION 'P14_BOOK_VALUE: the book value % does not follow from the register (the database works out %)', round(p_book_value, 2), bv USING ERRCODE = '22023';
  END IF;
  acc := nullif(a->>'accountId', '')::uuid;
  IF bv > 0 AND (acc IS NULL OR NOT EXISTS (SELECT 1 FROM public.accounts x WHERE x.id = acc AND x.owner_id = uid)) THEN
    RAISE EXCEPTION 'P14_INVALID: link the asset to its ledger asset account first' USING ERRCODE = '22023';
  END IF;
  IF coalesce(cardinality(p_evidence), 0) = 0 OR EXISTS (SELECT 1 FROM unnest(p_evidence) d WHERE NOT EXISTS (SELECT 1 FROM public.documents x WHERE x.id = d AND x.owner_id = uid)) THEN
    RAISE EXCEPTION 'P14_EVIDENCE: attach the disposal evidence (sale invoice, scrap note, write-off approval) from your documents' USING ERRCODE = '22023';
  END IF;
  IF p_proceeds_entry IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.expenses x WHERE x.id = p_proceeds_entry AND x.employee_id = uid) THEN
    RAISE EXCEPTION 'P14_INVALID: the proceeds entry is not one of your entries' USING ERRCODE = '22023';
  END IF;
  IF p_entry IS NULL OR EXISTS (SELECT 1 FROM public.expenses x WHERE x.id = p_entry) THEN RAISE EXCEPTION 'P14_INVALID: disposal entry id' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.asset_disposal_requests(owner_id, asset_id, asset_name, entity_id, method, disposal_date, proceeds, proceeds_entry_id,
    evidence_document_ids, reason, book_value, gain, entry_id, inputs, requested_by)
  VALUES (uid, p_asset, left(coalesce(a->>'name', p_asset), 200), nullif(coalesce(nullif(a->>'ownerEntityId', ''), a->>'entityId'), ''), p_method, p_date,
    round(p_proceeds, 2), p_proceeds_entry, p_evidence, why, bv, round(p_proceeds, 2) - bv, p_entry,
    ((CASE WHEN jsonb_typeof(p_inputs) = 'object' THEN p_inputs ELSE '{}' END) - 'bookValue' - 'gain' - 'book_value') || jsonb_build_object('asset', a, 'database', b), uid)
  RETURNING id INTO rid;
  RETURN rid;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'P14_PENDING: this asset already has an open disposal request' USING ERRCODE = '23505';
END $$;

CREATE FUNCTION public.decide_asset_disposal(p_request uuid, p_approve boolean, p_reason text, p_book_value numeric DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); r public.asset_disposal_requests; a jsonb; why text := btrim(coalesce(p_reason, '')); acc uuid; d jsonb; list jsonb; b jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF length(why) < 5 OR length(why) > 500 THEN RAISE EXCEPTION 'P14_REASON: give a reason of at least 5 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM public.asset_disposal_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR NOT (r.owner_id = uid OR phase3_p14.may_approve(r.owner_id, r.entity_id)) THEN
    RAISE EXCEPTION 'P14_NOT_PERMITTED: only the owner or a Finance approver for that company decides a disposal' USING ERRCODE = '42501';
  END IF;
  IF r.requested_by = uid AND r.owner_id <> uid THEN RAISE EXCEPTION 'P14_NOT_PERMITTED: a Finance user does not approve their own request' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'pending' THEN RETURN jsonb_build_object('request', r.id, 'status', r.status, 'replayed', true); END IF;
  -- P14-a: an approval always needs a recent step-up. Without P4 there is no step-up, so approvals fail closed (rejections,
  -- which dispose nothing, stay possible); with P4 every decision needs it.
  IF p_approve AND to_regprocedure('public.has_recent_step_up()') IS NULL THEN
    RAISE EXCEPTION 'P14_STEP_UP_UNAVAILABLE: approving a disposal needs the step-up check (P4), which is not installed' USING ERRCODE = '42501';
  END IF;
  IF NOT phase3_p14.step_up_ok() THEN RAISE EXCEPTION 'STEP_UP_REQUIRED: decide_asset_disposal' USING ERRCODE = '42501'; END IF;
  INSERT INTO phase3_p14.writing(transaction_id) VALUES (txid_current()) ON CONFLICT DO NOTHING;
  -- The request is closed first: the posting hook (P7/P8) posts the disposal entry only for an APPROVED request.
  UPDATE public.asset_disposal_requests SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, decided_by = uid, decided_at = clock_timestamp(), decision_reason = why
   WHERE id = r.id;
  IF p_approve THEN
    a := phase3_p14.asset_of(r.owner_id, r.asset_id);
    IF a IS NULL OR nullif(a->>'soldOn', '') IS NOT NULL THEN RAISE EXCEPTION 'P14_CHANGED: the asset is no longer in the register or is already disposed' USING ERRCODE = '40001'; END IF;
    -- P14-a residual: re-derive at decision time. The stored figure is the database's own working at request time; the
    -- working is deterministic in (asset, date), so any difference means the register changed: refuse rather than post a
    -- stale figure (stricter than the request tolerance on purpose). Only r.book_value (= this figure) is ever posted.
    b := phase3_p14.book_value(a, r.disposal_date);
    IF b ? 'unverifiable' THEN RAISE EXCEPTION 'P14_UNVERIFIABLE: the database cannot check this asset''s book value (%)', b->>'unverifiable' USING ERRCODE = '22023'; END IF;
    IF round((b->>'value')::numeric, 2) IS DISTINCT FROM r.book_value THEN
      RAISE EXCEPTION 'P14_BOOK_VALUE_CHANGED: the register changed since the request (book value % then, % now); prepare a new request', r.book_value, round((b->>'value')::numeric, 2) USING ERRCODE = '40001';
    END IF;
    IF (a - 'archived' - 'archivedAt' - 'archivedBy' - 'archiveReason' - 'archiveHistory') IS DISTINCT FROM ((r.inputs->'asset') - 'archived' - 'archivedAt' - 'archivedBy' - 'archiveReason' - 'archiveHistory') THEN
      RAISE EXCEPTION 'P14_CHANGED: the asset changed since the request; prepare a new request' USING ERRCODE = '40001';
    END IF;
    -- optional consistency check of the caller's figure (never stored or posted)
    IF p_book_value IS NOT NULL AND abs(round(p_book_value, 2) - r.book_value) > (b->>'tolerance')::numeric THEN
      RAISE EXCEPTION 'P14_BOOK_VALUE: the book value % does not follow from the register (the database works out %)', round(p_book_value, 2), r.book_value USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(r.evidence_document_ids) x WHERE NOT EXISTS (SELECT 1 FROM public.documents y WHERE y.id = x AND y.owner_id = r.owner_id)) THEN
      RAISE EXCEPTION 'P14_EVIDENCE: a piece of disposal evidence is no longer available' USING ERRCODE = '40001';
    END IF;
    d := jsonb_build_object('requestId', r.id, 'method', r.method, 'reason', r.reason, 'requestedBy', r.requested_by, 'approvedBy', uid,
      'approvedAt', to_jsonb(clock_timestamp())#>>'{}', 'approvalReason', why, 'evidence', to_jsonb(r.evidence_document_ids), 'bookValue', r.book_value,
      'proceeds', r.proceeds, 'gain', r.gain, 'entryId', r.entry_id, 'proceedsEntryId', r.proceeds_entry_id);
    SELECT jsonb_agg(CASE WHEN jsonb_typeof(x) = 'object' AND x->>'id' = r.asset_id
                          THEN x || jsonb_build_object('soldOn', to_char(r.disposal_date, 'YYYY-MM-DD'), 'saleValue', r.proceeds, 'disposal', d) ELSE x END ORDER BY o)
      INTO list FROM public.finance_preferences p, jsonb_array_elements(p.data->'assets') WITH ORDINALITY t(x, o) WHERE p.owner_id = r.owner_id;
    UPDATE public.finance_preferences SET data = jsonb_set(data, '{assets}', list) WHERE owner_id = r.owner_id;
    acc := nullif(a->>'accountId', '')::uuid;
    IF r.book_value > 0 THEN
      INSERT INTO public.expenses(id, employee_id, title, merchant, category, scope, amount, original_amount, currency, fx_rate, expense_date, description,
        payment_method, txn_type, account_id, adjustment_sign, tags, entity_id, entity_source)
      VALUES (r.entry_id, r.owner_id, left('Disposal · ' || r.asset_name, 200), NULL, 'Asset disposal', 'business', r.book_value, r.book_value, 'INR', 1, r.disposal_date,
        left(format('Book value removed on disposal (non-cash, %s); proceeds %s, %s %s. Asset %s. Approved request %s.', r.method, r.proceeds,
          CASE WHEN r.gain >= 0 THEN 'gain' ELSE 'loss' END, abs(r.gain), coalesce(nullif(a->>'tag', ''), r.asset_id), r.id), 2000),
        'other', 'adjustment', acc, -1, ARRAY['disposal'], r.entity_id, CASE WHEN r.entity_id IS NULL THEN 'account' ELSE 'manual' END);
    END IF;
  END IF;
  DELETE FROM phase3_p14.writing WHERE transaction_id = txid_current();
  RETURN jsonb_build_object('request', r.id, 'status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, 'entry', CASE WHEN p_approve AND r.book_value > 0 THEN r.entry_id END, 'replayed', false);
END $$;

-- R-E-I14: read-only preview of what a request would record (STABLE: it cannot write). bookValue is the database's own figure,
-- exactly what request_asset_disposal stores and an approval posts (R-E-I15); the server function adds the planned entries.
CREATE FUNCTION public.preview_asset_disposal(p_asset text, p_date date, p_proceeds numeric) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); a jsonb; b jsonb; acc uuid; problems text[] := '{}';
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  a := phase3_p14.asset_of(uid, p_asset);
  IF a IS NULL THEN RAISE EXCEPTION 'P14_NOT_FOUND: that asset is not in your register' USING ERRCODE = 'P0002'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'P14_INVALID: the disposal date' USING ERRCODE = '22023'; END IF;
  IF nullif(a->>'soldOn', '') IS NOT NULL THEN problems := problems || format('This asset was disposed on %s', a->>'soldOn'); END IF;
  IF p_date > current_date + 31 OR p_date < coalesce(nullif(a->>'inUse', '')::date, p_date) THEN problems := problems || 'The disposal date must be on or after the date the asset was put to use'::text; END IF;
  IF p_proceeds IS NULL OR p_proceeds < 0 THEN problems := problems || 'Enter the proceeds (0 if nothing was received)'::text; END IF;
  IF EXISTS (SELECT 1 FROM public.asset_disposal_requests q WHERE q.owner_id = uid AND q.asset_id = p_asset AND q.status = 'pending') THEN problems := problems || 'This asset already has an open disposal request'::text; END IF;
  b := phase3_p14.book_value(a, p_date);
  IF b ? 'unverifiable' THEN problems := problems || format('The database cannot check this asset''s book value (%s)', b->>'unverifiable'); END IF;
  acc := nullif(a->>'accountId', '')::uuid;
  IF coalesce((b->>'value')::numeric, 0) > 0 AND (acc IS NULL OR NOT EXISTS (SELECT 1 FROM public.accounts x WHERE x.id = acc AND x.owner_id = uid)) THEN
    problems := problems || 'Link the asset to its ledger asset account first'::text;
  END IF;
  -- the same figure request_asset_disposal stores and an approval posts (round to paise, as stored)
  RETURN jsonb_build_object('bookValue', round((b->>'value')::numeric, 2), 'tolerance', (b->>'tolerance')::numeric, 'months', (b->>'months')::int,
    'gain', CASE WHEN b ? 'value' AND p_proceeds IS NOT NULL THEN round(p_proceeds, 2) - round((b->>'value')::numeric, 2) END, 'accountId', acc, 'problems', to_jsonb(problems));
END $$;

CREATE FUNCTION public.cancel_asset_disposal(p_request uuid, p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); r public.asset_disposal_requests;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 5 THEN RAISE EXCEPTION 'P14_REASON: give a reason of at least 5 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM public.asset_disposal_requests WHERE id = p_request AND (requested_by = uid OR owner_id = uid) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'P14_NOT_PERMITTED: only the requester or the owner cancels a disposal request' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'pending' THEN RETURN jsonb_build_object('request', r.id, 'status', r.status, 'replayed', true); END IF;
  INSERT INTO phase3_p14.writing(transaction_id) VALUES (txid_current()) ON CONFLICT DO NOTHING;
  UPDATE public.asset_disposal_requests SET status = 'cancelled', decided_by = uid, decided_at = clock_timestamp(), decision_reason = btrim(p_reason) WHERE id = r.id;
  DELETE FROM phase3_p14.writing WHERE transaction_id = txid_current();
  RETURN jsonb_build_object('request', r.id, 'status', 'cancelled', 'replayed', false);
END $$;

-- --------------------------------------------------------------------------------------------
-- C. Guards
-- --------------------------------------------------------------------------------------------
-- The approval functions mark their own transaction in a table no client can write (a session setting could be set by
-- any role with set_config and would open the guards: found while fixing P14-a).
CREATE TABLE phase3_p14.writing (transaction_id bigint PRIMARY KEY);
REVOKE ALL ON phase3_p14.writing FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION phase3_p14.writing_now() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM phase3_p14.writing w WHERE w.transaction_id = txid_current())
$$;
REVOKE ALL ON FUNCTION phase3_p14.writing_now() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION phase3_p14.writing_now() TO authenticated;
-- P0-038: P11's checked restore is recognised by its transaction-bound ticket (phase3_p11.restoring()), never a session
-- setting. plpgsql so that P14 installs and works without P11 (the call is planned only when P11 exists).
CREATE FUNCTION phase3_p14.p11_restoring() RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF to_regprocedure('phase3_p11.restoring()') IS NULL THEN RETURN false; END IF;
  RETURN phase3_p11.restoring();
END $$;
CREATE FUNCTION phase3_p14.exempt() RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT current_setting('ledgerline.erasing', true) = 'on'
      OR phase3_p14.writing_now()   -- decide/cancel's own transaction (privilege-bound row, not a session setting)
      OR phase3_p14.p11_restoring()   -- checked backup restore (P11 ticket, not a session setting)
      OR (auth.uid() IS NULL AND current_user NOT IN ('authenticated', 'anon'))
$$;
CREATE FUNCTION phase3_p14.guard_asset_disposal_fields() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE o jsonb := CASE WHEN TG_OP = 'UPDATE' AND jsonb_typeof(OLD.data->'assets') = 'array' THEN OLD.data->'assets' ELSE '[]'::jsonb END;
  n jsonb := CASE WHEN jsonb_typeof(NEW.data->'assets') = 'array' THEN NEW.data->'assets' ELSE '[]'::jsonb END; k text; a jsonb; b jsonb;
BEGIN
  IF phase3_p14.exempt() THEN RETURN NEW; END IF;
  FOR k IN SELECT x->>'id' FROM jsonb_array_elements(o) x UNION SELECT x->>'id' FROM jsonb_array_elements(n) x LOOP
    SELECT x INTO a FROM jsonb_array_elements(o) x WHERE x->>'id' = k LIMIT 1;
    SELECT x INTO b FROM jsonb_array_elements(n) x WHERE x->>'id' = k LIMIT 1;
    IF (a->'soldOn', a->'saleValue', a->'disposal') IS DISTINCT FROM (b->'soldOn', b->'saleValue', b->'disposal')
       AND NOT (b IS NULL AND a IS NOT NULL AND a->'soldOn' IS NULL AND a->'disposal' IS NULL) THEN
      RAISE EXCEPTION 'P14_DISPOSAL_APPROVAL_REQUIRED: an asset is disposed only through an approved disposal request (evidence, reason, date, proceeds); archiving never disposes' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER p14_asset_disposal_fields BEFORE INSERT OR UPDATE ON public.finance_preferences FOR EACH ROW EXECUTE FUNCTION phase3_p14.guard_asset_disposal_fields();

CREATE FUNCTION phase3_p14.guard_disposal_entry() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF phase3_p14.exempt() THEN RETURN NEW; END IF;
  IF ('disposal' = ANY (coalesce(NEW.tags, '{}')) OR NEW.category = 'Asset disposal')
     AND (TG_OP = 'INSERT' OR NOT ('disposal' = ANY (coalesce(OLD.tags, '{}')) OR OLD.category = 'Asset disposal')) THEN
    RAISE EXCEPTION 'P14_DISPOSAL_APPROVAL_REQUIRED: disposal entries are recorded only by an approved disposal request' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER p14_disposal_entry BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION phase3_p14.guard_disposal_entry();

-- D. The request table is audit history (header D). The guards live in phase3_p14_audit, which the rollback keeps, so a
-- retained trail stays guarded.
CREATE SCHEMA IF NOT EXISTS phase3_p14_audit;
REVOKE ALL ON SCHEMA phase3_p14_audit FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA phase3_p14_audit TO anon, authenticated, service_role; -- the invoker guards call removal_allowed()
-- E2: an anonymous demo guest (demo_sessions row and still-anonymous identity), as the demo cleanup decides.
CREATE OR REPLACE FUNCTION phase3_p14_audit.demo_guest(_owner uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.demo_sessions d WHERE d.owner_id = _owner)
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _owner AND u.is_anonymous IS TRUE)
$$;
-- May this transaction remove _owner's requests? E1 (confirmed erasure of the caller's own data) or E2. SECURITY
-- INVOKER on purpose: the role check reads the caller's current_user, as the P20 guard does.
CREATE OR REPLACE FUNCTION phase3_p14_audit.removal_allowed(_owner uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE erasing boolean;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF _owner IS DISTINCT FROM auth.uid() THEN RETURN false; END IF;
    erasing := current_setting('ledgerline.erasing', true) = 'on'; -- before P18, as P20; rewritten below / by P18
    RETURN coalesce(erasing, false);
  END IF;
  IF current_user IN ('authenticated', 'anon') THEN RETURN false; END IF;
  RETURN phase3_p14_audit.demo_guest(_owner);
END $$;
CREATE OR REPLACE FUNCTION phase3_p14_audit.guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' AND phase3_p14_audit.removal_allowed(OLD.owner_id) THEN RETURN OLD; END IF;
  IF to_regnamespace('phase3_p14_retained') IS NOT NULL THEN
    RAISE EXCEPTION 'Asset disposal requests are retained audit history (P14 rolled back); they cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF to_regnamespace('phase3_p14') IS NOT NULL THEN
    -- installed: requests are written by request_asset_disposal (clients hold no INSERT), decisions only inside
    -- decide/cancel's own transaction (phase3_p14.writing) or P11's checked restore.
    IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN  -- nested: the helpers are evaluated only for an UPDATE
      IF phase3_p14.writing_now() OR phase3_p14.p11_restoring() THEN RETURN NEW; END IF;
    END IF;
  END IF;
  RAISE EXCEPTION 'P14_AUDIT_KEPT: disposal requests and decisions are audit history' USING ERRCODE = '42501';
END $$;
-- P18 already installed (install or re-install after P18): apply P18's rewrite to removal_allowed() exactly as P18's
-- install does for every guard (same patterns), saving the original so P18's rollback restores the setting read.
DO $p18$
DECLARE sig constant text := 'phase3_p14_audit.removal_allowed(uuid)'; def text; nd text;
BEGIN
  IF to_regclass('phase3_p18.saved_functions') IS NULL THEN RETURN; END IF;
  def := pg_get_functiondef(to_regprocedure(sig));
  nd := regexp_replace(def, 'coalesce\(current_setting\(''ledgerline\.erasing'',\s*true\),\s*''''\)\s*<>\s*''on''', 'NOT phase3_p18.erasure_authorised()', 'gi');
  nd := regexp_replace(nd, 'current_setting\(''ledgerline\.erasing'',\s*true\)\s*IS\s+DISTINCT\s+FROM\s*''on''', 'NOT phase3_p18.erasure_authorised()', 'gi');
  nd := regexp_replace(nd, 'coalesce\(current_setting\(''ledgerline\.erasing'',\s*true\),\s*''''\)\s*=\s*''on''', 'phase3_p18.erasure_authorised()', 'gi');
  nd := regexp_replace(nd, 'current_setting\(''ledgerline\.erasing'',\s*true\)\s*=\s*''on''', 'phase3_p18.erasure_authorised()', 'gi');
  IF nd LIKE '%current_setting(''ledgerline.erasing''%' OR nd IS NOT DISTINCT FROM def THEN
    RAISE EXCEPTION 'P14: % could not be moved to the P18 erasure authority', sig;
  END IF;
  INSERT INTO phase3_p18.saved_functions(signature, definition) VALUES (sig, def)
    ON CONFLICT (signature) DO UPDATE SET definition = EXCLUDED.definition;
  EXECUTE nd;
END $p18$;
-- Record upkeep while retained: refresh only from a verified pre-delete state (remaining + deleted rows match the record
-- and both guards are enabled 'O'), else mark the record stale for good. Row text is rendered with pinned settings.
CREATE OR REPLACE FUNCTION phase3_p14_audit.track_retained() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  SET TimeZone = 'UTC' SET DateStyle = 'ISO, MDY' SET IntervalStyle = 'postgres' SET extra_float_digits = 1 AS $$
DECLARE r record; before_n bigint; before_h text;
BEGIN
  IF to_regclass('phase3_p14_retained.rollback') IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO r FROM phase3_p14_retained.rollback FOR UPDATE; -- serialises record upkeep
  IF r.content_md5 LIKE 'stale%' THEN RETURN NULL; END IF;  -- never refreshed again
  SELECT count(*), md5(coalesce(string_agg(x::text, E'\n' ORDER BY x.id), '')) INTO before_n, before_h
    FROM (SELECT * FROM public.asset_disposal_requests UNION ALL SELECT * FROM p14_removed) x;
  IF before_n IS DISTINCT FROM r.rows OR before_h IS DISTINCT FROM r.content_md5
     OR (SELECT count(*) FROM pg_trigger g WHERE g.tgrelid = 'public.asset_disposal_requests'::regclass AND g.tgenabled = 'O'
          AND g.tgname IN ('asset_disposal_requests_guard', 'asset_disposal_requests_no_truncate')
          AND g.tgfoid = 'phase3_p14_audit.guard()'::regprocedure) <> 2 THEN
    UPDATE phase3_p14_retained.rollback SET content_md5 = format('stale since %s: rows changed outside the guards (record %s rows md5 %s; before delete %s rows md5 %s)',
      to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), r.rows, r.content_md5, before_n, before_h);
    RETURN NULL;
  END IF;
  UPDATE phase3_p14_retained.rollback SET rows = (SELECT count(*) FROM public.asset_disposal_requests),
    content_md5 = (SELECT md5(coalesce(string_agg(c::text, E'\n' ORDER BY c.id), '')) FROM public.asset_disposal_requests c);
  RETURN NULL;
END $$;
-- E1 follow-up: every erasure body deletes the caller's expenses; in that statement the caller's requests go too.
CREATE OR REPLACE FUNCTION phase3_p14_audit.follow_erasure() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND phase3_p14_audit.removal_allowed(auth.uid()) THEN
    DELETE FROM public.asset_disposal_requests q WHERE q.owner_id = auth.uid();
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION phase3_p14_audit.demo_guest(uuid), phase3_p14_audit.removal_allowed(uuid), phase3_p14_audit.guard(), phase3_p14_audit.follow_erasure(),
  phase3_p14_audit.track_retained() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION phase3_p14_audit.removal_allowed(uuid) TO anon, authenticated, service_role; -- read-only answer for the caller
GRANT EXECUTE ON FUNCTION phase3_p14_audit.demo_guest(uuid) TO service_role;
DROP TRIGGER IF EXISTS asset_disposal_requests_guard ON public.asset_disposal_requests;
CREATE TRIGGER asset_disposal_requests_guard BEFORE INSERT OR UPDATE OR DELETE ON public.asset_disposal_requests
  FOR EACH ROW EXECUTE FUNCTION phase3_p14_audit.guard();
DROP TRIGGER IF EXISTS asset_disposal_requests_no_truncate ON public.asset_disposal_requests;
CREATE TRIGGER asset_disposal_requests_no_truncate BEFORE TRUNCATE ON public.asset_disposal_requests
  FOR EACH STATEMENT EXECUTE FUNCTION phase3_p14_audit.guard();
DROP TRIGGER IF EXISTS asset_disposal_requests_retained_record ON public.asset_disposal_requests;
CREATE TRIGGER asset_disposal_requests_retained_record AFTER DELETE ON public.asset_disposal_requests
  REFERENCING OLD TABLE AS p14_removed FOR EACH STATEMENT EXECUTE FUNCTION phase3_p14_audit.track_retained();
DROP TRIGGER IF EXISTS p14_disposal_requests_follow_erasure ON public.expenses;
CREATE TRIGGER p14_disposal_requests_follow_erasure AFTER DELETE ON public.expenses
  FOR EACH STATEMENT EXECUTE FUNCTION phase3_p14_audit.follow_erasure();
DROP POLICY IF EXISTS "P14 requests recorded only by the disposal workflow" ON public.asset_disposal_requests;
CREATE POLICY "P14 requests recorded only by the disposal workflow" ON public.asset_disposal_requests AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "P14 requests cannot be changed" ON public.asset_disposal_requests;
CREATE POLICY "P14 requests cannot be changed" ON public.asset_disposal_requests AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "P14 requests cannot be deleted" ON public.asset_disposal_requests;
CREATE POLICY "P14 requests cannot be deleted" ON public.asset_disposal_requests AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);
DROP POLICY IF EXISTS "P14 service reads disposal requests" ON public.asset_disposal_requests;
CREATE POLICY "P14 service reads disposal requests" ON public.asset_disposal_requests FOR SELECT TO service_role USING (true);
DROP POLICY IF EXISTS "P14 demo cleanup removes guest requests" ON public.asset_disposal_requests;
CREATE POLICY "P14 demo cleanup removes guest requests" ON public.asset_disposal_requests FOR DELETE TO service_role USING (phase3_p14_audit.demo_guest(owner_id));

-- --------------------------------------------------------------------------------------------
-- P7/P8 posting of an approved disposal (wrap P8's classify hook when present)
-- --------------------------------------------------------------------------------------------
DO $w$
DECLARE fn regprocedure := to_regprocedure('phase3_p7.classify_adjustment(public.expenses,uuid,text)'); def text;
BEGIN
  IF fn IS NULL THEN RETURN; END IF;
  def := pg_get_functiondef(fn);
  INSERT INTO phase3_p14.saved_functions VALUES ('phase3_p7.classify_adjustment(public.expenses,uuid,text)', def);
  EXECUTE replace(def, 'FUNCTION phase3_p7.classify_adjustment(', 'FUNCTION phase3_p14.prior_classify(');
  EXECUTE $f$
CREATE OR REPLACE FUNCTION phase3_p7.classify_adjustment(_e public.expenses, _account_entity uuid, _account_role text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $b$
DECLARE r public.asset_disposal_requests; a jsonb;
  x jsonb := jsonb_build_object('entryId', _e.id, 'date', _e.expense_date, 'amount', _e.amount, 'type', 'adjustment');
BEGIN
  IF 'disposal' = ANY (coalesce(_e.tags, '{}')) THEN
    SELECT * INTO r FROM public.asset_disposal_requests q WHERE q.owner_id = _e.employee_id AND q.entry_id = _e.id AND q.status = 'approved';
    IF NOT FOUND THEN
      RETURN x || jsonb_build_object('exception', 'asset_disposal_workflow', 'detail', 'Disposal entry without an approved disposal request; not posted');
    END IF;
    a := r.inputs->'asset';
    IF _e.amount IS DISTINCT FROM r.book_value OR _e.expense_date IS DISTINCT FROM r.disposal_date OR _e.adjustment_sign IS DISTINCT FROM -1
       OR _e.account_id IS DISTINCT FROM nullif(a->>'accountId', '')::uuid OR _account_role IS DISTINCT FROM 'asset' THEN
      RETURN x || jsonb_build_object('exception', 'asset_disposal_mismatch', 'detail', 'Disposal entry differs from its approved request');
    END IF;
    RETURN jsonb_build_object('entity', _account_entity, 'source', 'asset_disposal', 'request', r.id,
      'lines', phase3_p7.leg('expense:Loss on asset disposal (book value)', 'expense', _e.amount, NULL, NULL, 'Disposal ' || r.asset_name)
            || phase3_p7.leg('account:' || _e.account_id, 'asset', -_e.amount, _e.account_id, NULL, _e.title));
  END IF;
  RETURN phase3_p14.prior_classify(_e, _account_entity, _account_role);
END $b$;$f$;
  REVOKE ALL ON FUNCTION phase3_p7.classify_adjustment(public.expenses, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
  REVOKE ALL ON FUNCTION phase3_p14.prior_classify(public.expenses, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
END $w$;

REVOKE ALL ON FUNCTION public.request_asset_disposal(text, text, date, numeric, uuid, uuid[], text, uuid, jsonb, numeric),
  public.decide_asset_disposal(uuid, boolean, text, numeric), public.cancel_asset_disposal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_asset_disposal(text, text, date, numeric, uuid, uuid[], text, uuid, jsonb, numeric),
  public.decide_asset_disposal(uuid, boolean, text, numeric), public.cancel_asset_disposal(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.preview_asset_disposal(text, date, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_asset_disposal(text, date, numeric) TO authenticated;
REVOKE ALL ON FUNCTION phase3_p14.num(jsonb), phase3_p14.book_value(jsonb, date) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA phase3_p14 TO authenticated; -- the SELECT policy and the guards call the helpers below
REVOKE ALL ON FUNCTION phase3_p14.asset_of(uuid, text), phase3_p14.guard_asset_disposal_fields(), phase3_p14.guard_disposal_entry() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION phase3_p14.may_approve(uuid, text), phase3_p14.step_up_ok(), phase3_p14.exempt(), phase3_p14.p11_restoring() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION phase3_p14.may_approve(uuid, text), phase3_p14.exempt(), phase3_p14.p11_restoring() TO authenticated;
REVOKE ALL ON phase3_p14.saved_functions FROM PUBLIC, anon, authenticated;

DO $post$
BEGIN
  -- D: only the table owner, authenticated (SELECT) and service_role (SELECT, DELETE) hold any privilege on the trail
  -- (also on an adopted retained table: a stray grant made while it was retained is refused, not carried forward).
  IF EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) x WHERE c.oid = 'public.asset_disposal_requests'::regclass AND x.grantee <> c.relowner
              AND NOT ((x.grantee = 'authenticated'::regrole AND x.privilege_type = 'SELECT')
                    OR (x.grantee = 'service_role'::regrole AND x.privilege_type IN ('SELECT', 'DELETE')))) THEN
    RAISE EXCEPTION 'P14: unexpected privilege on public.asset_disposal_requests';
  END IF;
  IF (SELECT count(*) FROM pg_constraint c WHERE c.conrelid = 'public.asset_disposal_requests'::regclass AND c.contype = 'f') <> 0 THEN
    RAISE EXCEPTION 'P14: the disposal audit trail must not depend on other rows';
  END IF;
END $post$;
COMMIT;
