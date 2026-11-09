-- ============================================================================================
-- P5_legal_entities_foundation.sql (PROPOSED ONLY: NOT APPLIED to Lovable Cloud, Live or any hosted DB)
-- Prepared 2026-11-09 for KK review (Phase 2, database foundation; V4 FND-02, FND-03, FND-05,
-- Decision 38 permanent IDs, P3 decisions DN-P3-5 B and DN-P3-8 B).
-- Plan: docs/plans/PHASE2_MIGRATION_PLAN_2026-11-09.md. Inventory: docs/plans/PHASE2_DATA_INVENTORY_2026-11-09.md.
-- Order: 0000-0088 -> P1 -> P2 -> P4 -> P5 (preflight checks all three). Rollback:
-- P5_legal_entities_foundation.rollback.sql (run BEFORE the P4 rollback; restores the exact
-- P1+P2+P4 catalog and archives, never drops, every row P5 created).
--
-- Stage: FND-03 "additive schema" + "dual-read compatibility" + "previewed backfill" + "compare".
-- The gated read switch, write switch and JSON cleanup are NOT part of this file.
--
-- Data: changes NO existing column value of any existing row. Adds one nullable column
-- (legal_entity_id) to expenses, documents and opening_postings; the column is filled only by
-- the link trigger below or by commit_entity_backfill. The legacy text entity_id columns, the JSON
-- finance_preferences.data (entities, books.entityAccounts, ...) and every P1/P2/P3 contract keyed
-- by the JSON text id (storage paths <owner>/companies/<hex(entity_id)>/, access_grants.entity_id,
-- entity_members, closedPeriods[].entityId) are untouched: legal_entities.entity_key IS that text id.
--
--  1. legal_entities (one row per owner per legal entity, permanent readable ENT- id, archive-only),
--     exactly one individual_personal row per owner (entity_key 'personal:<owner uuid>') = the
--     owner's personal books (DN-P3-5 B). Workspace labels (Me/Family/Business/Official), the
--     'Organisation: <name>' tags, reimbursement profiles and trip.organisation are NEVER mapped.
--  2. entity_relationships (dated, owner-scoped composite FKs).
--  3. account_entity_assignments (dated account -> entity; no overlapping ranges per account,
--     enforced by a trigger with a per-account advisory lock; btree_gist is not used, see section 3).
--  4. legal_entity_id on expenses/documents/opening_postings, resolved by trigger from the
--     existing text columns (never changes them, never blocks a write; unresolved = NULL + reported).
--  5. Readable permanent reference numbers (Decision 38, KK final decision 2026-11-09): the uuid
--     primary key stays the immutable internal ID; readable numbers are issued per accounting scope =
--     one legal entity (company or personal): readable_id_formats, readable_id_counters and
--     readable_id_registry keyed by (scope entity, prefix, year, number); issue_readable_id(),
--     claim_readable_id() (restore/import keep numbers), assign_readable_id() generic trigger.
--     Unlinked rows get no number until linked. register_records is the ONE permanent anchor (uuid +
--     PRP-/AST- number) of a property/asset shared by every co-owner; record_ownerships holds its dated
--     shares across legal entities of any account (requested by the entity's account, confirmed by the
--     record administrator; <= 100% confirmed per date; no overlap per owning entity).
--  6. Entity-aware closed periods (DN-P3-8 B): guard_closed_period (0058) evaluates the entry's
--     company (hand-picked, paying and receiving account; dated assignment AND legacy JSON link, so it
--     is never weaker than the app); guard_journals_rules (0083) reads assets[].ownerEntityId (the field
--     the app writes) before and after the save; ll_closed_on (0083) treats an empty entityId as "every
--     entity" like the app. Originals are saved in phase2_p5.saved_functions and restored by the rollback.
--  7. Generic legacy backfill framework (legacy_backfill_runs, legacy_sha256, legacy_exception,
--     legacy_json_elements, legacy_compare_maps) + the entity instance:
--     preview_entity_backfill(), commit_entity_backfill(_source_sha256, _archive_orphans),
--     entity_backfill_report().
--  8. RLS: owner policies, read for P2 grantees of the entity (has_permission view; personal and
--     unknown-legacy entities never), P4 RESTRICTIVE assistant policies on every new table, history
--     tables append-only, no client INSERT/UPDATE/DELETE privilege on any new table. Writers:
--     commit_entity_backfill, reassign_account_entity, archive_legal_entity, archive_register_record,
--     record_ownership_share, decide_ownership_share, end_ownership_share (P4 step-up);
--     record_entity_relationship, end_entity_relationship, register_shared_record, preview/report
--     (P4 assistant refusal).
-- ============================================================================================
BEGIN;

-- --------------------------------------------------------------------------------------------
-- 0. Preflight (fail closed on an unexpected catalog)
-- --------------------------------------------------------------------------------------------
DO $pre$
BEGIN
  IF to_regprocedure('public.guard_shared_document_edit()') IS NULL THEN
    RAISE EXCEPTION 'P5 requires P1_security_containment.sql';
  END IF;
  IF to_regprocedure('public.has_permission(uuid,text,text)') IS NULL OR to_regclass('public.access_grants') IS NULL THEN
    RAISE EXCEPTION 'P5 requires P2_v31_role_model.sql';
  END IF;
  IF to_regclass('public.step_up_grants') IS NULL OR to_regclass('security_p4.guarded_functions') IS NULL
     OR to_regprocedure('security_p4.guard(regprocedure,text)') IS NULL THEN
    RAISE EXCEPTION 'P5 requires P4_step_up_and_assistant_limits.sql';
  END IF;
  IF to_regclass('public.legal_entities') IS NOT NULL OR to_regnamespace('phase2_p5') IS NOT NULL THEN
    RAISE EXCEPTION 'P5 is already installed';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'legal_entity_id'
             AND table_name IN ('expenses', 'documents', 'opening_postings')) THEN
    RAISE EXCEPTION 'P5: legal_entity_id already exists on a ledger table; review before applying';
  END IF;
  -- The three functions P5 replaces must be exactly the applied 0058/0083 bodies (pinned md5 of
  -- prosrc). A hosted hot-fix would otherwise be silently overwritten.
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.guard_closed_period()')) IS DISTINCT FROM '0099e871a572634a68b89fdb84b963f4'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.guard_journals_rules()')) IS DISTINCT FROM 'c938be6da53ed17ea747c3c51d2b09db'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.ll_closed_on(jsonb,text,text)')) IS DISTINCT FROM '61b6672b01871c8ffea584e1bbf1c40a' THEN
    RAISE EXCEPTION 'P5: guard_closed_period / guard_journals_rules / ll_closed_on differ from migrations 0058/0083; review before applying';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'guard_closed_period' AND tgrelid = 'public.expenses'::regclass)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'guard_journals_rules' AND tgrelid = 'public.finance_preferences'::regclass) THEN
    RAISE EXCEPTION 'P5: period guard triggers missing; review before applying';
  END IF;
END $pre$;

-- Private bookkeeping for the rollback (original function definitions and ACLs).
CREATE SCHEMA phase2_p5;
REVOKE ALL ON SCHEMA phase2_p5 FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE phase2_p5.saved_functions (sig text PRIMARY KEY, definition text NOT NULL, acl aclitem[]);
REVOKE ALL ON phase2_p5.saved_functions FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO phase2_p5.saved_functions(sig, definition, acl)
SELECT p.oid::regprocedure::text, pg_get_functiondef(p.oid), p.proacl FROM pg_proc p
WHERE p.oid IN (to_regprocedure('public.guard_closed_period()'), to_regprocedure('public.guard_journals_rules()'),
                to_regprocedure('public.ll_closed_on(jsonb,text,text)'));

-- --------------------------------------------------------------------------------------------
-- 1. Readable permanent reference numbers (Decision 38; KK final decision 2026-11-09)
--    * The internal ID of every record is its uuid primary key: globally unique, immutable, never
--      reused or regenerated. Readable numbers are added BESIDE it and never replace a uuid, a legacy
--      JSON id or an LL-DES-/LL-CLM- reference (those stay in legacy_id / source).
--    * Readable numbers are issued WITHIN THE ACCOUNTING SCOPE of one legal entity (a company row or
--      the owner's individual_personal row): counters and uniqueness are keyed by
--      (scope entity, prefix[, year], number). Two companies can both hold AST-000001.
--    * A record with no entity scope yet (unlinked legacy row) gets NO number until it is linked;
--      screens show its legacy id (or the first 8 characters of its uuid) marked "unlinked".
--    * Legal entities themselves (ENT) are numbered in the owner's personal scope (the account
--      holder's register of entities); the personal row is ENT-000001 of its own scope.
--    * A jointly owned property/asset is ONE register_records row with ONE number, issued in the scope
--      of the entity that first records it; co-owners' shares live in record_ownerships (section 2b).
--    * Applied in P5 to legal_entities (ENT) and register_records (PRP/AST). EXP/CLM/DES/TRP/EVT/REM/NTF
--      formats are registered; their tables attach the same trigger when they are created (registers
--      step) or, for expenses, at the write switch, never by renumbering existing rows.
-- --------------------------------------------------------------------------------------------
-- Formats from THAPAL_V4_MASTER "Permanent IDs (revision 8)". NNNN is a MINIMUM width: numbers are
-- never wrapped or truncated (TRP-2026-10000 follows TRP-2026-9999). ENT is new in P5.
CREATE TABLE public.readable_id_formats (
  prefix text PRIMARY KEY CHECK (prefix ~ '^[A-Z]{3}$'),
  yearly boolean NOT NULL,
  width int NOT NULL CHECK (width BETWEEN 4 AND 9),
  record text NOT NULL
);
INSERT INTO public.readable_id_formats(prefix, yearly, width, record) VALUES
  ('ENT', false, 6, 'Legal entity (numbered in the owner''s personal scope)'),
  ('AST', false, 6, 'Asset'),
  ('PRP', false, 4, 'Property (one number per property, also when jointly owned)'),
  ('TRP', true, 4, 'Trip'),
  ('EXP', true, 6, 'Expense'),
  ('CLM', true, 4, 'Claim'),
  ('DES', true, 4, 'Expenditure statement (versions keep the number and add v2, v3)'),
  ('EVT', true, 6, 'Calendar event'),
  ('REM', true, 6, 'Reminder'),
  ('NTF', true, 6, 'Notification');
COMMENT ON TABLE public.readable_id_formats IS 'P5: readable reference formats (Decision 38). Read-only to clients; changed only by a reviewed migration.';

CREATE TABLE public.readable_id_counters (
  scope_entity_id uuid NOT NULL,
  prefix text NOT NULL REFERENCES public.readable_id_formats(prefix),
  year int NOT NULL CHECK (year = 0 OR year BETWEEN 1900 AND 9999),
  last_value bigint NOT NULL CHECK (last_value >= 1),
  PRIMARY KEY (scope_entity_id, prefix, year)
);
COMMENT ON TABLE public.readable_id_counters IS 'P5: last issued number per accounting scope (legal entity) / prefix / year (0 = not yearly). Only moves forward; kept by erasure so numbers are never reused. No client access.';

CREATE TABLE public.readable_id_registry (
  scope_entity_id uuid NOT NULL,
  readable_id text NOT NULL,
  prefix text NOT NULL REFERENCES public.readable_id_formats(prefix),
  year int NOT NULL,
  seq bigint NOT NULL,
  owner_id uuid NOT NULL,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  how text NOT NULL CHECK (how IN ('issued', 'claimed')),
  PRIMARY KEY (scope_entity_id, readable_id),
  UNIQUE (table_name, record_id)
);
CREATE INDEX readable_id_registry_owner_idx ON public.readable_id_registry(owner_id, table_name);
COMMENT ON TABLE public.readable_id_registry IS 'P5: every readable number ever issued or claimed (restore/import), unique per accounting scope entity. Append-only; archived records keep their entry; a number is never issued twice in a scope.';

CREATE FUNCTION public.format_readable_id(_prefix text, _year int, _n bigint) RETURNS text
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT f.prefix || '-' || CASE WHEN f.yearly THEN lpad(_year::text, 4, '0') || '-' ELSE '' END
    || CASE WHEN length(_n::text) >= f.width THEN _n::text ELSE lpad(_n::text, f.width, '0') END
  FROM public.readable_id_formats f WHERE f.prefix = _prefix
$$;

-- Issues the next number of _scope_entity in the same transaction as the record insert (rolls back with
-- it). The counter row lock serialises concurrent issuers in one scope; numbers claimed by a restore
-- are skipped. _owner = account owner of the scope entity (RLS on the registry).
CREATE FUNCTION public.issue_readable_id(_scope_entity uuid, _owner uuid, _prefix text, _on date, _table text, _record uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE f public.readable_id_formats; yr int; v bigint; rid text;
BEGIN
  IF _scope_entity IS NULL OR _owner IS NULL OR _table IS NULL OR _record IS NULL THEN
    RAISE EXCEPTION 'A readable number needs an accounting scope entity, owner, table and record';
  END IF;
  SELECT * INTO f FROM public.readable_id_formats WHERE prefix = _prefix;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown readable ID prefix %', _prefix; END IF;
  SELECT r.readable_id INTO rid FROM public.readable_id_registry r WHERE r.table_name = _table AND r.record_id = _record;
  IF FOUND THEN RETURN rid; END IF; -- the same record keeps its number
  yr := CASE WHEN f.yearly THEN extract(year FROM coalesce(_on, (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date))::int ELSE 0 END;
  LOOP
    INSERT INTO public.readable_id_counters AS c(scope_entity_id, prefix, year, last_value) VALUES (_scope_entity, _prefix, yr, 1)
    ON CONFLICT (scope_entity_id, prefix, year) DO UPDATE SET last_value = c.last_value + 1
    RETURNING c.last_value INTO v;
    rid := public.format_readable_id(_prefix, yr, v);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.readable_id_registry r WHERE r.scope_entity_id = _scope_entity AND r.readable_id = rid);
  END LOOP;
  INSERT INTO public.readable_id_registry(scope_entity_id, readable_id, prefix, year, seq, owner_id, table_name, record_id, how)
  VALUES (_scope_entity, rid, _prefix, yr, v, _owner, _table, _record, 'issued');
  RETURN rid;
END $$;

-- Keeps an existing number (backup restore, re-import): never renumbers. Refuses a number registered to
-- another record in the scope and moves the counter past it so it is never issued again.
CREATE FUNCTION public.claim_readable_id(_scope_entity uuid, _owner uuid, _readable_id text, _table text, _record uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m text[]; f public.readable_id_formats; yr int; n bigint; r public.readable_id_registry;
BEGIN
  IF _scope_entity IS NULL OR _owner IS NULL OR _table IS NULL OR _record IS NULL THEN
    RAISE EXCEPTION 'A readable number needs an accounting scope entity, owner, table and record';
  END IF;
  m := regexp_match(coalesce(_readable_id, ''), '^([A-Z]{3})-(?:([0-9]{4})-)?([0-9]{1,18})$');
  IF m IS NULL THEN RAISE EXCEPTION 'READABLE_ID_INVALID: %', _readable_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO f FROM public.readable_id_formats WHERE prefix = m[1];
  IF NOT FOUND OR f.yearly <> (m[2] IS NOT NULL) THEN RAISE EXCEPTION 'READABLE_ID_INVALID: %', _readable_id USING ERRCODE = '22023'; END IF;
  yr := coalesce(m[2]::int, 0); n := m[3]::bigint;
  IF n < 1 OR public.format_readable_id(f.prefix, yr, n) <> _readable_id THEN RAISE EXCEPTION 'READABLE_ID_INVALID: %', _readable_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM public.readable_id_registry x WHERE x.scope_entity_id = _scope_entity AND x.readable_id = _readable_id;
  IF FOUND THEN
    IF r.table_name = _table AND r.record_id = _record THEN RETURN _readable_id; END IF;
    RAISE EXCEPTION 'READABLE_ID_TAKEN: % already belongs to another record in this scope', _readable_id USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.readable_id_registry x WHERE x.table_name = _table AND x.record_id = _record) THEN
    RAISE EXCEPTION 'READABLE_ID_TAKEN: this record already has a readable number' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.readable_id_registry(scope_entity_id, readable_id, prefix, year, seq, owner_id, table_name, record_id, how)
  VALUES (_scope_entity, _readable_id, f.prefix, yr, n, _owner, _table, _record, 'claimed');
  INSERT INTO public.readable_id_counters AS c(scope_entity_id, prefix, year, last_value) VALUES (_scope_entity, f.prefix, yr, n)
  ON CONFLICT (scope_entity_id, prefix, year) DO UPDATE SET last_value = greatest(c.last_value, excluded.last_value);
  RETURN _readable_id;
END $$;

-- Generic BEFORE INSERT OR UPDATE trigger for register tables with columns id uuid, readable_id text
-- (nullable) and a scope column holding the legal entity uuid. Arguments: prefix ('@record_kind' =
-- PRP/AST from register_records.record_kind), date column
-- (default created_at), scope column (default legal_entity_id; '@owner_personal' = the owner's personal
-- entity, used by legal_entities), owner column (default owner_id).
--   INSERT/UPDATE with no scope -> no number (unlinked; shown by legacy id).
--   scope present and readable_id NULL -> issue in that scope; readable_id given -> claim (restore/import).
--   Once set, readable_id never changes (every role), also when the record later moves scope.
CREATE FUNCTION public.assign_readable_id() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pfx text := TG_ARGV[0]; dcol text := coalesce(TG_ARGV[1], 'created_at'); scol text := coalesce(TG_ARGV[2], 'legal_entity_id');
  ocol text := coalesce(TG_ARGV[3], 'owner_id'); n jsonb := to_jsonb(NEW); o jsonb; rid text; d date; sc uuid; own uuid;
BEGIN
  IF pfx = '@record_kind' THEN -- register_records: property -> PRP, asset -> AST
    pfx := CASE n->>'record_kind' WHEN 'property' THEN 'PRP' WHEN 'asset' THEN 'AST' END;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    o := to_jsonb(OLD);
    IF o->>'readable_id' IS NOT NULL THEN
      IF n->'readable_id' IS DISTINCT FROM o->'readable_id' THEN
        RAISE EXCEPTION 'READABLE_ID_IMMUTABLE: % keeps %', TG_TABLE_NAME, o->>'readable_id' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END IF;
  END IF;
  own := (n->>ocol)::uuid;
  sc := CASE WHEN scol = '@owner_personal' THEN
              CASE WHEN n->>'kind' = 'individual_personal' THEN (n->>'id')::uuid
                   ELSE (SELECT e.id FROM public.legal_entities e WHERE e.owner_id = own AND e.kind = 'individual_personal') END
            ELSE (n->>scol)::uuid END;
  IF sc IS NULL THEN
    IF n->>'readable_id' IS NOT NULL THEN RAISE EXCEPTION 'READABLE_ID_NEEDS_SCOPE: link % to a legal entity first', TG_TABLE_NAME USING ERRCODE = '23514'; END IF;
    RETURN NEW; -- unlinked: no number yet
  END IF;
  IF scol <> '@owner_personal' THEN -- the scope entity's own owner (a co-owned record may be recorded by another account)
    SELECT e.owner_id INTO own FROM public.legal_entities e WHERE e.id = sc;
    IF own IS NULL THEN RAISE EXCEPTION 'Readable number scope entity not found' USING ERRCODE = '23503'; END IF;
  END IF;
  d := CASE WHEN n->>dcol IS NULL THEN NULL
            WHEN (n->>dcol) ~ '^\d{4}-\d{2}-\d{2}$' THEN (n->>dcol)::date
            ELSE ((n->>dcol)::timestamptz AT TIME ZONE 'Asia/Kolkata')::date END;
  IF n->>'readable_id' IS NULL THEN rid := public.issue_readable_id(sc, own, pfx, d, TG_TABLE_NAME, (n->>'id')::uuid);
  ELSE rid := public.claim_readable_id(sc, own, n->>'readable_id', TG_TABLE_NAME, (n->>'id')::uuid);
  END IF;
  NEW := jsonb_populate_record(NEW, jsonb_build_object('readable_id', rid));
  RETURN NEW;
END $$;

-- --------------------------------------------------------------------------------------------
-- 2. Legal entities, relationships, dated account assignments
-- --------------------------------------------------------------------------------------------
CREATE TABLE public.legal_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  -- Permanent alias = today's finance_preferences.data.entities[].id (P1 paths, P2 grants, P3 postings).
  entity_key text NOT NULL CHECK (length(entity_key) BETWEEN 1 AND 200),
  kind text NOT NULL CHECK (kind IN ('individual_personal', 'individual', 'huf', 'proprietorship', 'partnership', 'llp',
                                     'company', 'trust', 'organisation', 'legacy_unknown')),
  legal_name text NOT NULL DEFAULT '' CHECK (length(legal_name) <= 300),
  pan text CHECK (pan IS NULL OR (pan = upper(btrim(pan)) AND length(pan) BETWEEN 1 AND 20)),
  registration_no text CHECK (registration_no IS NULL OR length(registration_no) BETWEEN 1 AND 60),
  gstins text[] NOT NULL DEFAULT '{}' CHECK (cardinality(gstins) <= 100),
  identifiers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(identifiers) = 'object'),
  readable_id text NOT NULL,
  display_code text CHECK (display_code IS NULL OR length(display_code) BETWEEN 1 AND 60),
  source jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  archived_at timestamptz,
  archived_by uuid,
  archive_reason text CHECK (archive_reason IS NULL OR length(archive_reason) BETWEEN 3 AND 500),
  UNIQUE (owner_id, id),
  UNIQUE (owner_id, entity_key),
  UNIQUE (owner_id, readable_id),
  CHECK ((kind = 'individual_personal') = (entity_key = 'personal:' || owner_id::text)),
  CHECK (kind <> 'individual_personal' OR archived_at IS NULL),
  CHECK ((archived_at IS NULL) = (archive_reason IS NULL))
);
CREATE UNIQUE INDEX legal_entities_one_personal_idx ON public.legal_entities(owner_id) WHERE kind = 'individual_personal';
COMMENT ON TABLE public.legal_entities IS 'P5 (FND-02): legal entities per owner. entity_key = legacy JSON entities[].id (permanent alias; personal:<owner> for the one individual_personal row). Archive only; readable_id ENT-NNNNNN never changes or repeats. Written only by P5 functions.';

