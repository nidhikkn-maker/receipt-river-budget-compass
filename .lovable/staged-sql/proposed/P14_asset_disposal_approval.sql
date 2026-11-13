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
--   * P18 (erasure authority) is installed LAST and rolled back FIRST (P18 header). P18 rewrites phase3_p14.exempt() and
--     phase3_p14_audit.removal_allowed(), which read ledgerline.erasing, to its transaction-bound authority and saves the
--     originals for its own rollback. A P14 install or re-install while P18 is installed would re-create those functions
--     trusting the setting (an owner could set it in plain SQL and dispose an asset without approval), and a P14 rollback
--     under P18 would drop phase3_p14.exempt() that P18's rollback must restore; so both refuse while phase3_p18 exists
--     (review of fab1ed3, M1): roll back P18 first, then P14 (or install P14), then re-install P18.
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
--         erasure authority once P18 is installed; before P18 the condition is the session setting ledgerline.erasing,
--         which any role can set, exactly as the applied guards and P20 before P18: accepted for now, KK decision brief).
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
-- P14-c (13 Nov 2026, Track A; WS-E fin8, independent note 4226890837): an asset id may be stored more than once (an
--   excluded duplicate, a second copy, another owner's copy). The copy priced, checked and disposed is chosen by
--   phase3_p14.asset_copy with the app's own rule (disposalCopy → disposedOn / depreciationCopy) for the disposal month
--   and the owner (new optional p_owner_entity on request / preview; '' = personal); its array position is stored in
--   asset_ordinal. Approval locks the register row, re-chooses the copy, requires the same ordinal and a byte-identical row
--   (else P14_CHANGED, nothing written) and writes soldOn / saleValue / disposal on THAT row only (before: every row with
--   the id, other owners' included). The disposal-field guard also compares every row of an id (multiset), not only the
--   first. The request's figure follows phase3_p14.book_value as before (app parity: src/lib/p14-asset-disposal-sql.test.ts).
-- P14-d (13 Nov 2026, Track A; independent review of 6ea9c77, M1 + L1-L4):
--   M1 open requests are unique per COPY owner: new column asset_owner_entity (text NOT NULL DEFAULT '', '' = personal), set
--      by request_asset_disposal from the chosen copy's owner, and the open-request index is (owner_id, asset_id,
--      asset_owner_entity). Before, once entity A's copy of an id was approved, entity B's copy of that id could never be
--      requested (P14_PENDING for good). The approval re-chooses the copy for asset_owner_entity.
--   L1 app parity edges (WS-E fin9): a kind that is not one of src/lib/assets.ts ASSET_KINDS' own keys is unreadable and a
--      chosen copy with such a kind is refused (P14_UNVERIFIABLE), never priced; ownerEntityId counts only as a non-empty
--      JSON string (false, 0, 1, '', null = personal); a JSON number is truthy iff JS parses it to non-zero (1e-400 → 0,
--      falsy; 1e400 → Infinity, truthy): |x| > 2^-1075, worked exactly in numeric (a float8 cast raises out of range).
--   L2 a row whose disposal names an approved request of the owner is bound to it: it stays at the approved position
--      (asset_ordinal) with the id and financial fields priced (cost, inUse, kind, ownerEntityId, bookMethod, bookRatePct,
--      usefulLifeYears, residualPct); operational fields (name, location, notes, ...) stay editable
--      (phase3_p14.sold_rows_moved, called by the disposal-field guard; P14-e: phase3_p14.sold_row_refusal). Before, sold facts could be moved onto another
--      copy of the id and a sold row's owner or cost changed.
--   L4 a request without asset_ordinal (recorded before P14-c) is never approved (explicit P14_CHANGED); it can be
--      rejected or cancelled.
-- P14-e (13 Nov 2026, Track A; independent review of 4d3ba2cf, M-a + M-b + lows):
--   M-a a sold row bound to its approved request is compared by meaning, not bytes (phase3_p14.sold_row_refusal, replacing
--      sold_rows_moved): the app rewrites a row as it displays it (ownerEntityId ''/null/false/whitespace dropped, bookMethod
--      missing/invalid -> 'slm', bookRatePct missing -> 0), so a name-only edit of a sold row stored untidied was refused.
--      Now: id, owner_of = the request's copy owner, kind, inUse, cost, normalised method / rate / life / residual equal to
--      the priced row's, the book value at the disposal date (book_value: also freezes openingWdv, adjustments,
--      policyHistory, buildingPolicy where they move the figure) equal to r.book_value and verifiable, soldOn / saleValue
--      equal to the request's date and proceeds.
--   M-b excluding the sold copy (excludedAt truthy on the row bound to an approved request) is refused ('a sold copy cannot be
--      excluded'): it undid the disposal (the other copy then previewed as held). The preview's open-request check counts
--      'approved' as well as 'pending', as the open-request index does.
--   L2 position: the sold row keeps its rank among the non-excluded copies of the same id and owner (the order that decides
--      which copy counts), compared with the previous register; unrelated rows may be inserted before it.
--   Lows: the fallback copy is refused (P14_UNVERIFIABLE) whenever cleanAssets would drop it (no string name, no numeric
--      cost, inUse not YYYY-MM-DD), not only for an unknown kind; a whitespace-only ownerEntityId (JS trim() empty) is
--      personal (phase3_p14.js_blank), also as a named p_owner_entity.
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
  -- M1: P18 is installed last; installing P14 under it would re-create guards that trust ledgerline.erasing.
  IF to_regnamespace('phase3_p18') IS NOT NULL THEN
    RAISE EXCEPTION 'P14: P18 (erasure authority) is installed; roll back P18 first, install P14, then re-install P18 (P18 is installed last)';
  END IF;
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
-- P14-c (copy rule, 13 Nov 2026, Track A; WS-E fin8 / independent note 4226890837). finance_preferences.data->'assets' may
-- hold an asset id more than once (a duplicate excluded with excludedAt, a second copy, a copy under another owner via
-- ownerEntityId). The first-row lookup used before priced the wrong copy (land stored before machinery: the land's cost)
-- and the approval marked EVERY row with the id sold, other owners' copies included. The copy is now chosen exactly as
-- the app's disposalCopy (asset-disposal.ts) → disposedOn / depreciationCopy (books/depreciation.ts) for the disposal
-- month and the asset's owner (ownerEntityId; NULL = personal):
--   1. copies: object rows with that string id, not excluded (excludedAt falsy, JS truthiness), of that owner. With no
--      owner named, copies under more than one owner are refused (P14_OWNER), else that one owner;
--   2. readable copies (cleanAssets: string name, a known kind, numeric cost, inUse YYYY-MM-DD) that depreciate
--      (kind <> 'property'; a property whose building is depreciated is refused below, never guessed);
--   3. sale stop (saleStops): sold copies (soldOn truthy, inUse <= soldOn) in soldOn order, storage order on ties; the first
--      one that is the copy chosen in its own sale month disposes the asset: refused P14_ALREADY_DISPOSED (any month);
--   4. chosen: the first depreciating copy, in storage order, in the figure for the month (inFigureAt: not sold before its
--      inUse, inUse month <= month, not sold in an earlier month);
--   5. else (no depreciating copy in the figure, e.g. land) the first copy in use by the month and not sold in an earlier
--      month, else the first copy.
-- Text comparisons are COLLATE "C" (JS string order). The chosen row's 1-based position in the stored array (ordinal) is
-- returned with it; request_asset_disposal records it (asset_ordinal) and the approval writes only that row, after
-- re-checking under the register's row lock that it is still byte-identical to the row priced. A property copy with a
-- building policy is refused (P14_UNVERIFIABLE): whether the app depreciates it (buildingAsset: approved policy, cost
-- basis, reconciliation) is not reproduced here, so the choice is not guessed (book_value refuses those anyway).
-- P14-d (L1c): a JSON number is truthy iff JS parses it to a non-zero double. Values with |x| <= 2^-1075 round to 0 in
-- JS (1e-400 → 0; exactly 2^-1075 ties to even, 0); larger ones are non-zero (1e400 → Infinity). Worked exactly in numeric:
-- a float8 cast raises "out of range" for 1e-400 / 1e400 instead of rounding as JS does.
CREATE FUNCTION phase3_p14.truthy(_v jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE jsonb_typeof(_v) WHEN 'string' THEN (_v #>> '{}') <> '' WHEN 'boolean' THEN _v = 'true'::jsonb
    WHEN 'number' THEN abs((_v #>> '{}')::numeric) * power(2::numeric, 1075) > 1 WHEN 'object' THEN true WHEN 'array' THEN true ELSE false END
$$;
-- P14-e: true when JS String.prototype.trim() leaves nothing (ECMAScript WhiteSpace + LineTerminator: TAB, LF, VT, FF, CR,
-- SPACE, NBSP, U+1680, U+2000-U+200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF). NULL stays NULL.
CREATE FUNCTION phase3_p14.js_blank(_s text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT btrim(_s, chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32) || chr(160) || chr(5760) || chr(8192) || chr(8193) || chr(8194)
    || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) || chr(8232) || chr(8233) || chr(8239)
    || chr(8287) || chr(12288) || chr(65279)) = ''
$$;
-- P14-d (L1b): the owner of a copy, as the app normalises ownerEntityId (WS-E fin9): a non-empty JSON string, else personal
-- (NULL). false, 0, 1, true, '' and null are all personal. P14-e: a whitespace-only string (JS trim() empty) is personal
-- too, as the app's ownerEntityId.trim() check; a non-blank string is returned as stored.
CREATE FUNCTION phase3_p14.owner_of(_a jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN jsonb_typeof(_a->'ownerEntityId') = 'string' AND NOT phase3_p14.js_blank(_a->>'ownerEntityId') THEN _a->>'ownerEntityId' END
$$;
-- P14-d (L1a): src/lib/assets.ts ASSET_KINDS own keys (the app's cleanAssets checks Object.hasOwn(ASSET_KINDS, kind), WS-E
-- fin9); anything else ("toString", "constructor", "", a number) is unreadable.
CREATE FUNCTION phase3_p14.known_kind(_a jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT jsonb_typeof(_a->'kind') = 'string' AND (_a->>'kind') IN ('property', 'building', 'vehicle', 'machinery', 'computer', 'furniture', 'other')
$$;
-- books/depreciation.ts inFigureAt(a, m)
CREATE FUNCTION phase3_p14.in_figure(_a jsonb, _m text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(
    NOT (phase3_p14.truthy(_a->'soldOn') AND (_a->>'soldOn') COLLATE "C" < (_a->>'inUse') COLLATE "C")
    AND left(_a->>'inUse', 7) COLLATE "C" <= _m COLLATE "C"
    AND NOT (phase3_p14.truthy(_a->'soldOn') AND left(_a->>'soldOn', 7) COLLATE "C" < _m COLLATE "C"), false)
$$;
-- Returns NULL (no copy of that id for that owner), {"refused": message, "code": sqlstate}, or
-- {"asset": the stored row, "ordinal": its 1-based position, "ownerEntityId": owner or null}.
-- _entity: the owner whose copy is meant ('' or NULL = personal) when _named; when not _named, the single owner.
CREATE FUNCTION phase3_p14.asset_copy(_owner uuid, _asset text, _on date, _entity text, _named boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE copies jsonb; mine jsonb; dep jsonb; ent text; m text := to_char(_on, 'YYYY-MM'); s record; first_o bigint; pick_o bigint; pick_a jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object('o', t.o, 'a', t.x,
           'w', phase3_p14.owner_of(t.x)) ORDER BY t.o), '[]'::jsonb)
    INTO copies
    FROM public.finance_preferences p,
         jsonb_array_elements(CASE WHEN jsonb_typeof(p.data->'assets') = 'array' THEN p.data->'assets' ELSE '[]'::jsonb END) WITH ORDINALITY t(x, o)
   WHERE p.owner_id = _owner AND jsonb_typeof(t.x) = 'object' AND jsonb_typeof(t.x->'id') = 'string' AND t.x->>'id' = _asset
     AND NOT phase3_p14.truthy(t.x->'excludedAt');
  IF jsonb_array_length(copies) = 0 THEN RETURN NULL; END IF;
  IF _named THEN ent := CASE WHEN NOT phase3_p14.js_blank(_entity) THEN _entity END;   -- P14-e: blank = personal, as owner_of
  ELSE
    IF (SELECT count(DISTINCT coalesce(c->>'w', '')) FROM jsonb_array_elements(copies) c) > 1 THEN
      RETURN jsonb_build_object('code', '22023', 'refused', 'P14_OWNER: this asset is recorded under more than one owner; name the owner whose copy is disposed (p_owner_entity, '''' for personal). Nothing was requested');
    END IF;
    ent := copies->0->>'w';
  END IF;
  SELECT coalesce(jsonb_agg(c ORDER BY (c->>'o')::bigint), '[]'::jsonb) INTO mine FROM jsonb_array_elements(copies) c WHERE (c->>'w') IS NOT DISTINCT FROM ent;
  IF jsonb_array_length(mine) = 0 THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(mine) c WHERE c->'a'->>'kind' = 'property'
              AND jsonb_typeof(c->'a'->'buildingPolicy') = 'array' AND jsonb_array_length(c->'a'->'buildingPolicy') > 0) THEN
    RETURN jsonb_build_object('code', '22023', 'refused', 'P14_UNVERIFIABLE: the database cannot check this asset''s book value (a copy is a property with a building depreciation policy); nothing was requested');
  END IF;
  -- 2. readable (cleanAssets) and depreciating
  SELECT coalesce(jsonb_agg(c ORDER BY (c->>'o')::bigint), '[]'::jsonb) INTO dep FROM jsonb_array_elements(mine) c
   WHERE jsonb_typeof(c->'a'->'name') = 'string' AND phase3_p14.known_kind(c->'a')
     AND jsonb_typeof(c->'a'->'cost') = 'number' AND jsonb_typeof(c->'a'->'inUse') = 'string' AND (c->'a'->>'inUse') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND c->'a'->>'kind' <> 'property';
  -- 3. sale stop
  FOR s IN SELECT (c->>'o')::bigint o, c->'a'->>'soldOn' sold FROM jsonb_array_elements(dep) c
            WHERE phase3_p14.truthy(c->'a'->'soldOn') AND (c->'a'->>'inUse') COLLATE "C" <= (c->'a'->>'soldOn') COLLATE "C"
            ORDER BY (c->'a'->>'soldOn') COLLATE "C", (c->>'o')::bigint LOOP
    first_o := (SELECT (c->>'o')::bigint FROM jsonb_array_elements(dep) c WHERE phase3_p14.in_figure(c->'a', left(s.sold, 7)) ORDER BY (c->>'o')::bigint LIMIT 1);
    IF first_o = s.o THEN
      RETURN jsonb_build_object('code', '42501', 'refused', format('P14_ALREADY_DISPOSED: already disposed on %s (the copy depreciation was worked from was sold); check the duplicate. Nothing was requested', s.sold));
    END IF;
  END LOOP;
  -- 4. the copy depreciation is worked from in the month
  SELECT (c->>'o')::bigint, c->'a' INTO pick_o, pick_a FROM jsonb_array_elements(dep) c WHERE phase3_p14.in_figure(c->'a', m) ORDER BY (c->>'o')::bigint LIMIT 1;
  -- 5. fallback (no depreciating copy in the figure): in use by the month and not sold earlier, else the first copy
  IF pick_o IS NULL THEN
    SELECT (c->>'o')::bigint, c->'a' INTO pick_o, pick_a FROM jsonb_array_elements(mine) c
     WHERE jsonb_typeof(c->'a'->'inUse') = 'string' AND left(c->'a'->>'inUse', 7) COLLATE "C" <= m COLLATE "C"
       AND NOT (phase3_p14.truthy(c->'a'->'soldOn') AND left(c->'a'->>'soldOn', 7) COLLATE "C" < m COLLATE "C")
     ORDER BY (c->>'o')::bigint LIMIT 1;
  END IF;
  IF pick_o IS NULL THEN pick_o := (mine->0->>'o')::bigint; pick_a := mine->0->'a'; END IF;
  -- P14-d (L1a): a fallback copy whose kind is not an asset kind is unreadable to the app; it is refused, never priced.
  IF NOT coalesce(phase3_p14.known_kind(pick_a), false) THEN
    RETURN jsonb_build_object('code', '22023', 'refused', 'P14_UNVERIFIABLE: the database cannot check this asset''s book value (the copy has no known asset kind); nothing was requested');
  END IF;
  -- P14-e: any copy cleanAssets drops (no string name, no numeric cost, inUse not YYYY-MM-DD) is not shown or depreciated by
  -- the app either; it is refused, never priced or disposed.
  IF NOT coalesce(jsonb_typeof(pick_a->'name') = 'string' AND jsonb_typeof(pick_a->'cost') = 'number'
                  AND jsonb_typeof(pick_a->'inUse') = 'string' AND (pick_a->>'inUse') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$', false) THEN
    RETURN jsonb_build_object('code', '22023', 'refused', 'P14_UNVERIFIABLE: the database cannot check this asset''s book value (the copy is not a readable asset: it needs a name, a numeric cost and a put-to-use date YYYY-MM-DD); nothing was requested');
  END IF;
  RETURN jsonb_build_object('asset', pick_a, 'ordinal', pick_o, 'ownerEntityId', ent);
END $$;
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
  IF method NOT IN ('slm', 'wdv') OR rp < 0 OR life < 0 OR rate < 0 OR rate > 100 OR (rate IS NULL AND NOT (life > 0)) OR (method = 'wdv' AND rate IS NULL AND NOT (life > 0 AND rp > 0)) THEN
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
  asset_ordinal integer CHECK (asset_ordinal >= 1), -- P14-c: always set by request_asset_disposal; a row without it is never approved
  asset_owner_entity text NOT NULL DEFAULT '', -- P14-d: the chosen copy's owner (ownerEntityId; '' = personal); open requests are unique per copy owner
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
    CREATE UNIQUE INDEX asset_disposal_requests_one_open ON public.asset_disposal_requests (owner_id, asset_id, asset_owner_entity) WHERE status IN ('pending', 'approved');
  END IF;
  CREATE UNIQUE INDEX shape_reference_one_open ON phase3_p14.shape_reference (owner_id, asset_id, asset_owner_entity) WHERE status IN ('pending', 'approved');
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
-- P14-c: p_owner_entity names whose copy is disposed (the asset's ownerEntityId; '' = personal). NULL = not named: the
-- copies must then all belong to one owner (else P14_OWNER), as the app's disposalCopy with no owner. The copy is chosen
-- by phase3_p14.asset_copy (the app's rule for the disposal month); its position is stored in asset_ordinal.
CREATE FUNCTION public.request_asset_disposal(p_asset text, p_method text, p_date date, p_proceeds numeric, p_proceeds_entry uuid,
  p_evidence uuid[], p_reason text, p_entry uuid, p_inputs jsonb DEFAULT '{}'::jsonb, p_book_value numeric DEFAULT NULL,
  p_owner_entity text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); a jsonb; c jsonb; why text := btrim(coalesce(p_reason, '')); rid uuid; acc uuid; b jsonb; bv numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  c := phase3_p14.asset_copy(uid, p_asset, p_date, p_owner_entity, p_owner_entity IS NOT NULL);
  IF c IS NULL THEN RAISE EXCEPTION 'P14_NOT_FOUND: that asset is not in your register' USING ERRCODE = 'P0002'; END IF;
  IF c ? 'refused' THEN RAISE EXCEPTION '%', c->>'refused' USING ERRCODE = c->>'code'; END IF;
  a := c->'asset';
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
  INSERT INTO public.asset_disposal_requests(owner_id, asset_id, asset_name, asset_ordinal, asset_owner_entity, entity_id, method, disposal_date, proceeds, proceeds_entry_id,
    evidence_document_ids, reason, book_value, gain, entry_id, inputs, requested_by)
  VALUES (uid, p_asset, left(coalesce(a->>'name', p_asset), 200), (c->>'ordinal')::int, coalesce(c->>'ownerEntityId', ''),
    coalesce(c->>'ownerEntityId', CASE WHEN jsonb_typeof(a->'entityId') = 'string' THEN nullif(a->>'entityId', '') END), p_method, p_date,
    round(p_proceeds, 2), p_proceeds_entry, p_evidence, why, bv, round(p_proceeds, 2) - bv, p_entry,
    ((CASE WHEN jsonb_typeof(p_inputs) = 'object' THEN p_inputs ELSE '{}' END) - 'bookValue' - 'gain' - 'book_value' - 'copy')
      || jsonb_build_object('asset', a, 'database', b, 'copy', jsonb_build_object('ordinal', (c->>'ordinal')::int, 'ownerEntityId', c->'ownerEntityId')), uid)
  RETURNING id INTO rid;
  RETURN rid;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'P14_PENDING: this asset already has an open disposal request' USING ERRCODE = '23505';
END $$;

CREATE FUNCTION public.decide_asset_disposal(p_request uuid, p_approve boolean, p_reason text, p_book_value numeric DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); r public.asset_disposal_requests; a jsonb; c jsonb; why text := btrim(coalesce(p_reason, '')); acc uuid; d jsonb; b jsonb;
  reg jsonb; held jsonb;
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
    -- P14-c: lock the owner's register row, then re-choose the copy by the same rule for the request's owner and month. It
    -- must be the row at the recorded ordinal and that row must be byte-identical to the row priced (r.inputs->'asset');
    -- otherwise refuse (the whole call rolls back: the request stays pending, nothing is written).
    -- P14-d (L4): a request recorded without the copy position (before P14-c) is never approved; reject or cancel it.
    IF r.asset_ordinal IS NULL THEN
      RAISE EXCEPTION 'P14_CHANGED: this request has no recorded copy position (recorded before the copy rule); reject or cancel it and prepare a new request' USING ERRCODE = '40001';
    END IF;
    SELECT p.data INTO reg FROM public.finance_preferences p WHERE p.owner_id = r.owner_id FOR UPDATE;
    held := CASE WHEN jsonb_typeof(reg->'assets') = 'array' THEN reg->'assets'->(r.asset_ordinal - 1) END;
    -- P14-d (M1): the copy owner recorded with the request (not re-derived from the snapshot)
    c := phase3_p14.asset_copy(r.owner_id, r.asset_id, r.disposal_date, r.asset_owner_entity, true);
    IF c IS NULL THEN RAISE EXCEPTION 'P14_CHANGED: the asset is no longer in the register or is already disposed' USING ERRCODE = '40001'; END IF;
    IF c ? 'refused' THEN RAISE EXCEPTION 'P14_CHANGED: %', c->>'refused' USING ERRCODE = '40001'; END IF;
    IF (c->>'ordinal')::int IS DISTINCT FROM r.asset_ordinal OR held IS NULL OR (c->'asset')::text IS DISTINCT FROM held::text THEN
      RAISE EXCEPTION 'P14_CHANGED: the asset changed since the request (the copy priced, at position %, is no longer the one disposed); prepare a new request', r.asset_ordinal USING ERRCODE = '40001';
    END IF;
    a := held;
    IF nullif(a->>'soldOn', '') IS NOT NULL THEN RAISE EXCEPTION 'P14_CHANGED: the asset is no longer in the register or is already disposed' USING ERRCODE = '40001'; END IF;
    -- P14-a residual: re-derive at decision time. The stored figure is the database's own working at request time; the
    -- working is deterministic in (asset, date), so any difference means the register changed: refuse rather than post a
    -- stale figure (stricter than the request tolerance on purpose). Only r.book_value (= this figure) is ever posted.
    b := phase3_p14.book_value(a, r.disposal_date);
    IF b ? 'unverifiable' THEN RAISE EXCEPTION 'P14_UNVERIFIABLE: the database cannot check this asset''s book value (%)', b->>'unverifiable' USING ERRCODE = '22023'; END IF;
    IF round((b->>'value')::numeric, 2) IS DISTINCT FROM r.book_value THEN
      RAISE EXCEPTION 'P14_BOOK_VALUE_CHANGED: the register changed since the request (book value % then, % now); prepare a new request', r.book_value, round((b->>'value')::numeric, 2) USING ERRCODE = '40001';
    END IF;
    -- P14-c: the row at the ordinal must be byte-identical to the row priced at request time (any edit refuses).
    IF held IS DISTINCT FROM r.inputs->'asset' OR held::text IS DISTINCT FROM (r.inputs->'asset')::text THEN
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
    -- P14-c: only the chosen row (by ordinal) is marked; other copies of the id and other owners' copies are untouched.
    UPDATE public.finance_preferences SET data = jsonb_set(data, ARRAY['assets', (r.asset_ordinal - 1)::text],
        a || jsonb_build_object('soldOn', to_char(r.disposal_date, 'YYYY-MM-DD'), 'saleValue', r.proceeds, 'disposal', d), false)
     WHERE owner_id = r.owner_id;
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
  RETURN jsonb_build_object('request', r.id, 'status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, 'entry', CASE WHEN p_approve AND r.book_value > 0 THEN r.entry_id END,
    'ordinal', r.asset_ordinal, 'bookValue', r.book_value, 'replayed', false);
END $$;

-- R-E-I14: read-only preview of what a request would record (STABLE: it cannot write). bookValue is the database's own figure,
-- exactly what request_asset_disposal stores and an approval posts (R-E-I15); the server function adds the planned entries.
-- P14-c: p_owner_entity as in request_asset_disposal (NULL: not named); the copy, its ordinal and owner are returned, the
-- same ones a request with the same arguments records. The 3-argument form is the unnamed-owner call.
CREATE FUNCTION public.preview_asset_disposal(p_asset text, p_date date, p_proceeds numeric, p_owner_entity text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); a jsonb; c jsonb; b jsonb; acc uuid; problems text[] := '{}';
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  c := phase3_p14.asset_copy(uid, p_asset, p_date, p_owner_entity, p_owner_entity IS NOT NULL);
  IF c IS NULL THEN RAISE EXCEPTION 'P14_NOT_FOUND: that asset is not in your register' USING ERRCODE = 'P0002'; END IF;
  IF c->>'code' = '22023' AND c->>'refused' LIKE 'P14_OWNER%' THEN RAISE EXCEPTION '%', c->>'refused' USING ERRCODE = '22023'; END IF;
  IF c ? 'refused' THEN
    RETURN jsonb_build_object('bookValue', NULL, 'tolerance', NULL, 'months', NULL, 'gain', NULL, 'accountId', NULL, 'ordinal', NULL,
      'ownerEntityId', NULL, 'problems', to_jsonb(ARRAY[c->>'refused']));
  END IF;
  a := c->'asset';
  IF p_date IS NULL THEN RAISE EXCEPTION 'P14_INVALID: the disposal date' USING ERRCODE = '22023'; END IF;
  IF nullif(a->>'soldOn', '') IS NOT NULL THEN problems := problems || format('This asset was disposed on %s', a->>'soldOn'); END IF;
  IF p_date > current_date + 31 OR p_date < coalesce(nullif(a->>'inUse', '')::date, p_date) THEN problems := problems || 'The disposal date must be on or after the date the asset was put to use'::text; END IF;
  IF p_proceeds IS NULL OR p_proceeds < 0 THEN problems := problems || 'Enter the proceeds (0 if nothing was received)'::text; END IF;
  -- P14-e (M-b): 'approved' counts as well as 'pending', exactly as the open-request index request_asset_disposal hits
  -- (P14_PENDING), so the preview never shows a clean plan the request then refuses.
  IF EXISTS (SELECT 1 FROM public.asset_disposal_requests q WHERE q.owner_id = uid AND q.asset_id = p_asset AND q.status = 'pending'
              AND q.asset_owner_entity = coalesce(c->>'ownerEntityId', '')) THEN problems := problems || 'This asset already has an open disposal request'::text;
  ELSIF EXISTS (SELECT 1 FROM public.asset_disposal_requests q WHERE q.owner_id = uid AND q.asset_id = p_asset AND q.status = 'approved'
              AND q.asset_owner_entity = coalesce(c->>'ownerEntityId', '')) THEN problems := problems || 'This asset already has an approved disposal request'::text; END IF;
  b := phase3_p14.book_value(a, p_date);
  IF b ? 'unverifiable' THEN problems := problems || format('The database cannot check this asset''s book value (%s)', b->>'unverifiable'); END IF;
  acc := nullif(a->>'accountId', '')::uuid;
  IF coalesce((b->>'value')::numeric, 0) > 0 AND (acc IS NULL OR NOT EXISTS (SELECT 1 FROM public.accounts x WHERE x.id = acc AND x.owner_id = uid)) THEN
    problems := problems || 'Link the asset to its ledger asset account first'::text;
  END IF;
  -- the same figure request_asset_disposal stores and an approval posts (round to paise, as stored)
  RETURN jsonb_build_object('bookValue', round((b->>'value')::numeric, 2), 'tolerance', (b->>'tolerance')::numeric, 'months', (b->>'months')::int,
    'gain', CASE WHEN b ? 'value' AND p_proceeds IS NOT NULL THEN round(p_proceeds, 2) - round((b->>'value')::numeric, 2) END, 'accountId', acc,
    'ordinal', (c->>'ordinal')::int, 'ownerEntityId', c->'ownerEntityId', 'problems', to_jsonb(problems));
END $$;
CREATE FUNCTION public.preview_asset_disposal(p_asset text, p_date date, p_proceeds numeric) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$ SELECT public.preview_asset_disposal(p_asset, p_date, p_proceeds, NULL::text) $$;

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
-- Before P18 the erasure exemption is the client-settable setting (as every applied guard); P18, installed after P14,
-- rewrites it to phase3_p18.erasure_authorised() (and P14 refuses to install or roll back while P18 is installed).
CREATE FUNCTION phase3_p14.exempt() RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT current_setting('ledgerline.erasing', true) = 'on'
      OR phase3_p14.writing_now()   -- decide/cancel's own transaction (privilege-bound row, not a session setting)
      OR phase3_p14.p11_restoring()   -- checked backup restore (P11 ticket, not a session setting)
      OR (auth.uid() IS NULL AND current_user NOT IN ('authenticated', 'anon'))
$$;
-- P14-d (L2) / P14-e (M-a, M-b, L2): a sold row bound to its approved request (its disposal.requestId names an approved
-- request of this owner) is compared by MEANING, never by bytes: the app rewrites a row as it displays it (cleanAssets /
-- preserve-records: an ownerEntityId of '', null, false or whitespace dropped, a missing or invalid bookMethod -> 'slm', a
-- missing bookRatePct -> 0), and a name-only edit of a row stored untidied must still save. phase3_p14.sold_meaning is
-- what the approval priced and disposed:
--   excluded (JS truthy excludedAt), id, owner (owner_of), kind, inUse, cost, method ('wdv' or else 'slm'), rate, life,
--   residual (numbers; missing = 0), the book value at the disposal date (phase3_p14.book_value rounded to paise; NULL when
--   unverifiable: it reads cost, inUse, kind, method, rate, life, residual, openingWdv, adjustments, policyHistory and
--   buildingPolicy, so a change to any of those that moves the figure is caught), soldOn and saleValue.
-- The expected meaning comes from the request: not excluded, r.asset_id, nullif(r.asset_owner_entity, ''), the priced row's
-- kind / inUse / cost / method / rate / life / residual (r.inputs->'asset', read the same normalised way), r.book_value,
-- r.disposal_date, r.proceeds. Position: the row keeps its rank among the non-excluded copies of the same id and owner
-- (the order that decides which copy counts), compared with the previous register; unrelated rows may be added, removed
-- or moved around it. A row that already differed before the write (not produced by this workflow) is refused only if the
-- write changes its meaning or rank again. Returns NULL (allowed) or the refusal message. SECURITY DEFINER: reads the
-- request (an approver may not hold the owner's read).
CREATE FUNCTION phase3_p14.sold_meaning(_x jsonb, _on date) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE b jsonb; v numeric;
BEGIN
  BEGIN
    b := phase3_p14.book_value(_x, _on);
    v := CASE WHEN b ? 'value' THEN round((b->>'value')::numeric, 2) END;
  EXCEPTION WHEN OTHERS THEN v := NULL;   -- e.g. inUse 2026-13-40 (format right, no such date): unverifiable
  END;
  RETURN jsonb_build_array(phase3_p14.truthy(_x->'excludedAt'), _x->'id', phase3_p14.owner_of(_x), _x->'kind', _x->'inUse',
    phase3_p14.num(_x->'cost'), coalesce(_x->'bookMethod' = '"wdv"'::jsonb, false), coalesce(phase3_p14.num(_x->'bookRatePct'), 0),
    coalesce(phase3_p14.num(_x->'usefulLifeYears'), 0), coalesce(phase3_p14.num(_x->'residualPct'), 0), v, _x->'soldOn', phase3_p14.num(_x->'saleValue'));
END $$;
-- rank of the copy at 1-based position _o among the non-excluded object rows of id _id and owner _ent (NULL = personal)
CREATE FUNCTION phase3_p14.copy_rank(_rows jsonb, _o bigint, _id text, _ent text) RETURNS bigint
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT count(*) FROM jsonb_array_elements(_rows) WITH ORDINALITY t(x, o)
   WHERE t.o < _o AND jsonb_typeof(t.x) = 'object' AND jsonb_typeof(t.x->'id') = 'string' AND t.x->>'id' = _id
     AND NOT phase3_p14.truthy(t.x->'excludedAt') AND phase3_p14.owner_of(t.x) IS NOT DISTINCT FROM _ent
$$;
CREATE FUNCTION phase3_p14.sold_row_refusal(_owner uuid, _old jsonb, _new jsonb) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o jsonb := CASE WHEN jsonb_typeof(_old) = 'array' THEN _old ELSE '[]'::jsonb END;
  n jsonb := CASE WHEN jsonb_typeof(_new) = 'array' THEN _new ELSE '[]'::jsonb END;
  s record; r public.asset_disposal_requests; p jsonb; ent text; want jsonb; got jsonb; was jsonb; was_o bigint;
BEGIN
  FOR s IN SELECT t.o, t.x FROM jsonb_array_elements(n) WITH ORDINALITY t(x, o)
            WHERE jsonb_typeof(t.x) = 'object' AND jsonb_typeof(t.x->'disposal') = 'object' AND jsonb_typeof(t.x->'disposal'->'requestId') = 'string' ORDER BY t.o LOOP
    SELECT q.* INTO r FROM public.asset_disposal_requests q
     WHERE q.owner_id = _owner AND q.status = 'approved' AND q.id::text = s.x->'disposal'->>'requestId'
       -- reveals nothing the caller cannot read already (the table's SELECT policy: the owner or an approver)
       AND (auth.uid() IS NULL OR q.owner_id = auth.uid() OR phase3_p14.may_approve(q.owner_id, q.entity_id));
    CONTINUE WHEN NOT FOUND;
    p := r.inputs->'asset'; ent := nullif(r.asset_owner_entity, '');
    want := jsonb_build_array(false, to_jsonb(r.asset_id), ent, p->'kind', p->'inUse', phase3_p14.num(p->'cost'),
      coalesce(p->'bookMethod' = '"wdv"'::jsonb, false), coalesce(phase3_p14.num(p->'bookRatePct'), 0), coalesce(phase3_p14.num(p->'usefulLifeYears'), 0),
      coalesce(phase3_p14.num(p->'residualPct'), 0), r.book_value, to_char(r.disposal_date, 'YYYY-MM-DD'), r.proceeds);
    got := phase3_p14.sold_meaning(s.x, r.disposal_date);
    SELECT t.o, t.x INTO was_o, was FROM jsonb_array_elements(o) WITH ORDINALITY t(x, o)
     WHERE jsonb_typeof(t.x) = 'object' AND jsonb_typeof(t.x->'disposal') = 'object' AND t.x->'disposal'->>'requestId' = s.x->'disposal'->>'requestId'
     ORDER BY t.o LIMIT 1;
    IF was IS NULL THEN
      RETURN 'P14_DISPOSAL_APPROVAL_REQUIRED: an asset is disposed only through an approved disposal request (evidence, reason, date, proceeds); archiving never disposes';
    END IF;
    IF got IS DISTINCT FROM want AND got IS DISTINCT FROM phase3_p14.sold_meaning(was, r.disposal_date) THEN
      IF (got->>0)::boolean AND NOT phase3_p14.truthy(was->'excludedAt') THEN
        RETURN 'P14_DISPOSAL_APPROVAL_REQUIRED: a sold copy cannot be excluded (it would undo the approved disposal); keep it and mark the other copy as the duplicate';
      END IF;
      RETURN 'P14_DISPOSAL_APPROVAL_REQUIRED: a disposed asset keeps the figures it was approved with (id, owner, kind, cost, put-to-use date, book method, rate, life, residual and the book value at disposal, which also covers the opening WDV and adjustments); only its name, location, notes and similar details can change';
    END IF;
    IF phase3_p14.copy_rank(n, s.o, r.asset_id, ent) IS DISTINCT FROM phase3_p14.copy_rank(o, was_o, r.asset_id, ent) THEN
      RETURN 'P14_DISPOSAL_APPROVAL_REQUIRED: a disposed asset keeps its place among the copies of its id (another copy cannot be moved in front of it or removed from before it); other assets can be added or moved freely';
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
CREATE FUNCTION phase3_p14.guard_asset_disposal_fields() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE o jsonb := CASE WHEN TG_OP = 'UPDATE' AND jsonb_typeof(OLD.data->'assets') = 'array' THEN OLD.data->'assets' ELSE '[]'::jsonb END;
  n jsonb := CASE WHEN jsonb_typeof(NEW.data->'assets') = 'array' THEN NEW.data->'assets' ELSE '[]'::jsonb END; k text; w text; a jsonb; b jsonb;
BEGIN
  IF phase3_p14.exempt() THEN RETURN NEW; END IF;
  -- P14-e: a sold row bound to its approved request keeps its meaning and rank (phase3_p14.sold_row_refusal); checked first
  -- so its specific message (e.g. a sold copy cannot be excluded) is the one shown.
  k := phase3_p14.sold_row_refusal(NEW.owner_id, o, n);
  IF k IS NOT NULL THEN RAISE EXCEPTION '%', k USING ERRCODE = '42501'; END IF;
  -- P14-e (L2): per id and owner, the first copy that counts (not excluded, phase3_p14.owner_of) — the row the app reads —
  -- not the first row of the id: an excluded duplicate or another owner's copy may sit in front of a sold row.
  FOR k, w IN SELECT x->>'id', phase3_p14.owner_of(x) FROM jsonb_array_elements(o) x WHERE NOT phase3_p14.truthy(x->'excludedAt')
         UNION SELECT x->>'id', phase3_p14.owner_of(x) FROM jsonb_array_elements(n) x WHERE NOT phase3_p14.truthy(x->'excludedAt') LOOP
    a := NULL; b := NULL;
    SELECT t.x INTO a FROM jsonb_array_elements(o) WITH ORDINALITY t(x, i) WHERE t.x->>'id' = k AND phase3_p14.owner_of(t.x) IS NOT DISTINCT FROM w
       AND NOT phase3_p14.truthy(t.x->'excludedAt') ORDER BY t.i LIMIT 1;
    SELECT t.x INTO b FROM jsonb_array_elements(n) WITH ORDINALITY t(x, i) WHERE t.x->>'id' = k AND phase3_p14.owner_of(t.x) IS NOT DISTINCT FROM w
       AND NOT phase3_p14.truthy(t.x->'excludedAt') ORDER BY t.i LIMIT 1;
    IF (a->'soldOn', a->'saleValue', a->'disposal') IS DISTINCT FROM (b->'soldOn', b->'saleValue', b->'disposal')
       AND NOT (b IS NULL AND a IS NOT NULL AND a->'soldOn' IS NULL AND a->'disposal' IS NULL) THEN
      RAISE EXCEPTION 'P14_DISPOSAL_APPROVAL_REQUIRED: an asset is disposed only through an approved disposal request (evidence, reason, date, proceeds); archiving never disposes' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  -- P14-c: the loop above compares only the first row of each id. With duplicate rows of an id, every row counts: per
  -- id the multiset of disposal facts (soldOn, saleValue, disposal; JSON null = absent) must not gain a member, and may
  -- lose one only when it carries neither soldOn nor disposal (as the loop allows for a removed row). P14-d (L2): a sold
  -- row bound to its approved request also keeps its position and priced financial fields (owner included), below.
  IF EXISTS (SELECT x->>'id', jsonb_build_array(nullif(x->'soldOn', 'null'::jsonb), nullif(x->'saleValue', 'null'::jsonb), nullif(x->'disposal', 'null'::jsonb))
               FROM jsonb_array_elements(n) x
              WHERE jsonb_typeof(x) = 'object' AND coalesce(nullif(x->'soldOn', 'null'::jsonb), nullif(x->'saleValue', 'null'::jsonb), nullif(x->'disposal', 'null'::jsonb)) IS NOT NULL
             EXCEPT ALL
             SELECT x->>'id', jsonb_build_array(nullif(x->'soldOn', 'null'::jsonb), nullif(x->'saleValue', 'null'::jsonb), nullif(x->'disposal', 'null'::jsonb))
               FROM jsonb_array_elements(o) x
              WHERE jsonb_typeof(x) = 'object' AND coalesce(nullif(x->'soldOn', 'null'::jsonb), nullif(x->'saleValue', 'null'::jsonb), nullif(x->'disposal', 'null'::jsonb)) IS NOT NULL)
     OR EXISTS (SELECT 1 FROM (
             SELECT x->>'id', jsonb_build_array(nullif(x->'soldOn', 'null'::jsonb), nullif(x->'saleValue', 'null'::jsonb), nullif(x->'disposal', 'null'::jsonb)) f
               FROM jsonb_array_elements(o) x
              WHERE jsonb_typeof(x) = 'object' AND coalesce(nullif(x->'soldOn', 'null'::jsonb), nullif(x->'saleValue', 'null'::jsonb), nullif(x->'disposal', 'null'::jsonb)) IS NOT NULL
             EXCEPT ALL
             SELECT x->>'id', jsonb_build_array(nullif(x->'soldOn', 'null'::jsonb), nullif(x->'saleValue', 'null'::jsonb), nullif(x->'disposal', 'null'::jsonb))
               FROM jsonb_array_elements(n) x
              WHERE jsonb_typeof(x) = 'object' AND coalesce(nullif(x->'soldOn', 'null'::jsonb), nullif(x->'saleValue', 'null'::jsonb), nullif(x->'disposal', 'null'::jsonb)) IS NOT NULL) lost
             WHERE lost.f->0 <> 'null'::jsonb OR lost.f->2 <> 'null'::jsonb) THEN
    RAISE EXCEPTION 'P14_DISPOSAL_APPROVAL_REQUIRED: an asset is disposed only through an approved disposal request (evidence, reason, date, proceeds); archiving never disposes' USING ERRCODE = '42501';
  END IF;
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
    erasing := current_setting('ledgerline.erasing', true) = 'on'; -- before P18 only (client-settable, as P20); P18 rewrites it
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

REVOKE ALL ON FUNCTION public.request_asset_disposal(text, text, date, numeric, uuid, uuid[], text, uuid, jsonb, numeric, text),
  public.decide_asset_disposal(uuid, boolean, text, numeric), public.cancel_asset_disposal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_asset_disposal(text, text, date, numeric, uuid, uuid[], text, uuid, jsonb, numeric, text),
  public.decide_asset_disposal(uuid, boolean, text, numeric), public.cancel_asset_disposal(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.preview_asset_disposal(text, date, numeric), public.preview_asset_disposal(text, date, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_asset_disposal(text, date, numeric), public.preview_asset_disposal(text, date, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION phase3_p14.num(jsonb), phase3_p14.book_value(jsonb, date) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA phase3_p14 TO authenticated; -- the SELECT policy and the guards call the helpers below
REVOKE ALL ON FUNCTION phase3_p14.asset_copy(uuid, text, date, text, boolean), phase3_p14.known_kind(jsonb), phase3_p14.in_figure(jsonb, text), phase3_p14.guard_asset_disposal_fields(), phase3_p14.guard_disposal_entry() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION phase3_p14.may_approve(uuid, text), phase3_p14.step_up_ok(), phase3_p14.exempt(), phase3_p14.p11_restoring() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION phase3_p14.may_approve(uuid, text), phase3_p14.exempt(), phase3_p14.p11_restoring() TO authenticated;
REVOKE ALL ON FUNCTION phase3_p14.sold_row_refusal(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION phase3_p14.sold_row_refusal(uuid, jsonb, jsonb) TO authenticated; -- called by the invoker guard on finance_preferences
REVOKE ALL ON FUNCTION phase3_p14.sold_meaning(jsonb, date), phase3_p14.copy_rank(jsonb, bigint, text, text) FROM PUBLIC, anon, authenticated;
-- P14-e: pure helpers the invoker guard on finance_preferences now calls (first counting copy per id and owner)
REVOKE ALL ON FUNCTION phase3_p14.truthy(jsonb), phase3_p14.owner_of(jsonb), phase3_p14.js_blank(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION phase3_p14.truthy(jsonb), phase3_p14.owner_of(jsonb), phase3_p14.js_blank(text) TO authenticated;
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
