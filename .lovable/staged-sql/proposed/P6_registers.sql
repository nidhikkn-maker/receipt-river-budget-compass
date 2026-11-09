-- ============================================================================================
-- P6_registers.sql (PROPOSED ONLY: NOT APPLIED to Lovable Cloud, Live or any hosted DB)
-- Prepared 2026-11-09 for KK review (Phase 2 stage 2, normalised registers; V4 FND-03, FND-05,
-- Decision 38 / DN-P2-IDS permanent IDs, Signature Flow Flow 4 and Flow 5, F08 projects).
-- Plan: docs/plans/PHASE2_MIGRATION_PLAN_2026-11-09.md sections 15-22.
-- Order: 0000-0088 -> P1 -> P2 -> P4 -> P5 -> P6 (preflight checks all four). Rollback:
-- P6_registers.rollback.sql (run BEFORE the P5 rollback, which refuses while P6 is installed).
--
-- Stage: FND-03 "additive schema" + "dual-read compatibility" + "previewed backfill" + "compare".
-- The app keeps reading and writing the JSON registers in finance_preferences.data; there is NO read
-- or write switch here. No existing column value of any existing row changes; no existing table,
-- column, function, trigger or policy is altered. P6 only:
--   * adds new tables, functions, triggers on the new tables, two AFTER triggers on P5/applied
--     tables (archive history on register_records; erasure on finance_preferences) and four readable
--     ID formats (LSE, HLD, RCV, PRJ);
--   * inserts rows into the new tables and, for assets and properties, into P5's register_records /
--     record_ownerships (the one permanent anchor per asset/property, DN-P2-IDS item 3).
--
-- Registers (priority order of the brief; every slice is complete and tested):
--  1. assets (id = register_records.id, AST number in the owning entity's scope), asset_events,
--     depreciation_journals.
--  2. properties (id = register_records.id, PRP number), property_units (building/floor/unit tree),
--     property_assets (dated containment; no double counting in valuation), register_valuations
--     (dated valuation observations), leases (LSE number).
--  3. trips (TRP-YYYY-NNNN; itinerary_status separate from finance_status), trip_bookings,
--     trip_advances, register_entry_links (trip/booking/project <-> ledger entry by id; the
--     'Trip: <name>' tag on entries is never touched and stays readable).
--  4. investment_holdings (HLD; demat link by ISIN), receivables (RCV-YYYY-NNNN).
--  5. projects (PRJ; from budgets[kind=project]; entry links by the exact project tag).
--  Shared: register_legacy_copies (a co-owner's own JSON copy of a jointly owned property/asset
--  attached to the ONE shared record), register_archive_events (append-only archive history).
--
-- Rules on every register row: uuid primary key (permanent; never regenerated), owner_id, accounting
-- scope legal entity (assets/properties: the register_records scope), readable number per KK's rule,
-- legacy_id + legacy_element (the raw JSON element, read-only) + source provenance (path, element
-- sha256, source sha256, revision, run id), descriptive columns, references to ledger rows/accounts/
-- documents by id (never an editable money total), legacy money in read-only legacy_* columns for the
-- compare stage only, archive-only (no client hard delete; archive history append-only; disposal,
-- sale, transfer, write-off and scrapping are separate accounting workflows NOT in this file).
-- RLS: owner; P2 grantees ('view') of the scope company read only that company's rows (personal
-- never); co-owners of a shared record read it through p5_can_read_register_record; P4 RESTRICTIVE
-- assistant policies on every new table; no client INSERT/UPDATE/DELETE privilege.
-- Writers: commit_register_backfill, archive_register_item, end_asset_containment (P4 step-up);
-- preview_register_backfill, register_backfill_report, register_valuation_report,
-- attach_asset_to_property (P4 assistant refusal).
-- ============================================================================================
BEGIN;

-- --------------------------------------------------------------------------------------------
-- 0. Preflight (fail closed on an unexpected catalog)
-- --------------------------------------------------------------------------------------------
DO $pre$
BEGIN
  IF to_regprocedure('public.guard_shared_document_edit()') IS NULL THEN RAISE EXCEPTION 'P6 requires P1_security_containment.sql'; END IF;
  IF to_regprocedure('public.has_permission(uuid,text,text)') IS NULL OR to_regclass('public.access_grants') IS NULL THEN
    RAISE EXCEPTION 'P6 requires P2_v31_role_model.sql';
  END IF;
  IF to_regclass('security_p4.guarded_functions') IS NULL OR to_regprocedure('security_p4.guard(regprocedure,text)') IS NULL THEN
    RAISE EXCEPTION 'P6 requires P4_step_up_and_assistant_limits.sql';
  END IF;
  IF to_regnamespace('phase2_p5') IS NULL OR to_regclass('public.register_records') IS NULL OR to_regclass('public.record_ownerships') IS NULL
     OR to_regprocedure('public.assign_readable_id()') IS NULL OR to_regprocedure('public.legacy_json_elements(jsonb,text[],text)') IS NULL
     OR to_regprocedure('public.p5_can_read_register_record(uuid)') IS NULL THEN
    RAISE EXCEPTION 'P6 requires P5_legal_entities_foundation.sql';
  END IF;
  IF to_regnamespace('phase2_p6') IS NOT NULL OR to_regclass('public.assets') IS NOT NULL OR to_regclass('public.trips') IS NOT NULL THEN
    RAISE EXCEPTION 'P6 is already installed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.readable_id_formats f
             JOIN (VALUES ('LSE', false, 4), ('HLD', false, 6), ('RCV', true, 4), ('PRJ', false, 4)) v(prefix, yearly, width) ON v.prefix = f.prefix
             WHERE (f.yearly, f.width) IS DISTINCT FROM (v.yearly, v.width)) THEN
    RAISE EXCEPTION 'P6: a readable ID format LSE/HLD/RCV/PRJ exists with a different definition; review before applying';
  END IF;
END $pre$;

CREATE SCHEMA phase2_p6;
REVOKE ALL ON SCHEMA phase2_p6 FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE phase2_p6.installed (installed_at timestamptz NOT NULL DEFAULT clock_timestamp());
REVOKE ALL ON phase2_p6.installed FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO phase2_p6.installed DEFAULT VALUES;

-- --------------------------------------------------------------------------------------------
-- 1. Readable formats for the new numbered registers (P5 already registers AST, PRP and TRP).
--    Kept by the rollback (with their counters) so a number is never issued twice.
-- --------------------------------------------------------------------------------------------
INSERT INTO public.readable_id_formats(prefix, yearly, width, record) VALUES
  ('LSE', false, 4, 'Lease (numbered in the leased property''s scope)'),
  ('HLD', false, 6, 'Investment holding (manual / other investments)'),
  ('RCV', true, 4, 'Receivable (customer invoice; year of the invoice date)'),
  ('PRJ', false, 4, 'Project / activity')
ON CONFLICT (prefix) DO NOTHING;