-- ENT numbers in the owner's personal scope; the personal row must exist first (commit creates it first).
CREATE TRIGGER a_assign_readable_id BEFORE INSERT OR UPDATE ON public.legal_entities
  FOR EACH ROW EXECUTE FUNCTION public.assign_readable_id('ENT', 'created_at', '@owner_personal', 'owner_id');

CREATE TABLE public.entity_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  from_entity_id uuid NOT NULL,
  to_entity_id uuid NOT NULL,
  relation text NOT NULL CHECK (relation IN ('shareholder', 'director', 'partner', 'designated_partner', 'proprietor', 'trustee',
                                             'settlor', 'member', 'beneficiary', 'karta', 'coparcener', 'custodian', 'group_member')),
  pct numeric(9, 6) CHECK (pct IS NULL OR (pct > 0 AND pct <= 100)),
  valid_from date NOT NULL DEFAULT '-infinity',
  valid_to date,
  evidence_document_id uuid,
  note text CHECK (note IS NULL OR length(note) <= 500),
  source jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CHECK (from_entity_id <> to_entity_id),
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  FOREIGN KEY (owner_id, from_entity_id) REFERENCES public.legal_entities(owner_id, id),
  FOREIGN KEY (owner_id, to_entity_id) REFERENCES public.legal_entities(owner_id, id)
);
CREATE INDEX entity_relationships_to_idx ON public.entity_relationships(owner_id, to_entity_id);
COMMENT ON TABLE public.entity_relationships IS 'P5 (FND-02/03): explicit dated relationship from_entity -> to_entity (shareholder, director, partner, trustee, member, beneficiary, karta, custodian, group membership...). Never inferred from names. End-dated, never deleted by clients.';

CREATE TABLE public.account_entity_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL,
  valid_from date NOT NULL,   -- inclusive; '-infinity' = legacy link frozen by the backfill
  valid_to date,              -- exclusive; NULL = open
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  source jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source) = 'object'),
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  FOREIGN KEY (owner_id, entity_id) REFERENCES public.legal_entities(owner_id, id)
);
CREATE INDEX account_entity_assignments_account_idx ON public.account_entity_assignments(owner_id, account_id, valid_from);
COMMENT ON TABLE public.account_entity_assignments IS 'P5 (FND-05): dated account -> legal entity. Moving an account closes the old range and opens a new one, so earlier entries keep their entity. No overlaps (trigger). Changed only through commit_entity_backfill / reassign_account_entity.';

-- Overlap guard. Why a trigger and not EXCLUDE USING gist (account_id WITH =, daterange WITH &&):
-- the btree_gist extension is not loaded by the isolated PGlite harness (so an exclusion constraint
-- could not be tested), installing an extension on hosted needs separate approval and would make
-- the rollback either leave it behind or risk dropping a pre-existing copy. The per-account
-- transaction advisory lock serialises concurrent writers; under READ COMMITTED (Supabase default)
-- the overlap query after the lock sees every committed row.
CREATE FUNCTION public.guard_account_entity_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- account deleted (ON DELETE CASCADE) or confirmed account erasure; nothing else
    IF current_setting('ledgerline.erasing', true) = 'on' OR NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = OLD.account_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Account assignments are history; close them with reassign_account_entity' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.owner_id, NEW.account_id, NEW.entity_id, NEW.valid_from, NEW.reason, NEW.decided_by, NEW.created_at, NEW.source)
       IS DISTINCT FROM (OLD.id, OLD.owner_id, OLD.account_id, OLD.entity_id, OLD.valid_from, OLD.reason, OLD.decided_by, OLD.created_at, OLD.source)
       OR OLD.valid_to IS NOT NULL OR NEW.valid_to IS NULL THEN
      RAISE EXCEPTION 'An account assignment can only be closed once' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = NEW.account_id AND a.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'Account not found for this owner' USING ERRCODE = '23503';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('public.account_entity_assignments:' || NEW.account_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.account_entity_assignments x
             WHERE x.account_id = NEW.account_id AND x.id <> NEW.id
               AND daterange(x.valid_from, x.valid_to, '[)') && daterange(NEW.valid_from, NEW.valid_to, '[)')) THEN
    RAISE EXCEPTION 'ASSIGNMENT_OVERLAP: account % already belongs to an entity in that range', NEW.account_id USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_account_entity_assignment BEFORE INSERT OR UPDATE OR DELETE ON public.account_entity_assignments
  FOR EACH ROW EXECUTE FUNCTION public.guard_account_entity_assignment();

-- --------------------------------------------------------------------------------------------
-- 2b. Shared register records and dated ownership (KK decision item 3: a jointly owned property keeps
--     ONE permanent record and ONE number across all owners; shares and dates are held separately).
--   * register_records is the permanent anchor of one property or asset: uuid id (the permanent
--     internal ID, also the primary key the registers step will reuse: properties.id / assets.id
--     REFERENCES register_records(id)), the registering account (record administrator), the accounting
--     scope that issued its readable number (PRP-NNNN / AST-NNNNNN, scope = the registering legal
--     entity), legacy id + source provenance, archive only.
--   * record_ownerships holds the dated shares: one row per owning legal entity (of ANY account), share
--     %, valid_from (inclusive) / valid_to (exclusive), evidence document. Rules (trigger, every role):
--     no overlapping ranges per (record, owning entity); the CONFIRMED shares of a record never exceed
--     100% on any date; rows are end-dated or rejected, never deleted by clients.
--   * Consent: a share is always requested by the account that owns the owning entity (nobody can put
--     another account's entity on a record). It is confirmed at once when that account administers the
--     record, otherwise it waits (pending, not counted, not visible to the administrator's co-owners)
--     until the record administrator confirms or rejects it. A stranger who learns a record uuid can
--     therefore neither block it (pending shares are not counted) nor read it.
-- --------------------------------------------------------------------------------------------
CREATE TABLE public.register_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,                 -- registering account = record administrator
  record_kind text NOT NULL CHECK (record_kind IN ('property', 'asset')),
  legal_entity_id uuid NOT NULL,          -- accounting scope that issued readable_id (first recording entity)
  readable_id text NOT NULL,              -- PRP-NNNN / AST-NNNNNN, unique within that scope, never changes
  label text NOT NULL DEFAULT '' CHECK (length(label) <= 300),
  legacy_id text CHECK (legacy_id IS NULL OR length(legacy_id) BETWEEN 1 AND 200),
  source jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  archived_at timestamptz,
  archived_by uuid,
  archive_reason text CHECK (archive_reason IS NULL OR length(archive_reason) BETWEEN 3 AND 500),
  UNIQUE (owner_id, id),
  UNIQUE (legal_entity_id, readable_id),
  UNIQUE (owner_id, record_kind, legacy_id),
  CHECK ((archived_at IS NULL) = (archive_reason IS NULL)),
  FOREIGN KEY (owner_id, legal_entity_id) REFERENCES public.legal_entities(owner_id, id)
);
COMMENT ON TABLE public.register_records IS 'P5: permanent anchor (uuid + readable PRP-/AST- number issued in the registering legal entity''s scope) of one property or asset, shared by every co-owner. Registers attach later by primary key. Archive only.';
CREATE TRIGGER a_assign_readable_id BEFORE INSERT OR UPDATE ON public.register_records
  FOR EACH ROW EXECUTE FUNCTION public.assign_readable_id('@record_kind', 'created_at', 'legal_entity_id', 'owner_id');

CREATE FUNCTION public.guard_register_record_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('ledgerline.erasing', true) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Register records are never deleted; archive instead' USING ERRCODE = '42501';
  END IF;
  IF (NEW.id, NEW.owner_id, NEW.record_kind, NEW.legal_entity_id, NEW.label, NEW.legacy_id, NEW.source, NEW.created_at, NEW.created_by)
     IS DISTINCT FROM (OLD.id, OLD.owner_id, OLD.record_kind, OLD.legal_entity_id, OLD.label, OLD.legacy_id, OLD.source, OLD.created_at, OLD.created_by)
     OR OLD.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'A register record keeps its identity; it can only be archived once' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_register_record_change BEFORE UPDATE OR DELETE ON public.register_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_register_record_change();

CREATE TABLE public.record_ownerships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.register_records(id),
  owner_id uuid NOT NULL,                -- account that owns the owning entity (requested the share)
  owning_entity_id uuid NOT NULL,
  share_pct numeric(9, 6) NOT NULL CHECK (share_pct > 0 AND share_pct <= 100),
  valid_from date NOT NULL,
  valid_to date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  decided_at timestamptz,
  decided_by uuid,
  evidence_document_id uuid,
  note text CHECK (note IS NULL OR length(note) <= 500),
  source jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  CHECK ((status = 'pending') = (decided_at IS NULL)),
  CHECK (status = 'confirmed' OR valid_to IS NULL),
  FOREIGN KEY (owner_id, owning_entity_id) REFERENCES public.legal_entities(owner_id, id)
);
CREATE INDEX record_ownerships_record_idx ON public.record_ownerships(record_id, valid_from);
CREATE INDEX record_ownerships_owner_idx ON public.record_ownerships(owner_id, owning_entity_id);
COMMENT ON TABLE public.record_ownerships IS 'P5: dated ownership shares of one register record across legal entities of any account. No overlap per owning entity; confirmed shares per date <= 100%. Requested by the entity''s account, confirmed by the record administrator. Written only through record_ownership_share / decide_ownership_share / end_ownership_share.';

