-- ============================================================================================
-- P8_asset_depreciation_posting.sql (PROPOSED ONLY: NOT APPLIED to Lovable Cloud, Live or any hosted DB)
-- Prepared 2026-11-10 for KK review (Phase 3 completion, remaining item 4). Plan:
-- docs/plans/PHASE3_ACCOUNTING_PLAN_2026-11-10.md section 11.
-- Order: 0000-0088 -> P1 -> P2 -> P4 -> P5 (-> P5b) -> P6 -> P7 (r2) -> P8. Rollback:
-- P8_asset_depreciation_posting.rollback.sql, run BEFORE the P7, P6 and P5 rollbacks (each refuses
-- while P8 is installed).
--
-- What it does: approved book depreciation becomes a BALANCED posting in the asset's legal entity
-- through the one posting path (phase3_p7.write_batch via the expenses trigger), instead of an
-- 'unclassified_adjustment' exception:
--     Dr expense:Depreciation            (the asset's legal entity)
--     Cr account:<asset ledger account>  (same entity; the asset account must belong to it)
-- Only APPROVED depreciation posts. Approval is the app's existing flow (Assets -> "Approve & add":
-- the non-cash adjustment entry is saved, then books.journals[] marks that journal 'posted' with the
-- entry's id) and/or a P6 depreciation_journals row with status 'posted' and that entry_id. The monthly
-- depreciation job only PREPARES journals (no entry, nothing posts). Rules enforced here:
--   * one depreciation per asset and month (a second approved journal for the same asset-month, or an
--     entry claimed by two journals, is an exception, never a second posting);
--   * the entry must equal its journal: amount, month-end date, asset ledger account, adjustment -1;
--   * the asset's legal entity = P6 register_records scope when the asset is in the P6 register, else
--     the JSON asset's ownerEntityId company, else the personal books; the asset ledger account must be
--     assigned to that same entity (otherwise an exception: never an inter-entity guess);
--   * ARCHIVED assets still depreciate (P0-001: archive is status only, the asset stays in the books);
--   * impairment and disposal entries are NOT classified here: disposal/sale/write-off is a separate
--     authorised workflow (they stay listed exceptions until that workflow is approved).
-- Nothing else changes: no existing row, table, column or function other than the P7 hook
-- phase3_p7.classify_adjustment (restored by the rollback) is altered.
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase2_p6') IS NULL OR to_regclass('public.depreciation_journals') IS NULL THEN
    RAISE EXCEPTION 'P8 requires P6_registers.sql';
  END IF;
  IF to_regnamespace('phase3_p7') IS NULL OR to_regprocedure('phase3_p7.classify_adjustment(public.expenses,uuid,text)') IS NULL
     OR to_regprocedure('phase3_p7.reverse_entry(uuid,uuid,uuid,text,date,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'P8 requires P7_balanced_posting.sql revision 2';
  END IF;
  IF to_regnamespace('phase3_p8') IS NOT NULL THEN RAISE EXCEPTION 'P8 is already installed'; END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('phase3_p7.classify_adjustment(public.expenses,uuid,text)')) IS DISTINCT FROM md5(E'\n  SELECT NULL::jsonb\n') THEN
    RAISE EXCEPTION 'P8: phase3_p7.classify_adjustment differs from P7; review before applying';
  END IF;
END $pre$;

CREATE SCHEMA phase3_p8;
REVOKE ALL ON SCHEMA phase3_p8 FROM PUBLIC, anon, authenticated;
CREATE TABLE phase3_p8.installed (installed_at timestamptz NOT NULL DEFAULT clock_timestamp());
INSERT INTO phase3_p8.installed DEFAULT VALUES;

-- Month end of 'YYYY-MM' (the app's depreciationEntry date).
CREATE FUNCTION phase3_p8.month_end(_period text) RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT (to_date(_period || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date
$$;

-- Approved depreciation journal(s) that name this entry: from the app's JSON books.journals and from the
-- P6 register. Returns one row per source.
CREATE FUNCTION phase3_p8.approved_journals(_owner uuid, _entry uuid)
RETURNS TABLE(src text, journal_id text, asset_key text, asset_id uuid, period text, amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT 'json', j->>'id', j->>'assetId', NULL::uuid, j->>'period', (j->>'amount')::numeric
  FROM public.finance_preferences p, jsonb_array_elements(CASE WHEN jsonb_typeof(p.data->'books'->'journals') = 'array' THEN p.data->'books'->'journals' ELSE '[]'::jsonb END) j
  WHERE p.owner_id = _owner AND j->>'transactionId' = _entry::text AND j->>'status' = 'posted' AND coalesce(j->>'kind', 'book') = 'book'
    AND jsonb_typeof(j->'amount') = 'number' AND (j->>'period') ~ '^\d{4}-\d{2}$'
  UNION ALL
  SELECT 'p6', d.legacy_id, a.legacy_id, d.asset_id, d.period, d.legacy_amount
  FROM public.depreciation_journals d JOIN public.assets a ON a.id = d.asset_id AND a.owner_id = d.owner_id
  WHERE d.owner_id = _owner AND d.entry_id = _entry AND d.status = 'posted' AND d.journal_kind = 'book'
$$;

-- Whether another entry (_other) holds the asset-month against _entry: it exists for the owner and is
-- already posted, or neither is posted and it has the lower id (deterministic; never both).
CREATE FUNCTION phase3_p8.holds(_owner uuid, _other text, _entry uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN _other IS NULL OR _other !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN false
    WHEN NOT EXISTS (SELECT 1 FROM public.expenses x WHERE x.id = _other::uuid AND x.employee_id = _owner) THEN false
    WHEN EXISTS (SELECT 1 FROM public.posting_events ev WHERE ev.owner_id = _owner AND ev.event_key = 'ledger_entry:' || _other AND phase3_p7.event_active(ev.id)) THEN true
    WHEN EXISTS (SELECT 1 FROM public.posting_events ev WHERE ev.owner_id = _owner AND ev.event_key = 'ledger_entry:' || _entry AND phase3_p7.event_active(ev.id)) THEN false
    ELSE _other::uuid < _entry END
$$;

-- The P7 hook, now classifying approved book depreciation (see header). NULL = not depreciation.
CREATE OR REPLACE FUNCTION phase3_p7.classify_adjustment(_e public.expenses, _account_entity uuid, _account_role text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE prefs jsonb; n int; nkeys int; j record; asset jsonb; ent uuid; acct uuid; reg uuid; ekey text;
  x jsonb := jsonb_build_object('entryId', _e.id, 'date', _e.expense_date, 'amount', _e.amount, 'type', 'adjustment');
BEGIN
  IF coalesce(_e.tags, '{}') && ARRAY['impairment', 'disposal'] THEN
    RETURN x || jsonb_build_object('exception', 'asset_disposal_workflow', 'detail', 'Impairment, sale and disposal are a separate authorised workflow; not posted automatically');
  END IF;
  SELECT count(*), count(DISTINCT (coalesce(t.asset_key, '') || '|' || coalesce(t.period, ''))) INTO n, nkeys FROM phase3_p8.approved_journals(_e.employee_id, _e.id) t;
  IF n = 0 THEN
    IF 'depreciation' = ANY (coalesce(_e.tags, '{}')) THEN
      RETURN x || jsonb_build_object('exception', 'depreciation_not_approved', 'detail', 'Depreciation entry has no approved (posted) depreciation journal');
    END IF;
    RETURN NULL;
  END IF;
  IF nkeys > 1 OR (SELECT count(*) FROM phase3_p8.approved_journals(_e.employee_id, _e.id) t WHERE t.src = 'json') > 1 THEN
    RETURN x || jsonb_build_object('exception', 'duplicate_depreciation', 'detail', 'One entry is claimed by more than one depreciation journal');
  END IF;
  SELECT * INTO j FROM phase3_p8.approved_journals(_e.employee_id, _e.id) t ORDER BY t.src LIMIT 1;
  SELECT data INTO prefs FROM public.finance_preferences WHERE owner_id = _e.employee_id;
  -- one depreciation per asset and month: when two approved journals of the same asset-month name
  -- different entries, the one already posted keeps it (else the lower entry id); the other is an exception
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(prefs->'books'->'journals') = 'array' THEN prefs->'books'->'journals' ELSE '[]'::jsonb END) o
             WHERE o->>'assetId' = j.asset_key AND o->>'period' = j.period AND o->>'status' = 'posted' AND coalesce(o->>'kind', 'book') = 'book'
               AND o->>'transactionId' IS DISTINCT FROM _e.id::text AND phase3_p8.holds(_e.employee_id, o->>'transactionId', _e.id))
     OR EXISTS (SELECT 1 FROM public.depreciation_journals d JOIN public.assets a ON a.id = d.asset_id
                WHERE d.owner_id = _e.employee_id AND a.legacy_id = j.asset_key AND d.period = j.period AND d.status = 'posted' AND d.entry_id IS DISTINCT FROM _e.id
                  AND phase3_p8.holds(_e.employee_id, d.entry_id::text, _e.id)) THEN
    RETURN x || jsonb_build_object('exception', 'duplicate_depreciation', 'detail', 'This asset already has approved depreciation for ' || j.period);
  END IF;
  IF j.amount IS DISTINCT FROM _e.amount THEN
    RETURN x || jsonb_build_object('exception', 'depreciation_amount_mismatch', 'detail', 'Entry amount differs from its approved depreciation journal');
  END IF;
  IF _e.expense_date IS DISTINCT FROM phase3_p8.month_end(j.period) OR _e.adjustment_sign IS DISTINCT FROM -1 THEN
    RETURN x || jsonb_build_object('exception', 'depreciation_date_mismatch', 'detail', 'Depreciation is dated on its month end and lowers the asset account');
  END IF;
  -- the asset (archived or not: P0-001 keeps archived assets in the books) and its ledger account
  SELECT a INTO asset FROM jsonb_array_elements(CASE WHEN jsonb_typeof(prefs->'assets') = 'array' THEN prefs->'assets' ELSE '[]'::jsonb END) a
  WHERE jsonb_typeof(a) = 'object' AND a->>'id' = j.asset_key LIMIT 1;
  SELECT a.ledger_account_id, rr.legal_entity_id INTO acct, reg FROM public.assets a JOIN public.register_records rr ON rr.id = a.id AND rr.owner_id = a.owner_id
  WHERE a.owner_id = _e.employee_id AND a.legacy_id = j.asset_key LIMIT 1;
  IF asset IS NULL AND reg IS NULL THEN
    RETURN x || jsonb_build_object('exception', 'asset_missing', 'detail', 'The depreciated asset is not in the asset register');
  END IF;
  IF _e.account_id IS DISTINCT FROM coalesce(acct, nullif(asset->>'accountId', '')::uuid) OR _account_role IS DISTINCT FROM 'asset' THEN
    RETURN x || jsonb_build_object('exception', 'depreciation_account_mismatch', 'detail', 'Depreciation must lower the asset''s own ledger asset account');
  END IF;
  -- the asset's legal entity: P6 register scope, else the JSON company, else the personal books
  IF reg IS NOT NULL THEN ent := reg;
  ELSE
    ekey := nullif(coalesce(nullif(asset->>'ownerEntityId', ''), asset->>'entityId'), '');
    ent := CASE WHEN ekey IS NULL THEN public.p5_personal_entity(_e.employee_id)
                ELSE (SELECT le.id FROM public.legal_entities le WHERE le.owner_id = _e.employee_id AND le.entity_key = ekey) END;
  END IF;
  IF ent IS NULL OR ent IS DISTINCT FROM _account_entity THEN
    RETURN x || jsonb_build_object('exception', 'asset_entity_mismatch', 'detail', 'The asset ledger account belongs to another legal entity than the asset');
  END IF;
  RETURN jsonb_build_object('entity', ent, 'journal', j.journal_id, 'source', j.src,
    'lines', phase3_p7.leg('expense:Depreciation', 'expense', _e.amount, NULL, NULL, 'Depreciation ' || j.period)
          || phase3_p7.leg('account:' || _e.account_id, 'asset', -_e.amount, _e.account_id, NULL, _e.title));
END $$;
REVOKE ALL ON FUNCTION phase3_p7.classify_adjustment(public.expenses, uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- The approval in the app's flow lands in finance_preferences AFTER the entry was saved: re-sync the
-- entries whose approved depreciation journals changed (for active books only).
CREATE FUNCTION phase3_p8.sync_journals_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t uuid; nj jsonb; oj jsonb;
BEGIN
  IF current_setting('ledgerline.erasing', true) = 'on' OR NOT phase3_p7.active(NEW.owner_id) THEN RETURN NULL; END IF;
  nj := CASE WHEN jsonb_typeof(NEW.data->'books'->'journals') = 'array' THEN NEW.data->'books'->'journals' ELSE '[]'::jsonb END;
  oj := CASE WHEN TG_OP = 'UPDATE' AND jsonb_typeof(OLD.data->'books'->'journals') = 'array' THEN OLD.data->'books'->'journals' ELSE '[]'::jsonb END;
  IF nj = oj THEN RETURN NULL; END IF;
  PERFORM phase3_p7.lock_owner(NEW.owner_id);
  FOR t IN SELECT DISTINCT (x->>'transactionId')::uuid FROM (
             (SELECT value x FROM jsonb_array_elements(nj) EXCEPT SELECT value FROM jsonb_array_elements(oj))
             UNION (SELECT value FROM jsonb_array_elements(oj) EXCEPT SELECT value FROM jsonb_array_elements(nj))) d
           WHERE x->>'transactionId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             AND EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = (x->>'transactionId')::uuid AND e.employee_id = NEW.owner_id) LOOP
    PERFORM phase3_p7.sync_entry(NEW.owner_id, t, true, jsonb_build_object('reason', 'Depreciation approved'));
  END LOOP;
  RETURN NULL;
END $$;
CREATE TRIGGER zz_p8_sync_depreciation AFTER INSERT OR UPDATE OF data ON public.finance_preferences FOR EACH ROW EXECUTE FUNCTION phase3_p8.sync_journals_trigger();

-- A P6 register backfill can record an approved journal for an entry that is already saved.
CREATE FUNCTION phase3_p8.sync_register_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.entry_id IS NULL OR current_setting('ledgerline.erasing', true) = 'on' OR NOT phase3_p7.active(NEW.owner_id) THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = NEW.entry_id AND e.employee_id = NEW.owner_id) THEN RETURN NULL; END IF;
  PERFORM phase3_p7.lock_owner(NEW.owner_id);
  PERFORM phase3_p7.sync_entry(NEW.owner_id, NEW.entry_id, true, jsonb_build_object('reason', 'Depreciation register entry'));
  RETURN NULL;
END $$;
CREATE TRIGGER zz_p8_sync_depreciation AFTER INSERT ON public.depreciation_journals FOR EACH ROW EXECUTE FUNCTION phase3_p8.sync_register_trigger();

DO $grants$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p WHERE p.pronamespace = 'phase3_p8'::regnamespace LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f.sig);
  END LOOP;
END $grants$;
REVOKE ALL ON phase3_p8.installed FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