-- --------------------------------------------------------------------------------------------
-- 2. Pure parsing helpers (legacy JSON values are untrusted: bad values become NULL + an exception,
--    never a failed write).
-- --------------------------------------------------------------------------------------------
CREATE FUNCTION public.p6_date(_v jsonb) RETURNS date
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF jsonb_typeof(_v) <> 'string' OR (_v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}' THEN RETURN NULL; END IF;
  RETURN left(_v #>> '{}', 10)::date;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;

CREATE FUNCTION public.p6_ts(_v jsonb) RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF jsonb_typeof(_v) <> 'string' OR (_v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}' THEN RETURN NULL; END IF;
  RETURN (_v #>> '{}')::timestamptz;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;

CREATE FUNCTION public.p6_num(_v jsonb) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN jsonb_typeof(_v) = 'number' THEN (_v #>> '{}')::numeric
              WHEN jsonb_typeof(_v) = 'string' AND btrim(_v #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN btrim(_v #>> '{}')::numeric END
$$;

CREATE FUNCTION public.p6_text(_v jsonb, _max int DEFAULT 500) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN jsonb_typeof(_v) IN ('string', 'number', 'boolean') THEN nullif(left(btrim(_v #>> '{}'), _max), '') END
$$;

CREATE FUNCTION public.p6_uuid(_v jsonb) RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN jsonb_typeof(_v) = 'string' AND (_v #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (_v #>> '{}')::uuid END
$$;

CREATE FUNCTION public.p6_texts(_v jsonb) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN jsonb_typeof(_v) = 'array' THEN coalesce((SELECT array_agg(left(x #>> '{}', 200) ORDER BY i) FROM jsonb_array_elements(_v) WITH ORDINALITY a(x, i)
                                                               WHERE jsonb_typeof(x) = 'string' AND btrim(x #>> '{}') <> ''), '{}') ELSE '{}' END
$$;

-- --------------------------------------------------------------------------------------------
-- 3. Scope and reference helpers (definer; internal, no client EXECUTE)
-- --------------------------------------------------------------------------------------------
-- Accounting scope of a legacy register item: ownerEntityId -> that legal entity (archived and
-- owner-confirmed legacy_unknown entities resolve: history keeps its link); none -> the owner's personal
-- books; an unknown key -> NULL (orphan, reported, never guessed).
CREATE FUNCTION public.p6_scope(_owner uuid, _key text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.p5_entity_for_keys(_owner, CASE WHEN nullif(btrim(coalesce(_key, '')), '') IS NULL THEN '{}'::text[] ELSE ARRAY[_key] END)
$$;

-- Label of a scope entity in compare keys: 'personal' or the legacy entity key.
CREATE FUNCTION public.p6_scope_label(_entity uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN e.kind = 'individual_personal' THEN 'personal' ELSE e.entity_key END FROM public.legal_entities e WHERE e.id = _entity
$$;

CREATE FUNCTION public.p6_ref_ok(_owner uuid, _kind text, _id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT _id IS NOT NULL AND CASE _kind
    WHEN 'expense' THEN EXISTS (SELECT 1 FROM public.expenses x WHERE x.id = _id AND x.employee_id = _owner)
    WHEN 'account' THEN EXISTS (SELECT 1 FROM public.accounts x WHERE x.id = _id AND x.owner_id = _owner)
    WHEN 'document' THEN EXISTS (SELECT 1 FROM public.documents x WHERE x.id = _id AND x.owner_id = _owner)
    WHEN 'loan' THEN EXISTS (SELECT 1 FROM public.loans x WHERE x.id = _id AND x.owner_id = _owner)
    WHEN 'security_holding' THEN EXISTS (SELECT 1 FROM public.security_holdings x WHERE x.id = _id AND x.owner_id = _owner)
    ELSE false END
$$;

-- A company scope shared with the caller through a P2 'view' grant. Personal books and unknown legacy
-- entities are never shared this way (FND-04).
CREATE FUNCTION public.p6_entity_shared(_entity uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.legal_entities e WHERE e.id = _entity
    AND e.kind NOT IN ('individual_personal', 'legacy_unknown') AND public.has_permission(e.owner_id, e.entity_key, 'view'))
$$;

-- One pass over a legacy list with provenance and a status per element: 'ok', 'invalid' (not an
-- object or no text id), 'too_long', 'duplicate_same' (later identical copy of the same id: skipped with
-- a warning) or 'conflict' (the same id with different content: every copy skipped with an error,
-- never guessed). One grouping pass, so large registers (5,000+ items) stay linear.
CREATE FUNCTION public.p6_list(_data jsonb, _path text[])
RETURNS TABLE(ord int, path text, legacy_id text, element jsonb, element_sha256 text, status text)
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  WITH x AS (SELECT * FROM public.legacy_json_elements(_data, _path)),
  g AS (SELECT x.legacy_id, count(*) n, count(DISTINCT x.element_sha256) d, min(x.ord) first_ord FROM x WHERE x.legacy_id IS NOT NULL GROUP BY 1)
  SELECT x.ord, x.path, x.legacy_id, x.element, x.element_sha256,
    CASE WHEN jsonb_typeof(x.element) <> 'object' OR x.legacy_id IS NULL OR btrim(x.legacy_id) = '' THEN 'invalid'
         WHEN length(x.legacy_id) > 200 THEN 'too_long'
         WHEN g.n = 1 THEN 'ok' WHEN g.d > 1 THEN 'conflict' WHEN g.first_ord = x.ord THEN 'ok' ELSE 'duplicate_same' END
  FROM x LEFT JOIN g ON g.legacy_id = x.legacy_id
$$;

CREATE FUNCTION public.p6_status_exception(_status text, _path text, _legacy_id text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE _status
    WHEN 'invalid' THEN public.legacy_exception('invalid_record', 'error', _path, _legacy_id, '{"note":"not an object or no text id; kept in the JSON only"}')
    WHEN 'too_long' THEN public.legacy_exception('legacy_id_too_long', 'error', _path, left(_legacy_id, 64), '{}')
    WHEN 'duplicate_same' THEN public.legacy_exception('duplicate_record', 'warning', _path, _legacy_id, '{"note":"identical copy of an earlier element; imported once"}')
    WHEN 'conflict' THEN public.legacy_exception('conflicting_duplicate_id', 'error', _path, _legacy_id, '{"note":"same id with different content; not imported until the owner resolves it"}')
  END
$$;

-- Adds {n, <fields>} of one legacy item to a compare map under key.
CREATE FUNCTION public.p6_map_add(_map jsonb, _key text, _vals jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT _map || jsonb_build_object(_key, (SELECT jsonb_object_agg(k, CASE WHEN k = 'n' THEN to_jsonb(coalesce((_map->_key->>'n')::numeric, 0) + 1)
                                                                       ELSE to_jsonb(coalesce((_map->_key->>k)::numeric, 0) + coalesce((_vals->>k)::numeric, 0)) END)
                                          FROM (SELECT 'n' k UNION SELECT jsonb_object_keys(_vals)) ks))
$$;

-- --------------------------------------------------------------------------------------------
-- 4. Tables
-- --------------------------------------------------------------------------------------------
-- 4.1 Assets (slice 1). id IS the register_records id (one permanent id + one AST number for every
--     co-owner); the scope and archive state live on register_records (one place).
CREATE TABLE public.assets (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  name text NOT NULL DEFAULT '' CHECK (length(name) <= 300),
  asset_kind text CHECK (asset_kind IS NULL OR asset_kind IN ('property', 'building', 'vehicle', 'machinery', 'computer', 'furniture', 'other')),
  in_use_on date, purchase_date date, capitalised_on date, sold_on date,
  share_pct numeric CHECK (share_pct IS NULL OR (share_pct > 0 AND share_pct <= 100)),
  book_method text CHECK (book_method IS NULL OR book_method IN ('slm', 'wdv')),
  book_rate_pct numeric, useful_life_years numeric, residual_pct numeric,
  tag text, location text, custodian text, department text, supplier text, condition text, last_verified date, warranty_until date,
  ledger_account_id uuid,          -- accounts.id (asset ledger account), checked at insert; no FK so a valid account delete is never refused
  purchase_entry_id uuid,          -- expenses.id that bought it (legacy transactionId)
  payment_entry_id uuid,           -- expenses.id of the matched bank payment (legacy paymentId)
  document_ids uuid[] NOT NULL DEFAULT '{}',
  legacy_cost numeric, legacy_opening_wdv jsonb, legacy_adjustments jsonb, legacy_sale_value numeric, legacy_monthly_rent numeric, legacy_deposit numeric,
  legacy_id text NOT NULL CHECK (length(legacy_id) BETWEEN 1 AND 200),
  legacy_element jsonb NOT NULL,
  source jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (owner_id, id),
  UNIQUE (owner_id, legacy_id),
  FOREIGN KEY (owner_id, id) REFERENCES public.register_records(owner_id, id)
);
COMMENT ON TABLE public.assets IS 'P6 (FND-03): asset register row of a register_records anchor (one id + one AST number across co-owners). Descriptive fields only; money is in ledger entries (purchase/payment ids) and depreciation_journals; legacy_* are read-only compare copies. Scope and archive live on register_records. Written only by commit_register_backfill.';

CREATE TABLE public.asset_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  event_date date,
  event_kind text NOT NULL CHECK (length(event_kind) BETWEEN 1 AND 40),
  note text, to_value text, applied boolean,
  document_id uuid,
  legacy_value numeric,
  legacy_id text NOT NULL CHECK (length(legacy_id) BETWEEN 1 AND 200),
  legacy_element jsonb NOT NULL,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (owner_id, legacy_id),
  FOREIGN KEY (owner_id, asset_id) REFERENCES public.assets(owner_id, id)
);
CREATE INDEX asset_events_asset_idx ON public.asset_events(asset_id, event_date);
COMMENT ON TABLE public.asset_events IS 'P6: append-only asset lifecycle events (received, capitalised, moves, maintenance, impairment, revaluation, disposal...). legacy_value is the read-only legacy amount; disposal/sale accounting is a separate workflow.';

CREATE TABLE public.depreciation_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- new uuid; the legacy stableUuid is not owner-scoped (inventory R12) and stays in legacy_id
  owner_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  period text NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
  journal_kind text NOT NULL DEFAULT 'book' CHECK (journal_kind = 'book'),
  status text NOT NULL CHECK (status IN ('prepared', 'posted')),
  posted_on date,
  entry_id uuid,                   -- expenses.id of the posted ledger entry
  legacy_amount numeric,
  legacy_id text NOT NULL CHECK (length(legacy_id) BETWEEN 1 AND 200),
  legacy_element jsonb NOT NULL,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (owner_id, legacy_id),
  UNIQUE (asset_id, period, journal_kind),         -- no duplicate depreciation for one asset-month
  FOREIGN KEY (owner_id, asset_id) REFERENCES public.assets(owner_id, id)
);
COMMENT ON TABLE public.depreciation_journals IS 'P6: depreciation journals (prepared/posted) per asset and month; the amount belongs to the posted ledger entry (entry_id); legacy_amount is a read-only compare copy. One journal per asset, month and kind.';

-- 4.2 Properties (slice 2)
CREATE TABLE public.properties (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  name text NOT NULL DEFAULT '' CHECK (length(name) <= 300),
  address text, notes text, gstin text,
  loan_id uuid, deposit_account_id uuid,
  document_ids uuid[] NOT NULL DEFAULT '{}', insurance_document_ids uuid[] NOT NULL DEFAULT '{}', tax_document_ids uuid[] NOT NULL DEFAULT '{}',
  legacy_valuation jsonb,
  legacy_id text NOT NULL CHECK (length(legacy_id) BETWEEN 1 AND 200),
  legacy_element jsonb NOT NULL,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (owner_id, id),
  UNIQUE (owner_id, legacy_id),
  FOREIGN KEY (owner_id, id) REFERENCES public.register_records(owner_id, id)
);
COMMENT ON TABLE public.properties IS 'P6 (FND-03): property register row of a register_records anchor (one id + one PRP number across every co-owner; dated shares in record_ownerships). Valuations are dated observations in register_valuations; contained assets in property_assets.';

CREATE TABLE public.property_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  property_id uuid NOT NULL,
  parent_id uuid REFERENCES public.property_units(id),
  level text NOT NULL CHECK (level IN ('building', 'floor', 'unit')),
  name text NOT NULL DEFAULT '' CHECK (length(name) <= 300),
  area_sqft numeric,
  ord int NOT NULL,
  legacy_id text,
  legacy_path text NOT NULL,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (owner_id, id),
  UNIQUE (property_id, legacy_path),
  FOREIGN KEY (owner_id, property_id) REFERENCES public.properties(owner_id, id)
);
COMMENT ON TABLE public.property_units IS 'P6: Property -> Building -> Floor -> Unit tree (legacy buildings[].floors[].units[] kept with their ids and path).';

-- Dated containment: a property can contain several assets (FND-03); an asset sits in at most one
-- property on any date. included_in_property_value = the asset''s value is part of the property''s
-- valuation, so valuation reports count it once (Flow 5 consolidation rule).
CREATE TABLE public.property_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  property_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('carrying_asset', 'component')),
  included_in_property_value boolean NOT NULL,
  valid_from date NOT NULL DEFAULT '-infinity',
  valid_to date,
  reason text CHECK (reason IS NULL OR length(reason) <= 500),
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CHECK (property_id <> asset_id),
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  FOREIGN KEY (owner_id, property_id) REFERENCES public.properties(owner_id, id),
  FOREIGN KEY (owner_id, asset_id) REFERENCES public.assets(owner_id, id)
);
CREATE INDEX property_assets_asset_idx ON public.property_assets(asset_id, valid_from);
COMMENT ON TABLE public.property_assets IS 'P6: dated containment property -> asset (carrying asset or component). No overlap per asset (trigger). Ended once, never deleted.';

CREATE TABLE public.register_valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  record_id uuid NOT NULL,
  as_of date NOT NULL,
  value numeric NOT NULL CHECK (value >= 0),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  basis text NOT NULL CHECK (basis IN ('market', 'book')),
  source_label text CHECK (source_label IS NULL OR length(source_label) <= 300),
  document_id uuid,
  legacy_id text,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (owner_id, legacy_id),
  FOREIGN KEY (owner_id, record_id) REFERENCES public.register_records(owner_id, id)
);
COMMENT ON TABLE public.register_valuations IS 'P6: append-only dated valuation observations of a property or asset (value, date, source). Never income, never a ledger amount; reports read the latest one.';

CREATE TABLE public.leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  legal_entity_id uuid NOT NULL,          -- numbering scope = the property''s scope when recorded
  readable_id text,                       -- LSE-NNNN
  property_id uuid NOT NULL,
  unit_id uuid,
  tenant text NOT NULL DEFAULT '' CHECK (length(tenant) <= 300),
  start_date date, end_date date,
  due_day int, escalation_pct numeric, escalation_every_months int, notice_days int,
  payment_terms text, gst boolean, currency text,
  document_id uuid, receipt_account_id uuid,
  legacy_rent numeric, legacy_deposit numeric,
  legacy_id text NOT NULL CHECK (length(legacy_id) BETWEEN 1 AND 200),
  legacy_element jsonb NOT NULL,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  archived_at timestamptz, archived_by uuid,
  archive_reason text CHECK (archive_reason IS NULL OR length(archive_reason) BETWEEN 3 AND 500),
  CHECK ((archived_at IS NULL) = (archive_reason IS NULL)),
  UNIQUE (owner_id, id),
  UNIQUE (owner_id, legacy_id),
  UNIQUE (legal_entity_id, readable_id),
  FOREIGN KEY (owner_id, legal_entity_id) REFERENCES public.legal_entities(owner_id, id),
  FOREIGN KEY (owner_id, property_id) REFERENCES public.properties(owner_id, id),
  FOREIGN KEY (owner_id, unit_id) REFERENCES public.property_units(owner_id, id)
);
COMMENT ON TABLE public.leases IS 'P6: lease terms (descriptive) of a property/unit; rent and deposit are legacy compare copies only (rent receipts are ledger entries). LSE number in the property''s scope. Archive only.';

-- 4.3 Trips (slice 3). Itinerary and finance status are separate (Signature Flow 4: finance is marked
--     complete independently; trip completion never closes pending refunds or claims).
CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  legal_entity_id uuid NOT NULL,          -- personal books unless explicitly linked; organisation names are never entities
  readable_id text,                       -- TRP-YYYY-NNNN (year of the trip start for legacy trips)
  name text NOT NULL DEFAULT '' CHECK (length(name) <= 300),
  destination text, purpose text, trip_type text,
  start_date date, end_date date,
  travellers text[] NOT NULL DEFAULT '{}', currencies text[] NOT NULL DEFAULT '{}',
  primary_workspace_label text,           -- Me/Family/Business/Official label (never a legal entity)
  organisation_label text,                -- organisation NAME (never a legal entity)
  plan jsonb NOT NULL DEFAULT '{}'::jsonb, -- budgets are plans (allowed by FND-03), not ledger totals
  itinerary jsonb NOT NULL DEFAULT '[]'::jsonb,
  itinerary_status text NOT NULL CHECK (itinerary_status IN ('planned', 'cancelled')),
  itinerary_cancelled_at timestamptz, itinerary_restored_at timestamptz,
  finance_status text NOT NULL CHECK (finance_status IN ('open', 'finance_complete')),
  finance_completed_at timestamptz,
  legacy_tag text NOT NULL,               -- 'Trip: <name>' as entries carry it today (kept readable, never rewritten)
  legacy_id text NOT NULL CHECK (length(legacy_id) BETWEEN 1 AND 200),
  legacy_element jsonb NOT NULL,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  archived_at timestamptz, archived_by uuid,
  archive_reason text CHECK (archive_reason IS NULL OR length(archive_reason) BETWEEN 3 AND 500),
  CHECK ((archived_at IS NULL) = (archive_reason IS NULL)),
  CHECK ((itinerary_status = 'cancelled') = (itinerary_cancelled_at IS NOT NULL)),
  CHECK ((finance_status = 'finance_complete') = (finance_completed_at IS NOT NULL)),
  UNIQUE (owner_id, id),
  UNIQUE (owner_id, id, legal_entity_id),
  UNIQUE (owner_id, legacy_id),
  UNIQUE (legal_entity_id, readable_id),
  FOREIGN KEY (owner_id, legal_entity_id) REFERENCES public.legal_entities(owner_id, id)
);
COMMENT ON TABLE public.trips IS 'P6 (Flow 4): trip register. TRP-YYYY-NNNN in the scope entity. itinerary_status and finance_status are independent. Entries link by id (register_entry_links), the Trip: <name> tag stays on entries for compatibility. Budgets are plans. Archive only.';

CREATE TABLE public.trip_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  trip_id uuid NOT NULL,
  legal_entity_id uuid NOT NULL,
  booking_kind text, provider text, booking_ref text,
  booking_date date, due_date date, check_in_at timestamptz,
  payment_status text CHECK (payment_status IS NULL OR payment_status IN ('unpaid', 'paid', 'cancelled')),
  confirmation text CHECK (confirmation IS NULL OR confirmation IN ('pending', 'confirmed')),
  traveller text, location text, currency text, note text, cancel_terms text,
  document_ids uuid[] NOT NULL DEFAULT '{}',
  legacy_amount numeric, legacy_original_amount numeric, legacy_planning_rate numeric,
  legacy_id text NOT NULL CHECK (length(legacy_id) BETWEEN 1 AND 200),
  legacy_element jsonb NOT NULL,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (owner_id, id),
  UNIQUE (trip_id, legacy_id),
  FOREIGN KEY (owner_id, trip_id, legal_entity_id) REFERENCES public.trips(owner_id, id, legal_entity_id)
);
COMMENT ON TABLE public.trip_bookings IS 'P6: trip bookings (plans/commitments, never payments). Payments are ledger entries linked by id (register_entry_links role booking_payment). legacy_amount is a read-only compare copy.';

CREATE TABLE public.trip_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  trip_id uuid NOT NULL,
  legal_entity_id uuid NOT NULL,
  advance_date date, source_label text, settled_at timestamptz, settlement_note text,
  entry_id uuid,                          -- the ledger entry of the advance once linked (never guessed from amounts)
  legacy_amount numeric,
  legacy_id text NOT NULL CHECK (length(legacy_id) BETWEEN 1 AND 200),
  legacy_element jsonb NOT NULL,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (trip_id, legacy_id),
  FOREIGN KEY (owner_id, trip_id, legal_entity_id) REFERENCES public.trips(owner_id, id, legal_entity_id)
);
COMMENT ON TABLE public.trip_advances IS 'P6: trip advances. The amount belongs to the advance ledger entry (entry_id, linked explicitly, never by amount matching); legacy_amount is a read-only compare copy.';

-- 4.4 Holdings and receivables (slice 4)
CREATE TABLE public.investment_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  legal_entity_id uuid NOT NULL,
  readable_id text,                       -- HLD-NNNNNN
  holding_kind text, name text NOT NULL DEFAULT '' CHECK (length(name) <= 300),
  isin text, symbol text, exchange text, scheme_code text,
  share_pct numeric, grams numeric, karat numeric, trading_status text, currency text,
  bond jsonb,
  cash_account_id uuid,                   -- accounts.id (broker cash)
  demat_holding_id uuid,                  -- security_holdings.id with the same ISIN (one source is counted, never both)
  legacy_quantity numeric, legacy_cost_basis numeric,
  legacy_id text NOT NULL CHECK (length(legacy_id) BETWEEN 1 AND 200),
  legacy_element jsonb NOT NULL,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  archived_at timestamptz, archived_by uuid,
  archive_reason text CHECK (archive_reason IS NULL OR length(archive_reason) BETWEEN 3 AND 500),
  CHECK ((archived_at IS NULL) = (archive_reason IS NULL)),
  UNIQUE (owner_id, id),
  UNIQUE (owner_id, legacy_id),
  UNIQUE (legal_entity_id, readable_id),
  FOREIGN KEY (owner_id, legal_entity_id) REFERENCES public.legal_entities(owner_id, id)
);
COMMENT ON TABLE public.investment_holdings IS 'P6: manual / other investments (books.holdings). Quantity and cost basis are legacy compare copies (FND-03; REQ-LED-002); the demat link is by ISIN. HLD number in the owning entity scope. Archive only.';

CREATE TABLE public.receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  legal_entity_id uuid NOT NULL,
  readable_id text,                       -- RCV-YYYY-NNNN (invoice year)
  customer text NOT NULL DEFAULT '' CHECK (length(customer) <= 300),
  invoice_no text, invoice_date date, due_date date,
  settled_by_entry_id uuid,               -- explicit settlement entry; the legacy fuzzy name/amount match is NOT migrated
  legacy_amount numeric, legacy_gst numeric,
  legacy_id text NOT NULL CHECK (length(legacy_id) BETWEEN 1 AND 200),
  legacy_element jsonb NOT NULL,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  archived_at timestamptz, archived_by uuid,
  archive_reason text CHECK (archive_reason IS NULL OR length(archive_reason) BETWEEN 3 AND 500),
  CHECK ((archived_at IS NULL) = (archive_reason IS NULL)),
  UNIQUE (owner_id, id),
  UNIQUE (owner_id, legacy_id),
  UNIQUE (legal_entity_id, readable_id),
  FOREIGN KEY (owner_id, legal_entity_id) REFERENCES public.legal_entities(owner_id, id)
);
COMMENT ON TABLE public.receivables IS 'P6: customer invoices owed. Amount/GST are legacy compare copies; settlement is an explicit entry id. RCV-YYYY-NNNN. Archive only.';

-- 4.5 Projects / activities (slice 5; F08)
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  legal_entity_id uuid NOT NULL,
  readable_id text,                       -- PRJ-NNNN
  name text NOT NULL DEFAULT '' CHECK (length(name) <= 300),
  tag text NOT NULL CHECK (length(tag) BETWEEN 1 AND 200),   -- the exact entry tag the budget matches today
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,                    -- budget plan {amount, period, start, carry}
  legacy_id text NOT NULL CHECK (length(legacy_id) BETWEEN 1 AND 200),
  legacy_element jsonb NOT NULL,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  archived_at timestamptz, archived_by uuid,
  archive_reason text CHECK (archive_reason IS NULL OR length(archive_reason) BETWEEN 3 AND 500),
  CHECK ((archived_at IS NULL) = (archive_reason IS NULL)),
  UNIQUE (owner_id, id),
  UNIQUE (owner_id, legacy_id),
  UNIQUE (legal_entity_id, readable_id),
  FOREIGN KEY (owner_id, legal_entity_id) REFERENCES public.legal_entities(owner_id, id)
);
COMMENT ON TABLE public.projects IS 'P6 (F08): projects/activities as a register (additive; today they are only budgets[kind=project] and tags). Budget is a plan; spending is the linked entries. PRJ number. Archive only.';

-- 4.6 Shared tables
-- Ledger entry <-> register record links (many to many), by id. The tag on the entry is not touched.
CREATE TABLE public.register_entry_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  register text NOT NULL CHECK (register IN ('trips', 'trip_bookings', 'projects')),
  record_id uuid NOT NULL,
  legal_entity_id uuid NOT NULL,          -- scope of the record (set by trigger)
  expense_id uuid NOT NULL,               -- expenses.id (checked at insert; no FK: a valid entry delete is never refused)
  role text NOT NULL CHECK (role IN ('trip_expense', 'booking_payment', 'project_expense')),
  basis text NOT NULL CHECK (basis IN ('trip_id_column', 'trip_tag', 'booking_expense_id', 'project_tag')),
  tag text,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (register, record_id, expense_id, role, basis),
  FOREIGN KEY (owner_id, legal_entity_id) REFERENCES public.legal_entities(owner_id, id)
);
CREATE INDEX register_entry_links_expense_idx ON public.register_entry_links(owner_id, expense_id);
COMMENT ON TABLE public.register_entry_links IS 'P6: append-only links from trips, bookings and projects to ledger entries by id (replaces name-tag matching for readers after the read switch; tags stay on entries).';

-- A co-owner''s own legacy JSON copy of a jointly owned property/asset, attached to the ONE shared
-- record (DN-P2-IDS item 3). Allowed only while that account holds a confirmed share of the record.
CREATE TABLE public.register_legacy_copies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  record_id uuid NOT NULL REFERENCES public.register_records(id),
  record_kind text NOT NULL CHECK (record_kind IN ('property', 'asset')),
  legacy_id text NOT NULL CHECK (length(legacy_id) BETWEEN 1 AND 200),
  legacy_element jsonb NOT NULL,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (owner_id, record_kind, legacy_id)
);
COMMENT ON TABLE public.register_legacy_copies IS 'P6: a co-owner''s legacy JSON property/asset attached to the shared register record instead of creating a second record. Append-only.';

CREATE TABLE public.register_archive_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  register text NOT NULL,
  record_id uuid NOT NULL,
  readable_id text,
  action text NOT NULL CHECK (action = 'archived'),
  reason text NOT NULL,
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  by_user uuid
);
CREATE INDEX register_archive_events_record_idx ON public.register_archive_events(owner_id, record_id);
COMMENT ON TABLE public.register_archive_events IS 'P6: append-only archive history of register records (written by trigger whenever a record is archived, through any path).';

-- --------------------------------------------------------------------------------------------
-- 5. Readable numbers (P5 generic trigger; scope = legal_entity_id; claimed numbers kept)
-- --------------------------------------------------------------------------------------------
CREATE TRIGGER a_assign_readable_id BEFORE INSERT OR UPDATE ON public.leases FOR EACH ROW EXECUTE FUNCTION public.assign_readable_id('LSE', 'created_at', 'legal_entity_id', 'owner_id');
CREATE TRIGGER a_assign_readable_id BEFORE INSERT OR UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.assign_readable_id('TRP', 'start_date', 'legal_entity_id', 'owner_id');
CREATE TRIGGER a_assign_readable_id BEFORE INSERT OR UPDATE ON public.investment_holdings FOR EACH ROW EXECUTE FUNCTION public.assign_readable_id('HLD', 'created_at', 'legal_entity_id', 'owner_id');
CREATE TRIGGER a_assign_readable_id BEFORE INSERT OR UPDATE ON public.receivables FOR EACH ROW EXECUTE FUNCTION public.assign_readable_id('RCV', 'invoice_date', 'legal_entity_id', 'owner_id');
CREATE TRIGGER a_assign_readable_id BEFORE INSERT OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.assign_readable_id('PRJ', 'created_at', 'legal_entity_id', 'owner_id');

-- --------------------------------------------------------------------------------------------
-- 6. Guards (every role, including definer code and the table owner)
-- --------------------------------------------------------------------------------------------
-- Identity, legacy copies and provenance never change. TG_ARGV lists the columns that may be set ONCE
-- (from NULL) by the archive / end writers; every other change is refused. Deletes only by confirmed
-- erasure (ledgerline.erasing).
CREATE FUNCTION public.p6_guard_register_row() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE o jsonb; n jsonb; c text; changed boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('ledgerline.erasing', true) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Register records are never deleted; archive instead (%)', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  o := to_jsonb(OLD); n := to_jsonb(NEW);
  IF TG_NARGS > 0 THEN
    FOREACH c IN ARRAY TG_ARGV LOOP
      IF n->c IS DISTINCT FROM o->c THEN
        changed := true;
        IF o->>c IS NOT NULL THEN RAISE EXCEPTION '% of % can only be set once', c, TG_TABLE_NAME USING ERRCODE = '42501'; END IF;
      END IF;
      o := o - c; n := n - c;
    END LOOP;
  END IF;
  IF n IS DISTINCT FROM o THEN
    RAISE EXCEPTION '% rows keep their identity, legacy copy and provenance; only archiving is allowed', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF changed AND TG_ARGV[0] = 'archived_at' AND (to_jsonb(NEW)->>'archived_at') IS NULL THEN
    RAISE EXCEPTION 'Archiving needs a time' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER guard_p6_register_row BEFORE UPDATE OR DELETE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.p6_guard_register_row();
CREATE TRIGGER guard_p6_register_row BEFORE UPDATE OR DELETE ON public.asset_events FOR EACH ROW EXECUTE FUNCTION public.p6_guard_register_row();
CREATE TRIGGER guard_p6_register_row BEFORE UPDATE OR DELETE ON public.depreciation_journals FOR EACH ROW EXECUTE FUNCTION public.p6_guard_register_row();
CREATE TRIGGER guard_p6_register_row BEFORE UPDATE OR DELETE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.p6_guard_register_row();
CREATE TRIGGER guard_p6_register_row BEFORE UPDATE OR DELETE ON public.property_units FOR EACH ROW EXECUTE FUNCTION public.p6_guard_register_row();
CREATE TRIGGER guard_p6_register_row BEFORE UPDATE OR DELETE ON public.register_valuations FOR EACH ROW EXECUTE FUNCTION public.p6_guard_register_row();
CREATE TRIGGER guard_p6_register_row BEFORE UPDATE OR DELETE ON public.trip_bookings FOR EACH ROW EXECUTE FUNCTION public.p6_guard_register_row();
CREATE TRIGGER guard_p6_register_row BEFORE UPDATE OR DELETE ON public.trip_advances FOR EACH ROW EXECUTE FUNCTION public.p6_guard_register_row();
CREATE TRIGGER guard_p6_register_row BEFORE UPDATE OR DELETE ON public.register_entry_links FOR EACH ROW EXECUTE FUNCTION public.p6_guard_register_row();
CREATE TRIGGER guard_p6_register_row BEFORE UPDATE OR DELETE ON public.register_legacy_copies FOR EACH ROW EXECUTE FUNCTION public.p6_guard_register_row();
CREATE TRIGGER guard_p6_register_row BEFORE UPDATE OR DELETE ON public.register_archive_events FOR EACH ROW EXECUTE FUNCTION public.p6_guard_register_row();
CREATE TRIGGER guard_p6_register_row BEFORE UPDATE OR DELETE ON public.property_assets FOR EACH ROW EXECUTE FUNCTION public.p6_guard_register_row('valid_to');
CREATE TRIGGER guard_p6_register_row BEFORE UPDATE OR DELETE ON public.leases FOR EACH ROW EXECUTE FUNCTION public.p6_guard_register_row('archived_at', 'archived_by', 'archive_reason');
CREATE TRIGGER guard_p6_register_row BEFORE UPDATE OR DELETE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.p6_guard_register_row('archived_at', 'archived_by', 'archive_reason');
CREATE TRIGGER guard_p6_register_row BEFORE UPDATE OR DELETE ON public.investment_holdings FOR EACH ROW EXECUTE FUNCTION public.p6_guard_register_row('archived_at', 'archived_by', 'archive_reason');
CREATE TRIGGER guard_p6_register_row BEFORE UPDATE OR DELETE ON public.receivables FOR EACH ROW EXECUTE FUNCTION public.p6_guard_register_row('archived_at', 'archived_by', 'archive_reason');
CREATE TRIGGER guard_p6_register_row BEFORE UPDATE OR DELETE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.p6_guard_register_row('archived_at', 'archived_by', 'archive_reason');

-- References by id are checked when a row is written (owner's own rows only). Later deletes of the
-- referenced entry/account/document stay valid and show up as orphans in the compare report.
CREATE FUNCTION public.p6_guard_references() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n jsonb := to_jsonb(NEW); spec text; col text; kind text; v uuid; ent uuid;
BEGIN
  -- TG_ARGV: 'column:kind' (kind expense/account/document/loan/security_holding; column[] for arrays)
  FOREACH spec IN ARRAY coalesce(TG_ARGV, '{}'::text[]) LOOP
    col := split_part(spec, ':', 1); kind := split_part(spec, ':', 2);
    IF jsonb_typeof(n->col) = 'array' THEN
      FOR v IN SELECT x::uuid FROM jsonb_array_elements_text(n->col) x LOOP
        IF NOT public.p6_ref_ok((n->>'owner_id')::uuid, kind, v) THEN RAISE EXCEPTION 'P6: % % is not one of the owner''s records', kind, v USING ERRCODE = '23503'; END IF;
      END LOOP;
    ELSIF n->>col IS NOT NULL AND NOT public.p6_ref_ok((n->>'owner_id')::uuid, kind, (n->>col)::uuid) THEN
      RAISE EXCEPTION 'P6: % % is not one of the owner''s records', kind, n->>col USING ERRCODE = '23503';
    END IF;
  END LOOP;
  IF TG_TABLE_NAME = 'register_entry_links' THEN
    ent := CASE NEW.register
      WHEN 'trips' THEN (SELECT t.legal_entity_id FROM public.trips t WHERE t.id = NEW.record_id AND t.owner_id = NEW.owner_id)
      WHEN 'trip_bookings' THEN (SELECT b.legal_entity_id FROM public.trip_bookings b WHERE b.id = NEW.record_id AND b.owner_id = NEW.owner_id)
      WHEN 'projects' THEN (SELECT p.legal_entity_id FROM public.projects p WHERE p.id = NEW.record_id AND p.owner_id = NEW.owner_id) END;
    IF ent IS NULL THEN RAISE EXCEPTION 'P6: linked % record not found for this owner', NEW.register USING ERRCODE = '23503'; END IF;
    NEW.legal_entity_id := ent;
  ELSIF TG_TABLE_NAME = 'register_legacy_copies' THEN
    IF NOT EXISTS (SELECT 1 FROM public.register_records r WHERE r.id = NEW.record_id AND r.record_kind = NEW.record_kind AND r.owner_id <> NEW.owner_id AND r.archived_at IS NULL)
       OR NOT EXISTS (SELECT 1 FROM public.record_ownerships x WHERE x.record_id = NEW.record_id AND x.owner_id = NEW.owner_id AND x.status = 'confirmed') THEN
      RAISE EXCEPTION 'P6: a legacy copy attaches only to another account''s active shared record in which you hold a confirmed share' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_p6_references BEFORE INSERT ON public.assets FOR EACH ROW EXECUTE FUNCTION public.p6_guard_references('ledger_account_id:account', 'purchase_entry_id:expense', 'payment_entry_id:expense', 'document_ids:document');
CREATE TRIGGER guard_p6_references BEFORE INSERT ON public.asset_events FOR EACH ROW EXECUTE FUNCTION public.p6_guard_references('document_id:document');
CREATE TRIGGER guard_p6_references BEFORE INSERT ON public.depreciation_journals FOR EACH ROW EXECUTE FUNCTION public.p6_guard_references('entry_id:expense');
CREATE TRIGGER guard_p6_references BEFORE INSERT ON public.properties FOR EACH ROW EXECUTE FUNCTION public.p6_guard_references('loan_id:loan', 'deposit_account_id:account', 'document_ids:document', 'insurance_document_ids:document', 'tax_document_ids:document');
CREATE TRIGGER guard_p6_references BEFORE INSERT ON public.register_valuations FOR EACH ROW EXECUTE FUNCTION public.p6_guard_references('document_id:document');
CREATE TRIGGER guard_p6_references BEFORE INSERT ON public.leases FOR EACH ROW EXECUTE FUNCTION public.p6_guard_references('document_id:document', 'receipt_account_id:account');
CREATE TRIGGER guard_p6_references BEFORE INSERT ON public.trip_bookings FOR EACH ROW EXECUTE FUNCTION public.p6_guard_references('document_ids:document');
CREATE TRIGGER guard_p6_references BEFORE INSERT ON public.trip_advances FOR EACH ROW EXECUTE FUNCTION public.p6_guard_references('entry_id:expense');
CREATE TRIGGER guard_p6_references BEFORE INSERT ON public.investment_holdings FOR EACH ROW EXECUTE FUNCTION public.p6_guard_references('cash_account_id:account', 'demat_holding_id:security_holding');
CREATE TRIGGER guard_p6_references BEFORE INSERT ON public.receivables FOR EACH ROW EXECUTE FUNCTION public.p6_guard_references('settled_by_entry_id:expense');
CREATE TRIGGER guard_p6_references BEFORE INSERT ON public.register_entry_links FOR EACH ROW EXECUTE FUNCTION public.p6_guard_references('expense_id:expense');
CREATE TRIGGER guard_p6_references BEFORE INSERT ON public.register_legacy_copies FOR EACH ROW EXECUTE FUNCTION public.p6_guard_references();

-- Containment: an asset sits in at most one property on any date (per-asset advisory lock + range
-- check, every role; same technique as P5 section 2.3).
CREATE FUNCTION public.p6_guard_property_asset() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('public.property_assets:' || NEW.asset_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.property_assets x WHERE x.asset_id = NEW.asset_id AND x.id <> NEW.id
             AND daterange(x.valid_from, x.valid_to, '[)') && daterange(NEW.valid_from, NEW.valid_to, '[)')) THEN
    RAISE EXCEPTION 'CONTAINMENT_OVERLAP: this asset is already inside a property in that range' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_p6_property_asset BEFORE INSERT ON public.property_assets FOR EACH ROW EXECUTE FUNCTION public.p6_guard_property_asset();

-- Archive history: appended whenever a register record is archived, whatever path archived it.
CREATE FUNCTION public.p6_log_archive() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE reg text := TG_TABLE_NAME;
BEGIN
  IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
    IF TG_TABLE_NAME = 'register_records' THEN
      reg := CASE WHEN NEW.record_kind = 'asset' AND EXISTS (SELECT 1 FROM public.assets a WHERE a.id = NEW.id) THEN 'assets'
                  WHEN NEW.record_kind = 'property' AND EXISTS (SELECT 1 FROM public.properties p WHERE p.id = NEW.id) THEN 'properties'
                  ELSE 'register_records' END;
    END IF;
    INSERT INTO public.register_archive_events(owner_id, register, record_id, readable_id, action, reason, at, by_user)
    VALUES (NEW.owner_id, reg, NEW.id, NEW.readable_id, 'archived', NEW.archive_reason, NEW.archived_at, NEW.archived_by);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER p6_log_archive AFTER UPDATE ON public.register_records FOR EACH ROW EXECUTE FUNCTION public.p6_log_archive();
CREATE TRIGGER p6_log_archive AFTER UPDATE ON public.leases FOR EACH ROW EXECUTE FUNCTION public.p6_log_archive();
CREATE TRIGGER p6_log_archive AFTER UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.p6_log_archive();
CREATE TRIGGER p6_log_archive AFTER UPDATE ON public.investment_holdings FOR EACH ROW EXECUTE FUNCTION public.p6_log_archive();
CREATE TRIGGER p6_log_archive AFTER UPDATE ON public.receivables FOR EACH ROW EXECUTE FUNCTION public.p6_log_archive();
CREATE TRIGGER p6_log_archive AFTER UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.p6_log_archive();

-- --------------------------------------------------------------------------------------------
-- 7. Backfill plans (framework of P5 section 3 / plan section 5). Each plan reads the RAW stored
--    JSON, returns rows to create (or existing ones), exceptions, the legacy "before" compare map and
--    source_sha256. Proposed ids are fresh uuids; commit recomputes the plan under the owner lock.
-- --------------------------------------------------------------------------------------------
-- 7.1 Assets, asset events, depreciation journals
CREATE FUNCTION public.p6_plan_assets(_owner uuid, _data jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  rws jsonb[] := '{}'; ex jsonb[] := '{}'; bm jsonb := '{}'; el record; e jsonb; st text; scope uuid; rid uuid; rec public.register_records;
  ids jsonb := '{}'; keys jsonb := '{}'; v uuid; d jsonb; share numeric; arr uuid[]; a_ok boolean; k text; aid uuid; ek text; per text;
  seen_jp text[] := '{}';
BEGIN
  -- Legacy "before" map: every asset by its JSON company (ownerEntityId; none = personal), INR.
  FOR el IN SELECT * FROM public.p6_list(_data, ARRAY['assets']) x WHERE x.status <> 'duplicate_same' ORDER BY x.ord LOOP
    e := el.element;
    keys := keys || CASE WHEN el.legacy_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(el.legacy_id, coalesce(nullif(e->>'ownerEntityId', ''), 'personal')) END;
    bm := public.p6_map_add(bm, 'assets|' || CASE WHEN el.status IN ('invalid', 'too_long') THEN '(invalid)' ELSE coalesce(nullif(e->>'ownerEntityId', ''), 'personal') END || '|INR',
      jsonb_build_object('cost', public.p6_num(e->'cost'), 'sale_value', public.p6_num(e->'saleValue')));
  END LOOP;
  FOR el IN SELECT * FROM public.p6_list(_data, ARRAY['assets']) ORDER BY ord LOOP
    st := el.status;
    IF st <> 'ok' THEN ex := ex || public.p6_status_exception(st, el.path, el.legacy_id); CONTINUE; END IF;
    e := el.element;
    scope := public.p6_scope(_owner, e->>'ownerEntityId');
    SELECT * INTO rec FROM public.register_records r WHERE r.owner_id = _owner AND r.record_kind = 'asset' AND r.legacy_id = el.legacy_id;
    IF scope IS NULL AND rec.id IS NULL THEN
      ex := ex || public.legacy_exception('orphan_owner_entity', 'error', el.path, el.legacy_id, jsonb_build_object('ownerEntityId', e->'ownerEntityId',
        'note', 'company missing from the entity list (deleted/merged); not imported until the owner confirms it in the company backfill'));
      CONTINUE;
    END IF;
    IF rec.id IS NOT NULL AND scope IS DISTINCT FROM rec.legal_entity_id THEN
      ex := ex || public.legacy_exception('record_scope_differs', 'warning', el.path, el.legacy_id, jsonb_build_object('record_readable_id', rec.readable_id,
        'note', 'the register record keeps its scope and number; ownership changes are dated shares'));
    END IF;
    rid := coalesce(rec.id, gen_random_uuid());
    IF rec.id IS NULL THEN
      rws := rws || jsonb_build_object('t', 'register_records', 'a', 'create', 'path', el.path, 'legacy_id', el.legacy_id, 'row', jsonb_build_object(
        'id', rid, 'owner_id', _owner, 'record_kind', 'asset', 'legal_entity_id', scope, 'label', left(coalesce(e->>'name', ''), 300), 'legacy_id', el.legacy_id,
        'source', jsonb_build_object('from', 'p6_backfill', 'register', 'assets', 'path', el.path, 'legacy_id', el.legacy_id, 'element_sha256', el.element_sha256)));
    END IF;
    SELECT a.id INTO v FROM public.assets a WHERE a.owner_id = _owner AND a.legacy_id = el.legacy_id;
    ids := ids || jsonb_build_object(el.legacy_id, rid);
    IF v IS NOT NULL THEN
      rws := rws || jsonb_build_object('t', 'assets', 'a', 'exists', 'path', el.path, 'legacy_id', el.legacy_id, 'row', jsonb_build_object('id', v));
      CONTINUE;
    END IF;
    -- references: only the owner's own existing rows; anything else is reported and left out
    arr := '{}';
    FOR d IN SELECT x FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e->'docIds') = 'array' THEN e->'docIds' ELSE '[]'::jsonb END || CASE WHEN e ? 'docId' THEN jsonb_build_array(e->'docId') ELSE '[]'::jsonb END) x LOOP
      IF d = 'null'::jsonb THEN CONTINUE; END IF;
      IF public.p6_ref_ok(_owner, 'document', public.p6_uuid(d)) THEN
        IF NOT public.p6_uuid(d) = ANY (arr) THEN arr := arr || public.p6_uuid(d); END IF;
      ELSE ex := ex || public.legacy_exception('missing_document', 'warning', el.path, el.legacy_id, jsonb_build_object('document', d)); END IF;
    END LOOP;
    FOR k, ek IN SELECT * FROM (VALUES ('transactionId', 'expense'), ('paymentId', 'expense'), ('accountId', 'account')) z LOOP
      IF e ? k AND e->k <> 'null'::jsonb AND NOT public.p6_ref_ok(_owner, ek, public.p6_uuid(e->k)) THEN
        ex := ex || public.legacy_exception('missing_' || ek, 'warning', el.path, el.legacy_id, jsonb_build_object('field', k, 'value', e->k));
      END IF;
    END LOOP;
    IF e->>'kind' IS NOT NULL AND NOT (e->>'kind' = ANY (ARRAY['property', 'building', 'vehicle', 'machinery', 'computer', 'furniture', 'other'])) THEN
      ex := ex || public.legacy_exception('unknown_asset_kind', 'warning', el.path, el.legacy_id, jsonb_build_object('kind', e->'kind'));
    END IF;
    share := public.p6_num(e->'sharePct');
    rws := rws || jsonb_build_object('t', 'assets', 'a', 'create', 'path', el.path, 'legacy_id', el.legacy_id, 'row', jsonb_build_object(
      'id', rid, 'owner_id', _owner, 'name', left(coalesce(e->>'name', ''), 300),
      'asset_kind', CASE WHEN e->>'kind' = ANY (ARRAY['property', 'building', 'vehicle', 'machinery', 'computer', 'furniture', 'other']) THEN e->>'kind' END,
      'in_use_on', public.p6_date(e->'inUse'), 'purchase_date', public.p6_date(e->'purchaseDate'), 'capitalised_on', public.p6_date(e->'capitalisedOn'),
      'sold_on', public.p6_date(e->'soldOn'),
      'share_pct', CASE WHEN share > 0 AND share <= 100 THEN share END,
      'book_method', CASE WHEN e->>'bookMethod' IN ('slm', 'wdv') THEN e->>'bookMethod' END,
      'book_rate_pct', public.p6_num(e->'bookRatePct'), 'useful_life_years', public.p6_num(e->'usefulLifeYears'), 'residual_pct', public.p6_num(e->'residualPct'),
      'tag', public.p6_text(e->'tag', 200), 'location', public.p6_text(e->'location', 300), 'custodian', public.p6_text(e->'custodian', 300),
      'department', public.p6_text(e->'department', 200), 'supplier', public.p6_text(e->'supplier', 300), 'condition', public.p6_text(e->'condition', 40),
      'last_verified', public.p6_date(e->'lastVerified'), 'warranty_until', public.p6_date(e->'warrantyUntil'),
      'ledger_account_id', CASE WHEN public.p6_ref_ok(_owner, 'account', public.p6_uuid(e->'accountId')) THEN public.p6_uuid(e->'accountId') END,
      'purchase_entry_id', CASE WHEN public.p6_ref_ok(_owner, 'expense', public.p6_uuid(e->'transactionId')) THEN public.p6_uuid(e->'transactionId') END,
      'payment_entry_id', CASE WHEN public.p6_ref_ok(_owner, 'expense', public.p6_uuid(e->'paymentId')) THEN public.p6_uuid(e->'paymentId') END,
      'document_ids', to_jsonb(arr),
      'legacy_cost', public.p6_num(e->'cost'), 'legacy_opening_wdv', e->'openingWdv', 'legacy_adjustments', e->'adjustments',
      'legacy_sale_value', public.p6_num(e->'saleValue'), 'legacy_monthly_rent', public.p6_num(e->'monthlyRent'), 'legacy_deposit', public.p6_num(e->'deposit'),
      'legacy_id', el.legacy_id, 'legacy_element', e,
      'source', jsonb_build_object('from', 'finance_preferences', 'path', el.path, 'legacy_id', el.legacy_id, 'element_sha256', el.element_sha256)));
    -- The JSON share of the owning entity becomes a dated, confirmed share (DN-P2-IDS item 3).
    IF share > 0 AND share <= 100 AND scope IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.record_ownerships x WHERE x.record_id = rid AND x.owner_id = _owner AND x.owning_entity_id = scope AND x.status <> 'rejected') THEN
      rws := rws || jsonb_build_object('t', 'record_ownerships', 'a', 'create', 'path', el.path, 'legacy_id', el.legacy_id, 'row', jsonb_build_object(
        'record_id', rid, 'owner_id', _owner, 'owning_entity_id', scope, 'share_pct', share,
        'valid_from', coalesce(public.p6_date(e->'purchaseDate'), public.p6_date(e->'inUse'), '-infinity'::date), 'status', 'confirmed',
        'decided_at', clock_timestamp(), 'decided_by', _owner, 'note', 'Legacy asset sharePct',
        'source', jsonb_build_object('from', 'p6_backfill', 'register', 'assets', 'path', el.path, 'legacy_id', el.legacy_id)));
    ELSIF share IS NOT NULL AND NOT (share > 0 AND share <= 100) THEN
      ex := ex || public.legacy_exception('invalid_share_pct', 'warning', el.path, el.legacy_id, jsonb_build_object('sharePct', e->'sharePct'));
    END IF;
  END LOOP;

  -- Asset events
  FOR el IN SELECT * FROM public.p6_list(_data, ARRAY['books', 'assetEvents']) ORDER BY ord LOOP
    e := el.element;
    IF jsonb_typeof(e) = 'object' AND el.status <> 'duplicate_same' THEN
      bm := public.p6_map_add(bm, 'asset_events|' || coalesce(keys->>(e->>'assetId'), '(no asset)') || '|INR', jsonb_build_object('value', public.p6_num(e->'value')));
    END IF;
    st := el.status;
    IF st <> 'ok' THEN ex := ex || public.p6_status_exception(st, el.path, el.legacy_id); CONTINUE; END IF;
    aid := (ids->>(e->>'assetId'))::uuid;
    IF aid IS NULL THEN ex := ex || public.legacy_exception('event_for_unknown_asset', 'error', el.path, el.legacy_id, jsonb_build_object('assetId', e->'assetId')); CONTINUE; END IF;
    IF NOT (jsonb_typeof(e->'kind') = 'string' AND length(e->>'kind') BETWEEN 1 AND 40) THEN
      ex := ex || public.legacy_exception('invalid_event_kind', 'error', el.path, el.legacy_id, jsonb_build_object('kind', e->'kind')); CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.asset_events x WHERE x.owner_id = _owner AND x.legacy_id = el.legacy_id) THEN
      rws := rws || jsonb_build_object('t', 'asset_events', 'a', 'exists', 'path', el.path, 'legacy_id', el.legacy_id, 'row', '{}'::jsonb); CONTINUE;
    END IF;
    IF e->'docId' IS NOT NULL AND e->'docId' <> 'null'::jsonb AND NOT public.p6_ref_ok(_owner, 'document', public.p6_uuid(e->'docId')) THEN
      ex := ex || public.legacy_exception('missing_document', 'warning', el.path, el.legacy_id, jsonb_build_object('document', e->'docId'));
    END IF;
    rws := rws || jsonb_build_object('t', 'asset_events', 'a', 'create', 'path', el.path, 'legacy_id', el.legacy_id, 'row', jsonb_build_object(
      'owner_id', _owner, 'asset_id', aid, 'event_date', public.p6_date(e->'date'), 'event_kind', e->>'kind', 'note', public.p6_text(e->'note', 1000),
      'to_value', public.p6_text(e->'to', 300), 'applied', CASE WHEN jsonb_typeof(e->'applied') = 'boolean' THEN (e->>'applied')::boolean END,
      'document_id', CASE WHEN public.p6_ref_ok(_owner, 'document', public.p6_uuid(e->'docId')) THEN public.p6_uuid(e->'docId') END,
      'legacy_value', public.p6_num(e->'value'), 'legacy_id', el.legacy_id, 'legacy_element', e,
      'source', jsonb_build_object('from', 'finance_preferences', 'path', el.path, 'legacy_id', el.legacy_id, 'element_sha256', el.element_sha256)));
  END LOOP;

  -- Depreciation journals (one per asset, month and kind)
  FOR el IN SELECT * FROM public.p6_list(_data, ARRAY['books', 'journals']) ORDER BY ord LOOP
    e := el.element;
    IF jsonb_typeof(e) = 'object' AND el.status <> 'duplicate_same' THEN
      bm := public.p6_map_add(bm, 'journals|' || coalesce(keys->>(e->>'assetId'), '(no asset)') || '|INR', jsonb_build_object('amount', public.p6_num(e->'amount')));
    END IF;
    st := el.status;
    IF st <> 'ok' THEN ex := ex || public.p6_status_exception(st, el.path, el.legacy_id); CONTINUE; END IF;
    aid := (ids->>(e->>'assetId'))::uuid;
    IF aid IS NULL THEN ex := ex || public.legacy_exception('journal_for_unknown_asset', 'error', el.path, el.legacy_id, jsonb_build_object('assetId', e->'assetId')); CONTINUE; END IF;
    per := e->>'period';
    IF per IS NULL OR per !~ '^\d{4}-\d{2}$' OR coalesce(e->>'status', '') NOT IN ('prepared', 'posted') OR coalesce(e->>'kind', 'book') <> 'book' THEN
      ex := ex || public.legacy_exception('invalid_journal', 'error', el.path, el.legacy_id, jsonb_build_object('period', e->'period', 'status', e->'status', 'kind', e->'kind')); CONTINUE;
    END IF;
    IF (aid::text || per) = ANY (seen_jp) OR EXISTS (SELECT 1 FROM public.depreciation_journals x WHERE x.asset_id = aid AND x.period = per AND x.owner_id = _owner AND x.legacy_id <> el.legacy_id) THEN
      ex := ex || public.legacy_exception('duplicate_journal_period', 'error', el.path, el.legacy_id, jsonb_build_object('assetId', e->'assetId', 'period', per,
        'note', 'a second depreciation journal for the same asset and month is never imported')); CONTINUE;
    END IF;
    seen_jp := seen_jp || (aid::text || per);
    IF EXISTS (SELECT 1 FROM public.depreciation_journals x WHERE x.owner_id = _owner AND x.legacy_id = el.legacy_id) THEN
      rws := rws || jsonb_build_object('t', 'depreciation_journals', 'a', 'exists', 'path', el.path, 'legacy_id', el.legacy_id, 'row', '{}'::jsonb); CONTINUE;
    END IF;
    IF e->'transactionId' IS NOT NULL AND e->'transactionId' <> 'null'::jsonb AND NOT public.p6_ref_ok(_owner, 'expense', public.p6_uuid(e->'transactionId')) THEN
      ex := ex || public.legacy_exception('missing_expense', 'warning', el.path, el.legacy_id, jsonb_build_object('field', 'transactionId', 'value', e->'transactionId'));
    END IF;
    IF e->>'status' = 'posted' AND NOT public.p6_ref_ok(_owner, 'expense', public.p6_uuid(e->'transactionId')) THEN
      ex := ex || public.legacy_exception('posted_journal_without_entry', 'warning', el.path, el.legacy_id, '{}'::jsonb);
    END IF;
    rws := rws || jsonb_build_object('t', 'depreciation_journals', 'a', 'create', 'path', el.path, 'legacy_id', el.legacy_id, 'row', jsonb_build_object(
      'owner_id', _owner, 'asset_id', aid, 'period', per, 'journal_kind', 'book', 'status', e->>'status', 'posted_on', public.p6_date(e->'postedOn'),
      'entry_id', CASE WHEN public.p6_ref_ok(_owner, 'expense', public.p6_uuid(e->'transactionId')) THEN public.p6_uuid(e->'transactionId') END,
      'legacy_amount', public.p6_num(e->'amount'), 'legacy_id', el.legacy_id, 'legacy_element', e,
      'source', jsonb_build_object('from', 'finance_preferences', 'path', el.path, 'legacy_id', el.legacy_id, 'element_sha256', el.element_sha256)));
  END LOOP;
  RETURN jsonb_build_object('rows', to_jsonb(rws), 'exceptions', to_jsonb(ex), 'before', bm,
    'source', jsonb_build_object('assets', coalesce(_data->'assets', 'null'::jsonb), 'assetEvents', coalesce(_data->'books'->'assetEvents', 'null'::jsonb),
                                 'journals', coalesce(_data->'books'->'journals', 'null'::jsonb)),
    'source_path', 'finance_preferences.data{assets,books.assetEvents,books.journals}');