CREATE FUNCTION public.guard_record_ownership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p date; total numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('ledgerline.erasing', true) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Ownership shares are history; end them instead of deleting' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.record_id, NEW.owner_id, NEW.owning_entity_id, NEW.share_pct, NEW.valid_from, NEW.evidence_document_id, NEW.note, NEW.source, NEW.created_at, NEW.created_by)
       IS DISTINCT FROM (OLD.id, OLD.record_id, OLD.owner_id, OLD.owning_entity_id, OLD.share_pct, OLD.valid_from, OLD.evidence_document_id, OLD.note, OLD.source, OLD.created_at, OLD.created_by)
       OR NOT ((OLD.status = 'pending' AND NEW.status IN ('confirmed', 'rejected') AND NEW.valid_to IS NULL)          -- decision, once
               OR (OLD.status = 'confirmed' AND NEW.status = 'confirmed' AND OLD.valid_to IS NULL AND NEW.valid_to IS NOT NULL
                   AND (NEW.decided_at, NEW.decided_by) IS NOT DISTINCT FROM (OLD.decided_at, OLD.decided_by))) THEN -- end, once
      RAISE EXCEPTION 'An ownership share can only be decided once and ended once' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.evidence_document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id = NEW.evidence_document_id AND d.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'Evidence document not found for this owner' USING ERRCODE = '23503';
  END IF;
  IF NEW.status = 'rejected' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('public.record_ownerships:' || NEW.record_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.record_ownerships x WHERE x.record_id = NEW.record_id
             AND x.owning_entity_id = NEW.owning_entity_id AND x.id <> NEW.id AND x.status <> 'rejected'
             AND daterange(x.valid_from, x.valid_to, '[)') && daterange(NEW.valid_from, NEW.valid_to, '[)')) THEN
    RAISE EXCEPTION 'OWNERSHIP_OVERLAP: this entity already holds a share of the record in that range' USING ERRCODE = '23P01';
  END IF;
  IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
  -- Confirmed shares are piecewise constant; the total can only rise at a range start, so checking
  -- NEW.valid_from and every other start inside the new range covers every date.
  FOR p IN SELECT NEW.valid_from UNION SELECT x.valid_from FROM public.record_ownerships x
           WHERE x.record_id = NEW.record_id AND x.id <> NEW.id AND x.status = 'confirmed'
             AND x.valid_from > NEW.valid_from AND (NEW.valid_to IS NULL OR x.valid_from < NEW.valid_to) LOOP
    SELECT NEW.share_pct + coalesce(sum(x.share_pct), 0) INTO total FROM public.record_ownerships x
    WHERE x.record_id = NEW.record_id AND x.id <> NEW.id AND x.status = 'confirmed'
      AND x.valid_from <= p AND (x.valid_to IS NULL OR p < x.valid_to);
    IF total > 100 THEN
      RAISE EXCEPTION 'OWNERSHIP_OVER_100: shares of this record would total % on %', total, p USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_record_ownership BEFORE INSERT OR UPDATE OR DELETE ON public.record_ownerships
  FOR EACH ROW EXECUTE FUNCTION public.guard_record_ownership();

-- RLS helpers (definer, so the policies do not recurse into their own tables).
-- A register record is visible to its administrator, to every account holding a CONFIRMED share of it,
-- and to P2 grantees ('view') of the registering company or of a confirmed owning company (personal
-- and unknown-legacy entities are never shared this way).
CREATE FUNCTION public.p5_can_read_register_record(_record uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.register_records r WHERE r.id = _record AND r.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.record_ownerships x WHERE x.record_id = _record AND x.status = 'confirmed' AND x.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.legal_entities e
               WHERE e.kind NOT IN ('individual_personal', 'legacy_unknown')
                 AND (e.id = (SELECT r.legal_entity_id FROM public.register_records r WHERE r.id = _record)
                      OR e.id IN (SELECT x.owning_entity_id FROM public.record_ownerships x WHERE x.record_id = _record AND x.status = 'confirmed'))
                 AND public.has_permission(e.owner_id, e.entity_key, 'view')))
$$;

-- Registers a shared property/asset in one of the caller's active entities and issues its readable
-- number in that entity's scope. Idempotent per (caller, kind, legacy id). Assistant sessions refused.
CREATE FUNCTION public.register_shared_record(_kind text, _entity uuid, _label text, _legacy_id text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); rid uuid;
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Sign in with your account to register records'; END IF;
  IF _kind IS NULL OR _kind NOT IN ('property', 'asset') THEN RAISE EXCEPTION 'Record kind must be property or asset' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.legal_entities e WHERE e.id = _entity AND e.owner_id = uid AND e.archived_at IS NULL) THEN
    RAISE EXCEPTION 'Choose one of your active legal entities' USING ERRCODE = 'P0002';
  END IF;
  IF nullif(btrim(coalesce(_legacy_id, '')), '') IS NOT NULL THEN
    SELECT r.id INTO rid FROM public.register_records r WHERE r.owner_id = uid AND r.record_kind = _kind AND r.legacy_id = btrim(_legacy_id);
    IF FOUND THEN RETURN rid; END IF;
  END IF;
  INSERT INTO public.register_records(owner_id, record_kind, legal_entity_id, label, legacy_id, source, created_by)
  VALUES (uid, _kind, _entity, left(btrim(coalesce(_label, '')), 300), nullif(btrim(coalesce(_legacy_id, '')), ''),
          jsonb_build_object('from', 'register_shared_record', 'captured_at', clock_timestamp()), uid)
  RETURNING id INTO rid;
  RETURN rid;
END $$;

-- Archive (never delete) a register record; number, shares and history stay. Step-up guarded.
CREATE FUNCTION public.archive_register_record(_id uuid, _reason text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Sign in with your account to archive'; END IF;
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN RAISE EXCEPTION 'Give a reason for archiving' USING ERRCODE = '22023'; END IF;
  UPDATE public.register_records SET archived_at = clock_timestamp(), archived_by = uid, archive_reason = btrim(_reason)
  WHERE id = _id AND owner_id = uid AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active register record not found' USING ERRCODE = 'P0002'; END IF;
END $$;

-- Requests (or, for the record administrator, records) the caller's entity share of a register record
-- from a date. Step-up guarded (P4 wrapper).
CREATE FUNCTION public.record_ownership_share(_record uuid, _entity uuid, _pct numeric, _from date, _evidence uuid, _note text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); rec public.register_records; rid uuid; admin boolean;
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Sign in with your account to record ownership'; END IF;
  IF _record IS NULL OR _from IS NULL OR _from IN ('infinity'::date, '-infinity'::date) THEN RAISE EXCEPTION 'Record and start date are required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO rec FROM public.register_records r WHERE r.id = _record;
  IF NOT FOUND OR rec.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Active register record not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.legal_entities e WHERE e.id = _entity AND e.owner_id = uid AND e.archived_at IS NULL) THEN
    RAISE EXCEPTION 'Owning entity must be one of your active legal entities' USING ERRCODE = 'P0002';
  END IF;
  admin := rec.owner_id = uid;
  INSERT INTO public.record_ownerships(record_id, owner_id, owning_entity_id, share_pct, valid_from, status, decided_at, decided_by,
                                       evidence_document_id, note, source, created_by)
  VALUES (_record, uid, _entity, _pct, _from, CASE WHEN admin THEN 'confirmed' ELSE 'pending' END,
          CASE WHEN admin THEN clock_timestamp() END, CASE WHEN admin THEN uid END, _evidence, nullif(btrim(coalesce(_note, '')), ''),
          jsonb_build_object('from', 'record_ownership_share', 'captured_at', clock_timestamp()), uid)
  RETURNING id INTO rid;
  RETURN rid;
END $$;

-- The record administrator confirms (counted from then on, <= 100% enforced) or rejects a pending share.
CREATE FUNCTION public.decide_ownership_share(_id uuid, _confirm boolean) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Sign in with your account to decide ownership'; END IF;
  IF _confirm IS NULL THEN RAISE EXCEPTION 'Confirm or reject' USING ERRCODE = '22023'; END IF;
  UPDATE public.record_ownerships x SET status = CASE WHEN _confirm THEN 'confirmed' ELSE 'rejected' END, decided_at = clock_timestamp(), decided_by = uid
  WHERE x.id = _id AND x.status = 'pending'
    AND EXISTS (SELECT 1 FROM public.register_records r WHERE r.id = x.record_id AND r.owner_id = uid AND r.archived_at IS NULL);
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending ownership share not found' USING ERRCODE = 'P0002'; END IF;
END $$;

-- The share's own account ends its confirmed share (sale, transfer); the row stays as history.
CREATE FUNCTION public.end_ownership_share(_id uuid, _valid_to date) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Sign in with your account to end ownership'; END IF;
  IF _valid_to IS NULL OR _valid_to IN ('infinity'::date, '-infinity'::date) THEN RAISE EXCEPTION 'Choose the end date' USING ERRCODE = '22023'; END IF;
  UPDATE public.record_ownerships SET valid_to = _valid_to WHERE id = _id AND owner_id = uid AND status = 'confirmed' AND valid_to IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Open ownership share not found' USING ERRCODE = 'P0002'; END IF;
END $$;

-- legal_entities: archive only (every role, including definer functions and the service role).
CREATE FUNCTION public.guard_legal_entity_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('ledgerline.erasing', true) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Legal entities are never deleted; archive instead' USING ERRCODE = '42501';
  END IF;
  IF (NEW.id, NEW.owner_id, NEW.entity_key, NEW.kind, NEW.legal_name, NEW.pan, NEW.registration_no, NEW.gstins, NEW.identifiers, NEW.source, NEW.created_at, NEW.created_by)
     IS DISTINCT FROM (OLD.id, OLD.owner_id, OLD.entity_key, OLD.kind, OLD.legal_name, OLD.pan, OLD.registration_no, OLD.gstins, OLD.identifiers, OLD.source, OLD.created_at, OLD.created_by) THEN
    RAISE EXCEPTION 'Legal entity identity is fixed in this stage; only archiving and the display code can change' USING ERRCODE = '42501';
  END IF;
  IF OLD.archived_at IS NOT NULL AND (NEW.archived_at, NEW.archived_by, NEW.archive_reason) IS DISTINCT FROM (OLD.archived_at, OLD.archived_by, OLD.archive_reason) THEN
    RAISE EXCEPTION 'An archived legal entity stays archived' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_legal_entity_change BEFORE UPDATE OR DELETE ON public.legal_entities
  FOR EACH ROW EXECUTE FUNCTION public.guard_legal_entity_change();

CREATE FUNCTION public.guard_entity_relationship_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('ledgerline.erasing', true) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Relationships are history; end them instead of deleting' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND ((NEW.id, NEW.owner_id, NEW.from_entity_id, NEW.to_entity_id, NEW.relation, NEW.pct, NEW.valid_from, NEW.evidence_document_id, NEW.note, NEW.source, NEW.created_at, NEW.created_by)
     IS DISTINCT FROM (OLD.id, OLD.owner_id, OLD.from_entity_id, OLD.to_entity_id, OLD.relation, OLD.pct, OLD.valid_from, OLD.evidence_document_id, OLD.note, OLD.source, OLD.created_at, OLD.created_by)
     OR OLD.valid_to IS NOT NULL OR NEW.valid_to IS NULL) THEN
    RAISE EXCEPTION 'A relationship can only be ended once' USING ERRCODE = '42501';
  END IF;
  IF NEW.evidence_document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id = NEW.evidence_document_id AND d.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'Evidence document not found for this owner' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_entity_relationship_change BEFORE INSERT OR UPDATE OR DELETE ON public.entity_relationships
  FOR EACH ROW EXECUTE FUNCTION public.guard_entity_relationship_change();

-- --------------------------------------------------------------------------------------------
-- 3. Generic legacy backfill framework (reused by the registers work: assets, properties, trips,
--    holdings, leases, receivables, journals). See the plan, section "Backfill framework".
-- --------------------------------------------------------------------------------------------
CREATE TABLE public.legacy_backfill_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind ~ '^[a-z][a-z_]{2,39}$'),
  source_path text NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  data_sha256 text CHECK (data_sha256 IS NULL OR data_sha256 ~ '^[0-9a-f]{64}$'),
  source_revision bigint,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb NOT NULL,
  exceptions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(exceptions) = 'array'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid NOT NULL
);
CREATE INDEX legacy_backfill_runs_owner_idx ON public.legacy_backfill_runs(owner_id, kind, created_at DESC);
COMMENT ON TABLE public.legacy_backfill_runs IS 'P5: append-only record of every committed legacy backfill (kind, source path, source sha256/revision, created counts, exceptions). Generic for every register backfill.';

CREATE FUNCTION public.guard_backfill_run_append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('ledgerline.erasing', true) = 'on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Backfill history is append-only' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER guard_backfill_run_append_only BEFORE UPDATE OR DELETE ON public.legacy_backfill_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_backfill_run_append_only();

