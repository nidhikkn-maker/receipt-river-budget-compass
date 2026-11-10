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
--   * P11 installed: a checked backup restore (phase3_p11.checked) may carry disposals recorded in the backup.
-- Rollback: P14_asset_disposal_approval.rollback.sql (exact pre-P14 catalog; refuses while requests exist unless
-- approved). No existing row or value is changed.
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
--    server re-computes the book value at approval; a register change since the request refuses (P14_CHANGED).
-- C. Guards: soldOn / saleValue / disposal of an asset change ONLY through B (P14_DISPOSAL_APPROVAL_REQUIRED), and a
--    disposal-tagged entry is inserted ONLY by B. Archiving (archived / archive status / recordArchive) never touches
--    these fields, so archiving can never dispose. Erasure and the service path are exempt.
-- P14-a (fixed 10 Nov 2026, WS-E batch 6-8 check): the database no longer trusts the caller's book value. It works the
--   book value out itself from the stored register (phase3_p14.book_value: the app's uniform monthly working at full
--   precision, KK decision 4) and refuses a request or approval whose figure differs by more than 0.50 + 0.005 per month
--   worked (P14_BOOK_VALUE); assets whose working it cannot reproduce (recorded prospective estimate changes, a property's
--   building policy, missing method/rate) are refused, never trusted (P14_UNVERIFIABLE). Approval needs a recent step-up:
--   with P4 every decision needs it; WITHOUT P4 approvals fail closed (P14_STEP_UP_UNAVAILABLE), rejections still work.
--   preview_asset_disposal (STABLE, read-only) returns the database's working for the I05 preview (R-E-I14).
--   decide/cancel mark their transaction in phase3_p14.writing (a table no client can write) instead of the session
--   setting phase3_p14.writing, which any role could set to open the guards in C.
-- Known limit (KK review): the app engine stays the source of the posted paise figure; the database bounds it within the
-- tolerance above rather than running a second posting engine. 0069's closed-period register guard still
-- applies to the asset change: an asset bought before a closed period cannot be changed (also not disposed) until
-- that period rule is made disposal-date aware.
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase3_p14') IS NOT NULL THEN RAISE EXCEPTION 'P14 is already installed'; END IF;
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
CREATE TABLE public.asset_disposal_requests (
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
);
CREATE UNIQUE INDEX asset_disposal_requests_one_open ON public.asset_disposal_requests (owner_id, asset_id) WHERE status IN ('pending', 'approved');
ALTER TABLE public.asset_disposal_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asset_disposal_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.asset_disposal_requests TO authenticated;
GRANT ALL ON public.asset_disposal_requests TO service_role;
CREATE POLICY "Disposal requests: owner and approvers read" ON public.asset_disposal_requests FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR phase3_p14.may_approve(owner_id, entity_id));