END $$;

-- 7.2 Properties (+ units, containment from Property.assetId, valuation, co-owner attach) and leases
CREATE FUNCTION public.p6_plan_properties(_owner uuid, _data jsonb, _opts jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  rws jsonb[] := '{}'; ex jsonb[] := '{}'; bm jsonb := '{}'; el record; e jsonb; st text; scope uuid; rid uuid; rec public.register_records; v uuid;
  ids jsonb := '{}'; scopes jsonb := '{}'; keys jsonb := '{}'; units jsonb := '{}'; arr uuid[]; d jsonb; b record; f record; u record; bid uuid; fid uuid; uid2 uuid;
  attach uuid; aid uuid; pid uuid; used_assets uuid[] := '{}'; val numeric; k text; unit uuid; attached text[] := '{}';
BEGIN
  FOR el IN SELECT * FROM public.p6_list(_data, ARRAY['books', 'properties']) x WHERE x.status <> 'duplicate_same' ORDER BY x.ord LOOP
    e := el.element;
    keys := keys || CASE WHEN el.legacy_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(el.legacy_id, coalesce(nullif(e->>'ownerEntityId', ''), 'personal')) END;
    bm := public.p6_map_add(bm, 'properties|' || CASE WHEN el.status IN ('invalid', 'too_long') THEN '(invalid)' ELSE coalesce(nullif(e->>'ownerEntityId', ''), 'personal') END || '|' || coalesce(e->'valuation'->>'currency', 'INR'),
      jsonb_build_object('valuation', public.p6_num(e->'valuation'->'value')));
  END LOOP;
  FOR el IN SELECT * FROM public.p6_list(_data, ARRAY['books', 'properties']) ORDER BY ord LOOP
    st := el.status;
    IF st <> 'ok' THEN ex := ex || public.p6_status_exception(st, el.path, el.legacy_id); CONTINUE; END IF;
    e := el.element;
    -- Co-owner attach (owner-chosen option {attach: {legacy id: shared record id}}): the JSON copy joins
    -- the one shared record; no second record, number or property row is created.
    attach := coalesce(public.p6_uuid(_opts->'attach'->el.legacy_id),
      (SELECT c.record_id FROM public.register_legacy_copies c WHERE c.owner_id = _owner AND c.record_kind = 'property' AND c.legacy_id = el.legacy_id));
    IF coalesce(_opts->'attach' ? el.legacy_id, false) OR attach IS NOT NULL THEN
      IF attach IS NULL OR NOT EXISTS (SELECT 1 FROM public.register_records r WHERE r.id = attach AND r.record_kind = 'property' AND r.owner_id <> _owner AND r.archived_at IS NULL)
         OR NOT EXISTS (SELECT 1 FROM public.record_ownerships x WHERE x.record_id = attach AND x.owner_id = _owner AND x.status = 'confirmed') THEN
        ex := ex || public.legacy_exception('attach_refused', 'error', el.path, el.legacy_id, jsonb_build_object('record', _opts->'attach'->el.legacy_id,
          'note', 'attach only to another account''s active shared property in which you hold a confirmed share'));
        CONTINUE;
      END IF;
      attached := attached || el.legacy_id;
      rws := rws || jsonb_build_object('t', 'register_legacy_copies',
        'a', CASE WHEN EXISTS (SELECT 1 FROM public.register_legacy_copies c WHERE c.owner_id = _owner AND c.record_kind = 'property' AND c.legacy_id = el.legacy_id) THEN 'exists' ELSE 'create' END,
        'path', el.path, 'legacy_id', el.legacy_id, 'row', jsonb_build_object('owner_id', _owner, 'record_id', attach, 'record_kind', 'property', 'legacy_id', el.legacy_id,
          'legacy_element', e, 'source', jsonb_build_object('from', 'finance_preferences', 'path', el.path, 'legacy_id', el.legacy_id, 'element_sha256', el.element_sha256)));
      CONTINUE;
    END IF;
    scope := public.p6_scope(_owner, e->>'ownerEntityId');
    SELECT * INTO rec FROM public.register_records r WHERE r.owner_id = _owner AND r.record_kind = 'property' AND r.legacy_id = el.legacy_id;
    IF scope IS NULL AND rec.id IS NULL THEN
      ex := ex || public.legacy_exception('orphan_owner_entity', 'error', el.path, el.legacy_id, jsonb_build_object('ownerEntityId', e->'ownerEntityId')); CONTINUE;
    END IF;
    rid := coalesce(rec.id, gen_random_uuid());
    scope := coalesce(rec.legal_entity_id, scope);
    ids := ids || jsonb_build_object(el.legacy_id, rid); scopes := scopes || jsonb_build_object(el.legacy_id, scope);
    IF rec.id IS NULL THEN
      rws := rws || jsonb_build_object('t', 'register_records', 'a', 'create', 'path', el.path, 'legacy_id', el.legacy_id, 'row', jsonb_build_object(
        'id', rid, 'owner_id', _owner, 'record_kind', 'property', 'legal_entity_id', scope, 'label', left(coalesce(e->>'name', ''), 300), 'legacy_id', el.legacy_id,
        'source', jsonb_build_object('from', 'p6_backfill', 'register', 'properties', 'path', el.path, 'legacy_id', el.legacy_id, 'element_sha256', el.element_sha256)));
    END IF;
    SELECT p.id INTO v FROM public.properties p WHERE p.owner_id = _owner AND p.legacy_id = el.legacy_id;
    IF v IS NULL THEN
      arr := '{}';
      FOR d IN SELECT x FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e->'docIds') = 'array' THEN e->'docIds' ELSE '[]'::jsonb END) x LOOP
        IF public.p6_ref_ok(_owner, 'document', public.p6_uuid(d)) THEN IF NOT public.p6_uuid(d) = ANY (arr) THEN arr := arr || public.p6_uuid(d); END IF;
        ELSE ex := ex || public.legacy_exception('missing_document', 'warning', el.path, el.legacy_id, jsonb_build_object('document', d)); END IF;
      END LOOP;
      FOR k IN SELECT unnest(ARRAY['loanId', 'depositAccountId']) LOOP
        IF e->'links' ? k AND e->'links'->k <> 'null'::jsonb AND NOT public.p6_ref_ok(_owner, CASE k WHEN 'loanId' THEN 'loan' ELSE 'account' END, public.p6_uuid(e->'links'->k)) THEN
          ex := ex || public.legacy_exception(CASE k WHEN 'loanId' THEN 'missing_loan' ELSE 'missing_account' END, 'warning', el.path, el.legacy_id, jsonb_build_object('field', 'links.' || k, 'value', e->'links'->k));
        END IF;
      END LOOP;
      rws := rws || jsonb_build_object('t', 'properties', 'a', 'create', 'path', el.path, 'legacy_id', el.legacy_id, 'row', jsonb_build_object(
        'id', rid, 'owner_id', _owner, 'name', left(coalesce(e->>'name', ''), 300), 'address', public.p6_text(e->'address', 1000), 'notes', public.p6_text(e->'notes', 2000),
        'gstin', public.p6_text(e->'links'->'gstin', 20),
        'loan_id', CASE WHEN public.p6_ref_ok(_owner, 'loan', public.p6_uuid(e->'links'->'loanId')) THEN public.p6_uuid(e->'links'->'loanId') END,
        'deposit_account_id', CASE WHEN public.p6_ref_ok(_owner, 'account', public.p6_uuid(e->'links'->'depositAccountId')) THEN public.p6_uuid(e->'links'->'depositAccountId') END,
        'document_ids', to_jsonb(arr),
        'insurance_document_ids', (SELECT coalesce(jsonb_agg(DISTINCT public.p6_uuid(x)), '[]'::jsonb) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e->'links'->'insuranceDocIds') = 'array' THEN e->'links'->'insuranceDocIds' ELSE '[]'::jsonb END) x WHERE public.p6_ref_ok(_owner, 'document', public.p6_uuid(x))),
        'tax_document_ids', (SELECT coalesce(jsonb_agg(DISTINCT public.p6_uuid(x)), '[]'::jsonb) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e->'links'->'taxDocIds') = 'array' THEN e->'links'->'taxDocIds' ELSE '[]'::jsonb END) x WHERE public.p6_ref_ok(_owner, 'document', public.p6_uuid(x))),
        'legacy_valuation', e->'valuation', 'legacy_id', el.legacy_id, 'legacy_element', e,
        'source', jsonb_build_object('from', 'finance_preferences', 'path', el.path, 'legacy_id', el.legacy_id, 'element_sha256', el.element_sha256)));
    ELSE
      rws := rws || jsonb_build_object('t', 'properties', 'a', 'exists', 'path', el.path, 'legacy_id', el.legacy_id, 'row', jsonb_build_object('id', v));
    END IF;
    -- Building -> floor -> unit tree, keyed by path inside the property
    FOR b IN SELECT x.value bv, x.i - 1 bi FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e->'buildings') = 'array' THEN e->'buildings' ELSE '[]'::jsonb END) WITH ORDINALITY x(value, i) LOOP
      SELECT pu.id INTO bid FROM public.property_units pu WHERE pu.property_id = rid AND pu.legacy_path = format('buildings[%s]', b.bi);
      IF bid IS NULL THEN
        bid := gen_random_uuid();
        rws := rws || jsonb_build_object('t', 'property_units', 'a', 'create', 'path', el.path || format('.buildings[%s]', b.bi), 'legacy_id', b.bv->>'id', 'row', jsonb_build_object(
          'id', bid, 'owner_id', _owner, 'property_id', rid, 'level', 'building', 'name', left(coalesce(b.bv->>'name', ''), 300), 'ord', b.bi,
          'legacy_id', public.p6_text(b.bv->'id', 200), 'legacy_path', format('buildings[%s]', b.bi), 'source', jsonb_build_object('from', 'finance_preferences', 'path', el.path || format('.buildings[%s]', b.bi))));
      END IF;
      FOR f IN SELECT x.value fv, x.i - 1 fi FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b.bv->'floors') = 'array' THEN b.bv->'floors' ELSE '[]'::jsonb END) WITH ORDINALITY x(value, i) LOOP
        SELECT pu.id INTO fid FROM public.property_units pu WHERE pu.property_id = rid AND pu.legacy_path = format('buildings[%s].floors[%s]', b.bi, f.fi);
        IF fid IS NULL THEN
          fid := gen_random_uuid();
          rws := rws || jsonb_build_object('t', 'property_units', 'a', 'create', 'path', el.path || format('.buildings[%s].floors[%s]', b.bi, f.fi), 'legacy_id', f.fv->>'id', 'row', jsonb_build_object(
            'id', fid, 'owner_id', _owner, 'property_id', rid, 'parent_id', bid, 'level', 'floor', 'name', left(coalesce(f.fv->>'name', ''), 300), 'ord', f.fi,
            'legacy_id', public.p6_text(f.fv->'id', 200), 'legacy_path', format('buildings[%s].floors[%s]', b.bi, f.fi), 'source', jsonb_build_object('from', 'finance_preferences', 'path', el.path || format('.buildings[%s].floors[%s]', b.bi, f.fi))));
        END IF;
        FOR u IN SELECT x.value uv, x.i - 1 ui FROM jsonb_array_elements(CASE WHEN jsonb_typeof(f.fv->'units') = 'array' THEN f.fv->'units' ELSE '[]'::jsonb END) WITH ORDINALITY x(value, i) LOOP
          SELECT pu.id INTO uid2 FROM public.property_units pu WHERE pu.property_id = rid AND pu.legacy_path = format('buildings[%s].floors[%s].units[%s]', b.bi, f.fi, u.ui);
          IF uid2 IS NULL THEN
            uid2 := gen_random_uuid();
            rws := rws || jsonb_build_object('t', 'property_units', 'a', 'create', 'path', el.path || format('.buildings[%s].floors[%s].units[%s]', b.bi, f.fi, u.ui), 'legacy_id', u.uv->>'id', 'row', jsonb_build_object(
              'id', uid2, 'owner_id', _owner, 'property_id', rid, 'parent_id', fid, 'level', 'unit', 'name', left(coalesce(u.uv->>'name', ''), 300), 'ord', u.ui,
              'area_sqft', public.p6_num(u.uv->'areaSqft'), 'legacy_id', public.p6_text(u.uv->'id', 200), 'legacy_path', format('buildings[%s].floors[%s].units[%s]', b.bi, f.fi, u.ui),
              'source', jsonb_build_object('from', 'finance_preferences', 'path', el.path || format('.buildings[%s].floors[%s].units[%s]', b.bi, f.fi, u.ui))));
          END IF;
          IF jsonb_typeof(u.uv->'id') = 'string' THEN
            IF units ? (el.legacy_id || '/' || (u.uv->>'id')) THEN
              ex := ex || public.legacy_exception('duplicate_unit_id', 'warning', el.path, u.uv->>'id', '{}'::jsonb);
              units := units || jsonb_build_object(el.legacy_id || '/' || (u.uv->>'id'), 'ambiguous');
            ELSE units := units || jsonb_build_object(el.legacy_id || '/' || (u.uv->>'id'), uid2); END IF;
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;
    -- Valuation: one dated observation (never income, never a ledger amount)
    val := public.p6_num(e->'valuation'->'value');
    IF val IS NOT NULL THEN
      IF val < 0 OR public.p6_date(e->'valuation'->'date') IS NULL THEN
        ex := ex || public.legacy_exception('invalid_valuation', 'warning', el.path, el.legacy_id, jsonb_build_object('valuation', e->'valuation'));
      ELSIF NOT EXISTS (SELECT 1 FROM public.register_valuations x WHERE x.owner_id = _owner AND x.legacy_id = el.legacy_id || '#valuation') THEN
        rws := rws || jsonb_build_object('t', 'register_valuations', 'a', 'create', 'path', el.path || '.valuation', 'legacy_id', el.legacy_id, 'row', jsonb_build_object(
          'owner_id', _owner, 'record_id', rid, 'as_of', public.p6_date(e->'valuation'->'date'), 'value', val,
          'currency', coalesce(e->'valuation'->>'currency', 'INR'), 'basis', 'market', 'source_label', public.p6_text(e->'valuation'->'source', 300),
          'legacy_id', el.legacy_id || '#valuation', 'source', jsonb_build_object('from', 'finance_preferences', 'path', el.path || '.valuation', 'legacy_id', el.legacy_id)));
      END IF;
    END IF;
    -- Property.assetId: the asset register row carrying this property's cost (FND-03 containment)
    IF nullif(e->>'assetId', '') IS NOT NULL THEN
      SELECT a.id INTO aid FROM public.assets a WHERE a.owner_id = _owner AND a.legacy_id = e->>'assetId';
      IF aid IS NULL THEN
        ex := ex || public.legacy_exception('contained_asset_not_registered', 'warning', el.path, el.legacy_id, jsonb_build_object('assetId', e->'assetId',
          'note', 'commit the assets register first; the containment is created on the next commit'));
      ELSIF aid = ANY (used_assets) OR EXISTS (SELECT 1 FROM public.property_assets x WHERE x.asset_id = aid AND x.property_id <> rid AND x.valid_to IS NULL) THEN
        ex := ex || public.legacy_exception('asset_in_two_properties', 'error', el.path, el.legacy_id, jsonb_build_object('assetId', e->'assetId'));
      ELSE
        used_assets := used_assets || aid;
        IF NOT EXISTS (SELECT 1 FROM public.property_assets x WHERE x.property_id = rid AND x.asset_id = aid) THEN
          rws := rws || jsonb_build_object('t', 'property_assets', 'a', 'create', 'path', el.path || '.assetId', 'legacy_id', el.legacy_id, 'row', jsonb_build_object(
            'owner_id', _owner, 'property_id', rid, 'asset_id', aid, 'role', 'carrying_asset', 'included_in_property_value', true, 'valid_from', '-infinity',
            'reason', 'Legacy Property.assetId (asset row that carries the property cost)', 'source', jsonb_build_object('from', 'finance_preferences', 'path', el.path || '.assetId')));
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- Leases (scope and number in the leased property's scope)
  FOR el IN SELECT * FROM public.p6_list(_data, ARRAY['books', 'leases']) ORDER BY ord LOOP
    e := el.element;
    IF jsonb_typeof(e) = 'object' AND el.status <> 'duplicate_same' THEN
      bm := public.p6_map_add(bm, 'leases|' || coalesce(keys->>(e->>'propertyId'), '(no property)') || '|' || coalesce(e->>'currency', 'INR'),
        jsonb_build_object('rent', public.p6_num(e->'rent'), 'deposit', public.p6_num(e->'deposit')));
    END IF;
    st := el.status;
    IF st <> 'ok' THEN ex := ex || public.p6_status_exception(st, el.path, el.legacy_id); CONTINUE; END IF;
    pid := (ids->>(e->>'propertyId'))::uuid;
    IF pid IS NULL THEN
      ex := ex || public.legacy_exception(CASE WHEN (e->>'propertyId') = ANY (attached) THEN 'lease_on_attached_property' ELSE 'lease_for_unknown_property' END, 'error', el.path, el.legacy_id,
        jsonb_build_object('propertyId', e->'propertyId')); CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.leases x WHERE x.owner_id = _owner AND x.legacy_id = el.legacy_id) THEN
      rws := rws || jsonb_build_object('t', 'leases', 'a', 'exists', 'path', el.path, 'legacy_id', el.legacy_id, 'row', '{}'::jsonb); CONTINUE;
    END IF;
    unit := NULL;
    IF nullif(e->>'unitId', '') IS NOT NULL THEN
      IF units->>((e->>'propertyId') || '/' || (e->>'unitId')) IS NULL OR units->>((e->>'propertyId') || '/' || (e->>'unitId')) = 'ambiguous' THEN
        ex := ex || public.legacy_exception('lease_unit_not_found', 'warning', el.path, el.legacy_id, jsonb_build_object('unitId', e->'unitId'));
      ELSE unit := (units->>((e->>'propertyId') || '/' || (e->>'unitId')))::uuid; END IF;
    END IF;
    rws := rws || jsonb_build_object('t', 'leases', 'a', 'create', 'path', el.path, 'legacy_id', el.legacy_id, 'row', jsonb_build_object(
      'owner_id', _owner, 'legal_entity_id', scopes->>(e->>'propertyId'), 'property_id', pid, 'unit_id', unit, 'tenant', left(coalesce(e->>'tenant', ''), 300),
      'start_date', public.p6_date(e->'start'), 'end_date', public.p6_date(e->'end'), 'due_day', CASE WHEN public.p6_num(e->'dueDay') BETWEEN 1 AND 31 THEN public.p6_num(e->'dueDay')::int END,
      'escalation_pct', public.p6_num(e->'escalationPct'), 'escalation_every_months', CASE WHEN public.p6_num(e->'escalationEveryMonths') BETWEEN 0 AND 1200 THEN public.p6_num(e->'escalationEveryMonths')::int END,
      'notice_days', CASE WHEN public.p6_num(e->'noticeDays') BETWEEN 0 AND 3650 THEN public.p6_num(e->'noticeDays')::int END,
      'payment_terms', public.p6_text(e->'paymentTerms', 1000), 'gst', CASE WHEN jsonb_typeof(e->'gst') = 'boolean' THEN (e->>'gst')::boolean END,
      'currency', public.p6_text(e->'currency', 3),
      'document_id', CASE WHEN public.p6_ref_ok(_owner, 'document', public.p6_uuid(e->'docId')) THEN public.p6_uuid(e->'docId') END,
      'receipt_account_id', CASE WHEN public.p6_ref_ok(_owner, 'account', public.p6_uuid(e->'accountId')) THEN public.p6_uuid(e->'accountId') END,
      'legacy_rent', public.p6_num(e->'rent'), 'legacy_deposit', public.p6_num(e->'deposit'), 'legacy_id', el.legacy_id, 'legacy_element', e,
      'source', jsonb_build_object('from', 'finance_preferences', 'path', el.path, 'legacy_id', el.legacy_id, 'element_sha256', el.element_sha256)));
    IF e ? 'accountId' AND e->'accountId' <> 'null'::jsonb AND NOT public.p6_ref_ok(_owner, 'account', public.p6_uuid(e->'accountId')) THEN
      ex := ex || public.legacy_exception('missing_account', 'warning', el.path, el.legacy_id, jsonb_build_object('field', 'accountId', 'value', e->'accountId'));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('rows', to_jsonb(rws), 'exceptions', to_jsonb(ex), 'before', bm,
    'source', jsonb_build_object('properties', coalesce(_data->'books'->'properties', 'null'::jsonb), 'leases', coalesce(_data->'books'->'leases', 'null'::jsonb)),
    'source_path', 'finance_preferences.data{books.properties,books.leases}');