-- sha256 of a JSON value. jsonb text output is canonical (key order and spacing normalised), so the
-- same stored value always hashes the same.
CREATE FUNCTION public.legacy_sha256(_value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT encode(sha256(convert_to(coalesce(_value, 'null'::jsonb)::text, 'UTF8')), 'hex')
$$;

-- One exception record. severity: error (blocks a link), warning (owner review), info.
CREATE FUNCTION public.legacy_exception(_code text, _severity text, _path text, _legacy_id text, _detail jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('code', _code, 'severity', _severity, 'path', _path, 'legacy_id', _legacy_id, 'detail', coalesce(_detail, '{}'::jsonb))
$$;

-- Enumerates the elements of a JSON array at _path inside _data with provenance (path text such as
-- 'books.properties[3]', legacy id = element->>_id_field, element sha256). Non-arrays yield nothing;
-- callers report them with legacy_exception(..., 'not_a_list', ...).
CREATE FUNCTION public.legacy_json_elements(_data jsonb, _path text[], _id_field text DEFAULT 'id')
RETURNS TABLE(ord int, path text, legacy_id text, element jsonb, element_sha256 text)
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT (e.i - 1)::int, array_to_string(_path, '.') || '[' || (e.i - 1) || ']',
         CASE WHEN jsonb_typeof(e.v) = 'object' AND jsonb_typeof(e.v->_id_field) = 'string' THEN e.v->>_id_field END,
         e.v, public.legacy_sha256(e.v)
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_data #> _path) = 'array' THEN _data #> _path ELSE '[]'::jsonb END) WITH ORDINALITY e(v, i)
$$;

-- Compares two keyed aggregates {key: value}. Returns {identical, before_keys, after_keys, differences:[{key, before, after}]}.
CREATE FUNCTION public.legacy_compare_maps(_before jsonb, _after jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  WITH k AS (SELECT key FROM jsonb_object_keys(coalesce(_before, '{}'::jsonb)) key UNION SELECT key FROM jsonb_object_keys(coalesce(_after, '{}'::jsonb)) key),
  d AS (SELECT k.key, _before->k.key b, _after->k.key a FROM k WHERE (_before->k.key) IS DISTINCT FROM (_after->k.key))
  SELECT jsonb_build_object('identical', NOT EXISTS (SELECT 1 FROM d),
    'before_keys', (SELECT count(*) FROM jsonb_object_keys(coalesce(_before, '{}'::jsonb))),
    'after_keys', (SELECT count(*) FROM jsonb_object_keys(coalesce(_after, '{}'::jsonb))),
    'differences', coalesce((SELECT jsonb_agg(jsonb_build_object('key', d.key, 'before', d.b, 'after', d.a) ORDER BY d.key) FROM d), '[]'::jsonb))
$$;

-- --------------------------------------------------------------------------------------------
-- 4. Resolution: text entity keys -> legal entity (dual read). Internal helpers, no client EXECUTE.
-- --------------------------------------------------------------------------------------------
CREATE FUNCTION public.p5_personal_entity(_owner uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT e.id FROM public.legal_entities e WHERE e.owner_id = _owner AND e.kind = 'individual_personal'
$$;

-- Companies that the legacy JSON books.entityAccounts lists an account under, exactly like the app's
-- ownerOf scan. jsonb stores object keys in its own canonical order (not the app's insertion order),
-- so an account listed under several companies returns every key: ambiguous, never linked, but every
-- one counts for closed periods.
CREATE FUNCTION public.p5_json_account_keys(_entity_accounts jsonb, _account uuid) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN _account IS NULL OR jsonb_typeof(_entity_accounts) IS DISTINCT FROM 'object' THEN '{}'::text[]
    ELSE coalesce((SELECT array_agg(j.key ORDER BY j.key) FROM jsonb_each(_entity_accounts) j
                   WHERE jsonb_typeof(j.value) = 'array' AND j.value ? _account::text), '{}') END
$$;

-- Candidate entity keys of an account on a date ({} = personal). A dated assignment, when the account
-- has any, is authoritative for the link column (one key, or {} for personal / outside every range).
-- Otherwise the legacy JSON snapshot is read (p5_json_account_keys).
CREATE FUNCTION public.p5_account_entity_keys(_owner uuid, _account uuid, _on date, _entity_accounts jsonb DEFAULT NULL) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE k text; eam jsonb := _entity_accounts;
BEGIN
  IF _account IS NULL OR _owner IS NULL THEN RETURN '{}'; END IF;
  IF EXISTS (SELECT 1 FROM public.account_entity_assignments a WHERE a.account_id = _account AND a.owner_id = _owner) THEN
    SELECT CASE WHEN e.kind = 'individual_personal' THEN NULL ELSE e.entity_key END INTO k
    FROM public.account_entity_assignments a JOIN public.legal_entities e ON e.owner_id = a.owner_id AND e.id = a.entity_id
    WHERE a.account_id = _account AND a.owner_id = _owner AND a.valid_from <= coalesce(_on, 'infinity'::date)
      AND (a.valid_to IS NULL OR coalesce(_on, 'infinity'::date) < a.valid_to)
    LIMIT 1;
    RETURN CASE WHEN k IS NULL THEN '{}'::text[] ELSE ARRAY[k] END;
  END IF;
  IF eam IS NULL THEN SELECT p.data->'books'->'entityAccounts' INTO eam FROM public.finance_preferences p WHERE p.owner_id = _owner; END IF;
  RETURN public.p5_json_account_keys(eam, _account);
END $$;

-- Candidate keys of a ledger entry, same rule as effectiveEntity (src/lib/books/entity-accounts.ts):
-- a hand-picked company (entity_source 'manual') wins; otherwise the paying account's company.
CREATE FUNCTION public.p5_expense_entity_keys(_owner uuid, _source text, _entity text, _account uuid, _on date, _entity_accounts jsonb DEFAULT NULL) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN _source = 'manual' THEN CASE WHEN nullif(_entity, '') IS NULL THEN '{}'::text[] ELSE ARRAY[_entity] END
              ELSE public.p5_account_entity_keys(_owner, _account, _on, _entity_accounts) END
$$;

-- Candidate keys -> legal entity id. {} -> the owner's personal entity; one key -> that entity (archived
-- entities still resolve: history keeps its link); several keys or an unknown key -> NULL (unresolved,
-- reported). Before the backfill (no personal entity yet) everything is NULL.
CREATE FUNCTION public.p5_entity_for_keys(_owner uuid, _keys text[]) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN public.p5_personal_entity(_owner) IS NULL THEN NULL
    WHEN cardinality(coalesce(_keys, '{}')) = 0 THEN public.p5_personal_entity(_owner)
    WHEN cardinality(_keys) = 1 THEN (SELECT e.id FROM public.legal_entities e WHERE e.owner_id = _owner AND e.entity_key = _keys[1])
  END
$$;

-- BEFORE INSERT OR UPDATE on expenses, documents and opening_postings. Named zy_ so it runs after
-- every applied BEFORE trigger and before P1's zz_ guards (which never look at this column).
-- Never raises for a valid row; never changes any other column except: an UPDATE whose only effect is
-- this link keeps expenses.correction_revision (a link is not a correction; 0041 bumps it on every update).
CREATE FUNCTION public.p5_link_legal_entity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME = 'expenses' THEN
    IF TG_OP = 'UPDATE' AND (NEW.employee_id, NEW.entity_source, NEW.entity_id, NEW.account_id, NEW.expense_date, NEW.legal_entity_id)
       IS NOT DISTINCT FROM (OLD.employee_id, OLD.entity_source, OLD.entity_id, OLD.account_id, OLD.expense_date, OLD.legal_entity_id) THEN
      RETURN NEW;
    END IF;
    NEW.legal_entity_id := public.p5_entity_for_keys(NEW.employee_id,
      public.p5_expense_entity_keys(NEW.employee_id, NEW.entity_source, NEW.entity_id, NEW.account_id, NEW.expense_date));
    IF TG_OP = 'UPDATE' AND NEW.legal_entity_id IS DISTINCT FROM OLD.legal_entity_id
       AND (to_jsonb(NEW) - ARRAY['legal_entity_id', 'correction_revision']) = (to_jsonb(OLD) - ARRAY['legal_entity_id', 'correction_revision']) THEN
      NEW.correction_revision := OLD.correction_revision;
    END IF;
  ELSE
    IF TG_OP = 'UPDATE' AND (NEW.owner_id, NEW.entity_id, NEW.legal_entity_id) IS NOT DISTINCT FROM (OLD.owner_id, OLD.entity_id, OLD.legal_entity_id) THEN
      RETURN NEW;
    END IF;
    NEW.legal_entity_id := public.p5_entity_for_keys(NEW.owner_id,
      CASE WHEN nullif(NEW.entity_id, '') IS NULL THEN '{}'::text[] ELSE ARRAY[NEW.entity_id] END);
  END IF;
  RETURN NEW;
END $$;

ALTER TABLE public.expenses ADD COLUMN legal_entity_id uuid;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_legal_entity_fk FOREIGN KEY (employee_id, legal_entity_id) REFERENCES public.legal_entities(owner_id, id);
ALTER TABLE public.documents ADD COLUMN legal_entity_id uuid;
ALTER TABLE public.documents ADD CONSTRAINT documents_legal_entity_fk FOREIGN KEY (owner_id, legal_entity_id) REFERENCES public.legal_entities(owner_id, id);
ALTER TABLE public.opening_postings ADD COLUMN legal_entity_id uuid;
ALTER TABLE public.opening_postings ADD CONSTRAINT opening_postings_legal_entity_fk FOREIGN KEY (owner_id, legal_entity_id) REFERENCES public.legal_entities(owner_id, id);
COMMENT ON COLUMN public.expenses.legal_entity_id IS 'P5: legal entity of this entry, resolved from entity_id (manual) or the dated account assignment / legacy entityAccounts; NULL = not yet backfilled or unresolved. Never written by clients (trigger).';
COMMENT ON COLUMN public.documents.legal_entity_id IS 'P5: legal entity of this document, resolved from entity_id (NULL entity_id = owner personal). Trigger-maintained.';
COMMENT ON COLUMN public.opening_postings.legal_entity_id IS 'P5: legal entity of this opening posting, resolved from entity_id. Trigger-maintained.';

CREATE TRIGGER zy_p5_link_legal_entity BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.p5_link_legal_entity();
CREATE TRIGGER zy_p5_link_legal_entity BEFORE INSERT OR UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.p5_link_legal_entity();
CREATE TRIGGER zy_p5_link_legal_entity BEFORE INSERT OR UPDATE ON public.opening_postings FOR EACH ROW EXECUTE FUNCTION public.p5_link_legal_entity();

-- --------------------------------------------------------------------------------------------
-- 5. Entity-aware closed periods (DN-P3-8 B; inventory finding 6, risk R11)
-- --------------------------------------------------------------------------------------------
-- 0083 ll_closed_on, with one change: an empty entityId means "every entity", as the app treats it
-- (accounting-journal.ts: !p.entityId || p.entityId === j.entityId). Same signature/volatility.
CREATE OR REPLACE FUNCTION public.ll_closed_on(_periods jsonb, _date text, _entity text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT _date IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_periods)='array' THEN _periods ELSE '[]'::jsonb END) p
    WHERE left(_date,10) BETWEEN p->>'from' AND p->>'to' AND (nullif(p->>'entityId','') IS NULL OR p->>'entityId' IS NOT DISTINCT FROM _entity));
$$;

-- True when a ledger entry dated _d touches a closed period: a period without entityId closes every
-- entity (as before); a company period closes entries whose hand-picked company, paying account's company
-- or destination account's company (dated assignment or legacy JSON link) is that company. Malformed
-- periods are ignored exactly as in 0058.
-- Each closed result was also closed under 0058, so no entry that 0058 accepted is refused.
CREATE FUNCTION public.p5_entry_closed(_owner uuid, _periods jsonb, _entity_accounts jsonb, _d date, _source text, _entity text, _account uuid, _to_account uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p jsonb; keys text[];
BEGIN
  IF _d IS NULL OR jsonb_typeof(_periods) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(_periods)
           WHERE (value->>'from') ~ '^\d{4}-\d{2}-\d{2}$' AND (value->>'to') ~ '^\d{4}-\d{2}-\d{2}$'
             AND _d BETWEEN (value->>'from')::date AND (value->>'to')::date LOOP
    IF nullif(p->>'entityId', '') IS NULL THEN RETURN true; END IF;
    IF keys IS NULL THEN
      -- Conservative during dual-read: the dated assignment AND the legacy JSON link both count, so a
      -- company close is honoured whichever of the two the app currently follows.
      keys := CASE WHEN _source = 'manual' AND nullif(_entity, '') IS NOT NULL THEN ARRAY[_entity] ELSE '{}'::text[] END
        || public.p5_account_entity_keys(_owner, _account, _d, _entity_accounts)
        || public.p5_account_entity_keys(_owner, _to_account, _d, _entity_accounts)
        || public.p5_json_account_keys(_entity_accounts, _account)
        || public.p5_json_account_keys(_entity_accounts, _to_account);
    END IF;
    IF p->>'entityId' = ANY (keys) THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END $$;

-- 0058 guard_closed_period with the entity check. Same name, trigger, SECURITY mode, early exits and
-- error message (the app matches on it).
CREATE OR REPLACE FUNCTION public.guard_closed_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  owner uuid := COALESCE(NEW.employee_id, OLD.employee_id);
  periods jsonb;
  eam jsonb;
BEGIN
  IF auth.uid() IS NULL OR current_setting('ledgerline.erasing', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.amount IS NOT DISTINCT FROM OLD.amount AND NEW.expense_date IS NOT DISTINCT FROM OLD.expense_date
     AND NEW.category IS NOT DISTINCT FROM OLD.category AND NEW.txn_type IS NOT DISTINCT FROM OLD.txn_type
     AND NEW.account_id IS NOT DISTINCT FROM OLD.account_id AND NEW.to_account_id IS NOT DISTINCT FROM OLD.to_account_id
     AND NEW.original_amount IS NOT DISTINCT FROM OLD.original_amount AND NEW.currency IS NOT DISTINCT FROM OLD.currency
     AND NEW.scope IS NOT DISTINCT FROM OLD.scope AND NEW.allocations IS NOT DISTINCT FROM OLD.allocations THEN
    RETURN NEW;
  END IF;
  SELECT data->'books'->'closedPeriods', data->'books'->'entityAccounts' INTO periods, eam FROM public.finance_preferences WHERE owner_id = owner;
  IF periods IS NULL OR jsonb_typeof(periods) <> 'array' OR jsonb_array_length(periods) = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP <> 'INSERT' AND public.p5_entry_closed(owner, periods, eam, OLD.expense_date, OLD.entity_source, OLD.entity_id, OLD.account_id, OLD.to_account_id) THEN
    RAISE EXCEPTION 'Entries dated % are in a closed period. Reopen it on the Audit page first.', OLD.expense_date USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP <> 'DELETE' AND public.p5_entry_closed(owner, periods, eam, NEW.expense_date, NEW.entity_source, NEW.entity_id, NEW.account_id, NEW.to_account_id) THEN
    RAISE EXCEPTION 'Entries dated % are in a closed period. Reopen it on the Audit page first.', NEW.expense_date USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

-- Company of an asset as the app stores it: ownerEntityId (src/lib/assets.ts:18); entityId only as a
-- fallback for older records. NULL when the list has no such asset or it has no company.
CREATE FUNCTION public.p5_asset_entity_key(_assets jsonb, _asset_id text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT nullif(coalesce(nullif(x->>'ownerEntityId', ''), x->>'entityId'), '')
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_assets) = 'array' THEN _assets ELSE '[]'::jsonb END) x
  WHERE x->>'id' = _asset_id LIMIT 1
$$;

-- Closed for the asset's company before OR after this write (an asset moved to another company in the
-- same save cannot take a closed journal or event with it). Without a company: periods without
-- entityId only, exactly as 0083 behaved for every asset.
CREATE FUNCTION public.p5_asset_closed(_periods jsonb, _date text, _new_assets jsonb, _old_assets jsonb, _asset_id text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT public.ll_closed_on(_periods, _date, public.p5_asset_entity_key(_new_assets, _asset_id))
      OR public.ll_closed_on(_periods, _date, public.p5_asset_entity_key(_old_assets, _asset_id))
$$;

-- 0083 guard_journals_rules; only the three closed checks change (x->>'entityId' of NEW assets -> p5_asset_closed).
CREATE OR REPLACE FUNCTION public.guard_journals_rules() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  periods jsonb := NEW.data->'books'->'closedPeriods';
  oj jsonb := CASE WHEN jsonb_typeof(OLD.data->'books'->'journals')='array' THEN OLD.data->'books'->'journals' ELSE '[]'::jsonb END;
  nj jsonb := CASE WHEN jsonb_typeof(NEW.data->'books'->'journals')='array' THEN NEW.data->'books'->'journals' ELSE '[]'::jsonb END;
  oe jsonb := CASE WHEN jsonb_typeof(OLD.data->'books'->'assetEvents')='array' THEN OLD.data->'books'->'assetEvents' ELSE '[]'::jsonb END;
  ne jsonb := CASE WHEN jsonb_typeof(NEW.data->'books'->'assetEvents')='array' THEN NEW.data->'books'->'assetEvents' ELSE '[]'::jsonb END;
  orl jsonb := CASE WHEN jsonb_typeof(OLD.data->'books'->'rules')='array' THEN OLD.data->'books'->'rules' ELSE '[]'::jsonb END;
  nrl jsonb := CASE WHEN jsonb_typeof(NEW.data->'books'->'rules')='array' THEN NEW.data->'books'->'rules' ELSE '[]'::jsonb END;
  a jsonb; b jsonb; fin text[] := ARRAY['capitalised','impairment','revaluation','disposal'];
BEGIN
  IF current_setting('ledgerline.erasing',true)='on' THEN RETURN NEW; END IF;
  FOR a IN SELECT value FROM jsonb_array_elements(oj) LOOP
    SELECT value INTO b FROM jsonb_array_elements(nj) WHERE value->>'id'=a->>'id' LIMIT 1;
    IF b IS NOT DISTINCT FROM a THEN CONTINUE; END IF;
    IF a->>'status'='posted' THEN RAISE EXCEPTION 'Posted journal % cannot be changed or removed', a->>'id' USING ERRCODE='23514'; END IF;
    IF public.p5_asset_closed(periods,(a->>'period')||'-28',NEW.data->'assets',OLD.data->'assets',a->>'assetId') THEN RAISE EXCEPTION 'Journal % is in a closed period; reopen it first', a->>'id' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOR b IN SELECT value FROM jsonb_array_elements(nj) LOOP
    SELECT value INTO a FROM jsonb_array_elements(oj) WHERE value->>'id'=b->>'id' LIMIT 1;
    IF a IS NOT DISTINCT FROM b THEN CONTINUE; END IF;
    IF public.p5_asset_closed(periods,(b->>'period')||'-28',NEW.data->'assets',OLD.data->'assets',b->>'assetId') THEN RAISE EXCEPTION 'Journal % is in a closed period; reopen it first', b->>'id' USING ERRCODE='23514'; END IF;
    IF b->>'status'='posted' AND (b->>'postedOn') IS NULL THEN RAISE EXCEPTION 'Posted journal % needs a posting date', b->>'id' USING ERRCODE='23514'; END IF;
    IF b->>'status'='posted' AND a IS NOT NULL AND a->>'status'='prepared' AND (a->'amount',a->'period',a->'assetId') IS DISTINCT FROM (b->'amount',b->'period',b->'assetId') THEN
      RAISE EXCEPTION 'Journal % must be posted exactly as prepared', b->>'id' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOR a IN SELECT value FROM jsonb_array_elements(oe) UNION ALL SELECT value FROM jsonb_array_elements(ne) LOOP
    IF NOT (a->>'kind' = ANY(fin)) THEN CONTINUE; END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(oe) x WHERE x=a) = (SELECT count(*) FROM jsonb_array_elements(ne) x WHERE x=a) THEN CONTINUE; END IF;
    IF public.p5_asset_closed(periods,a->>'date',NEW.data->'assets',OLD.data->'assets',a->>'assetId') THEN RAISE EXCEPTION 'Asset event % is in a closed period; reopen it first', a->>'id' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOR a IN SELECT value FROM jsonb_array_elements(orl) WHERE value->>'status' IN ('active','superseded') LOOP
    SELECT value INTO b FROM jsonb_array_elements(nrl) WHERE value->>'id'=a->>'id' LIMIT 1;
    IF b IS NULL THEN RAISE EXCEPTION 'Approved rule % cannot be removed', a->>'id' USING ERRCODE='23514'; END IF;
    IF (a->'key',a->'area',a->'value',a->'effectiveFrom',a->'approvedOn',a->'appliesTo') IS DISTINCT FROM (b->'key',b->'area',b->'value',b->'effectiveFrom',b->'approvedOn',b->'appliesTo') THEN
      RAISE EXCEPTION 'Approved rule % cannot be edited; propose a new version', a->>'id' USING ERRCODE='23514'; END IF;
    IF NOT (b->>'status'=a->>'status' OR (a->>'status'='active' AND b->>'status'='superseded')) THEN RAISE EXCEPTION 'Approved rule % cannot change to %', a->>'id', b->>'status' USING ERRCODE='23514'; END IF;
    IF a->>'effectiveTo' IS NOT NULL AND b->'effectiveTo' IS DISTINCT FROM a->'effectiveTo' THEN RAISE EXCEPTION 'Rule % end date is fixed', a->>'id' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOR b IN SELECT value FROM jsonb_array_elements(nrl) WHERE value->>'status'='active' LOOP
    SELECT value INTO a FROM jsonb_array_elements(orl) WHERE value->>'id'=b->>'id' LIMIT 1;
    IF a IS NOT NULL AND a->>'status'='active' THEN CONTINUE; END IF;
    IF a IS NOT NULL AND a->>'status' IS DISTINCT FROM 'proposed' THEN RAISE EXCEPTION 'Only a proposed rule can be activated' USING ERRCODE='23514'; END IF;
    IF (b->>'approvedOn') IS NULL THEN RAISE EXCEPTION 'Rule % needs an approval date to activate', b->>'id' USING ERRCODE='23514'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b->'tests')='array' THEN b->'tests' ELSE '[]'::jsonb END) t WHERE (t->>'passed') IS DISTINCT FROM 'true') THEN
      RAISE EXCEPTION 'Rule % has failing checks and cannot be activated', b->>'id' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NEW;