CREATE FUNCTION public.request_asset_disposal(p_asset text, p_method text, p_date date, p_proceeds numeric, p_proceeds_entry uuid,
  p_evidence uuid[], p_reason text, p_book_value numeric, p_entry uuid, p_inputs jsonb DEFAULT '{}'::jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); a jsonb; why text := btrim(coalesce(p_reason, '')); rid uuid; acc uuid; b jsonb;
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
  IF p_book_value IS NULL OR p_book_value < 0 THEN RAISE EXCEPTION 'P14_INVALID: book value' USING ERRCODE = '22023'; END IF;
  -- P14-a: the database works the book value out from the stored register; a caller's figure is only accepted within tolerance.
  b := phase3_p14.book_value(a, p_date);
  IF b ? 'unverifiable' THEN RAISE EXCEPTION 'P14_UNVERIFIABLE: the database cannot check this asset''s book value (%); nothing was requested', b->>'unverifiable' USING ERRCODE = '22023'; END IF;
  IF abs(round(p_book_value, 2) - (b->>'value')::numeric) > (b->>'tolerance')::numeric THEN
    RAISE EXCEPTION 'P14_BOOK_VALUE: the book value % does not follow from the register (the database works out %)', round(p_book_value, 2), b->>'value' USING ERRCODE = '22023';
  END IF;
  acc := nullif(a->>'accountId', '')::uuid;
  IF p_book_value > 0 AND (acc IS NULL OR NOT EXISTS (SELECT 1 FROM public.accounts x WHERE x.id = acc AND x.owner_id = uid)) THEN
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
    round(p_proceeds, 2), p_proceeds_entry, p_evidence, why, round(p_book_value, 2), round(p_proceeds, 2) - round(p_book_value, 2), p_entry,
    coalesce(p_inputs, '{}') || jsonb_build_object('asset', a, 'database', b), uid)
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
    IF p_book_value IS NULL OR round(p_book_value, 2) <> r.book_value OR (a - 'archived' - 'archivedAt' - 'archivedBy' - 'archiveReason' - 'archiveHistory') IS DISTINCT FROM ((r.inputs->'asset') - 'archived' - 'archivedAt' - 'archivedBy' - 'archiveReason' - 'archiveHistory') THEN
      RAISE EXCEPTION 'P14_CHANGED: the asset or its book value changed since the request; prepare a new request' USING ERRCODE = '40001';
    END IF;
    b := phase3_p14.book_value(a, r.disposal_date);
    IF b ? 'unverifiable' THEN RAISE EXCEPTION 'P14_UNVERIFIABLE: the database cannot check this asset''s book value (%)', b->>'unverifiable' USING ERRCODE = '22023'; END IF;
    IF abs(r.book_value - (b->>'value')::numeric) > (b->>'tolerance')::numeric THEN
      RAISE EXCEPTION 'P14_BOOK_VALUE: the request''s book value % does not follow from the register (the database works out %)', r.book_value, b->>'value' USING ERRCODE = '22023';
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

-- R-E-I14: read-only preview of what a request would record (STABLE: it cannot write). The server function adds the app
-- engine's paise figure and the planned entries; this returns the database's own check so the screen shows both.
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
  RETURN jsonb_build_object('bookValue', (b->>'value')::numeric, 'tolerance', (b->>'tolerance')::numeric, 'months', (b->>'months')::int,
    'gain', CASE WHEN b ? 'value' AND p_proceeds IS NOT NULL THEN round(p_proceeds, 2) - (b->>'value')::numeric END, 'accountId', acc, 'problems', to_jsonb(problems));
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
CREATE FUNCTION phase3_p14.exempt() RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT current_setting('ledgerline.erasing', true) = 'on'
      OR phase3_p14.writing_now()   -- decide/cancel's own transaction (privilege-bound row, not a session setting)
      OR coalesce(current_setting('phase3_p11.checked', true), '') = 'on'   -- checked backup restore (P11)
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

CREATE FUNCTION phase3_p14.guard_requests() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF phase3_p14.exempt() THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  RAISE EXCEPTION 'P14_AUDIT_KEPT: disposal requests and decisions are audit history' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER p14_requests_kept BEFORE UPDATE OR DELETE ON public.asset_disposal_requests FOR EACH ROW EXECUTE FUNCTION phase3_p14.guard_requests();

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

REVOKE ALL ON FUNCTION public.request_asset_disposal(text, text, date, numeric, uuid, uuid[], text, numeric, uuid, jsonb),
  public.decide_asset_disposal(uuid, boolean, text, numeric), public.cancel_asset_disposal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_asset_disposal(text, text, date, numeric, uuid, uuid[], text, numeric, uuid, jsonb),
  public.decide_asset_disposal(uuid, boolean, text, numeric), public.cancel_asset_disposal(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.preview_asset_disposal(text, date, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_asset_disposal(text, date, numeric) TO authenticated;
REVOKE ALL ON FUNCTION phase3_p14.num(jsonb), phase3_p14.book_value(jsonb, date) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA phase3_p14 TO authenticated; -- the SELECT policy and the guards call the helpers below
REVOKE ALL ON FUNCTION phase3_p14.asset_of(uuid, text), phase3_p14.guard_asset_disposal_fields(), phase3_p14.guard_disposal_entry() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION phase3_p14.may_approve(uuid, text), phase3_p14.step_up_ok(), phase3_p14.exempt(), phase3_p14.guard_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION phase3_p14.may_approve(uuid, text), phase3_p14.exempt(), phase3_p14.guard_requests() TO authenticated;
REVOKE ALL ON phase3_p14.saved_functions FROM PUBLIC, anon, authenticated;
COMMIT;