END $$;

-- 7.3 Trips, bookings, advances and entry links (by trip_id, by the exact 'Trip: <name>' tag, by booking expense ids)
CREATE FUNCTION public.p6_plan_trips(_owner uuid, _data jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  rws jsonb[] := '{}'; ex jsonb[] := '{}'; bm jsonb := '{}'; el record; e jsonb; st text; personal uuid := public.p5_personal_entity(_owner);
  tid uuid; v uuid; x record; bk record; tag text; dup_names text[]; legacy_uuid uuid; bid uuid; pay uuid; cur text;
BEGIN
  SELECT coalesce(array_agg(n), '{}') INTO dup_names FROM (
    SELECT tl.element->>'name' n FROM public.p6_list(_data, ARRAY['trips']) tl WHERE tl.status = 'ok'
    GROUP BY 1 HAVING count(*) > 1) z;
  FOR el IN SELECT * FROM public.p6_list(_data, ARRAY['trips']) ORDER BY ord LOOP
    e := el.element;
    st := el.status;
    IF jsonb_typeof(e) = 'object' AND st IN ('ok', 'invalid', 'too_long', 'conflict') THEN
      bm := public.p6_map_add(bm, 'trips|personal|-', '{}'::jsonb);
      FOR bk IN SELECT y.value bv FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e->'bookings') = 'array' THEN e->'bookings' ELSE '[]'::jsonb END) y(value) WHERE jsonb_typeof(y.value) = 'object' LOOP
        bm := public.p6_map_add(bm, 'trip_bookings|personal|INR', jsonb_build_object('amount', public.p6_num(bk.bv->'amount')));
      END LOOP;
      FOR bk IN SELECT y.value bv FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e->'advances') = 'array' THEN e->'advances' ELSE '[]'::jsonb END) y(value) WHERE jsonb_typeof(y.value) = 'object' LOOP
        bm := public.p6_map_add(bm, 'trip_advances|personal|INR', jsonb_build_object('amount', public.p6_num(bk.bv->'amount')));
      END LOOP;
    END IF;
    IF st <> 'ok' THEN ex := ex || public.p6_status_exception(st, el.path, el.legacy_id); CONTINUE; END IF;
    tag := 'Trip: ' || coalesce(e->>'name', '');
    IF nullif(e->>'organisation', '') IS NOT NULL OR e->>'primaryWorkspace' IN ('business', 'official') THEN
      ex := ex || public.legacy_exception('trip_label_not_an_entity', 'info', el.path, el.legacy_id, jsonb_build_object(
        'note', 'organisation / workspace labels are kept as labels; the trip stays in personal books until it is linked to a company explicitly'));
    END IF;
    SELECT t.id INTO v FROM public.trips t WHERE t.owner_id = _owner AND t.legacy_id = el.legacy_id;
    tid := coalesce(v, gen_random_uuid());
    IF v IS NOT NULL THEN
      rws := rws || jsonb_build_object('t', 'trips', 'a', 'exists', 'path', el.path, 'legacy_id', el.legacy_id, 'row', jsonb_build_object('id', v));
    ELSE
      rws := rws || jsonb_build_object('t', 'trips', 'a', 'create', 'path', el.path, 'legacy_id', el.legacy_id, 'row', jsonb_build_object(
        'id', tid, 'owner_id', _owner, 'legal_entity_id', personal, 'name', left(coalesce(e->>'name', ''), 300),
        'destination', public.p6_text(e->'destination', 300), 'purpose', public.p6_text(e->'purpose', 1000), 'trip_type', public.p6_text(e->'type', 40),
        'start_date', public.p6_date(e->'start'), 'end_date', public.p6_date(e->'end'),
        'travellers', to_jsonb(public.p6_texts(e->'travellers')), 'currencies', to_jsonb(public.p6_texts(e->'currencies')),
        'primary_workspace_label', public.p6_text(e->'primaryWorkspace', 40), 'organisation_label', public.p6_text(e->'organisation', 300),
        'plan', jsonb_strip_nulls(jsonb_build_object('budget', e->'budget', 'budgetLines', e->'budgetLines', 'contingency', e->'contingency',
           'workspaceBudgets', e->'workspaceBudgets', 'travellerBudgets', e->'travellerBudgets', 'currencyBudgets', e->'currencyBudgets',
           'organisationBudgets', e->'organisationBudgets', 'budgetNotes', e->'budgetNotes', 'budgetUpdatedAt', e->'budgetUpdatedAt',
           'completeBudgetDimensions', e->'completeBudgetDimensions')),
        'itinerary', CASE WHEN jsonb_typeof(e->'itinerary') = 'array' THEN e->'itinerary' ELSE '[]'::jsonb END,
        -- Itinerary and finance are independent (Flow 4): cancelledAt -> itinerary cancelled; closedAt -> finance complete.
        'itinerary_status', CASE WHEN public.p6_ts(e->'cancelledAt') IS NOT NULL THEN 'cancelled' ELSE 'planned' END,
        'itinerary_cancelled_at', public.p6_ts(e->'cancelledAt'), 'itinerary_restored_at', public.p6_ts(e->'restoredAt'),
        'finance_status', CASE WHEN public.p6_ts(e->'closedAt') IS NOT NULL THEN 'finance_complete' ELSE 'open' END,
        'finance_completed_at', public.p6_ts(e->'closedAt'),
        'legacy_tag', tag, 'legacy_id', el.legacy_id, 'legacy_element', e,
        'source', jsonb_build_object('from', 'finance_preferences', 'path', el.path, 'legacy_id', el.legacy_id, 'element_sha256', el.element_sha256)));
    END IF;
    -- Bookings
    FOR bk IN SELECT y.value bv, y.i - 1 bi FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e->'bookings') = 'array' THEN e->'bookings' ELSE '[]'::jsonb END) WITH ORDINALITY y(value, i) LOOP
      IF jsonb_typeof(bk.bv) <> 'object' OR jsonb_typeof(bk.bv->'id') <> 'string' OR (SELECT count(*) FROM jsonb_array_elements(e->'bookings') z WHERE z->>'id' = bk.bv->>'id') > 1 THEN
        ex := ex || public.legacy_exception('invalid_or_duplicate_booking', 'error', el.path || format('.bookings[%s]', bk.bi), bk.bv->>'id', '{}'::jsonb); CONTINUE;
      END IF;
      SELECT b.id INTO bid FROM public.trip_bookings b WHERE b.trip_id = tid AND b.legacy_id = bk.bv->>'id';
      IF bid IS NULL THEN
        bid := gen_random_uuid();
        rws := rws || jsonb_build_object('t', 'trip_bookings', 'a', 'create', 'path', el.path || format('.bookings[%s]', bk.bi), 'legacy_id', bk.bv->>'id', 'row', jsonb_build_object(
          'id', bid, 'owner_id', _owner, 'trip_id', tid, 'legal_entity_id', personal, 'booking_kind', public.p6_text(bk.bv->'kind', 40),
          'provider', public.p6_text(bk.bv->'provider', 300), 'booking_ref', public.p6_text(bk.bv->'ref', 300), 'booking_date', public.p6_date(bk.bv->'date'),
          'due_date', public.p6_date(bk.bv->'dueDate'), 'check_in_at', public.p6_ts(bk.bv->'checkInAt'),
          'payment_status', CASE WHEN bk.bv->>'status' IN ('unpaid', 'paid', 'cancelled') THEN bk.bv->>'status' END,
          'confirmation', CASE WHEN bk.bv->>'confirmation' IN ('pending', 'confirmed') THEN bk.bv->>'confirmation' END,
          'traveller', public.p6_text(bk.bv->'traveller', 200), 'location', public.p6_text(bk.bv->'location', 300), 'currency', public.p6_text(bk.bv->'currency', 3),
          'note', public.p6_text(bk.bv->'note', 1000), 'cancel_terms', public.p6_text(bk.bv->'cancelTerms', 1000),
          'document_ids', (SELECT coalesce(jsonb_agg(DISTINCT public.p6_uuid(z)), '[]'::jsonb) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(bk.bv->'documentIds') = 'array' THEN bk.bv->'documentIds' ELSE '[]'::jsonb END) z WHERE public.p6_ref_ok(_owner, 'document', public.p6_uuid(z))),
          'legacy_amount', public.p6_num(bk.bv->'amount'), 'legacy_original_amount', public.p6_num(bk.bv->'originalAmount'), 'legacy_planning_rate', public.p6_num(bk.bv->'planningRate'),
          'legacy_id', bk.bv->>'id', 'legacy_element', bk.bv,
          'source', jsonb_build_object('from', 'finance_preferences', 'path', el.path || format('.bookings[%s]', bk.bi), 'legacy_id', bk.bv->>'id', 'element_sha256', public.legacy_sha256(bk.bv))));
      END IF;
      -- Booking payments by entry id (bookingPaymentIds: expenseId + expenseIds)
      FOR pay IN SELECT DISTINCT p.u FROM (SELECT public.p6_uuid(bk.bv->'expenseId') u UNION ALL
                   SELECT public.p6_uuid(z) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(bk.bv->'expenseIds') = 'array' THEN bk.bv->'expenseIds' ELSE '[]'::jsonb END) z) p WHERE p.u IS NOT NULL LOOP
        IF NOT public.p6_ref_ok(_owner, 'expense', pay) THEN
          ex := ex || public.legacy_exception('booking_payment_entry_missing', 'warning', el.path || format('.bookings[%s]', bk.bi), bk.bv->>'id', jsonb_build_object('expense_id', pay));
        ELSIF NOT EXISTS (SELECT 1 FROM public.register_entry_links l WHERE l.register = 'trip_bookings' AND l.record_id = bid AND l.expense_id = pay AND l.role = 'booking_payment') THEN
          rws := rws || jsonb_build_object('t', 'register_entry_links', 'a', 'create', 'path', el.path || format('.bookings[%s]', bk.bi), 'legacy_id', bk.bv->>'id', 'row', jsonb_build_object(
            'owner_id', _owner, 'register', 'trip_bookings', 'record_id', bid, 'legal_entity_id', personal, 'expense_id', pay, 'role', 'booking_payment', 'basis', 'booking_expense_id',
            'source', jsonb_build_object('from', 'finance_preferences', 'path', el.path || format('.bookings[%s]', bk.bi))));
        END IF;
      END LOOP;
    END LOOP;
    -- Advances (the ledger entry is never guessed by amount; entry_id stays empty until linked explicitly)
    FOR bk IN SELECT y.value bv, y.i - 1 bi FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e->'advances') = 'array' THEN e->'advances' ELSE '[]'::jsonb END) WITH ORDINALITY y(value, i) LOOP
      IF jsonb_typeof(bk.bv) <> 'object' OR jsonb_typeof(bk.bv->'id') <> 'string' OR (SELECT count(*) FROM jsonb_array_elements(e->'advances') z WHERE z->>'id' = bk.bv->>'id') > 1 THEN
        ex := ex || public.legacy_exception('invalid_or_duplicate_advance', 'error', el.path || format('.advances[%s]', bk.bi), bk.bv->>'id', '{}'::jsonb); CONTINUE;
      END IF;
      IF EXISTS (SELECT 1 FROM public.trip_advances a WHERE a.trip_id = tid AND a.legacy_id = bk.bv->>'id') THEN CONTINUE; END IF;
      ex := ex || public.legacy_exception('advance_entry_not_linked', 'info', el.path || format('.advances[%s]', bk.bi), bk.bv->>'id',
        '{"note":"the advance ledger entry is linked explicitly later; never matched by amount"}');
      rws := rws || jsonb_build_object('t', 'trip_advances', 'a', 'create', 'path', el.path || format('.advances[%s]', bk.bi), 'legacy_id', bk.bv->>'id', 'row', jsonb_build_object(
        'owner_id', _owner, 'trip_id', tid, 'legal_entity_id', personal, 'advance_date', public.p6_date(bk.bv->'date'), 'source_label', public.p6_text(bk.bv->'source', 300),
        'settled_at', public.p6_ts(bk.bv->'settledAt'), 'settlement_note', public.p6_text(bk.bv->'settlementNote', 1000),
        'legacy_amount', public.p6_num(bk.bv->'amount'), 'legacy_id', bk.bv->>'id', 'legacy_element', bk.bv,
        'source', jsonb_build_object('from', 'finance_preferences', 'path', el.path || format('.advances[%s]', bk.bi), 'legacy_id', bk.bv->>'id', 'element_sha256', public.legacy_sha256(bk.bv))));
    END LOOP;
    -- Entry links: trip_id column (advances/settlements) and the exact tag (tripSummary rule). A name
    -- shared by two trips makes the tag ambiguous: no tag links for either (reported).
    legacy_uuid := public.p6_uuid(to_jsonb(el.legacy_id));
    IF (e->>'name') = ANY (dup_names) THEN
      ex := ex || public.legacy_exception('trip_name_ambiguous', 'error', el.path, el.legacy_id, jsonb_build_object('tag', tag, 'note', 'entries tagged with this name are not linked by tag'));
    END IF;
    FOR x IN SELECT xx.id, xx.basis FROM (
               SELECT ee.id, 'trip_id_column' basis FROM public.expenses ee WHERE ee.employee_id = _owner AND legacy_uuid IS NOT NULL AND ee.trip_id = legacy_uuid
               UNION ALL
               SELECT ee.id, 'trip_tag' FROM public.expenses ee WHERE ee.employee_id = _owner AND NOT ((e->>'name') = ANY (dup_names)) AND tag = ANY (ee.tags)) xx ORDER BY 1, 2 LOOP
      IF NOT EXISTS (SELECT 1 FROM public.register_entry_links l WHERE l.register = 'trips' AND l.record_id = tid AND l.expense_id = x.id AND l.role = 'trip_expense' AND l.basis = x.basis) THEN
        rws := rws || jsonb_build_object('t', 'register_entry_links', 'a', 'create', 'path', el.path, 'legacy_id', el.legacy_id, 'row', jsonb_build_object(
          'owner_id', _owner, 'register', 'trips', 'record_id', tid, 'legal_entity_id', personal, 'expense_id', x.id, 'role', 'trip_expense', 'basis', x.basis,
          'tag', CASE WHEN x.basis = 'trip_tag' THEN tag END, 'source', jsonb_build_object('from', 'expenses', 'rule', 'tripSummary: trip_id or exact tag')));
      END IF;
    END LOOP;
  END LOOP;
  -- An entry linked to two different trips (the app counts it in both): reported for review.
  FOR x IN SELECT r->'row'->>'expense_id' eid, count(DISTINCT r->'row'->>'record_id') n FROM unnest(rws) r
           WHERE r->>'t' = 'register_entry_links' AND r->'row'->>'register' = 'trips' GROUP BY 1 HAVING count(DISTINCT r->'row'->>'record_id') > 1 LOOP
    ex := ex || public.legacy_exception('entry_in_two_trips', 'warning', 'expenses', x.eid, jsonb_build_object('trips', x.n));
  END LOOP;
  RETURN jsonb_build_object('rows', to_jsonb(rws), 'exceptions', to_jsonb(ex), 'before', bm, 'source', jsonb_build_object('trips', coalesce(_data->'trips', 'null'::jsonb)),
    'source_path', 'finance_preferences.data{trips}');