END $$;

-- --------------------------------------------------------------------------------------------
-- 6. Entity backfill: plan (internal), preview, commit, compare report
-- --------------------------------------------------------------------------------------------
-- Legacy attribution as the app derives it today (effectiveEntity + ownerOf; NULL = personal). This is
-- the "before" side of every compare. jsonb keeps object keys in canonical order, not the app's
-- insertion order, so for an account listed under several companies (reported as account_linked_twice,
-- never linked) the chosen company may differ from the app's; those rows always show as differences.
CREATE FUNCTION public.p5_legacy_entry_keys(_owner uuid)
RETURNS TABLE(tbl text, row_id uuid, legacy_key text, account_id uuid, currency text, period text, txn_type text, amount numeric, original_amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH eam AS (SELECT p.data->'books'->'entityAccounts' m FROM public.finance_preferences p WHERE p.owner_id = _owner),
  owner_of AS (
    SELECT DISTINCT ON (acc.value) acc.value account, j.key entity_key
    FROM eam, jsonb_each(CASE WHEN jsonb_typeof(eam.m) = 'object' THEN eam.m ELSE '{}'::jsonb END) WITH ORDINALITY j(key, value, i),
         jsonb_array_elements_text(CASE WHEN jsonb_typeof(j.value) = 'array' THEN j.value ELSE '[]'::jsonb END) acc(value)
    ORDER BY acc.value, j.i)
  SELECT 'expenses', e.id, CASE WHEN e.entity_source = 'manual' THEN nullif(e.entity_id, '') ELSE o.entity_key END,
         e.account_id, e.currency, to_char(e.expense_date, 'YYYY-MM'), e.txn_type, e.amount, e.original_amount
  FROM public.expenses e LEFT JOIN owner_of o ON o.account = e.account_id::text
  WHERE e.employee_id = _owner
  UNION ALL
  SELECT 'documents', d.id, nullif(d.entity_id, ''), d.account_id, NULL, NULL, NULL, NULL, NULL FROM public.documents d WHERE d.owner_id = _owner
  UNION ALL
  SELECT 'opening_postings', o.id, nullif(o.entity_id, ''), NULL, NULL, o.fy, NULL, NULL, NULL FROM public.opening_postings o WHERE o.owner_id = _owner
$$;

-- The proposed backfill for one owner, computed from the RAW stored JSON (not the cleaned app view).
CREATE FUNCTION public.p5_entity_backfill_plan(_owner uuid, _archive_orphans boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  pr record; data jsonb; ents jsonb; eam jsonb; src_sha text;
  ex jsonb := '[]'; out_ents jsonb := '[]'; orphan_ents jsonb := '[]'; out_asg jsonb := '[]'; hints jsonb := '[]';
  valid_keys text[] := '{}'; bad_keys text[] := '{}'; el record; r record; k text; kind text; existing public.legal_entities;
  dup_n int; dup_same boolean; first_ord int; action text; acc uuid; acc_name text; linked_to text[]; earliest date;
  cur_key text; personal jsonb; links jsonb := '{}'; t text; kinds text[] := ARRAY['individual', 'huf', 'proprietorship', 'partnership', 'llp', 'company', 'trust', 'organisation'];
  intake_keys text[];
BEGIN
  SELECT p.data, p.revision INTO pr FROM public.finance_preferences p WHERE p.owner_id = _owner;
  data := coalesce(pr.data, '{}'::jsonb);
  ents := data->'entities';
  eam := data->'books'->'entityAccounts';
  src_sha := public.legacy_sha256(jsonb_build_object('entities', coalesce(ents, 'null'::jsonb), 'entityAccounts', coalesce(eam, 'null'::jsonb)));
  IF ents IS NOT NULL AND jsonb_typeof(ents) NOT IN ('array', 'null') THEN
    ex := ex || public.legacy_exception('entities_not_a_list', 'error', 'entities', NULL, jsonb_build_object('type', jsonb_typeof(ents)));
  END IF;
  IF eam IS NOT NULL AND jsonb_typeof(eam) NOT IN ('object', 'null') THEN
    ex := ex || public.legacy_exception('entity_accounts_not_an_object', 'error', 'books.entityAccounts', NULL, jsonb_build_object('type', jsonb_typeof(eam)));
  END IF;
  SELECT coalesce(array_agg(x.id::text), '{}') INTO intake_keys FROM (
    SELECT d.id FROM public.document_runs d WHERE d.owner_id = _owner UNION SELECT d.id FROM public.documents d WHERE d.owner_id = _owner) x;

  -- Personal books (DN-P3-5 B): one deterministic record, never a company.
  SELECT * INTO existing FROM public.legal_entities e WHERE e.owner_id = _owner AND e.kind = 'individual_personal';
  personal := jsonb_build_object('entity_key', 'personal:' || _owner::text, 'kind', 'individual_personal',
    'legal_name', coalesce(nullif(btrim((SELECT f.full_name FROM public.profiles f WHERE f.id = _owner)), ''), 'Personal'),
    'action', CASE WHEN existing.id IS NULL THEN 'create' ELSE 'exists' END, 'readable_id', existing.readable_id);

  -- Entities
  FOR el IN SELECT * FROM public.legacy_json_elements(data, ARRAY['entities']) ORDER BY ord LOOP
    IF jsonb_typeof(el.element) <> 'object' OR el.legacy_id IS NULL OR btrim(el.legacy_id) = '' THEN
      ex := ex || public.legacy_exception('invalid_entity_record', 'error', el.path, el.legacy_id, '{}'::jsonb); CONTINUE;
    END IF;
    k := el.legacy_id;
    IF length(k) > 200 THEN
      ex := ex || public.legacy_exception('entity_key_too_long', 'error', el.path, left(k, 64), jsonb_build_object('length', length(k)));
      bad_keys := bad_keys || k; CONTINUE;
    END IF;
    IF k LIKE 'personal:%' THEN
      ex := ex || public.legacy_exception('reserved_entity_key', 'error', el.path, k, '{}'::jsonb); bad_keys := bad_keys || k; CONTINUE;
    END IF;
    SELECT count(*), bool_and(x.element = el.element), min(x.ord) INTO dup_n, dup_same, first_ord
    FROM public.legacy_json_elements(data, ARRAY['entities']) x WHERE x.legacy_id = k;
    IF dup_n > 1 AND NOT dup_same THEN
      ex := ex || public.legacy_exception('conflicting_duplicate_entity_key', 'error', el.path, k, jsonb_build_object('occurrences', dup_n));
      bad_keys := bad_keys || k; CONTINUE;
    END IF;
    IF dup_n > 1 AND el.ord <> first_ord THEN
      ex := ex || public.legacy_exception('duplicate_entity_record', 'warning', el.path, k, jsonb_build_object('same_as', format('entities[%s]', first_ord))); CONTINUE;
    END IF;
    kind := el.element->>'kind';
    IF kind IS NULL OR NOT (kind = ANY (kinds)) THEN
      ex := ex || public.legacy_exception('unknown_entity_kind', 'error', el.path, k, jsonb_build_object('kind', el.element->'kind'));
      bad_keys := bad_keys || k; CONTINUE;
    END IF;
    IF k = ANY (intake_keys) THEN
      ex := ex || public.legacy_exception('intake_run_entity_key', 'info', el.path, k,
        jsonb_build_object('note', 'Created by document intake; the key equals the intake run/document id. Kept as the permanent alias.'));
    END IF;
    SELECT * INTO existing FROM public.legal_entities e WHERE e.owner_id = _owner AND e.entity_key = k;
    action := CASE WHEN existing.id IS NULL THEN 'create' WHEN existing.source->>'element_sha256' = el.element_sha256 THEN 'exists' ELSE 'exists_source_changed' END;
    IF action = 'exists_source_changed' THEN
      ex := ex || public.legacy_exception('entity_changed_since_backfill', 'warning', el.path, k, jsonb_build_object('readable_id', existing.readable_id));
    END IF;
    out_ents := out_ents || jsonb_build_object('entity_key', k, 'kind', kind,
      'legal_name', left(coalesce(el.element->>'name', ''), 300),
      'pan', nullif(upper(btrim(coalesce(el.element->>'pan', ''))), ''),
      'registration_no', nullif(btrim(coalesce(el.element->>'regNo', '')), ''),
      'gstins', CASE WHEN jsonb_typeof(el.element->'gstins') = 'array' THEN (SELECT coalesce(jsonb_agg(upper(btrim(g))), '[]'::jsonb) FROM jsonb_array_elements_text(el.element->'gstins') g WHERE btrim(g) <> '') ELSE '[]'::jsonb END,
      'identifiers', jsonb_strip_nulls(jsonb_build_object('pan', el.element->'pan', 'gstins', el.element->'gstins', 'regNo', el.element->'regNo',
         'verified', el.element->'verified', 'incorporatedOn', el.element->'incorporatedOn', 'booksFrom', el.element->'booksFrom', 'fyEnd', el.element->'fyEnd')),
      'path', el.path, 'element_sha256', el.element_sha256, 'action', action, 'readable_id', existing.readable_id);
    valid_keys := valid_keys || k;
    -- Names of people/related parties stay labels (FND-02): listed for the owner, never linked.
    IF jsonb_typeof(el.element->'shareholding') = 'array' OR jsonb_typeof(el.element->'people') = 'array' OR jsonb_typeof(el.element->'related') = 'array' THEN
      hints := hints || jsonb_build_object('entity_key', k, 'path', el.path,
        'shareholding', coalesce(el.element->'shareholding', '[]'::jsonb), 'people', coalesce(el.element->'people', '[]'::jsonb),
        'related', coalesce(el.element->'related', '[]'::jsonb), 'action', 'none: names are not entities; record relationships explicitly');
    END IF;
  END LOOP;

  -- Possible duplicates (same PAN or same normalised name): reported, never merged.
  FOR r IN SELECT x->>'pan' pan, jsonb_agg(x->>'entity_key' ORDER BY x->>'entity_key') ks FROM jsonb_array_elements(out_ents) x
           WHERE x->>'pan' IS NOT NULL GROUP BY 1 HAVING count(*) > 1 LOOP
    ex := ex || public.legacy_exception('possible_duplicate_pan', 'info', 'entities', NULL, jsonb_build_object('pan', r.pan, 'entity_keys', r.ks,
      'note', 'A proprietorship shares its proprietor''s PAN; review, never merged automatically'));
  END LOOP;
  FOR r IN SELECT upper(regexp_replace(x->>'legal_name', '[^A-Za-z0-9]', '', 'g')) nm, jsonb_agg(x->>'entity_key' ORDER BY x->>'entity_key') ks FROM jsonb_array_elements(out_ents) x
           WHERE btrim(x->>'legal_name') <> '' GROUP BY 1 HAVING count(*) > 1 LOOP
    ex := ex || public.legacy_exception('possible_duplicate_name', 'info', 'entities', NULL, jsonb_build_object('entity_keys', r.ks));
  END LOOP;

  -- Orphan references: keys used by rows or registers with no entity record (deleted / merged companies).
  FOR r IN
    WITH refs AS (
      SELECT 'expenses.entity_id' src, e.entity_id ref_key FROM public.expenses e WHERE e.employee_id = _owner AND nullif(e.entity_id, '') IS NOT NULL
      UNION ALL SELECT 'documents.entity_id', d.entity_id FROM public.documents d WHERE d.owner_id = _owner AND nullif(d.entity_id, '') IS NOT NULL
      UNION ALL SELECT 'opening_postings.entity_id', o.entity_id FROM public.opening_postings o WHERE o.owner_id = _owner
      UNION ALL SELECT 'entity_members.entity_id', m.entity_id FROM public.entity_members m WHERE m.owner_id = _owner
      UNION ALL SELECT 'books.entityAccounts', j.key FROM jsonb_each(CASE WHEN jsonb_typeof(eam) = 'object' THEN eam ELSE '{}'::jsonb END) j
      UNION ALL SELECT 'books.closedPeriods.entityId', x.element->>'entityId' FROM public.legacy_json_elements(data, ARRAY['books', 'closedPeriods']) x WHERE nullif(x.element->>'entityId', '') IS NOT NULL
      UNION ALL SELECT 'assets.ownerEntityId', x.element->>'ownerEntityId' FROM public.legacy_json_elements(data, ARRAY['assets']) x WHERE nullif(x.element->>'ownerEntityId', '') IS NOT NULL
      UNION ALL SELECT 'books.properties.ownerEntityId', x.element->>'ownerEntityId' FROM public.legacy_json_elements(data, ARRAY['books', 'properties']) x WHERE nullif(x.element->>'ownerEntityId', '') IS NOT NULL
      UNION ALL SELECT 'books.holdings.ownerEntityId', x.element->>'ownerEntityId' FROM public.legacy_json_elements(data, ARRAY['books', 'holdings']) x WHERE nullif(x.element->>'ownerEntityId', '') IS NOT NULL
      UNION ALL SELECT 'books.fyRecords.entityId', x.element->>'entityId' FROM public.legacy_json_elements(data, ARRAY['books', 'fyRecords']) x WHERE nullif(x.element->>'entityId', '') IS NOT NULL
    )
    SELECT c.ref_key k, jsonb_object_agg(c.src, c.n) per_source FROM (SELECT refs.ref_key, refs.src, count(*) n FROM refs GROUP BY 1, 2) c
    WHERE NOT (c.ref_key = ANY (valid_keys)) GROUP BY c.ref_key ORDER BY c.ref_key
  LOOP
    IF r.k = 'self' THEN
      ex := ex || public.legacy_exception('personal_sentinel_key', 'info', NULL, r.k, jsonb_build_object('references', r.per_source,
        'note', '"self" is the legacy personal sentinel; not mapped automatically'));
    ELSIF r.k = ANY (bad_keys) THEN
      ex := ex || public.legacy_exception('reference_to_invalid_entity', 'error', NULL, left(r.k, 200), jsonb_build_object('references', r.per_source));
    ELSE
      ex := ex || public.legacy_exception('orphan_entity_reference', CASE WHEN _archive_orphans AND length(r.k) <= 200 AND r.k NOT LIKE 'personal:%' THEN 'warning' ELSE 'error' END,
        NULL, left(r.k, 200), jsonb_build_object('references', r.per_source,
          'resolution', CASE WHEN _archive_orphans AND length(r.k) <= 200 AND r.k NOT LIKE 'personal:%' THEN 'archived unknown legacy entity (owner-confirmed option)' ELSE 'none: unresolved until the owner confirms' END));
      IF _archive_orphans AND length(r.k) <= 200 AND r.k NOT LIKE 'personal:%' THEN
        SELECT * INTO existing FROM public.legal_entities e WHERE e.owner_id = _owner AND e.entity_key = r.k;
        orphan_ents := orphan_ents || jsonb_build_object('entity_key', r.k, 'kind', 'legacy_unknown', 'legal_name', 'Unknown legacy entity',
          'references', r.per_source, 'action', CASE WHEN existing.id IS NULL THEN 'create' ELSE 'exists' END, 'readable_id', existing.readable_id);
        valid_keys := valid_keys || r.k;
      END IF;
    END IF;
  END LOOP;

  -- Account links from books.entityAccounts (current snapshot), frozen from '-infinity'.
  FOR r IN SELECT j.key ek, j.value v, a.value acc_txt, a.i - 1 ai
           FROM jsonb_each(CASE WHEN jsonb_typeof(eam) = 'object' THEN eam ELSE '{}'::jsonb END) j
           LEFT JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(j.value) = 'array' THEN j.value ELSE '[]'::jsonb END) WITH ORDINALITY a(value, i) ON true
           ORDER BY j.key, a.i LOOP
    t := format('books.entityAccounts.%s', r.ek) || CASE WHEN r.ai IS NULL THEN '' ELSE format('[%s]', r.ai) END;
    IF jsonb_typeof(r.v) <> 'array' THEN
      ex := ex || public.legacy_exception('account_list_not_a_list', 'error', t, r.ek, '{}'::jsonb); CONTINUE;
    END IF;
    IF r.acc_txt IS NULL THEN CONTINUE; END IF;
    IF jsonb_typeof(r.acc_txt) <> 'string' OR (r.acc_txt #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      ex := ex || public.legacy_exception('invalid_account_id', 'error', t, r.ek, jsonb_build_object('value', r.acc_txt)); CONTINUE;
    END IF;
    acc := (r.acc_txt #>> '{}')::uuid;
    SELECT a.name INTO acc_name FROM public.accounts a WHERE a.id = acc AND a.owner_id = _owner;
    IF NOT FOUND THEN
      ex := ex || public.legacy_exception('unknown_account', 'error', t, r.ek, jsonb_build_object('account_id', acc)); CONTINUE;
    END IF;
    SELECT array_agg(DISTINCT j.key ORDER BY j.key) INTO linked_to FROM jsonb_each(eam) j
    WHERE jsonb_typeof(j.value) = 'array' AND j.value ? acc::text;
    IF cardinality(linked_to) > 1 THEN
      ex := ex || public.legacy_exception('account_linked_twice', 'error', t, r.ek, jsonb_build_object('account_id', acc, 'entity_keys', to_jsonb(linked_to),
        'note', 'Entries on this account stay unresolved until the owner chooses one company'));
      CONTINUE;
    END IF;
    IF NOT (r.ek = ANY (valid_keys)) THEN
      ex := ex || public.legacy_exception(CASE WHEN r.ek = ANY (bad_keys) THEN 'link_to_invalid_entity' ELSE 'link_to_orphan_entity' END, 'error', t, r.ek,
        jsonb_build_object('account_id', acc));
      CONTINUE;
    END IF;
    SELECT min(e.expense_date) INTO earliest FROM public.expenses e WHERE e.employee_id = _owner AND (e.account_id = acc OR e.to_account_id = acc);
    IF EXISTS (SELECT 1 FROM public.account_entity_assignments a WHERE a.owner_id = _owner AND a.account_id = acc) THEN
      SELECT le.entity_key INTO cur_key FROM public.account_entity_assignments a JOIN public.legal_entities le ON le.owner_id = a.owner_id AND le.id = a.entity_id
      WHERE a.owner_id = _owner AND a.account_id = acc AND a.valid_to IS NULL;
      action := CASE WHEN cur_key IS NOT DISTINCT FROM r.ek THEN 'exists' ELSE 'exists_different' END;
      IF action = 'exists_different' THEN
        ex := ex || public.legacy_exception('account_assignment_differs', 'warning', t, r.ek, jsonb_build_object('account_id', acc, 'current_entity_key', cur_key));
      END IF;
    ELSE action := 'create';
    END IF;
    out_asg := out_asg || jsonb_build_object('account_id', acc, 'account_name', acc_name, 'entity_key', r.ek, 'valid_from', '-infinity',
      'earliest_ledger_date', earliest, 'path', t, 'action', action);
  END LOOP;

  -- What linking will do (the same key rule the link trigger applies after the commit).
  FOR t IN SELECT unnest(ARRAY['expenses', 'documents', 'opening_postings']) LOOP
    WITH rws AS (
      SELECT e.legal_entity_id IS NOT NULL linked, public.p5_expense_entity_keys(_owner, e.entity_source, e.entity_id, e.account_id, e.expense_date, eam) keys
      FROM public.expenses e WHERE t = 'expenses' AND e.employee_id = _owner
      UNION ALL
      SELECT d.legal_entity_id IS NOT NULL, CASE WHEN nullif(d.entity_id, '') IS NULL THEN '{}'::text[] ELSE ARRAY[d.entity_id] END
      FROM public.documents d WHERE t = 'documents' AND d.owner_id = _owner
      UNION ALL
      SELECT o.legal_entity_id IS NOT NULL, CASE WHEN nullif(o.entity_id, '') IS NULL THEN '{}'::text[] ELSE ARRAY[o.entity_id] END
      FROM public.opening_postings o WHERE t = 'opening_postings' AND o.owner_id = _owner),
    c AS (SELECT linked, keys, CASE WHEN cardinality(keys) = 0 THEN 'personal'
                                    WHEN cardinality(keys) = 1 AND keys[1] = ANY (valid_keys) THEN 'entity' ELSE 'unresolved' END how FROM rws)
    SELECT links || jsonb_build_object(t, jsonb_build_object(
      'total', (SELECT count(*) FROM c),
      'already_linked', (SELECT count(*) FROM c WHERE linked),
      'to_personal', (SELECT count(*) FROM c WHERE NOT linked AND how = 'personal'),
      'to_entity', (SELECT coalesce(jsonb_object_agg(s.k, s.n), '{}'::jsonb) FROM (SELECT keys[1] k, count(*) n FROM c WHERE NOT linked AND how = 'entity' GROUP BY 1) s),
      'unresolved', (SELECT count(*) FROM c WHERE NOT linked AND how = 'unresolved'),
      'unresolved_keys', (SELECT coalesce(jsonb_object_agg(s.k, s.n), '{}'::jsonb) FROM (SELECT array_to_string(keys, '|') k, count(*) n FROM c WHERE NOT linked AND how = 'unresolved' GROUP BY 1) s)))
    INTO links;
  END LOOP;

  RETURN jsonb_build_object(
    'kind', 'legal_entities', 'owner_id', _owner, 'source_path', 'finance_preferences.data{entities,books.entityAccounts}',
    'source_sha256', src_sha, 'data_sha256', public.legacy_sha256(data), 'source_revision', pr.revision,
    'archive_orphans', coalesce(_archive_orphans, false),
    'personal', personal, 'entities', out_ents, 'orphan_entities', orphan_ents, 'account_assignments', out_asg,
    'links', links, 'relationship_hints', hints, 'exceptions', ex,
    'counts', jsonb_build_object(
      'source_entities', CASE WHEN jsonb_typeof(ents) = 'array' THEN jsonb_array_length(ents) ELSE 0 END,
      'entities_to_create', (SELECT count(*) FROM jsonb_array_elements(out_ents) x WHERE x->>'action' = 'create')
         + (SELECT count(*) FROM jsonb_array_elements(orphan_ents) x WHERE x->>'action' = 'create') + CASE WHEN personal->>'action' = 'create' THEN 1 ELSE 0 END,
      'assignments_to_create', (SELECT count(*) FROM jsonb_array_elements(out_asg) x WHERE x->>'action' = 'create'),
      'errors', (SELECT count(*) FROM jsonb_array_elements(ex) x WHERE x->>'severity' = 'error'),
      'warnings', (SELECT count(*) FROM jsonb_array_elements(ex) x WHERE x->>'severity' = 'warning')));
END $$;

-- Read-only preview for the signed-in owner. Assistant sessions are refused (P4 wrapper).
-- SECURITY DEFINER because it must read the raw stored JSON and the owner's rows exactly, with
-- every query filtered to auth.uid(): RLS would also show company-member/team rows of OTHER owners.
CREATE FUNCTION public.preview_entity_backfill(_archive_orphans boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.finance_preferences p WHERE p.owner_id = uid) THEN RAISE EXCEPTION 'Owner preferences not found'; END IF;
  RETURN public.p5_entity_backfill_plan(uid, coalesce(_archive_orphans, false));
END $$;

-- Commits a preview. Refuses when entities or account links changed since the preview (optimistic
-- check on source_sha256). Idempotent per (owner, entity_key) and per account; fills only new tables
-- and NULL legal_entity_id columns; never changes an existing value. Step-up guarded (P4 wrapper).
CREATE FUNCTION public.commit_entity_backfill(_source_sha256 text, _archive_orphans boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  uid uuid := auth.uid(); plan jsonb; x jsonb; eid uuid; k int; n_ent int := 0; n_asg int := 0;
  linked jsonb := '{}'; failed jsonb := '[]'; r record; t text; n int; run uuid := gen_random_uuid(); summary jsonb;
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Sign in with your account to link companies'; END IF;
  IF _source_sha256 IS NULL OR _source_sha256 !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Preview the backfill first' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0)); -- same lock as save_reviewed_preferences
  PERFORM 1 FROM public.finance_preferences p WHERE p.owner_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Owner preferences not found'; END IF;
  plan := public.p5_entity_backfill_plan(uid, coalesce(_archive_orphans, false));
  IF plan->>'source_sha256' IS DISTINCT FROM _source_sha256 THEN
    RAISE EXCEPTION 'BACKFILL_SOURCE_CHANGED: companies or account links changed since the preview; preview again' USING ERRCODE = '40001';
  END IF;

  -- 1. Personal entity first (ENT-000001 for a fresh owner), then entities in stored order. Inserts
  --    happen only for plan actions 'create' (computed under the locks above): a conflicting insert
  --    would still fire the BEFORE trigger and spend a readable number on a row that never exists.
  IF plan->'personal'->>'action' = 'create' THEN
    INSERT INTO public.legal_entities(owner_id, entity_key, kind, legal_name, source, created_by)
    VALUES (uid, 'personal:' || uid::text, 'individual_personal', plan->'personal'->>'legal_name',
            jsonb_build_object('from', 'p5_backfill', 'rule', 'DN-P3-5 B: owner personal books; legacy rows with no company', 'run_id', run, 'captured_at', clock_timestamp()), uid);
    n_ent := n_ent + 1;
  END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(plan->'entities') WITH ORDINALITY v(value, i) ORDER BY i LOOP
    CONTINUE WHEN x->>'action' <> 'create';
    INSERT INTO public.legal_entities(owner_id, entity_key, kind, legal_name, pan, registration_no, gstins, identifiers, source, created_by)
    VALUES (uid, x->>'entity_key', x->>'kind', x->>'legal_name', x->>'pan', x->>'registration_no',
            ARRAY(SELECT jsonb_array_elements_text(x->'gstins')), x->'identifiers',
            jsonb_build_object('from', 'finance_preferences', 'path', x->>'path', 'legacy_id', x->>'entity_key', 'element_sha256', x->>'element_sha256',
                               'source_sha256', plan->>'source_sha256', 'source_revision', plan->'source_revision', 'run_id', run, 'captured_at', clock_timestamp()), uid)
    ON CONFLICT (owner_id, entity_key) DO NOTHING;
    GET DIAGNOSTICS k = ROW_COUNT; n_ent := n_ent + k;
  END LOOP;
  -- Owner-confirmed option: keys of deleted/merged companies become archived "unknown legacy" entities.
  FOR x IN SELECT value FROM jsonb_array_elements(plan->'orphan_entities') WITH ORDINALITY v(value, i) ORDER BY i LOOP
    CONTINUE WHEN x->>'action' <> 'create';
    INSERT INTO public.legal_entities(owner_id, entity_key, kind, legal_name, source, created_by, archived_at, archived_by, archive_reason)
    VALUES (uid, x->>'entity_key', 'legacy_unknown', 'Unknown legacy entity',
            jsonb_build_object('from', 'orphan_reference', 'references', x->'references', 'legacy_id', x->>'entity_key',
                               'source_sha256', plan->>'source_sha256', 'run_id', run, 'captured_at', clock_timestamp()), uid,
            clock_timestamp(), uid, 'Referenced by legacy records but missing from the company list (deleted or merged)')
    ON CONFLICT (owner_id, entity_key) DO NOTHING;
    GET DIAGNOSTICS k = ROW_COUNT; n_ent := n_ent + k;
  END LOOP;

  -- 2. Account links, frozen from '-infinity' so every existing and back-dated entry keeps today's company.
  FOR x IN SELECT value FROM jsonb_array_elements(plan->'account_assignments') LOOP
    CONTINUE WHEN x->>'action' <> 'create' OR EXISTS (SELECT 1 FROM public.account_entity_assignments a WHERE a.owner_id = uid AND a.account_id = (x->>'account_id')::uuid);
    SELECT e.id INTO eid FROM public.legal_entities e WHERE e.owner_id = uid AND e.entity_key = x->>'entity_key';
    INSERT INTO public.account_entity_assignments(owner_id, account_id, entity_id, valid_from, valid_to, reason, decided_by, source)
    VALUES (uid, (x->>'account_id')::uuid, eid, '-infinity', NULL, 'Legacy books.entityAccounts link frozen by the reviewed backfill', uid,
            jsonb_build_object('from', 'finance_preferences', 'path', x->>'path', 'earliest_ledger_date', x->'earliest_ledger_date',
                               'source_sha256', plan->>'source_sha256', 'run_id', run, 'captured_at', clock_timestamp()));
    n_asg := n_asg + 1;
  END LOOP;

  -- 3. Fill NULL legal_entity_id (the link trigger recomputes the same value; unresolved rows are left
  --    alone so no row is touched without a result). One bulk statement per table; if a legacy row
  --    fails an applied validation trigger, rows are retried one by one and the failures listed.
  FOREACH t IN ARRAY ARRAY['expenses', 'documents', 'opening_postings'] LOOP
    BEGIN
      IF t = 'expenses' THEN
        UPDATE public.expenses e SET legal_entity_id = public.p5_entity_for_keys(uid, public.p5_expense_entity_keys(uid, e.entity_source, e.entity_id, e.account_id, e.expense_date))
        WHERE e.employee_id = uid AND e.legal_entity_id IS NULL
          AND public.p5_entity_for_keys(uid, public.p5_expense_entity_keys(uid, e.entity_source, e.entity_id, e.account_id, e.expense_date)) IS NOT NULL;
      ELSIF t = 'documents' THEN
        UPDATE public.documents d SET legal_entity_id = public.p5_entity_for_keys(uid, CASE WHEN nullif(d.entity_id, '') IS NULL THEN '{}'::text[] ELSE ARRAY[d.entity_id] END)
        WHERE d.owner_id = uid AND d.legal_entity_id IS NULL
          AND public.p5_entity_for_keys(uid, CASE WHEN nullif(d.entity_id, '') IS NULL THEN '{}'::text[] ELSE ARRAY[d.entity_id] END) IS NOT NULL;
      ELSE
        UPDATE public.opening_postings o SET legal_entity_id = public.p5_entity_for_keys(uid, ARRAY[o.entity_id])
        WHERE o.owner_id = uid AND o.legal_entity_id IS NULL AND public.p5_entity_for_keys(uid, ARRAY[o.entity_id]) IS NOT NULL;
      END IF;
      GET DIAGNOSTICS n = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
      n := 0;
      FOR r IN EXECUTE format('SELECT id FROM public.%I WHERE %I = $1 AND legal_entity_id IS NULL ORDER BY id', t, CASE WHEN t = 'expenses' THEN 'employee_id' ELSE 'owner_id' END) USING uid LOOP
        BEGIN
          IF t = 'expenses' THEN
            UPDATE public.expenses e SET legal_entity_id = public.p5_entity_for_keys(uid, public.p5_expense_entity_keys(uid, e.entity_source, e.entity_id, e.account_id, e.expense_date))
            WHERE e.id = r.id AND public.p5_entity_for_keys(uid, public.p5_expense_entity_keys(uid, e.entity_source, e.entity_id, e.account_id, e.expense_date)) IS NOT NULL;
          ELSIF t = 'documents' THEN
            UPDATE public.documents d SET legal_entity_id = public.p5_entity_for_keys(uid, CASE WHEN nullif(d.entity_id, '') IS NULL THEN '{}'::text[] ELSE ARRAY[d.entity_id] END)
            WHERE d.id = r.id AND public.p5_entity_for_keys(uid, CASE WHEN nullif(d.entity_id, '') IS NULL THEN '{}'::text[] ELSE ARRAY[d.entity_id] END) IS NOT NULL;
          ELSE
            UPDATE public.opening_postings o SET legal_entity_id = public.p5_entity_for_keys(uid, ARRAY[o.entity_id])
            WHERE o.id = r.id AND public.p5_entity_for_keys(uid, ARRAY[o.entity_id]) IS NOT NULL;
          END IF;
          GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
        EXCEPTION WHEN OTHERS THEN
          failed := failed || public.legacy_exception('row_not_linkable', 'error', t, r.id::text, jsonb_build_object('error', SQLERRM));
        END;
      END LOOP;
    END;
    linked := linked || jsonb_build_object(t, n);
  END LOOP;

  summary := jsonb_build_object('run_id', run, 'source_sha256', plan->>'source_sha256', 'source_revision', plan->'source_revision',
    'created', jsonb_build_object('legal_entities', n_ent, 'account_assignments', n_asg), 'linked', linked,
    'failed_rows', failed, 'exceptions', plan->'exceptions');
  INSERT INTO public.legacy_backfill_runs(id, owner_id, kind, source_path, source_sha256, data_sha256, source_revision, options, summary, exceptions, created_by)
  VALUES (run, uid, 'legal_entities', plan->>'source_path', plan->>'source_sha256', plan->>'data_sha256', (plan->>'source_revision')::bigint,
          jsonb_build_object('archive_orphans', coalesce(_archive_orphans, false)), summary - 'exceptions', (plan->'exceptions') || failed, uid);
  RETURN summary;
END $$;

-- Compare report (FND-03 "compare"): counts, legacy-vs-linked attribution balances per
-- entity/account/currency/period, orphans, unresolved rows and drift since the last backfill.
-- "before" = today's app attribution from the legacy JSON (unchanged rows); "after" = the stored
-- legal_entity_id. Status 'match' needs identical balances, zero orphans and zero unresolved rows.
CREATE FUNCTION public.entity_backfill_report() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); personal_key text; before jsonb; after jsonb; cmp jsonb; plan jsonb; last public.legacy_backfill_runs;
  counts jsonb; orphans jsonb; unresolved jsonb; drift jsonb; docs_cmp jsonb; op_cmp jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  personal_key := 'personal:' || uid::text;
  plan := public.p5_entity_backfill_plan(uid, false);
  SELECT * INTO last FROM public.legacy_backfill_runs b WHERE b.owner_id = uid AND b.kind = 'legal_entities' ORDER BY b.created_at DESC, b.id DESC LIMIT 1;

  WITH l AS (SELECT * FROM public.p5_legacy_entry_keys(uid) WHERE tbl = 'expenses'),
  s AS (SELECT l.*, coalesce(le.entity_key, CASE WHEN e.legal_entity_id IS NULL THEN '(unlinked)' END) stored_key
        FROM l JOIN public.expenses e ON e.id = l.row_id LEFT JOIN public.legal_entities le ON le.owner_id = uid AND le.id = e.legal_entity_id),
  b AS (SELECT concat_ws('|', coalesce(legacy_key, personal_key), coalesce(account_id::text, '-'), currency, period, txn_type) g, count(*) n, sum(amount) amt, sum(original_amount) oamt FROM s GROUP BY 1),
  a AS (SELECT concat_ws('|', stored_key, coalesce(account_id::text, '-'), currency, period, txn_type) g, count(*) n, sum(amount) amt, sum(original_amount) oamt FROM s GROUP BY 1)
  SELECT (SELECT coalesce(jsonb_object_agg(g, jsonb_build_object('n', n, 'amount', amt, 'original_amount', oamt)), '{}'::jsonb) FROM b),
         (SELECT coalesce(jsonb_object_agg(g, jsonb_build_object('n', n, 'amount', amt, 'original_amount', oamt)), '{}'::jsonb) FROM a)
  INTO before, after;
  cmp := public.legacy_compare_maps(before, after);

  WITH l AS (SELECT * FROM public.p5_legacy_entry_keys(uid) WHERE tbl IN ('documents', 'opening_postings')),
  s AS (SELECT l.tbl, coalesce(l.legacy_key, personal_key) lk,
               coalesce(le.entity_key, CASE WHEN coalesce(d.legal_entity_id, o.legal_entity_id) IS NULL THEN '(unlinked)' END) sk
        FROM l LEFT JOIN public.documents d ON l.tbl = 'documents' AND d.id = l.row_id
               LEFT JOIN public.opening_postings o ON l.tbl = 'opening_postings' AND o.id = l.row_id
               LEFT JOIN public.legal_entities le ON le.owner_id = uid AND le.id = coalesce(d.legal_entity_id, o.legal_entity_id))
  SELECT public.legacy_compare_maps(
           (SELECT coalesce(jsonb_object_agg(k, n), '{}'::jsonb) FROM (SELECT lk k, count(*) n FROM s WHERE tbl = 'documents' GROUP BY 1) z),
           (SELECT coalesce(jsonb_object_agg(k, n), '{}'::jsonb) FROM (SELECT sk k, count(*) n FROM s WHERE tbl = 'documents' GROUP BY 1) z)),
         public.legacy_compare_maps(
           (SELECT coalesce(jsonb_object_agg(k, n), '{}'::jsonb) FROM (SELECT lk k, count(*) n FROM s WHERE tbl = 'opening_postings' GROUP BY 1) z),
           (SELECT coalesce(jsonb_object_agg(k, n), '{}'::jsonb) FROM (SELECT sk k, count(*) n FROM s WHERE tbl = 'opening_postings' GROUP BY 1) z))
  INTO docs_cmp, op_cmp;

  counts := jsonb_build_object(
    'legal_entities', (SELECT count(*) FROM public.legal_entities e WHERE e.owner_id = uid),
    'archived_entities', (SELECT count(*) FROM public.legal_entities e WHERE e.owner_id = uid AND e.archived_at IS NOT NULL),
    'account_assignments', (SELECT count(*) FROM public.account_entity_assignments a WHERE a.owner_id = uid),
    'expenses', (SELECT jsonb_build_object('total', count(*), 'linked', count(legal_entity_id)) FROM public.expenses WHERE employee_id = uid),
    'documents', (SELECT jsonb_build_object('total', count(*), 'linked', count(legal_entity_id)) FROM public.documents WHERE owner_id = uid),
    'opening_postings', (SELECT jsonb_build_object('total', count(*), 'linked', count(legal_entity_id)) FROM public.opening_postings WHERE owner_id = uid),
    'source_entities', plan->'counts'->'source_entities');

  -- Rows whose text key names no legal entity (deleted/merged company) and rows with no link at all.
  SELECT coalesce(jsonb_agg(jsonb_build_object('table', z.tbl, 'entity_key', z.k, 'rows', z.n) ORDER BY z.tbl, z.k), '[]'::jsonb) INTO orphans FROM (
    SELECT l.tbl, l.legacy_key k, count(*) n FROM public.p5_legacy_entry_keys(uid) l
    WHERE l.legacy_key IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.legal_entities e WHERE e.owner_id = uid AND e.entity_key = l.legacy_key)
    GROUP BY 1, 2) z;
  SELECT coalesce(jsonb_agg(jsonb_build_object('table', z.tbl, 'rows', z.n) ORDER BY z.tbl), '[]'::jsonb) INTO unresolved FROM (
    SELECT 'expenses' tbl, count(*) n FROM public.expenses WHERE employee_id = uid AND legal_entity_id IS NULL HAVING count(*) > 0
    UNION ALL SELECT 'documents', count(*) FROM public.documents WHERE owner_id = uid AND legal_entity_id IS NULL HAVING count(*) > 0
    UNION ALL SELECT 'opening_postings', count(*) FROM public.opening_postings WHERE owner_id = uid AND legal_entity_id IS NULL HAVING count(*) > 0) z;

  drift := jsonb_build_object(
    'source_changed_since_last_run', last.id IS NOT NULL AND last.source_sha256 IS DISTINCT FROM plan->>'source_sha256',
    'entities_not_in_table', (SELECT coalesce(jsonb_agg(x->>'entity_key' ORDER BY x->>'entity_key'), '[]'::jsonb) FROM jsonb_array_elements(plan->'entities') x WHERE x->>'action' = 'create'),
    'entities_changed_in_json', (SELECT coalesce(jsonb_agg(x->>'entity_key' ORDER BY x->>'entity_key'), '[]'::jsonb) FROM jsonb_array_elements(plan->'entities') x WHERE x->>'action' = 'exists_source_changed'),
    'account_links_not_in_table', (SELECT coalesce(jsonb_agg(x->>'account_id' ORDER BY x->>'account_id'), '[]'::jsonb) FROM jsonb_array_elements(plan->'account_assignments') x WHERE x->>'action' = 'create'),
    'account_links_differ', (SELECT coalesce(jsonb_agg(jsonb_build_object('account_id', x->>'account_id', 'json_entity_key', x->>'entity_key') ORDER BY x->>'account_id'), '[]'::jsonb) FROM jsonb_array_elements(plan->'account_assignments') x WHERE x->>'action' = 'exists_different'));

  RETURN jsonb_build_object(
    'owner_id', uid, 'source_sha256', plan->>'source_sha256', 'data_sha256', plan->>'data_sha256',
    'last_run', CASE WHEN last.id IS NULL THEN NULL ELSE jsonb_build_object('id', last.id, 'source_sha256', last.source_sha256, 'created_at', last.created_at) END,
    'counts', counts,
    'balances', jsonb_build_object('basis', 'expenses grouped by entity|account|currency|YYYY-MM|txn_type: count, sum(amount), sum(original_amount)') || cmp,
    'documents', docs_cmp, 'opening_postings', op_cmp,
    'orphans', orphans, 'unresolved', unresolved, 'drift', drift,
    'exceptions', plan->'exceptions',
    'status', CASE WHEN (cmp->>'identical')::boolean AND (docs_cmp->>'identical')::boolean AND (op_cmp->>'identical')::boolean
                        AND orphans = '[]'::jsonb AND unresolved = '[]'::jsonb THEN 'match' ELSE 'differences' END);
END $$;

-- --------------------------------------------------------------------------------------------
-- 7. Writers where history matters (all owner-only; anonymous demo guests refused)
-- --------------------------------------------------------------------------------------------
-- Moves an account to another entity from a date: closes the covering range, opens a new one and
-- relinks only the account's account-derived entries dated on/after _from. Earlier entries keep
-- their entity (FND-05). Refused when an affected entry lies in a period closed for the old or new
-- entity (DN-P3-4/8). The legacy JSON books.entityAccounts is not changed in this stage (drift is
-- reported by entity_backfill_report until the write switch). Step-up guarded (P4 wrapper).
CREATE FUNCTION public.reassign_account_entity(_account uuid, _entity uuid, _from date, _reason text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); cur public.account_entity_assignments; ent public.legal_entities; periods jsonb; new_id uuid; new_key text; old_key text; d date;
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Sign in with your account to move accounts'; END IF;
  IF _from IS NULL OR _from IN ('infinity'::date, '-infinity'::date) THEN RAISE EXCEPTION 'Choose the date the account moves' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN RAISE EXCEPTION 'Give a reason for the move' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  SELECT p.data->'books'->'closedPeriods' INTO periods FROM public.finance_preferences p WHERE p.owner_id = uid FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = _account AND a.owner_id = uid) THEN RAISE EXCEPTION 'Account not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO ent FROM public.legal_entities e WHERE e.id = _entity AND e.owner_id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Legal entity not found' USING ERRCODE = 'P0002'; END IF;
  IF ent.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Archived entities cannot receive accounts'; END IF;
  IF public.p5_personal_entity(uid) IS NULL THEN RAISE EXCEPTION 'Run the reviewed company backfill first'; END IF;
  -- An account linked only in the legacy JSON has no frozen history yet: opening a first range now
  -- would silently move every earlier entry to personal books. The reviewed backfill freezes it first.
  IF NOT EXISTS (SELECT 1 FROM public.account_entity_assignments a WHERE a.account_id = _account)
     AND cardinality(public.p5_json_account_keys((SELECT p.data->'books'->'entityAccounts' FROM public.finance_preferences p WHERE p.owner_id = uid), _account)) > 0 THEN
    RAISE EXCEPTION 'REASSIGN_NEEDS_BACKFILL: this account is linked to a company in the legacy list but its link is not frozen yet; resolve it in the reviewed backfill first' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.account_entity_assignments a WHERE a.account_id = _account AND a.valid_from >= _from) THEN
    RAISE EXCEPTION 'A later assignment already starts on or after %; moves are recorded in date order', _from;
  END IF;
  SELECT * INTO cur FROM public.account_entity_assignments a WHERE a.account_id = _account AND a.valid_from < _from AND (a.valid_to IS NULL OR a.valid_to > _from);
  old_key := (public.p5_account_entity_keys(uid, _account, _from))[1];
  new_key := CASE WHEN ent.kind = 'individual_personal' THEN NULL ELSE ent.entity_key END;
  IF cur.id IS NOT NULL AND cur.entity_id = _entity THEN RAISE EXCEPTION 'The account already belongs to this entity on that date'; END IF;
  -- Entries that would change entity must not sit in a period closed for either side.
  -- Every entry touching the account from that date moves between company books (either side of a transfer).
  FOR d IN SELECT e.expense_date FROM public.expenses e WHERE e.employee_id = uid AND (e.account_id = _account OR e.to_account_id = _account) AND e.expense_date >= _from LOOP
    IF public.ll_closed_on(periods, d::text, NULL) OR (old_key IS NOT NULL AND public.ll_closed_on(periods, d::text, old_key))
       OR (new_key IS NOT NULL AND public.ll_closed_on(periods, d::text, new_key)) THEN
      RAISE EXCEPTION 'REASSIGN_CLOSED_PERIOD: entries dated % are in a closed period; reopen it first or choose a later date', d USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  IF cur.id IS NOT NULL THEN UPDATE public.account_entity_assignments SET valid_to = _from WHERE id = cur.id; END IF;
  INSERT INTO public.account_entity_assignments(owner_id, account_id, entity_id, valid_from, valid_to, reason, decided_by, source)
  VALUES (uid, _account, _entity, _from, CASE WHEN cur.id IS NOT NULL THEN cur.valid_to END, btrim(_reason), uid,
          jsonb_build_object('from', 'reassign_account_entity', 'previous_assignment', cur.id, 'captured_at', clock_timestamp()))
  RETURNING id INTO new_id;
  UPDATE public.expenses e SET legal_entity_id = public.p5_entity_for_keys(uid, public.p5_expense_entity_keys(uid, e.entity_source, e.entity_id, e.account_id, e.expense_date))
  WHERE e.employee_id = uid AND e.account_id = _account AND e.entity_source <> 'manual' AND e.expense_date >= _from
    AND e.legal_entity_id IS DISTINCT FROM public.p5_entity_for_keys(uid, public.p5_expense_entity_keys(uid, e.entity_source, e.entity_id, e.account_id, e.expense_date));
  RETURN new_id;