END $$;

-- 7.4 Holdings (books.holdings) and receivables (data.receivables)
CREATE FUNCTION public.p6_plan_holdings(_owner uuid, _data jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE rws jsonb[] := '{}'; ex jsonb[] := '{}'; bm jsonb := '{}'; el record; e jsonb; st text; scope uuid; demat uuid; n int;
BEGIN
  FOR el IN SELECT * FROM public.p6_list(_data, ARRAY['books', 'holdings']) x WHERE x.status <> 'duplicate_same' ORDER BY x.ord LOOP
    e := el.element;
    bm := public.p6_map_add(bm, 'holdings|' || CASE WHEN el.status IN ('invalid', 'too_long') THEN '(invalid)' ELSE coalesce(nullif(e->>'ownerEntityId', ''), 'personal') END || '|' || coalesce(e->>'currency', 'INR'),
      jsonb_build_object('quantity', public.p6_num(e->'quantity'), 'cost_basis', public.p6_num(e->'costBasis')));
  END LOOP;
  FOR el IN SELECT * FROM public.p6_list(_data, ARRAY['books', 'holdings']) ORDER BY ord LOOP
    st := el.status;
    IF st <> 'ok' THEN ex := ex || public.p6_status_exception(st, el.path, el.legacy_id); CONTINUE; END IF;
    e := el.element;
    IF EXISTS (SELECT 1 FROM public.investment_holdings h WHERE h.owner_id = _owner AND h.legacy_id = el.legacy_id) THEN
      rws := rws || jsonb_build_object('t', 'investment_holdings', 'a', 'exists', 'path', el.path, 'legacy_id', el.legacy_id, 'row', '{}'::jsonb); CONTINUE;
    END IF;
    scope := public.p6_scope(_owner, e->>'ownerEntityId');
    IF scope IS NULL THEN ex := ex || public.legacy_exception('orphan_owner_entity', 'error', el.path, el.legacy_id, jsonb_build_object('ownerEntityId', e->'ownerEntityId')); CONTINUE; END IF;
    demat := NULL;
    IF nullif(e->>'isin', '') IS NOT NULL THEN
      SELECT count(*), min(s.id::text)::uuid INTO n, demat FROM public.security_holdings s WHERE s.owner_id = _owner AND upper(s.isin) = upper(e->>'isin');
      IF n = 1 THEN
        ex := ex || public.legacy_exception('demat_overlap', 'warning', el.path, el.legacy_id, jsonb_build_object('isin', e->'isin',
          'note', 'the same ISIN is held in a demat account; net worth must count one source, never both'));
      ELSE demat := NULL;
        IF n > 1 THEN ex := ex || public.legacy_exception('demat_isin_ambiguous', 'warning', el.path, el.legacy_id, jsonb_build_object('isin', e->'isin', 'matches', n)); END IF;
      END IF;
    END IF;
    IF e ? 'cashAccountId' AND e->'cashAccountId' <> 'null'::jsonb AND NOT public.p6_ref_ok(_owner, 'account', public.p6_uuid(e->'cashAccountId')) THEN
      ex := ex || public.legacy_exception('missing_account', 'warning', el.path, el.legacy_id, jsonb_build_object('field', 'cashAccountId', 'value', e->'cashAccountId'));
    END IF;
    rws := rws || jsonb_build_object('t', 'investment_holdings', 'a', 'create', 'path', el.path, 'legacy_id', el.legacy_id, 'row', jsonb_build_object(
      'owner_id', _owner, 'legal_entity_id', scope, 'holding_kind', public.p6_text(e->'kind', 40), 'name', left(coalesce(e->>'name', ''), 300),
      'isin', public.p6_text(e->'isin', 20), 'symbol', public.p6_text(e->'symbol', 40), 'exchange', public.p6_text(e->'exchange', 10), 'scheme_code', public.p6_text(e->'schemeCode', 40),
      'share_pct', public.p6_num(e->'sharePct'), 'grams', public.p6_num(e->'grams'), 'karat', public.p6_num(e->'karat'),
      'trading_status', public.p6_text(e->'tradingStatus', 20), 'currency', public.p6_text(e->'currency', 3), 'bond', e->'bond',
      'cash_account_id', CASE WHEN public.p6_ref_ok(_owner, 'account', public.p6_uuid(e->'cashAccountId')) THEN public.p6_uuid(e->'cashAccountId') END,
      'demat_holding_id', demat, 'legacy_quantity', public.p6_num(e->'quantity'), 'legacy_cost_basis', public.p6_num(e->'costBasis'),
      'legacy_id', el.legacy_id, 'legacy_element', e,
      'source', jsonb_build_object('from', 'finance_preferences', 'path', el.path, 'legacy_id', el.legacy_id, 'element_sha256', el.element_sha256)));
  END LOOP;
  RETURN jsonb_build_object('rows', to_jsonb(rws), 'exceptions', to_jsonb(ex), 'before', bm, 'source', jsonb_build_object('holdings', coalesce(_data->'books'->'holdings', 'null'::jsonb)),
    'source_path', 'finance_preferences.data{books.holdings}');
END $$;

CREATE FUNCTION public.p6_plan_receivables(_owner uuid, _data jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE rws jsonb[] := '{}'; ex jsonb[] := '{}'; bm jsonb := '{}'; el record; e jsonb; st text; personal uuid := public.p5_personal_entity(_owner);
BEGIN
  FOR el IN SELECT * FROM public.p6_list(_data, ARRAY['receivables']) x WHERE x.status <> 'duplicate_same' ORDER BY x.ord LOOP
    bm := public.p6_map_add(bm, 'receivables|' || CASE WHEN el.status IN ('invalid', 'too_long') THEN '(invalid)' ELSE 'personal' END || '|INR', jsonb_build_object('amount', public.p6_num(el.element->'amount'), 'gst', public.p6_num(el.element->'gst')));
  END LOOP;
  FOR el IN SELECT * FROM public.p6_list(_data, ARRAY['receivables']) ORDER BY ord LOOP
    st := el.status;
    IF st <> 'ok' THEN ex := ex || public.p6_status_exception(st, el.path, el.legacy_id); CONTINUE; END IF;
    e := el.element;
    IF EXISTS (SELECT 1 FROM public.receivables r WHERE r.owner_id = _owner AND r.legacy_id = el.legacy_id) THEN
      rws := rws || jsonb_build_object('t', 'receivables', 'a', 'exists', 'path', el.path, 'legacy_id', el.legacy_id, 'row', '{}'::jsonb); CONTINUE;
    END IF;
    ex := ex || public.legacy_exception('receivable_settlement_not_migrated', 'info', el.path, el.legacy_id, jsonb_build_object(
      'note', 'paid status is derived today by fuzzy name/amount matching; it is never stored as a link. The receivable stays in personal books until linked to a company.'));
    rws := rws || jsonb_build_object('t', 'receivables', 'a', 'create', 'path', el.path, 'legacy_id', el.legacy_id, 'row', jsonb_build_object(
      'owner_id', _owner, 'legal_entity_id', personal, 'customer', left(coalesce(e->>'customer', ''), 300), 'invoice_no', public.p6_text(e->'invoiceNo', 100),
      'invoice_date', public.p6_date(e->'date'), 'due_date', public.p6_date(e->'dueDate'),
      'legacy_amount', public.p6_num(e->'amount'), 'legacy_gst', public.p6_num(e->'gst'), 'legacy_id', el.legacy_id, 'legacy_element', e,
      'source', jsonb_build_object('from', 'finance_preferences', 'path', el.path, 'legacy_id', el.legacy_id, 'element_sha256', el.element_sha256)));
  END LOOP;
  RETURN jsonb_build_object('rows', to_jsonb(rws), 'exceptions', to_jsonb(ex), 'before', bm, 'source', jsonb_build_object('receivables', coalesce(_data->'receivables', 'null'::jsonb)),
    'source_path', 'finance_preferences.data{receivables}');
END $$;

-- 7.5 Projects (budgets[kind = 'project']; entries link by the exact tag the budget matches today)
CREATE FUNCTION public.p6_plan_projects(_owner uuid, _data jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE rws jsonb[] := '{}'; ex jsonb[] := '{}'; bm jsonb := '{}'; el record; e jsonb; st text; personal uuid := public.p5_personal_entity(_owner); pid uuid; x record; tags text[] := '{}';
BEGIN
  FOR el IN SELECT * FROM public.p6_list(_data, ARRAY['budgets']) ORDER BY ord LOOP
    e := el.element;
    CONTINUE WHEN jsonb_typeof(e) <> 'object' OR e->>'kind' IS DISTINCT FROM 'project';
    st := el.status;
    IF st IN ('ok', 'invalid', 'too_long', 'conflict') THEN bm := public.p6_map_add(bm, 'projects|personal|INR', jsonb_build_object('plan_amount', public.p6_num(e->'amount'))); END IF;
    IF st <> 'ok' THEN ex := ex || public.p6_status_exception(st, el.path, el.legacy_id); CONTINUE; END IF;
    IF nullif(btrim(coalesce(e->>'value', '')), '') IS NULL OR length(e->>'value') > 200 THEN
      ex := ex || public.legacy_exception('project_without_tag', 'error', el.path, el.legacy_id, jsonb_build_object('value', e->'value')); CONTINUE;
    END IF;
    IF (e->>'value') = ANY (tags) THEN
      ex := ex || public.legacy_exception('project_tag_used_twice', 'warning', el.path, el.legacy_id, jsonb_build_object('tag', e->'value'));
    END IF;
    tags := tags || (e->>'value');
    SELECT p.id INTO pid FROM public.projects p WHERE p.owner_id = _owner AND p.legacy_id = el.legacy_id;
    IF pid IS NOT NULL THEN
      rws := rws || jsonb_build_object('t', 'projects', 'a', 'exists', 'path', el.path, 'legacy_id', el.legacy_id, 'row', jsonb_build_object('id', pid));
    ELSE
      pid := gen_random_uuid();
      rws := rws || jsonb_build_object('t', 'projects', 'a', 'create', 'path', el.path, 'legacy_id', el.legacy_id, 'row', jsonb_build_object(
        'id', pid, 'owner_id', _owner, 'legal_entity_id', personal, 'name', left(coalesce(nullif(e->>'name', ''), e->>'value'), 300), 'tag', e->>'value',
        'plan', jsonb_strip_nulls(jsonb_build_object('amount', e->'amount', 'period', e->'period', 'start', e->'start', 'carry', e->'carry')),
        'legacy_id', el.legacy_id, 'legacy_element', e,
        'source', jsonb_build_object('from', 'finance_preferences', 'path', el.path, 'legacy_id', el.legacy_id, 'element_sha256', el.element_sha256)));
    END IF;
    FOR x IN SELECT ee.id FROM public.expenses ee WHERE ee.employee_id = _owner AND (e->>'value') = ANY (ee.tags) ORDER BY 1 LOOP
      IF NOT EXISTS (SELECT 1 FROM public.register_entry_links l WHERE l.register = 'projects' AND l.record_id = pid AND l.expense_id = x.id AND l.role = 'project_expense') THEN
        rws := rws || jsonb_build_object('t', 'register_entry_links', 'a', 'create', 'path', el.path, 'legacy_id', el.legacy_id, 'row', jsonb_build_object(
          'owner_id', _owner, 'register', 'projects', 'record_id', pid, 'legal_entity_id', personal, 'expense_id', x.id, 'role', 'project_expense', 'basis', 'project_tag',
          'tag', e->>'value', 'source', jsonb_build_object('from', 'expenses', 'rule', 'budgetSpend: exact project tag')));
      END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('rows', to_jsonb(rws), 'exceptions', to_jsonb(ex), 'before', bm, 'source', jsonb_build_object('budgets', coalesce(_data->'budgets', 'null'::jsonb)),
    'source_path', 'finance_preferences.data{budgets[kind=project]}');
END $$;

-- Dispatcher: plan + provenance + counts for one register.
CREATE FUNCTION public.p6_register_plan(_owner uuid, _register text, _opts jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pr record; data jsonb; p jsonb;
BEGIN
  IF _register IS NULL OR _register NOT IN ('assets', 'properties', 'trips', 'holdings', 'receivables', 'projects') THEN
    RAISE EXCEPTION 'Unknown register %', _register USING ERRCODE = '22023';
  END IF;
  SELECT f.data, f.revision INTO pr FROM public.finance_preferences f WHERE f.owner_id = _owner;
  data := coalesce(pr.data, '{}'::jsonb);
  IF public.p5_personal_entity(_owner) IS NULL THEN
    RETURN jsonb_build_object('register', _register, 'blocked', 'Run the reviewed company backfill (commit_entity_backfill) first', 'rows', '[]'::jsonb,
      'exceptions', jsonb_build_array(public.legacy_exception('entity_backfill_required', 'error', NULL, NULL, '{}')), 'before', '{}'::jsonb,
      'source_sha256', public.legacy_sha256(data), 'counts', '{}'::jsonb);
  END IF;
  p := CASE _register
    WHEN 'assets' THEN public.p6_plan_assets(_owner, data)
    WHEN 'properties' THEN public.p6_plan_properties(_owner, data, coalesce(_opts, '{}'::jsonb))
    WHEN 'trips' THEN public.p6_plan_trips(_owner, data)
    WHEN 'holdings' THEN public.p6_plan_holdings(_owner, data)
    WHEN 'receivables' THEN public.p6_plan_receivables(_owner, data)
    WHEN 'projects' THEN public.p6_plan_projects(_owner, data) END;
  RETURN (p - 'source') || jsonb_build_object('register', _register, 'owner_id', _owner,
    'source_sha256', public.legacy_sha256(p->'source'), 'data_sha256', public.legacy_sha256(data), 'source_revision', pr.revision,
    'options', coalesce(_opts, '{}'::jsonb),
    'counts', jsonb_build_object(
      'to_create', (SELECT coalesce(jsonb_object_agg(z.t, z.n), '{}'::jsonb) FROM (SELECT r->>'t' t, count(*) n FROM jsonb_array_elements(p->'rows') r WHERE r->>'a' = 'create' GROUP BY 1) z),
      'existing', (SELECT coalesce(jsonb_object_agg(z.t, z.n), '{}'::jsonb) FROM (SELECT r->>'t' t, count(*) n FROM jsonb_array_elements(p->'rows') r WHERE r->>'a' = 'exists' GROUP BY 1) z),
      'errors', (SELECT count(*) FROM jsonb_array_elements(p->'exceptions') x WHERE x->>'severity' = 'error'),
      'warnings', (SELECT count(*) FROM jsonb_array_elements(p->'exceptions') x WHERE x->>'severity' = 'warning')));
END $$;

-- "After" compare map from the tables (legacy_* read-only copies, keyed like the plan's "before").
CREATE FUNCTION public.p6_after_map(_owner uuid, _register text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m jsonb := '{}'; r record;
BEGIN
  IF _register = 'assets' THEN
    FOR r IN SELECT 'assets|' || public.p6_scope_label(rr.legal_entity_id) || '|INR' k, a.legacy_cost c, a.legacy_sale_value s
             FROM public.assets a JOIN public.register_records rr ON rr.id = a.id WHERE a.owner_id = _owner LOOP
      m := public.p6_map_add(m, r.k, jsonb_build_object('cost', r.c, 'sale_value', r.s));
    END LOOP;
    FOR r IN SELECT 'asset_events|' || public.p6_scope_label(rr.legal_entity_id) || '|INR' k, x.legacy_value v
             FROM public.asset_events x JOIN public.register_records rr ON rr.id = x.asset_id WHERE x.owner_id = _owner LOOP
      m := public.p6_map_add(m, r.k, jsonb_build_object('value', r.v));
    END LOOP;
    FOR r IN SELECT 'journals|' || public.p6_scope_label(rr.legal_entity_id) || '|INR' k, x.legacy_amount v
             FROM public.depreciation_journals x JOIN public.register_records rr ON rr.id = x.asset_id WHERE x.owner_id = _owner LOOP
      m := public.p6_map_add(m, r.k, jsonb_build_object('amount', r.v));
    END LOOP;
  ELSIF _register = 'properties' THEN
    FOR r IN SELECT 'properties|' || public.p6_scope_label(rr.legal_entity_id) || '|' || coalesce(p.legacy_valuation->>'currency', 'INR') k, public.p6_num(p.legacy_valuation->'value') v
             FROM public.properties p JOIN public.register_records rr ON rr.id = p.id WHERE p.owner_id = _owner
             UNION ALL
             SELECT 'properties|' || coalesce(nullif(c.legacy_element->>'ownerEntityId', ''), 'personal') || '|' || coalesce(c.legacy_element->'valuation'->>'currency', 'INR'),
                    public.p6_num(c.legacy_element->'valuation'->'value')
             FROM public.register_legacy_copies c WHERE c.owner_id = _owner AND c.record_kind = 'property' LOOP
      m := public.p6_map_add(m, r.k, jsonb_build_object('valuation', r.v));
    END LOOP;
    FOR r IN SELECT 'leases|' || public.p6_scope_label(rr.legal_entity_id) || '|' || coalesce(l.currency, 'INR') k, l.legacy_rent rent, l.legacy_deposit dep
             FROM public.leases l JOIN public.register_records rr ON rr.id = l.property_id WHERE l.owner_id = _owner LOOP
      m := public.p6_map_add(m, r.k, jsonb_build_object('rent', r.rent, 'deposit', r.dep));
    END LOOP;
  ELSIF _register = 'trips' THEN
    FOR r IN SELECT 'trips|' || public.p6_scope_label(t.legal_entity_id) || '|-' k FROM public.trips t WHERE t.owner_id = _owner LOOP
      m := public.p6_map_add(m, r.k, '{}'::jsonb);
    END LOOP;
    FOR r IN SELECT 'trip_bookings|' || public.p6_scope_label(b.legal_entity_id) || '|INR' k, b.legacy_amount v FROM public.trip_bookings b WHERE b.owner_id = _owner LOOP
      m := public.p6_map_add(m, r.k, jsonb_build_object('amount', r.v));
    END LOOP;
    FOR r IN SELECT 'trip_advances|' || public.p6_scope_label(a.legal_entity_id) || '|INR' k, a.legacy_amount v FROM public.trip_advances a WHERE a.owner_id = _owner LOOP
      m := public.p6_map_add(m, r.k, jsonb_build_object('amount', r.v));
    END LOOP;
  ELSIF _register = 'holdings' THEN
    FOR r IN SELECT 'holdings|' || public.p6_scope_label(h.legal_entity_id) || '|' || coalesce(h.currency, 'INR') k, h.legacy_quantity q, h.legacy_cost_basis c
             FROM public.investment_holdings h WHERE h.owner_id = _owner LOOP
      m := public.p6_map_add(m, r.k, jsonb_build_object('quantity', r.q, 'cost_basis', r.c));
    END LOOP;
  ELSIF _register = 'receivables' THEN
    FOR r IN SELECT 'receivables|' || public.p6_scope_label(x.legal_entity_id) || '|INR' k, x.legacy_amount a, x.legacy_gst g FROM public.receivables x WHERE x.owner_id = _owner LOOP
      m := public.p6_map_add(m, r.k, jsonb_build_object('amount', r.a, 'gst', r.g));
    END LOOP;
  ELSIF _register = 'projects' THEN
    FOR r IN SELECT 'projects|' || public.p6_scope_label(x.legal_entity_id) || '|INR' k, public.p6_num(x.plan->'amount') a FROM public.projects x WHERE x.owner_id = _owner LOOP
      m := public.p6_map_add(m, r.k, jsonb_build_object('plan_amount', r.a));
    END LOOP;
  END IF;
  RETURN m;
END $$;

-- References whose target no longer exists (entries/accounts/documents deleted after the backfill).
CREATE FUNCTION public.p6_orphans(_owner uuid, _register text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE out jsonb := '[]'; s record; r record;
BEGIN
  FOR s IN SELECT * FROM (VALUES
      ('assets', 'assets', 'purchase_entry_id', 'expense'), ('assets', 'assets', 'payment_entry_id', 'expense'), ('assets', 'assets', 'ledger_account_id', 'account'),
      ('assets', 'assets', 'document_ids', 'document'), ('assets', 'asset_events', 'document_id', 'document'), ('assets', 'depreciation_journals', 'entry_id', 'expense'),
      ('properties', 'properties', 'loan_id', 'loan'), ('properties', 'properties', 'deposit_account_id', 'account'), ('properties', 'properties', 'document_ids', 'document'),
      ('properties', 'leases', 'receipt_account_id', 'account'), ('properties', 'leases', 'document_id', 'document'), ('properties', 'register_valuations', 'document_id', 'document'),
      ('trips', 'trip_advances', 'entry_id', 'expense'), ('trips', 'trip_bookings', 'document_ids', 'document'), ('trips', 'register_entry_links', 'expense_id', 'expense'),
      ('holdings', 'investment_holdings', 'cash_account_id', 'account'), ('holdings', 'investment_holdings', 'demat_holding_id', 'security_holding'),
      ('receivables', 'receivables', 'settled_by_entry_id', 'expense'), ('projects', 'register_entry_links', 'expense_id', 'expense')) v(reg, tbl, col, kind)
    WHERE v.reg = _register LOOP
    FOR r IN EXECUTE format('SELECT x.id, ref FROM public.%I x, LATERAL unnest(%s) ref WHERE x.owner_id = $1 AND ref IS NOT NULL %s AND NOT public.p6_ref_ok($1, $2, ref)',
                            s.tbl, CASE WHEN s.col LIKE '%\_ids' THEN format('x.%I', s.col) ELSE format('ARRAY[x.%I]', s.col) END,
                            CASE WHEN s.tbl = 'register_entry_links' THEN CASE _register WHEN 'trips' THEN 'AND x.register IN (''trips'', ''trip_bookings'')' ELSE 'AND x.register = ''projects''' END ELSE '' END)
             USING _owner, s.kind LOOP
      out := out || jsonb_build_object('table', s.tbl, 'row', r.id, 'column', s.col, 'missing', s.kind, 'id', r.ref);
    END LOOP;
  END LOOP;
  RETURN out;
END $$;

-- --------------------------------------------------------------------------------------------
-- 8. Client entry points
-- --------------------------------------------------------------------------------------------
-- Read-only preview for the signed-in owner (assistant sessions refused by the P4 wrapper). The
-- options of the properties register take {"attach": {"<legacy property id>": "<shared record uuid>"}}.
CREATE FUNCTION public.preview_register_backfill(_register text, _options jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.finance_preferences p WHERE p.owner_id = uid) THEN RAISE EXCEPTION 'Owner preferences not found'; END IF;
  RETURN public.p6_register_plan(uid, _register, coalesce(_options, '{}'::jsonb));
END $$;

-- Commits a preview. Refuses when the register's JSON changed since the preview (BACKFILL_SOURCE_CHANGED).
-- Inserts only plan rows with action 'create' (computed under the owner lock), so a re-commit creates
-- nothing and spends no number. Fills only new tables (and P5 register_records/record_ownerships for
-- the anchors). Step-up guarded (P4 wrapper); anonymous guests refused.
CREATE FUNCTION public.commit_register_backfill(_register text, _source_sha256 text, _options jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); plan jsonb; x jsonb; rw jsonb; cols text; run uuid := gen_random_uuid(); created jsonb := '{}'; summary jsonb;
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Sign in with your account to import registers'; END IF;
  IF _source_sha256 IS NULL OR _source_sha256 !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Preview the backfill first' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0)); -- same lock as save_reviewed_preferences / commit_entity_backfill
  PERFORM 1 FROM public.finance_preferences p WHERE p.owner_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Owner preferences not found'; END IF;
  plan := public.p6_register_plan(uid, _register, coalesce(_options, '{}'::jsonb));
  IF plan ? 'blocked' THEN RAISE EXCEPTION '%', plan->>'blocked' USING ERRCODE = 'P0001'; END IF;
  IF plan->>'source_sha256' IS DISTINCT FROM _source_sha256 THEN
    RAISE EXCEPTION 'BACKFILL_SOURCE_CHANGED: the % register changed since the preview; preview again', _register USING ERRCODE = '40001';
  END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(plan->'rows') WITH ORDINALITY v(value, i) ORDER BY i LOOP
    CONTINUE WHEN x->>'a' <> 'create';
    IF NOT (x->>'t' = ANY (ARRAY['register_records', 'record_ownerships', 'assets', 'asset_events', 'depreciation_journals', 'properties', 'property_units',
        'property_assets', 'register_valuations', 'leases', 'trips', 'trip_bookings', 'trip_advances', 'register_entry_links', 'investment_holdings',
        'receivables', 'projects', 'register_legacy_copies'])) THEN
      RAISE EXCEPTION 'P6: unexpected plan table %', x->>'t';
    END IF;
    rw := (x->'row') || jsonb_build_object('created_by', uid,
      'source', coalesce(x->'row'->'source', '{}'::jsonb) || jsonb_build_object('source_sha256', plan->>'source_sha256', 'source_revision', plan->'source_revision',
                                                                             'run_id', run, 'captured_at', clock_timestamp()));
    SELECT string_agg(quote_ident(k), ', ') INTO cols FROM jsonb_object_keys(rw) k;
    EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)', x->>'t', cols, cols, x->>'t') USING rw;
    created := created || jsonb_build_object(x->>'t', coalesce((created->>(x->>'t'))::int, 0) + 1);
  END LOOP;
  summary := jsonb_build_object('run_id', run, 'register', _register, 'source_sha256', plan->>'source_sha256', 'source_revision', plan->'source_revision',
    'created', created, 'exceptions', plan->'exceptions');
  INSERT INTO public.legacy_backfill_runs(id, owner_id, kind, source_path, source_sha256, data_sha256, source_revision, options, summary, exceptions, created_by)
  VALUES (run, uid, _register, plan->>'source_path', plan->>'source_sha256', plan->>'data_sha256', (plan->>'source_revision')::bigint,
          coalesce(_options, '{}'::jsonb), summary - 'exceptions', plan->'exceptions', uid);
  RETURN summary;
END $$;

-- Compare report (FND-03 "compare"): counts (source vs table), legacy money per section|entity|currency
-- before (raw JSON) and after (read-only legacy_* columns), orphans, links, pending creates, exceptions.
-- Status 'match' needs identical maps, zero orphans and nothing left to create.
CREATE FUNCTION public.register_backfill_report(_register text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); plan jsonb; after jsonb; cmp jsonb; orphans jsonb; last public.legacy_backfill_runs; links jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  plan := public.p6_register_plan(uid, _register, '{}'::jsonb);
  after := public.p6_after_map(uid, _register);
  cmp := public.legacy_compare_maps(plan->'before', after);
  orphans := public.p6_orphans(uid, _register);
  SELECT * INTO last FROM public.legacy_backfill_runs b WHERE b.owner_id = uid AND b.kind = _register ORDER BY b.created_at DESC, b.id DESC LIMIT 1;
  SELECT coalesce(jsonb_object_agg(z.role, z.n), '{}'::jsonb) INTO links FROM (
    SELECT l.role || ':' || l.basis role, count(*) n FROM public.register_entry_links l WHERE l.owner_id = uid
      AND l.register = ANY (CASE _register WHEN 'trips' THEN ARRAY['trips', 'trip_bookings'] WHEN 'projects' THEN ARRAY['projects'] ELSE '{}'::text[] END) GROUP BY 1) z;
  RETURN jsonb_build_object('register', _register, 'owner_id', uid, 'source_sha256', plan->>'source_sha256',
    'last_run', CASE WHEN last.id IS NULL THEN NULL ELSE jsonb_build_object('id', last.id, 'source_sha256', last.source_sha256, 'created_at', last.created_at) END,
    'source_changed_since_last_run', last.id IS NOT NULL AND last.source_sha256 IS DISTINCT FROM plan->>'source_sha256',
    'pending', plan->'counts'->'to_create', 'existing', plan->'counts'->'existing',
    'money', jsonb_build_object('basis', 'section|entity|currency: n and sums of legacy amounts (JSON before, read-only legacy_* columns after)') || cmp,
    'orphans', orphans, 'links', links, 'exceptions', plan->'exceptions',
    'status', CASE WHEN (cmp->>'identical')::boolean AND orphans = '[]'::jsonb AND plan->'counts'->'to_create' = '{}'::jsonb THEN 'match' ELSE 'differences' END);
END $$;

-- Valuation without double counting (Flow 5): each property counts its latest valuation once; an asset
-- inside a valued property with included_in_property_value is NOT counted again; every other asset
-- counts its latest valuation, else (compare only) its legacy cost. Per scope entity and currency.
CREATE FUNCTION public.register_valuation_report(_as_of date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); d date := coalesce(_as_of, (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date); items jsonb; totals jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  WITH latest AS (
    SELECT DISTINCT ON (v.record_id) v.record_id, v.value, v.currency, v.as_of FROM public.register_valuations v
    WHERE v.owner_id = uid AND v.as_of <= d ORDER BY v.record_id, v.as_of DESC, v.created_at DESC),
  props AS (
    SELECT p.id, rr.readable_id, public.p6_scope_label(rr.legal_entity_id) scope, l.value, l.currency
    FROM public.properties p JOIN public.register_records rr ON rr.id = p.id LEFT JOIN latest l ON l.record_id = p.id
    WHERE p.owner_id = uid AND rr.archived_at IS NULL),
  inside AS (
    SELECT pa.asset_id, pa.property_id, pr.readable_id property_readable_id FROM public.property_assets pa JOIN props pr ON pr.id = pa.property_id
    WHERE pa.owner_id = uid AND pa.included_in_property_value AND pr.value IS NOT NULL
      AND pa.valid_from <= d AND (pa.valid_to IS NULL OR d < pa.valid_to)),
  asts AS (
    SELECT a.id, rr.readable_id, public.p6_scope_label(rr.legal_entity_id) scope, coalesce(l.value, a.legacy_cost) value, coalesce(l.currency, 'INR') currency,
           CASE WHEN l.value IS NOT NULL THEN 'valuation' ELSE 'legacy_cost_compare_only' END basis, i.property_readable_id
    FROM public.assets a JOIN public.register_records rr ON rr.id = a.id LEFT JOIN latest l ON l.record_id = a.id LEFT JOIN inside i ON i.asset_id = a.id
    WHERE a.owner_id = uid AND rr.archived_at IS NULL),
  it AS (
    SELECT 'property' kind, readable_id, scope, value, currency, 'valuation' basis, true counted, NULL::text counted_within FROM props WHERE value IS NOT NULL
    UNION ALL SELECT 'asset', readable_id, scope, value, currency, basis, property_readable_id IS NULL, property_readable_id FROM asts)
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'readable_id', readable_id, 'scope', scope, 'value', value, 'currency', currency, 'basis', basis,
           'counted', counted, 'counted_within', counted_within) ORDER BY kind DESC, readable_id), '[]'::jsonb),
         coalesce((SELECT jsonb_object_agg(k, s) FROM (SELECT scope || '|' || currency k, sum(value) s FROM it WHERE counted GROUP BY 1) z), '{}'::jsonb)
  INTO items, totals FROM it;
  RETURN jsonb_build_object('as_of', d, 'items', items, 'totals', totals,
    'rule', 'a component included in a valued property is counted inside that property only (FND-03, Flow 5)');
END $$;

-- Attach an asset to a property (owner's own rows; descriptive link, no money). Assistant refused.
CREATE FUNCTION public.attach_asset_to_property(_property uuid, _asset uuid, _included boolean, _from date, _reason text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); rid uuid;
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Sign in with your account to change registers'; END IF;
  IF _included IS NULL THEN RAISE EXCEPTION 'Say whether the asset is part of the property value' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.properties p JOIN public.register_records r ON r.id = p.id WHERE p.id = _property AND p.owner_id = uid AND r.archived_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.assets a JOIN public.register_records r ON r.id = a.id WHERE a.id = _asset AND a.owner_id = uid AND r.archived_at IS NULL) THEN
    RAISE EXCEPTION 'Active property and asset of your own are required' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.property_assets(owner_id, property_id, asset_id, role, included_in_property_value, valid_from, reason, source, created_by)
  VALUES (uid, _property, _asset, 'component', _included, coalesce(_from, '-infinity'), nullif(btrim(coalesce(_reason, '')), ''),
          jsonb_build_object('from', 'attach_asset_to_property', 'captured_at', clock_timestamp()), uid)
  RETURNING id INTO rid;
  RETURN rid;
END $$;

-- End a containment range (history: step-up). The row stays.
CREATE FUNCTION public.end_asset_containment(_id uuid, _valid_to date) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Sign in with your account to change registers'; END IF;
  IF _valid_to IS NULL OR _valid_to IN ('infinity'::date, '-infinity'::date) THEN RAISE EXCEPTION 'Choose the end date' USING ERRCODE = '22023'; END IF;
  UPDATE public.property_assets SET valid_to = _valid_to WHERE id = _id AND owner_id = uid AND valid_to IS NULL AND valid_from < _valid_to;
  IF NOT FOUND THEN RAISE EXCEPTION 'Open containment not found' USING ERRCODE = 'P0002'; END IF;
END $$;

-- Archive (never delete) a register record; its number, links, children and history stay. Assets and
-- properties archive their register_records anchor (one place). Step-up guarded (P4 wrapper).
CREATE FUNCTION public.archive_register_item(_register text, _id uuid, _reason text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); n int;
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Sign in with your account to archive'; END IF;
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN RAISE EXCEPTION 'Give a reason for archiving' USING ERRCODE = '22023'; END IF;
  IF _register IN ('assets', 'properties') THEN
    UPDATE public.register_records r SET archived_at = clock_timestamp(), archived_by = uid, archive_reason = btrim(_reason)
    WHERE r.id = _id AND r.owner_id = uid AND r.archived_at IS NULL
      AND r.record_kind = CASE _register WHEN 'assets' THEN 'asset' ELSE 'property' END
      AND (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = r.id) OR EXISTS (SELECT 1 FROM public.properties p WHERE p.id = r.id));
  ELSIF _register IN ('leases', 'trips', 'investment_holdings', 'receivables', 'projects') THEN
    EXECUTE format('UPDATE public.%I SET archived_at = clock_timestamp(), archived_by = $1, archive_reason = $2 WHERE id = $3 AND owner_id = $1 AND archived_at IS NULL', _register)
    USING uid, btrim(_reason), _id;
  ELSE RAISE EXCEPTION 'Unknown register %', _register USING ERRCODE = '22023';
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Active register record not found' USING ERRCODE = 'P0002'; END IF;
END $$;

-- Confirmed account erasure (delete_my_finance_data deletes finance_preferences last): remove the
-- owner's P6 rows BEFORE P5's eraser removes register_records (trigger name sorts first). If P5 then
-- refuses (ERASURE_BLOCKED_COOWNED) the whole erasure rolls back. SECURITY INVOKER on purpose (P5 pattern).
CREATE FUNCTION public.p6_erase_owner_registers() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE t text;
BEGIN
  IF current_setting('ledgerline.erasing', true) IS DISTINCT FROM 'on' OR current_user IN ('authenticated', 'anon') THEN RETURN NULL; END IF;
  DELETE FROM public.register_legacy_copies c WHERE c.owner_id = OLD.owner_id;
  FOREACH t IN ARRAY ARRAY['register_entry_links', 'register_archive_events', 'trip_advances', 'trip_bookings', 'trips', 'register_valuations', 'property_assets',
                           'leases', 'property_units', 'properties', 'depreciation_journals', 'asset_events', 'assets', 'investment_holdings', 'receivables', 'projects'] LOOP
    EXECUTE format('DELETE FROM public.%I WHERE owner_id = $1', t) USING OLD.owner_id;
  END LOOP;
  RETURN NULL;
END $$;
CREATE TRIGGER a_p6_erase_owner_registers AFTER DELETE ON public.finance_preferences FOR EACH ROW EXECUTE FUNCTION public.p6_erase_owner_registers();

-- --------------------------------------------------------------------------------------------
-- 9. Privileges and RLS
-- --------------------------------------------------------------------------------------------
DO $priv$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assets', 'asset_events', 'depreciation_journals', 'properties', 'property_units', 'property_assets', 'register_valuations', 'leases',
                           'trips', 'trip_bookings', 'trip_advances', 'register_entry_links', 'investment_holdings', 'receivables', 'projects',
                           'register_legacy_copies', 'register_archive_events'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated, service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $priv$;

-- Anchored on a shared register record: administrator, confirmed co-owners and P2 grantees of the
-- record's company (p5_can_read_register_record). Everything else: owner or a P2 'view' grantee of
-- the row's scope company (never personal books).
CREATE POLICY "Owner, co-owner or entity grantee reads assets" ON public.assets FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.p5_can_read_register_record(id));
CREATE POLICY "Owner, co-owner or entity grantee reads asset events" ON public.asset_events FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.p5_can_read_register_record(asset_id));
CREATE POLICY "Owner, co-owner or entity grantee reads depreciation journals" ON public.depreciation_journals FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.p5_can_read_register_record(asset_id));
CREATE POLICY "Owner, co-owner or entity grantee reads properties" ON public.properties FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.p5_can_read_register_record(id));
CREATE POLICY "Owner, co-owner or entity grantee reads property units" ON public.property_units FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.p5_can_read_register_record(property_id));
CREATE POLICY "Owner, co-owner or entity grantee reads containment" ON public.property_assets FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.p5_can_read_register_record(property_id));
CREATE POLICY "Owner, co-owner or entity grantee reads valuations" ON public.register_valuations FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.p5_can_read_register_record(record_id));
CREATE POLICY "Owner, co-owner or entity grantee reads leases" ON public.leases FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.p5_can_read_register_record(property_id));
CREATE POLICY "Owner or entity grantee reads trips" ON public.trips FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.p6_entity_shared(legal_entity_id));
CREATE POLICY "Owner or entity grantee reads trip bookings" ON public.trip_bookings FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.p6_entity_shared(legal_entity_id));
CREATE POLICY "Owner or entity grantee reads trip advances" ON public.trip_advances FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.p6_entity_shared(legal_entity_id));
CREATE POLICY "Owner or entity grantee reads entry links" ON public.register_entry_links FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.p6_entity_shared(legal_entity_id));
CREATE POLICY "Owner or entity grantee reads holdings" ON public.investment_holdings FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.p6_entity_shared(legal_entity_id));
CREATE POLICY "Owner or entity grantee reads receivables" ON public.receivables FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.p6_entity_shared(legal_entity_id));
CREATE POLICY "Owner or entity grantee reads projects" ON public.projects FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.p6_entity_shared(legal_entity_id));
CREATE POLICY "Owner or record administrator reads legacy copies" ON public.register_legacy_copies FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.register_records r WHERE r.id = register_legacy_copies.record_id AND r.owner_id = auth.uid()));
CREATE POLICY "Owner reads own archive history" ON public.register_archive_events FOR SELECT TO authenticated USING (owner_id = auth.uid());

-- P4 RESTRICTIVE assistant policies on every new table (same names and expressions as P4 section 8 / P5).
DO $pol$
DECLARE t record; rd text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
           AND c.relname IN ('assets', 'asset_events', 'depreciation_journals', 'properties', 'property_units', 'property_assets', 'register_valuations', 'leases',
                             'trips', 'trip_bookings', 'trip_advances', 'register_entry_links', 'investment_holdings', 'receivables', 'projects',
                             'register_legacy_copies', 'register_archive_events') ORDER BY c.relname LOOP
    rd := '(SELECT NOT public.is_assistant_session()) OR NOT public.assistant_client_revoked(owner_id)';
    EXECUTE format('CREATE POLICY "P4 assistants cannot insert" ON public.%I AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (NOT (SELECT public.is_assistant_session()))', t.relname);
    EXECUTE format('CREATE POLICY "P4 assistants cannot update" ON public.%I AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (NOT (SELECT public.is_assistant_session())) WITH CHECK (NOT (SELECT public.is_assistant_session()))', t.relname);
    EXECUTE format('CREATE POLICY "P4 assistants cannot delete" ON public.%I AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (NOT (SELECT public.is_assistant_session()))', t.relname);
    EXECUTE format('CREATE POLICY "P4 revoked assistants cannot read" ON public.%I AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (%s)', t.relname, rd);
    EXECUTE format('CREATE POLICY "P6 history cannot be changed by clients" ON public.%I AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false)', t.relname);
    EXECUTE format('CREATE POLICY "P6 history cannot be deleted by clients" ON public.%I AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false)', t.relname);
  END LOOP;