END $$;

-- Archive (never delete) a legal entity; its readable ID, links and history stay. Step-up guarded.
CREATE FUNCTION public.archive_legal_entity(_id uuid, _reason text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); ent public.legal_entities;
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Sign in with your account to archive'; END IF;
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN RAISE EXCEPTION 'Give a reason for archiving' USING ERRCODE = '22023'; END IF;
  SELECT * INTO ent FROM public.legal_entities e WHERE e.id = _id AND e.owner_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Legal entity not found' USING ERRCODE = 'P0002'; END IF;
  IF ent.kind = 'individual_personal' THEN RAISE EXCEPTION 'Personal books cannot be archived'; END IF;
  IF ent.archived_at IS NOT NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.account_entity_assignments a WHERE a.entity_id = _id AND a.valid_to IS NULL) THEN
    RAISE EXCEPTION 'Move this entity''s accounts first (reassign_account_entity)';
  END IF;
  UPDATE public.legal_entities SET archived_at = clock_timestamp(), archived_by = uid, archive_reason = btrim(_reason) WHERE id = _id;
END $$;

-- Explicit relationship (never inferred from names). Assistant sessions refused (P4 wrapper).
CREATE FUNCTION public.record_entity_relationship(_from uuid, _to uuid, _relation text, _pct numeric, _valid_from date, _evidence uuid, _note text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); rid uuid;
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Sign in with your account to record relationships'; END IF;
  IF (SELECT count(*) FROM public.legal_entities e WHERE e.owner_id = uid AND e.id IN (_from, _to) AND e.archived_at IS NULL) <> 2 THEN
    RAISE EXCEPTION 'Both entities must be your active legal entities' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.entity_relationships(owner_id, from_entity_id, to_entity_id, relation, pct, valid_from, evidence_document_id, note, source, created_by)
  VALUES (uid, _from, _to, _relation, _pct, coalesce(_valid_from, '-infinity'), _evidence, nullif(btrim(coalesce(_note, '')), ''),
          jsonb_build_object('from', 'record_entity_relationship', 'captured_at', clock_timestamp()), uid)
  RETURNING id INTO rid;
  RETURN rid;