END $pol$;

-- Function privileges: nothing callable by PUBLIC/anon; clients get only the entry points.
DO $grants$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN (
      'p6_date', 'p6_ts', 'p6_num', 'p6_text', 'p6_uuid', 'p6_texts', 'p6_scope', 'p6_scope_label', 'p6_ref_ok', 'p6_entity_shared', 'p6_list',
      'p6_status_exception', 'p6_map_add', 'p6_guard_register_row', 'p6_guard_references', 'p6_guard_property_asset', 'p6_log_archive',
      'p6_plan_assets', 'p6_plan_properties', 'p6_plan_trips', 'p6_plan_holdings', 'p6_plan_receivables', 'p6_plan_projects', 'p6_register_plan',
      'p6_after_map', 'p6_orphans', 'p6_erase_owner_registers',
      'preview_register_backfill', 'commit_register_backfill', 'register_backfill_report', 'register_valuation_report',
      'attach_asset_to_property', 'end_asset_containment', 'archive_register_item') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f.sig);
  END LOOP;
END $grants$;
GRANT EXECUTE ON FUNCTION public.preview_register_backfill(text, jsonb), public.commit_register_backfill(text, text, jsonb), public.register_backfill_report(text),
  public.register_valuation_report(date), public.attach_asset_to_property(uuid, uuid, boolean, date, text), public.end_asset_containment(uuid, date),
  public.archive_register_item(text, uuid, text) TO authenticated;
-- Policy helper: must be executable by every role RLS evaluates it for.
GRANT EXECUTE ON FUNCTION public.p6_entity_shared(uuid) TO authenticated;

-- --------------------------------------------------------------------------------------------
-- 10. P4 guards on the client entry points (removed again by the P6 rollback)
-- --------------------------------------------------------------------------------------------
DO $guard$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure sig,
                  CASE WHEN p.proname IN ('commit_register_backfill', 'archive_register_item', 'end_asset_containment') THEN 'step_up' ELSE 'assistant' END mode
           FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN (
             'preview_register_backfill', 'commit_register_backfill', 'register_backfill_report', 'register_valuation_report',
             'attach_asset_to_property', 'end_asset_containment', 'archive_register_item')
           ORDER BY p.proname LOOP
    PERFORM security_p4.guard(f.sig, f.mode);
  END LOOP;
END $guard$;

-- Fail closed: every client-callable volatile function must be guarded (same rule as P4 7d / P5).
DO $check$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND p.provolatile = 'v'
    AND p.prorettype <> 'trigger'::regtype AND p.proname NOT LIKE '%\_\_unguarded'
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND p.proname NOT IN ('revoke_assistant_client', 'remove_device_passkey', 'require_recent_step_up')
    AND NOT EXISTS (SELECT 1 FROM security_p4.guarded_functions g WHERE g.proname = p.proname);
  IF n > 0 THEN RAISE EXCEPTION 'P6: % unguarded client-callable writer function(s) in public', n; END IF;
END $check$;

COMMIT;