END $$;

CREATE FUNCTION public.end_entity_relationship(_id uuid, _valid_to date) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Sign in with your account to end relationships'; END IF;
  UPDATE public.entity_relationships SET valid_to = _valid_to WHERE id = _id AND owner_id = uid AND valid_to IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Open relationship not found' USING ERRCODE = 'P0002'; END IF;
END $$;

-- Confirmed account erasure (delete_my_finance_data sets ledgerline.erasing and deletes the ledger rows,
-- documents, opening postings and accounts before finance_preferences): remove the owner's P5 rows.
-- readable_id_counters are kept, so an erased owner's numbers are never issued again.
-- SECURITY INVOKER on purpose: current_user is then the caller, so only a definer erasure function (not a
-- client session that somehow set the setting) reaches the deletes.
CREATE FUNCTION public.p5_erase_owner_records() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_setting('ledgerline.erasing', true) IS DISTINCT FROM 'on' OR current_user IN ('authenticated', 'anon') THEN RETURN NULL; END IF;
  -- A record co-owned with ANOTHER account is shared evidence: erasure stops instead of deleting the
  -- co-owner's history (KK decision C13 pending). End the share or hand the record over first.
  IF EXISTS (SELECT 1 FROM public.register_records r JOIN public.record_ownerships x ON x.record_id = r.id
             WHERE r.owner_id = OLD.owner_id AND x.owner_id <> OLD.owner_id AND x.status <> 'rejected') THEN
    RAISE EXCEPTION 'ERASURE_BLOCKED_COOWNED: a record you administer has shares held by another account' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.entity_relationships WHERE owner_id = OLD.owner_id;
  DELETE FROM public.record_ownerships x WHERE x.owner_id = OLD.owner_id
    OR x.record_id IN (SELECT r.id FROM public.register_records r WHERE r.owner_id = OLD.owner_id);
  DELETE FROM public.register_records WHERE owner_id = OLD.owner_id;
  DELETE FROM public.account_entity_assignments WHERE owner_id = OLD.owner_id;
  DELETE FROM public.legal_entities WHERE owner_id = OLD.owner_id;
  DELETE FROM public.readable_id_registry WHERE owner_id = OLD.owner_id;
  DELETE FROM public.legacy_backfill_runs WHERE owner_id = OLD.owner_id;
  RETURN NULL;
END $$;
CREATE TRIGGER p5_erase_owner_records AFTER DELETE ON public.finance_preferences
  FOR EACH ROW EXECUTE FUNCTION public.p5_erase_owner_records();

-- --------------------------------------------------------------------------------------------
-- 8. Privileges and RLS
-- --------------------------------------------------------------------------------------------
-- Supabase default privileges grant ALL on new tables to anon/authenticated: remove them explicitly.
REVOKE ALL ON public.legal_entities, public.entity_relationships, public.account_entity_assignments, public.legacy_backfill_runs,
  public.readable_id_formats, public.readable_id_counters, public.readable_id_registry, public.record_ownerships, public.register_records
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.legal_entities, public.entity_relationships, public.account_entity_assignments, public.legacy_backfill_runs,
  public.readable_id_formats, public.readable_id_registry, public.record_ownerships, public.register_records TO authenticated, service_role;

ALTER TABLE public.legal_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_entity_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_backfill_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.readable_id_formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.readable_id_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.readable_id_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.record_ownerships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.register_records ENABLE ROW LEVEL SECURITY;

-- Owner, or a P2 grantee holding 'view' for exactly this entity (or a workspace-wide grant). Personal
-- books and unknown legacy entities are never shared this way (FND-04: personal records stay private).
CREATE POLICY "Owner or entity grantee reads legal entities" ON public.legal_entities FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR (kind NOT IN ('individual_personal', 'legacy_unknown') AND public.has_permission(owner_id, entity_key, 'view')));
CREATE POLICY "Owner or entity grantee reads relationships" ON public.entity_relationships FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.legal_entities e WHERE e.owner_id = entity_relationships.owner_id
    AND e.id = entity_relationships.to_entity_id AND e.kind NOT IN ('individual_personal', 'legacy_unknown') AND public.has_permission(e.owner_id, e.entity_key, 'view')));
CREATE POLICY "Owner or entity grantee reads account assignments" ON public.account_entity_assignments FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.legal_entities e WHERE e.owner_id = account_entity_assignments.owner_id
    AND e.id = account_entity_assignments.entity_id AND e.kind NOT IN ('individual_personal', 'legacy_unknown') AND public.has_permission(e.owner_id, e.entity_key, 'view')));
CREATE POLICY "Owner reads own backfill runs" ON public.legacy_backfill_runs FOR SELECT TO authenticated USING (owner_id = auth.uid());
-- A share row: its own account always; everyone who can read the record sees its confirmed/ended shares;
-- the administrator also sees pending and rejected requests. A pending requester sees only its own row.
CREATE POLICY "Owner, co-owner or entity grantee reads ownership shares" ON public.record_ownerships FOR SELECT TO authenticated
  USING (owner_id = auth.uid()
         OR (status = 'confirmed' AND public.p5_can_read_register_record(record_id))
         OR EXISTS (SELECT 1 FROM public.register_records r WHERE r.id = record_ownerships.record_id AND r.owner_id = auth.uid()));
CREATE POLICY "Administrator, co-owner or entity grantee reads register records" ON public.register_records FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.p5_can_read_register_record(id));
CREATE POLICY "Owner reads own readable IDs" ON public.readable_id_registry FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Signed-in users read readable ID formats" ON public.readable_id_formats FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

-- P4 RESTRICTIVE assistant policies on every new table (same names and expressions as P4 section 8).
DO $pol$
DECLARE t record; oc text; rd text;
BEGIN
  FOR t IN SELECT c.oid, c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
           AND c.relname IN ('legal_entities', 'entity_relationships', 'account_entity_assignments', 'legacy_backfill_runs',
                             'readable_id_formats', 'readable_id_counters', 'readable_id_registry', 'record_ownerships', 'register_records') ORDER BY c.relname LOOP
    SELECT x.col INTO oc FROM unnest(ARRAY['owner_id', 'employee_id', 'user_id', 'workspace_owner_id']) WITH ORDINALITY x(col, n)
    WHERE EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = x.col AND a.atttypid = 'uuid'::regtype AND NOT a.attisdropped AND a.attnum > 0)
    ORDER BY x.n LIMIT 1;
    rd := format('(SELECT NOT public.is_assistant_session()) OR NOT public.assistant_client_revoked(%s)', coalesce(quote_ident(oc), 'NULL'));
    EXECUTE format('CREATE POLICY "P4 assistants cannot insert" ON public.%I AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (NOT (SELECT public.is_assistant_session()))', t.relname);
    EXECUTE format('CREATE POLICY "P4 assistants cannot update" ON public.%I AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (NOT (SELECT public.is_assistant_session())) WITH CHECK (NOT (SELECT public.is_assistant_session()))', t.relname);
    EXECUTE format('CREATE POLICY "P4 assistants cannot delete" ON public.%I AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (NOT (SELECT public.is_assistant_session()))', t.relname);
    EXECUTE format('CREATE POLICY "P4 revoked assistants cannot read" ON public.%I AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (%s)', t.relname, rd);
  END LOOP;
END $pol$;

-- History is append-only for clients even if a permissive write policy is ever added (defence in depth).
DO $hist$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['legal_entities', 'entity_relationships', 'account_entity_assignments', 'legacy_backfill_runs', 'readable_id_registry', 'readable_id_counters', 'record_ownerships', 'register_records'] LOOP
    EXECUTE format('CREATE POLICY "P5 history cannot be changed by clients" ON public.%I AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false)', t);
    EXECUTE format('CREATE POLICY "P5 history cannot be deleted by clients" ON public.%I AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false)', t);
  END LOOP;
END $hist$;

-- Function privileges: nothing callable by PUBLIC/anon; clients get only the entry points.
DO $grants$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN (
      'format_readable_id', 'issue_readable_id', 'claim_readable_id', 'assign_readable_id',
      'guard_account_entity_assignment', 'guard_legal_entity_change', 'guard_entity_relationship_change', 'guard_backfill_run_append_only',
      'legacy_sha256', 'legacy_exception', 'legacy_json_elements', 'legacy_compare_maps',
      'p5_personal_entity', 'p5_account_entity_keys', 'p5_expense_entity_keys', 'p5_entity_for_keys', 'p5_link_legal_entity',
      'p5_entry_closed', 'p5_asset_entity_key', 'p5_asset_closed', 'p5_json_account_keys', 'p5_legacy_entry_keys', 'p5_entity_backfill_plan', 'p5_erase_owner_records',
      'preview_entity_backfill', 'commit_entity_backfill', 'entity_backfill_report', 'reassign_account_entity', 'archive_legal_entity',
      'record_entity_relationship', 'end_entity_relationship', 'guard_record_ownership', 'p5_can_read_register_record',
      'guard_register_record_change', 'register_shared_record', 'archive_register_record',
      'record_ownership_share', 'decide_ownership_share', 'end_ownership_share') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f.sig);
  END LOOP;
END $grants$;
GRANT EXECUTE ON FUNCTION public.preview_entity_backfill(boolean), public.commit_entity_backfill(text, boolean), public.entity_backfill_report(),
  public.reassign_account_entity(uuid, uuid, date, text), public.archive_legal_entity(uuid, text),
  public.record_entity_relationship(uuid, uuid, text, numeric, date, uuid, text), public.end_entity_relationship(uuid, date),
  public.register_shared_record(text, uuid, text, text), public.archive_register_record(uuid, text),
  public.record_ownership_share(uuid, uuid, numeric, date, uuid, text), public.decide_ownership_share(uuid, boolean),
  public.end_ownership_share(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.p5_can_read_register_record(uuid) TO authenticated;
-- Pure framework helpers are harmless and useful to server code / the registers work.
GRANT EXECUTE ON FUNCTION public.legacy_sha256(jsonb), public.legacy_exception(text, text, text, text, jsonb),
  public.legacy_json_elements(jsonb, text[], text), public.legacy_compare_maps(jsonb, jsonb),
  public.format_readable_id(text, int, bigint) TO authenticated, service_role;
-- The redefined 0058/0083 functions keep their original ACLs (CREATE OR REPLACE does not change them).

-- --------------------------------------------------------------------------------------------
-- 9. P4 guards on the new client entry points (registered in security_p4.guarded_functions so
--    require_recent_step_up accepts them; the P5 rollback removes them again)
-- --------------------------------------------------------------------------------------------
DO $guard$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure sig,
                  CASE WHEN p.proname IN ('commit_entity_backfill', 'reassign_account_entity', 'archive_legal_entity', 'archive_register_record',
                                          'record_ownership_share', 'decide_ownership_share', 'end_ownership_share') THEN 'step_up' ELSE 'assistant' END mode
           FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN (
             'commit_entity_backfill', 'reassign_account_entity', 'archive_legal_entity', 'archive_register_record',
             'preview_entity_backfill', 'entity_backfill_report', 'record_entity_relationship', 'end_entity_relationship',
             'register_shared_record', 'record_ownership_share', 'decide_ownership_share', 'end_ownership_share')
           ORDER BY p.proname LOOP
    PERFORM security_p4.guard(f.sig, f.mode);
  END LOOP;
END $guard$;

-- Fail closed: every client-callable volatile function must be guarded (same rule as P4 7d).
DO $check$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND p.provolatile = 'v'
    AND p.prorettype <> 'trigger'::regtype AND p.proname NOT LIKE '%\_\_unguarded'
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND p.proname NOT IN ('revoke_assistant_client', 'remove_device_passkey', 'require_recent_step_up')
    AND NOT EXISTS (SELECT 1 FROM security_p4.guarded_functions g WHERE g.proname = p.proname);
  IF n > 0 THEN RAISE EXCEPTION 'P5: % unguarded client-callable writer function(s) in public', n; END IF;
END $check$;

COMMIT;
