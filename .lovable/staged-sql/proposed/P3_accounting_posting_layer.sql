-- !!! SUPERSEDED 2026-11-10 by P7_balanced_posting.sql (authoritative Phase 3 posting layer, revised for
-- !!! the 14 approved P3 decisions, P1/P2/P4/P5). Kept for history only. NEVER install this file; its
-- !!! preflight refuses when P7 is installed and P7's preflight refuses when this file's objects exist.
-- P3 (PROPOSED, NOT APPLIED): one database-enforced posting layer on the EXISTING ledger (DN-04 option A).
-- Status: staged for KK review only. Never run against Lovable Cloud / hosted databases without KK approval.
-- Applies after drizzle/migrations 0000-0088 (and after proposed security P1/P2; see the plan for ordering).
-- Replaces scripts/accounting-foundation.sql (which must NOT be installed alongside this file).
--
-- Design summary (docs/plans/ACCOUNTING_MIGRATION_PLAN_2026-11-09.md):
--  * public.expenses stays the canonical economic-event ledger. Nothing in existing rows is rewritten.
--  * accounting_postings/accounting_posting_lines hold balanced double-entry postings keyed to that ledger:
--      kind 'entry'          one posting per (entry id, legal entity, version), derived with the corporate-statements.ts rules
--      kind 'entry_reversal' exact mirror of an entry posting (entry edited/deleted or backfill undone)
--      kind 'journal'        manual/company journals (formerly accounting_journal_evidence), incl. journal reversals
--  * Database invariants: exact 2dp numeric, debit/credit sign rules, deferred balance per posting AND per
--    (posting, legal entity, currency), unique idempotency key per owner, one active posting per event,
--    immutable lines (corrections = reversal referencing the original), closed periods via 0083 ll_closed_on,
--    owner/entity-grant RLS, cross-owner references refused.
--  * Backfill is never automatic: accounting_backfill('preview') -> owner review -> accounting_backfill('commit',
--    run, fingerprint). Only after a committed run do entry edits keep postings in step (reversal + replacement).
--  * delete_my_finance_data (0058) is unchanged: posting tables cascade from finance_preferences and every guard
--    honours ledgerline.erasing. restore_finance_backup (0072) is kept byte-for-byte and wrapped.

DO $$ BEGIN
 IF to_regclass('public.posting_batches') IS NOT NULL OR to_regnamespace('phase3_p7') IS NOT NULL THEN
  RAISE EXCEPTION 'P3 is superseded by P7_balanced_posting.sql, which is installed; never install both';
 END IF;
 IF to_regclass('public.accounting_journal_evidence') IS NOT NULL OR to_regclass('public.accounting_postings') IS NOT NULL THEN
  RAISE EXCEPTION 'P3: accounting-foundation or P3 objects already exist; stop and review before installing';
 END IF;
 IF to_regprocedure('public.restore_finance_backup(jsonb,text)') IS NULL OR to_regprocedure('public.ll_closed_on(jsonb,text,text)') IS NULL OR to_regprocedure('public.can_access_entity(uuid,text,boolean)') IS NULL THEN
  RAISE EXCEPTION 'P3: prerequisite 0072/0075/0083 objects are missing';
 END IF;
END $$;

CREATE SCHEMA accounting_private;
REVOKE ALL ON SCHEMA accounting_private FROM PUBLIC;
GRANT USAGE ON SCHEMA accounting_private TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------------
CREATE TABLE public.accounting_postings (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES public.finance_preferences(owner_id) ON DELETE CASCADE,
 entity_id text NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 200),
 posting_date date NOT NULL,
 kind text NOT NULL CHECK (kind IN ('entry','entry_reversal','journal')),
 idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 3 AND 300),
 source_entry_id uuid,
 entry_version integer,
 journal_id uuid,
 request_id uuid,
 journal jsonb,
 entry_ids uuid[] NOT NULL DEFAULT '{}',
 document_ids uuid[] NOT NULL DEFAULT '{}',
 settlement_entry_id uuid,
 reverses_id uuid REFERENCES public.accounting_postings(id) ON DELETE CASCADE,
 backfill_run_id uuid,
 description text NOT NULL DEFAULT '',
 meta jsonb NOT NULL DEFAULT '{}',
 actor_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT accounting_postings_idempotency UNIQUE (owner_id, idempotency_key),
 CHECK (kind <> 'entry' OR (source_entry_id IS NOT NULL AND entry_version > 0 AND reverses_id IS NULL)),
 CHECK (kind <> 'entry_reversal' OR (source_entry_id IS NOT NULL AND reverses_id IS NOT NULL)),
 CHECK (kind <> 'journal' OR (journal_id IS NOT NULL AND request_id IS NOT NULL AND jsonb_typeof(journal) = 'object'))
);
CREATE UNIQUE INDEX accounting_postings_journal_uq ON public.accounting_postings(owner_id, journal_id) WHERE journal_id IS NOT NULL;
CREATE UNIQUE INDEX accounting_postings_request_uq ON public.accounting_postings(owner_id, request_id) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX accounting_postings_one_reversal ON public.accounting_postings(reverses_id) WHERE reverses_id IS NOT NULL;
CREATE UNIQUE INDEX accounting_postings_entry_version ON public.accounting_postings(owner_id, source_entry_id, entity_id, entry_version) WHERE kind = 'entry';
CREATE INDEX accounting_postings_owner_entry ON public.accounting_postings(owner_id, source_entry_id) WHERE source_entry_id IS NOT NULL;
CREATE INDEX accounting_postings_owner_entity_date ON public.accounting_postings(owner_id, entity_id, posting_date);
CREATE INDEX accounting_postings_settlement ON public.accounting_postings(owner_id, settlement_entry_id) WHERE settlement_entry_id IS NOT NULL;
CREATE INDEX accounting_postings_documents ON public.accounting_postings USING gin(document_ids);

CREATE TABLE public.accounting_posting_lines (
 id uuid PRIMARY KEY,
 posting_id uuid NOT NULL REFERENCES public.accounting_postings(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL,
 line_no integer NOT NULL CHECK (line_no > 0),
 entity_id text NOT NULL,
 currency text NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
 code text NOT NULL CHECK (length(code) BETWEEN 1 AND 300),
 label text NOT NULL,
 role text NOT NULL CHECK (role IN ('asset','liability','equity','income','expense')),
 debit numeric NOT NULL DEFAULT 0,
 credit numeric NOT NULL DEFAULT 0,
 signed_amount numeric GENERATED ALWAYS AS (debit - credit) STORED,
 account_id uuid,
 entry_id uuid,
 cash_flow text CHECK (cash_flow IS NULL OR cash_flow IN ('operating','investing','financing')),
 original_currency text,
 original_amount numeric,
 meta jsonb NOT NULL DEFAULT '{}',
 CONSTRAINT accounting_lines_number UNIQUE (posting_id, line_no),
 -- Sign rule: exactly one strictly positive side; exact two-decimal amounts; NaN/Infinity rejected.
 CONSTRAINT accounting_lines_one_side CHECK (debit >= 0 AND credit >= 0 AND (debit > 0) <> (credit > 0)),
 CONSTRAINT accounting_lines_exact CHECK (debit = round(debit, 2) AND credit = round(credit, 2) AND debit < 1e13 AND credit < 1e13)
);
CREATE INDEX accounting_lines_posting ON public.accounting_posting_lines(posting_id);
CREATE INDEX accounting_lines_owner_entity_code ON public.accounting_posting_lines(owner_id, entity_id, code);
CREATE INDEX accounting_lines_account ON public.accounting_posting_lines(account_id) WHERE account_id IS NOT NULL;

CREATE TABLE public.accounting_backfill_runs (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES public.finance_preferences(owner_id) ON DELETE CASCADE,
 fingerprint text NOT NULL,
 result jsonb NOT NULL,
 actor_id uuid NOT NULL,
 committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 undone_at timestamptz,
 undo_reason text
);
CREATE INDEX accounting_backfill_runs_owner ON public.accounting_backfill_runs(owner_id, committed_at DESC);

-- Accountant review grants and notes keep the accounting-foundation shapes used by store.tsx.
CREATE TABLE public.accounting_review_grants (
 owner_id uuid NOT NULL REFERENCES public.finance_preferences(owner_id) ON DELETE CASCADE,
 accountant_id uuid NOT NULL, entity_id text NOT NULL, revoked_at timestamptz,
 PRIMARY KEY (owner_id, accountant_id, entity_id)
);
CREATE INDEX accounting_review_grants_accountant ON public.accounting_review_grants(accountant_id, owner_id, entity_id) WHERE revoked_at IS NULL;
CREATE TABLE public.accounting_exception_reviews (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES public.finance_preferences(owner_id) ON DELETE CASCADE,
 entity_id text NOT NULL,
 journal_id uuid NOT NULL,
 posting_id uuid NOT NULL REFERENCES public.accounting_postings(id) ON DELETE CASCADE,
 finding text NOT NULL, note text NOT NULL, actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX accounting_exception_reviews_owner ON public.accounting_exception_reviews(owner_id, journal_id);

-- Supabase default privileges grant ALL on new public tables; posting tables are read-only to every API role.
REVOKE ALL ON public.accounting_postings, public.accounting_posting_lines, public.accounting_backfill_runs, public.accounting_review_grants, public.accounting_exception_reviews FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.accounting_postings, public.accounting_posting_lines, public.accounting_backfill_runs, public.accounting_review_grants, public.accounting_exception_reviews TO authenticated, service_role;

ALTER TABLE public.accounting_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_posting_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_backfill_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_review_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_exception_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY owner_grants ON public.accounting_review_grants FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY accountant_own_grant ON public.accounting_review_grants FOR SELECT TO authenticated USING (accountant_id = auth.uid());
CREATE POLICY owner_runs ON public.accounting_backfill_runs FOR SELECT TO authenticated USING (owner_id = auth.uid());

-- Read access: owner, an active company member (0075 can_access_entity, same rule as company transactions),
-- or an active owner-granted accountant for that company. Revocation takes effect on the next statement.
CREATE FUNCTION accounting_private.can_read(_owner uuid, _entity text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT auth.uid() IS NOT NULL AND (auth.uid() = _owner OR public.can_access_entity(_owner, _entity, false)
  OR EXISTS (SELECT 1 FROM public.accounting_review_grants g WHERE g.owner_id = _owner AND g.entity_id = _entity AND g.accountant_id = auth.uid() AND g.revoked_at IS NULL))
$$;
REVOKE ALL ON FUNCTION accounting_private.can_read(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accounting_private.can_read(uuid, text) TO authenticated, service_role;
CREATE POLICY read_postings ON public.accounting_postings FOR SELECT TO authenticated USING (accounting_private.can_read(owner_id, entity_id));
CREATE POLICY read_lines ON public.accounting_posting_lines FOR SELECT TO authenticated USING (accounting_private.can_read(owner_id, entity_id));
CREATE POLICY read_reviews ON public.accounting_exception_reviews FOR SELECT TO authenticated USING (
 owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.accounting_review_grants g WHERE g.owner_id = accounting_exception_reviews.owner_id AND g.entity_id = accounting_exception_reviews.entity_id AND g.accountant_id = auth.uid() AND g.revoked_at IS NULL));

-- store.tsx reads accounting_journal_evidence(id, owner_id, entity_id, request_id, journal, entry_ids).
-- It is now a security-invoker view over journal postings, so the posting RLS above applies.
CREATE VIEW public.accounting_journal_evidence WITH (security_invoker = true) AS
 SELECT p.journal_id AS id, p.owner_id, p.entity_id, p.request_id, p.journal, p.entry_ids, p.created_at, p.actor_id, p.id AS posting_id
 FROM public.accounting_postings p WHERE p.kind = 'journal';
REVOKE ALL ON public.accounting_journal_evidence FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.accounting_journal_evidence TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------
-- Invariant guards
-- ---------------------------------------------------------------------------------------------------------
CREATE FUNCTION accounting_private.entity_exists(_owner uuid, _entity text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM public.finance_preferences p, jsonb_array_elements(CASE WHEN jsonb_typeof(p.data->'entities') = 'array' THEN p.data->'entities' ELSE '[]'::jsonb END) e
  WHERE p.owner_id = _owner AND e->>'id' = _entity)
$$;

CREATE FUNCTION accounting_private.guard_posting_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE periods jsonb; orig public.accounting_postings;
BEGIN
 IF coalesce(current_setting('ledgerline.posting_writer', true), '') <> 'on' THEN
  RAISE EXCEPTION 'Postings are written only by the accounting posting functions';
 END IF;
 IF NOT accounting_private.entity_exists(NEW.owner_id, NEW.entity_id) THEN RAISE EXCEPTION 'Company unavailable for posting'; END IF;
 SELECT data->'books'->'closedPeriods' INTO periods FROM public.finance_preferences WHERE owner_id = NEW.owner_id;
 IF public.ll_closed_on(periods, NEW.posting_date::text, NEW.entity_id) THEN
  RAISE EXCEPTION 'Accounting period is closed for %; post a correcting entry in an open period or reopen on Audit', NEW.posting_date USING ERRCODE = 'P0001';
 END IF;
 IF NEW.source_entry_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = NEW.source_entry_id AND e.employee_id <> NEW.owner_id) THEN
  RAISE EXCEPTION 'Posting source belongs to another owner';
 END IF;
 IF EXISTS (SELECT 1 FROM unnest(NEW.entry_ids) i WHERE NOT EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = i AND e.employee_id = NEW.owner_id)) THEN
  RAISE EXCEPTION 'Posting ledger entries belong to another owner';
 END IF;
 IF EXISTS (SELECT 1 FROM unnest(NEW.document_ids) i WHERE NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id = i AND d.owner_id = NEW.owner_id)) THEN
  RAISE EXCEPTION 'Posting documents belong to another owner';
 END IF;
 IF NEW.reverses_id IS NOT NULL THEN
  SELECT * INTO orig FROM public.accounting_postings WHERE id = NEW.reverses_id;
  IF NOT FOUND OR orig.owner_id <> NEW.owner_id OR orig.entity_id <> NEW.entity_id OR orig.kind = 'entry_reversal' OR NEW.posting_date < orig.posting_date THEN
   RAISE EXCEPTION 'Invalid reversal: original posting unavailable, already a reversal, or dated later';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_guard_posting_insert BEFORE INSERT ON public.accounting_postings FOR EACH ROW EXECUTE FUNCTION accounting_private.guard_posting_insert();

CREATE FUNCTION accounting_private.guard_line_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.accounting_postings;
BEGIN
 IF coalesce(current_setting('ledgerline.posting_writer', true), '') <> 'on' THEN
  RAISE EXCEPTION 'Postings are written only by the accounting posting functions';
 END IF;
 SELECT * INTO p FROM public.accounting_postings WHERE id = NEW.posting_id;
 IF NOT FOUND OR p.owner_id <> NEW.owner_id THEN RAISE EXCEPTION 'Posting line owner differs from its posting'; END IF;
 IF NEW.entity_id <> p.entity_id AND NOT accounting_private.entity_exists(NEW.owner_id, NEW.entity_id) THEN RAISE EXCEPTION 'Company unavailable for posting line'; END IF;
 IF NEW.account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = NEW.account_id AND a.owner_id = NEW.owner_id) THEN
  RAISE EXCEPTION 'Posting line account belongs to another owner';
 END IF;
 IF NEW.entry_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = NEW.entry_id AND e.employee_id <> NEW.owner_id) THEN
  RAISE EXCEPTION 'Posting line entry belongs to another owner';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_guard_line_insert BEFORE INSERT ON public.accounting_posting_lines FOR EACH ROW EXECUTE FUNCTION accounting_private.guard_line_insert();

-- Posted rows are immutable. Only confirmed account erasure (delete_my_finance_data sets ledgerline.erasing)
-- may remove the caller's own rows, through the finance_preferences cascade.
CREATE FUNCTION accounting_private.guard_posted_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF TG_OP = 'DELETE' AND current_setting('ledgerline.erasing', true) = 'on' AND (auth.uid() IS NULL OR OLD.owner_id = auth.uid()) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Posted accounting lines are immutable; post a reversal referencing the original';
END $$;
CREATE FUNCTION accounting_private.guard_posted_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Posted accounting lines are immutable; post a reversal referencing the original'; END $$;
CREATE TRIGGER b_posting_immutable BEFORE UPDATE OR DELETE ON public.accounting_postings FOR EACH ROW EXECUTE FUNCTION accounting_private.guard_posted_immutable();
CREATE TRIGGER b_line_immutable BEFORE UPDATE OR DELETE ON public.accounting_posting_lines FOR EACH ROW EXECUTE FUNCTION accounting_private.guard_posted_immutable();
CREATE TRIGGER c_posting_no_truncate BEFORE TRUNCATE ON public.accounting_postings FOR EACH STATEMENT EXECUTE FUNCTION accounting_private.guard_posted_truncate();
CREATE TRIGGER c_line_no_truncate BEFORE TRUNCATE ON public.accounting_posting_lines FOR EACH STATEMENT EXECUTE FUNCTION accounting_private.guard_posted_truncate();

-- Deferred (commit-time) invariants for a posting and its lines.
CREATE FUNCTION accounting_private.check_posting(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.accounting_postings; n integer;
BEGIN
 SELECT * INTO p FROM public.accounting_postings WHERE id = _id;
 IF NOT FOUND THEN RETURN; END IF; -- removed by confirmed erasure in the same transaction
 SELECT count(*) INTO n FROM public.accounting_posting_lines WHERE posting_id = _id;
 IF n < 2 THEN RAISE EXCEPTION 'A posting needs at least two lines' USING ERRCODE = '23514'; END IF;
 IF (SELECT sum(debit) <> sum(credit) FROM public.accounting_posting_lines WHERE posting_id = _id) THEN
  RAISE EXCEPTION 'Unbalanced posting: debits must equal credits' USING ERRCODE = '23514';
 END IF;
 IF EXISTS (SELECT 1 FROM public.accounting_posting_lines WHERE posting_id = _id GROUP BY entity_id, currency HAVING sum(debit) <> sum(credit)) THEN
  RAISE EXCEPTION 'Unbalanced posting: debits must equal credits for each legal entity and currency' USING ERRCODE = '23514';
 END IF;
 IF p.reverses_id IS NOT NULL AND (
   SELECT coalesce(jsonb_agg(jsonb_build_array(entity_id, currency, code, role, account_id, credit, debit) ORDER BY entity_id, currency, code, role, account_id, credit, debit), '[]') FROM public.accounting_posting_lines WHERE posting_id = p.reverses_id
  ) IS DISTINCT FROM (
   SELECT coalesce(jsonb_agg(jsonb_build_array(entity_id, currency, code, role, account_id, debit, credit) ORDER BY entity_id, currency, code, role, account_id, debit, credit), '[]') FROM public.accounting_posting_lines WHERE posting_id = _id
  ) THEN
  RAISE EXCEPTION 'Reversal must exactly mirror the original posting' USING ERRCODE = '23514';
 END IF;
 IF p.kind IN ('entry', 'entry_reversal') AND (
   SELECT count(*) FROM public.accounting_postings x WHERE x.owner_id = p.owner_id AND x.source_entry_id = p.source_entry_id AND x.entity_id = p.entity_id AND x.kind = 'entry'
    AND NOT EXISTS (SELECT 1 FROM public.accounting_postings r WHERE r.reverses_id = x.id)) > 1 THEN
  RAISE EXCEPTION 'Economic event already has an active posting for this company' USING ERRCODE = '23505';
 END IF;
END $$;
CREATE FUNCTION accounting_private.check_posting_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF TG_TABLE_NAME = 'accounting_postings' THEN PERFORM accounting_private.check_posting((to_jsonb(NEW)->>'id')::uuid);
 ELSE PERFORM accounting_private.check_posting((to_jsonb(NEW)->>'posting_id')::uuid); END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER z_posting_balanced AFTER INSERT ON public.accounting_postings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accounting_private.check_posting_trigger();
CREATE CONSTRAINT TRIGGER z_lines_balanced AFTER INSERT ON public.accounting_posting_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accounting_private.check_posting_trigger();

-- ---------------------------------------------------------------------------------------------------------
-- Writer helpers
-- ---------------------------------------------------------------------------------------------------------
CREATE FUNCTION accounting_private.insert_posting(_owner uuid, _entity text, _date date, _kind text, _key text, _lines jsonb,
 _entry uuid DEFAULT NULL, _version integer DEFAULT NULL, _reverses uuid DEFAULT NULL, _run uuid DEFAULT NULL, _description text DEFAULT '',
 _journal jsonb DEFAULT NULL, _request uuid DEFAULT NULL, _entry_ids uuid[] DEFAULT '{}', _documents uuid[] DEFAULT '{}', _settlement uuid DEFAULT NULL, _meta jsonb DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid := md5(_owner::text || ':' || _key)::uuid; l jsonb; n integer := 0;
BEGIN
 PERFORM set_config('ledgerline.posting_writer', 'on', true);
 INSERT INTO public.accounting_postings(id, owner_id, entity_id, posting_date, kind, idempotency_key, source_entry_id, entry_version, journal_id, request_id, journal, entry_ids, document_ids, settlement_entry_id, reverses_id, backfill_run_id, description, meta, actor_id)
 VALUES (pid, _owner, _entity, _date, _kind, _key, _entry, _version, (_journal->>'id')::uuid, _request, _journal, coalesce(_entry_ids, '{}'), coalesce(_documents, '{}'), _settlement, _reverses, _run, left(coalesce(_description, ''), 500), coalesce(_meta, '{}'), auth.uid());
 FOR l IN SELECT value FROM jsonb_array_elements(_lines) LOOP
  n := n + 1;
  INSERT INTO public.accounting_posting_lines(id, posting_id, owner_id, line_no, entity_id, currency, code, label, role, debit, credit, account_id, entry_id, cash_flow, original_currency, original_amount, meta)
  VALUES (md5(pid::text || ':' || n)::uuid, pid, _owner, n, coalesce(l->>'entityId', _entity), coalesce(l->>'currency', 'INR'), l->>'code', coalesce(l->>'label', l->>'code'), l->>'role',
   (l->>'debit')::numeric, (l->>'credit')::numeric, (l->>'accountId')::uuid, (l->>'entryId')::uuid, l->>'cashFlow', l->>'originalCurrency', (l->>'originalAmount')::numeric, coalesce(l->'meta', '{}'));
 END LOOP;
 PERFORM set_config('ledgerline.posting_writer', '', true);
 RETURN pid;
END $$;

CREATE FUNCTION accounting_private.lines_of(_posting uuid, _swap boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('entityId', entity_id, 'currency', currency, 'code', code, 'label', label, 'role', role,
  'debit', CASE WHEN _swap THEN credit ELSE debit END, 'credit', CASE WHEN _swap THEN debit ELSE credit END,
  'accountId', account_id, 'entryId', entry_id, 'cashFlow', cash_flow, 'originalCurrency', original_currency, 'originalAmount', original_amount, 'meta', meta) ORDER BY line_no), '[]')
 FROM public.accounting_posting_lines WHERE posting_id = _posting
$$;

-- Order-independent identity of financial content (labels are presentation only).
CREATE FUNCTION accounting_private.canon(_lines jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_array(x->>'code', x->>'role', (x->>'debit')::numeric, (x->>'credit')::numeric, x->>'accountId') ORDER BY x->>'code', x->>'role', (x->>'debit')::numeric, (x->>'credit')::numeric, x->>'accountId'), '[]')
 FROM jsonb_array_elements(coalesce(_lines, '[]')) x
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Derivation: the SAME rules as src/lib/books/corporate-statements.ts (per company, per entry).
-- Returns [{entityId, entryId, date, lines:[{code,label,role,debit,credit,accountId}], exception}] where an
-- 'unclassified' counterpart (or a manual company movement without a company account) is an exception,
-- never a posting (V3.1 §5 posting policy).
-- ---------------------------------------------------------------------------------------------------------
CREATE FUNCTION accounting_private.owner_of(_map jsonb, _account text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT key FROM jsonb_each(CASE WHEN jsonb_typeof(_map) = 'object' THEN _map ELSE '{}'::jsonb END)
 WHERE jsonb_typeof(value) = 'array' AND value ? _account ORDER BY key LIMIT 1
$$;
CREATE FUNCTION accounting_private.leg(_code text, _label text, _role text, _signed numeric, _account uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN round(_signed, 2) = 0 THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('code', _code, 'label', _label, 'role', _role,
  'debit', greatest(round(_signed, 2), 0), 'credit', greatest(-round(_signed, 2), 0), 'accountId', _account)) END
$$;

CREATE FUNCTION accounting_private.derive_entry(_e public.expenses, _prefs jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
 map jsonb := CASE WHEN jsonb_typeof(_prefs->'books'->'entityAccounts') = 'object' THEN _prefs->'books'->'entityAccounts' ELSE '{}'::jsonb END;
 kind text := coalesce(_e.txn_type, 'expense');
 is_move boolean := coalesce(_e.txn_type, 'expense') IN ('transfer', 'card_payment', 'loan_repayment', 'investment');
 company text; eid text; out jsonb := '[]'; lines jsonb; exc text; net numeric; counter numeric; a record; delta numeric; signed numeric; sgn integer; touched integer;
 principal numeric := _e.amount; interest numeric := 0; total numeric; parts jsonb; part record; nparts integer; allocated numeric; v numeric;
 ext uuid; ext_name text; money_in boolean; payer_name text; ids uuid[];
BEGIN
 IF _e.transfer_counterpart_of IS NOT NULL OR (_e.receipt_details ? 'accounting') OR _e.amount IS NULL OR _e.amount < 0 THEN RETURN out; END IF;
 -- ledger.ts repaymentParts (store maps originalAmount = original_amount ?? amount)
 IF kind = 'loan_repayment' AND _e.principal IS NOT NULL AND _e.interest IS NOT NULL THEN
  total := coalesce(_e.original_amount, _e.amount);
  interest := CASE WHEN total > 0 THEN round(_e.amount * _e.interest / total, 2) ELSE 0 END;
  principal := _e.amount - interest;
 END IF;
 -- entity-accounts.ts effectiveEntity
 company := CASE WHEN _e.entity_source = 'manual' THEN _e.entity_id WHEN _e.account_id IS NULL THEN NULL ELSE accounting_private.owner_of(map, _e.account_id::text) END;
 FOR eid IN SELECT DISTINCT x->>'id' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_prefs->'entities') = 'array' THEN _prefs->'entities' ELSE '[]'::jsonb END) x WHERE x->>'id' IS NOT NULL ORDER BY 1 LOOP
  SELECT coalesce(array_agg(ac.id), '{}') INTO ids FROM public.accounts ac WHERE ac.owner_id = _e.employee_id AND accounting_private.owner_of(map, ac.id::text) = eid;
  SELECT count(*) INTO touched FROM unnest(ids) i WHERE i = _e.account_id OR i = _e.to_account_id;
  IF touched = 0 AND company IS DISTINCT FROM eid THEN CONTINUE; END IF;
  lines := '[]'; net := 0; exc := NULL;
  -- ledger.ts accountBalance for this entry, liabilities credit-normal
  FOR a IN SELECT ac.id, ac.name, ac.kind FROM public.accounts ac WHERE ac.id = ANY(ids) AND (ac.id = _e.account_id OR ac.id = _e.to_account_id) ORDER BY ac.id LOOP
   sgn := CASE WHEN a.kind IN ('credit_card', 'loan', 'other_liability') THEN -1 ELSE 1 END; delta := 0;
   IF _e.account_id = a.id THEN
    delta := CASE WHEN kind = 'expense' THEN -_e.amount * sgn WHEN kind IN ('income', 'refund', 'reimbursement') THEN _e.amount * sgn
     WHEN kind = 'adjustment' THEN _e.amount * coalesce(_e.adjustment_sign, 1) WHEN is_move THEN -_e.amount * sgn
     WHEN kind = 'advance' THEN _e.amount * sgn WHEN kind = 'advance_settlement' THEN -_e.amount * sgn ELSE 0 END;
   END IF;
   IF is_move AND _e.to_account_id = a.id THEN delta := delta + (CASE WHEN kind = 'loan_repayment' THEN principal ELSE _e.amount END) * sgn; END IF;
   signed := CASE WHEN sgn = -1 THEN -delta ELSE delta END;
   lines := lines || accounting_private.leg('account:' || a.id, a.name, CASE WHEN sgn = -1 THEN 'liability' ELSE 'asset' END, signed, a.id);
   net := net + signed;
  END LOOP;
  -- A manually assigned company event paid outside company accounts is due to/from that payer.
  IF company IS NOT DISTINCT FROM eid AND touched = 0 THEN
   IF kind IN ('expense', 'income', 'refund', 'reimbursement') THEN
    money_in := kind <> 'expense';
    SELECT name INTO payer_name FROM public.accounts WHERE id = _e.account_id AND owner_id = _e.employee_id;
    lines := lines || accounting_private.leg('due:' || CASE WHEN money_in THEN 'from' ELSE 'to' END || ':' || coalesce(_e.account_id::text, 'unknown'),
     'Due ' || CASE WHEN money_in THEN 'from ' ELSE 'to ' END || coalesce(payer_name, 'unidentified payer'), CASE WHEN money_in THEN 'asset' ELSE 'liability' END,
     CASE WHEN money_in THEN _e.amount ELSE -_e.amount END, NULL);
    net := CASE WHEN money_in THEN _e.amount ELSE -_e.amount END;
   ELSE
    out := out || jsonb_build_array(jsonb_build_object('entityId', eid, 'entryId', _e.id, 'date', _e.expense_date, 'lines', '[]'::jsonb,
     'exception', 'Manually assigned movement has no linked company account; classification requires review.'));
    CONTINUE;
   END IF;
  END IF;
  IF net <> 0 THEN -- internal transfers/card settlements have two equal legs: no expense, no income
   counter := -net;
   IF company IS NOT DISTINCT FROM eid AND kind IN ('expense', 'refund', 'income') THEN
    parts := CASE WHEN jsonb_typeof(_e.allocations) = 'array' AND jsonb_array_length(_e.allocations) > 0
     THEN (SELECT jsonb_agg(jsonb_build_object('category', x->>'category', 'amount', (x->>'amount')::numeric) ORDER BY o) FROM jsonb_array_elements(_e.allocations) WITH ORDINALITY t(x, o))
     ELSE jsonb_build_array(jsonb_build_object('category', _e.category, 'amount', _e.amount)) END;
    IF (SELECT round(sum((x->>'amount')::numeric), 2) FROM jsonb_array_elements(parts) x) <> round(_e.amount, 2) THEN
     lines := lines || accounting_private.leg('unclassified:allocation', 'Invalid category allocation', 'unclassified', counter, NULL);
     exc := 'Category allocation does not equal the original entry; counterpart remains unclassified.';
    ELSE
     nparts := jsonb_array_length(parts); allocated := 0;
     FOR part IN SELECT x->>'category' AS category, (x->>'amount')::numeric AS amount, o FROM jsonb_array_elements(parts) WITH ORDINALITY t(x, o) ORDER BY o LOOP
      v := CASE WHEN part.o = nparts THEN counter - allocated ELSE round(counter * part.amount / _e.amount, 2) END;
      allocated := allocated + v;
      lines := lines || accounting_private.leg(CASE WHEN kind = 'income' THEN 'income:' ELSE 'expense:' END || part.category, part.category, CASE WHEN kind = 'income' THEN 'income' ELSE 'expense' END, v, NULL);
     END LOOP;
    END IF;
   ELSIF kind = 'loan_repayment' AND company IS NOT DISTINCT FROM eid AND _e.account_id = ANY(ids) AND _e.to_account_id = ANY(ids) THEN
    lines := lines || accounting_private.leg('expense:loan-interest', 'Loan interest', 'expense', counter, NULL);
   ELSIF is_move THEN -- cross-boundary money is due from/to, never company profit
    SELECT x INTO ext FROM unnest(ARRAY[_e.account_id, _e.to_account_id]) WITH ORDINALITY t(x, o) WHERE x IS NOT NULL AND NOT x = ANY(ids) ORDER BY o LIMIT 1;
    SELECT name INTO ext_name FROM public.accounts WHERE id = ext AND owner_id = _e.employee_id;
    lines := lines || accounting_private.leg('due:' || CASE WHEN counter > 0 THEN 'from' ELSE 'to' END || ':' || coalesce(ext::text, 'unknown'),
     'Due ' || CASE WHEN counter > 0 THEN 'from ' ELSE 'to ' END || coalesce(ext_name, 'unidentified counterparty'), CASE WHEN counter > 0 THEN 'asset' ELSE 'liability' END, counter, NULL);
   ELSIF kind = 'adjustment' AND company IS NOT DISTINCT FROM eid AND net < 0 AND EXISTS (
     SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_prefs->'books'->'journals') = 'array' THEN _prefs->'books'->'journals' ELSE '[]'::jsonb END) j
     WHERE j->>'status' = 'posted' AND j->>'transactionId' = _e.id::text) THEN
    lines := lines || accounting_private.leg('expense:depreciation', 'Posted book depreciation', 'expense', counter, NULL);
   ELSE
    lines := lines || accounting_private.leg('unclassified:' || kind, kind || ' counterpart — requires accounting classification', 'unclassified', counter, NULL);
    exc := kind || ' has no confirmed accounting counterpart; not treated as income or expense.';
   END IF;
  END IF;
  out := out || jsonb_build_array(jsonb_build_object('entityId', eid, 'entryId', _e.id, 'date', _e.expense_date, 'lines', lines, 'exception', exc));
 END LOOP;
 RETURN out;
END $$;

CREATE FUNCTION accounting_private.active_entry_posting(_owner uuid, _entry uuid, _entity text) RETURNS public.accounting_postings
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT p.* FROM public.accounting_postings p WHERE p.owner_id = _owner AND p.source_entry_id = _entry AND p.entity_id = _entity AND p.kind = 'entry'
  AND NOT EXISTS (SELECT 1 FROM public.accounting_postings r WHERE r.reverses_id = p.id) ORDER BY p.entry_version DESC LIMIT 1
$$;

-- Compare the derived state of one entry with its active postings; optionally apply reversal + replacement.
CREATE FUNCTION accounting_private.sync_entry(_owner uuid, _entry uuid, _run uuid, _apply boolean, _skip_closed boolean, _prefs jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.expenses; derived jsonb := '[]'; eid text; g jsonb; act public.accounting_postings; postable boolean; closed boolean; action text;
 out jsonb := '[]'; ver integer; periods jsonb := _prefs->'books'->'closedPeriods';
BEGIN
 SELECT * INTO e FROM public.expenses WHERE id = _entry AND employee_id = _owner;
 IF FOUND THEN derived := accounting_private.derive_entry(e, _prefs); END IF;
 FOR eid IN SELECT x->>'entityId' FROM jsonb_array_elements(derived) x UNION SELECT entity_id FROM public.accounting_postings WHERE owner_id = _owner AND source_entry_id = _entry AND kind = 'entry' ORDER BY 1 LOOP
  SELECT x INTO g FROM jsonb_array_elements(derived) x WHERE x->>'entityId' = eid LIMIT 1;
  act := accounting_private.active_entry_posting(_owner, _entry, eid);
  postable := g IS NOT NULL AND g->>'exception' IS NULL AND jsonb_array_length(g->'lines') >= 2;
  IF act.id IS NOT NULL AND postable AND accounting_private.canon(accounting_private.lines_of(act.id)) = accounting_private.canon(g->'lines') AND act.posting_date = (g->>'date')::date THEN action := 'unchanged';
  ELSIF act.id IS NULL AND NOT postable THEN action := CASE WHEN g IS NULL THEN NULL ELSE 'exception' END;
  ELSE action := CASE WHEN act.id IS NULL THEN 'post' WHEN postable THEN 'replace' ELSE 'reverse' END; END IF;
  CONTINUE WHEN action IS NULL;
  closed := action IN ('post', 'replace', 'reverse') AND ((postable AND public.ll_closed_on(periods, g->>'date', eid)) OR (act.id IS NOT NULL AND public.ll_closed_on(periods, act.posting_date::text, eid)));
  out := out || jsonb_build_array(jsonb_build_object('entryId', _entry, 'entityId', eid, 'action', action, 'date', coalesce(g->>'date', act.posting_date::text),
   'lines', CASE WHEN postable THEN g->'lines' ELSE '[]'::jsonb END, 'derivedLines', coalesce(g->'lines', '[]'::jsonb), 'exception', g->>'exception', 'reverses', act.id, 'closed', closed));
  IF _apply AND action IN ('post', 'replace', 'reverse') AND NOT (closed AND _skip_closed) THEN
   IF act.id IS NOT NULL THEN
    PERFORM accounting_private.insert_posting(_owner, eid, act.posting_date, 'entry_reversal', 'reverse:' || act.id, accounting_private.lines_of(act.id, true),
     _entry => _entry, _reverses => act.id, _run => _run, _description => 'Reversal of superseded ledger posting');
   END IF;
   IF postable THEN
    SELECT coalesce(max(entry_version), 0) + 1 INTO ver FROM public.accounting_postings WHERE owner_id = _owner AND source_entry_id = _entry AND entity_id = eid AND kind = 'entry';
    PERFORM accounting_private.insert_posting(_owner, eid, (g->>'date')::date, 'entry', 'entry:' || _entry || ':' || eid || ':v' || ver,
     (SELECT jsonb_agg(l || jsonb_build_object('entryId', _entry, 'originalCurrency', e.currency, 'originalAmount', e.original_amount)) FROM jsonb_array_elements(g->'lines') l),
     _entry => _entry, _version => ver, _run => _run, _description => left(coalesce(e.title, ''), 200), _entry_ids => ARRAY[_entry]);
   END IF;
  END IF;
 END LOOP;
 RETURN out;
END $$;

CREATE FUNCTION accounting_private.posting_active(_owner uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT coalesce((SELECT r.undone_at IS NULL FROM public.accounting_backfill_runs r WHERE r.owner_id = _owner ORDER BY r.committed_at DESC, r.id DESC LIMIT 1), false)
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Ledger (expenses) and document guards
-- ---------------------------------------------------------------------------------------------------------
CREATE FUNCTION accounting_private.entry_financial(_e public.expenses) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT to_jsonb(_e) - 'updated_at' - 'reconciled_at' - 'reconciled_by' - 'statement_ref'
$$;
CREATE FUNCTION accounting_private.guard_accounting_entry() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF current_setting('ledgerline.erasing', true) = 'on' THEN RETURN coalesce(NEW, OLD); END IF;
 IF TG_OP = 'INSERT' THEN
  IF NEW.receipt_details ? 'accounting' AND coalesce(current_setting('ledgerline.accounting_request', true), '') IS DISTINCT FROM NEW.receipt_details->'accounting'->>'requestId'
     AND coalesce(current_setting('ledgerline.restoring', true), '') <> 'on' THEN
   RAISE EXCEPTION 'Accounting evidence requires atomic journal posting';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD.receipt_details ? 'accounting' OR (TG_OP = 'UPDATE' AND NEW.receipt_details ? 'accounting') THEN
  -- Statement reconciliation metadata may change; amounts, ownership and journal evidence never do.
  IF TG_OP = 'UPDATE' AND accounting_private.entry_financial(NEW) = accounting_private.entry_financial(OLD) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Posted accounting evidence is immutable; use an exact reversal and replacement';
 END IF;
 IF EXISTS (SELECT 1 FROM public.accounting_postings p WHERE p.owner_id = OLD.employee_id AND p.settlement_entry_id = OLD.id AND p.kind = 'journal')
    AND (TG_OP = 'DELETE' OR accounting_private.entry_financial(NEW) <> accounting_private.entry_financial(OLD)) THEN
  RAISE EXCEPTION 'Settlement source is retained; reverse and replace without editing the original';
 END IF;
 RETURN coalesce(NEW, OLD);
END $$;
CREATE TRIGGER accounting_entry_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION accounting_private.guard_accounting_entry();

-- After an owner commits a backfill run, every later ledger change keeps postings in step:
-- reversal of the superseded posting + replacement, never an in-place edit. Closed periods refuse it.
CREATE FUNCTION accounting_private.sync_entry_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner uuid := coalesce(NEW.employee_id, OLD.employee_id); prefs jsonb;
BEGIN
 IF current_setting('ledgerline.erasing', true) = 'on' OR NOT accounting_private.posting_active(owner) THEN RETURN NULL; END IF;
 SELECT data INTO prefs FROM public.finance_preferences WHERE owner_id = owner;
 PERFORM accounting_private.sync_entry(owner, coalesce(NEW.id, OLD.id), NULL, true, false, coalesce(prefs, '{}'));
 IF TG_OP = 'UPDATE' AND NEW.id <> OLD.id THEN PERFORM accounting_private.sync_entry(owner, OLD.id, NULL, true, false, coalesce(prefs, '{}')); END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER accounting_entry_sync AFTER INSERT OR UPDATE OR DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION accounting_private.sync_entry_trigger();

CREATE FUNCTION accounting_private.guard_accounting_original() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF current_setting('ledgerline.erasing', true) = 'on' THEN RETURN coalesce(NEW, OLD); END IF;
 IF EXISTS (SELECT 1 FROM public.accounting_postings p WHERE p.document_ids @> ARRAY[OLD.id] AND p.owner_id = OLD.owner_id)
    AND (TG_OP = 'DELETE' OR NEW.file_path IS DISTINCT FROM OLD.file_path OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.entity_id IS DISTINCT FROM OLD.entity_id OR NOT NEW.evidence_locked) THEN
  RAISE EXCEPTION 'Accounting original is retained; save corrections as new evidence';
 END IF;
 RETURN coalesce(NEW, OLD);
END $$;
CREATE TRIGGER accounting_original_immutable BEFORE UPDATE OR DELETE ON public.documents FOR EACH ROW EXECUTE FUNCTION accounting_private.guard_accounting_original();

-- ---------------------------------------------------------------------------------------------------------
-- RPCs kept from accounting-foundation (same names and signatures as store.tsx calls)
-- ---------------------------------------------------------------------------------------------------------
CREATE FUNCTION public.set_accounting_review_grant(_entity text, _identity text, _revoke boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); target uuid;
BEGIN
 IF uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Sign in with a real account to share accounting review'; END IF;
 IF NOT accounting_private.entity_exists(uid, _entity) THEN RAISE EXCEPTION 'Owner company unavailable'; END IF;
 -- Identity is verified by the server; profile names never grant a role.
 SELECT id INTO target FROM auth.users WHERE email_confirmed_at IS NOT NULL AND (lower(email) = lower(trim(_identity)) OR id::text = _identity) LIMIT 1;
 IF target IS NULL OR target = uid THEN RAISE EXCEPTION 'Choose a different verified accountant account'; END IF;
 INSERT INTO public.accounting_review_grants(owner_id, accountant_id, entity_id, revoked_at) VALUES (uid, target, _entity, CASE WHEN _revoke THEN now() END)
 ON CONFLICT (owner_id, accountant_id, entity_id) DO UPDATE SET revoked_at = excluded.revoked_at;
END $$;

CREATE FUNCTION public.review_accounting_exception(_id uuid, _owner uuid, _journal uuid, _finding text, _note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); ev record; prev public.accounting_exception_reviews;
BEGIN
 SELECT entity_id, posting_id INTO ev FROM public.accounting_journal_evidence WHERE id = _journal AND owner_id = _owner;
 IF ev.entity_id IS NULL OR uid IS NULL OR NOT (uid = _owner OR EXISTS (SELECT 1 FROM public.accounting_review_grants WHERE owner_id = _owner AND accountant_id = uid AND entity_id = ev.entity_id AND revoked_at IS NULL)) THEN
  RAISE EXCEPTION 'Accountant review not authorised';
 END IF;
 IF length(trim(coalesce(_note, ''))) < 5 OR length(trim(coalesce(_finding, ''))) = 0 THEN RAISE EXCEPTION 'Finding and written review required'; END IF;
 SELECT * INTO prev FROM public.accounting_exception_reviews WHERE id = _id;
 IF FOUND THEN
  IF prev.owner_id <> _owner OR prev.journal_id <> _journal OR prev.actor_id <> uid OR prev.finding <> _finding OR prev.note <> _note THEN RAISE EXCEPTION 'Review request changed'; END IF;
  RETURN;
 END IF;
 INSERT INTO public.accounting_exception_reviews(id, owner_id, entity_id, journal_id, posting_id, finding, note, actor_id) VALUES (_id, _owner, ev.entity_id, _journal, ev.posting_id, _finding, _note, uid);
END $$;

-- Manual journals: the accounting-foundation validation rules, now stored as ONE posting with its lines.
-- Linked money legs still create canonical 'adjustment' entries so accountBalance and corporate-statements.ts
-- keep working; those entries are covered by this posting (derivation skips them), so the event posts once.
CREATE FUNCTION public.post_accounting_journal(_request uuid, _journal jsonb, _expected bigint) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); prefs jsonb; rev bigint; ent text := _journal->>'entityId'; dt date;
 jid uuid := (_journal->>'id')::uuid; previous public.accounting_journal_evidence;
 l jsonb; a public.accounts; deb numeric := 0; cred numeric := 0; n integer := 0; ids uuid[] := '{}'; tid uuid;
 primary_entry boolean := true; linked integer := 0; sign integer; amount numeric; prior public.accounting_journal_evidence;
 plines jsonb := '[]'; docs uuid[]; rev_posting uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 SELECT data, revision INTO prefs, rev FROM public.finance_preferences WHERE owner_id = uid FOR UPDATE;
 IF prefs IS NULL THEN RAISE EXCEPTION 'Owner preferences not found'; END IF;
 IF jid IS NULL OR _request IS NULL THEN RAISE EXCEPTION 'Journal and request identity required'; END IF;
 SELECT * INTO previous FROM public.accounting_journal_evidence WHERE owner_id = uid AND (id = jid OR request_id = _request);
 IF FOUND THEN
  IF previous.id <> jid OR previous.request_id <> _request OR previous.journal <> _journal THEN RAISE EXCEPTION 'Journal request identity already used'; END IF;
  RETURN previous.entry_ids;
 END IF;
 IF rev IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Accounting records changed; refresh before confirmation'; END IF;
 IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(prefs->'entities', '[]')) e WHERE e->>'id' = ent) THEN RAISE EXCEPTION 'Company unavailable'; END IF;
 IF coalesce(_journal->>'kind', '') NOT IN ('opening','accrual','advance','prepayment','depreciation','adjustment','reversal') OR length(trim(coalesce(_journal->>'description', ''))) < 5 THEN RAISE EXCEPTION 'Journal type and explanation required'; END IF;
 dt := (_journal->>'date')::date;
 IF dt IS NULL OR dt::text <> _journal->>'date' THEN RAISE EXCEPTION 'Invalid journal date'; END IF;
 IF public.ll_closed_on(prefs->'books'->'closedPeriods', dt::text, ent) THEN RAISE EXCEPTION 'Accounting period is closed'; END IF;
 IF jsonb_typeof(_journal->'documentIds') IS DISTINCT FROM 'array' OR jsonb_array_length(_journal->'documentIds') = 0 THEN RAISE EXCEPTION 'Retained originals required'; END IF;
 -- accounting-foundation defect fixed: its unqualified "id" resolved to d.id, so any owner document satisfied this check.
 IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(_journal->'documentIds') t(doc_id) WHERE NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id = t.doc_id::uuid AND d.owner_id = uid AND d.entity_id = ent AND length(coalesce(d.file_path, '')) > 0)) THEN RAISE EXCEPTION 'Company original unavailable'; END IF;
 IF jsonb_typeof(_journal->'legs') IS DISTINCT FROM 'array' OR jsonb_array_length(_journal->'legs') < 2 THEN RAISE EXCEPTION 'Two accounting legs required'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(_journal->'legs') x GROUP BY x->>'code' HAVING count(*) > 1) THEN RAISE EXCEPTION 'Repeated account codes'; END IF;
 FOR l IN SELECT * FROM jsonb_array_elements(_journal->'legs') LOOP
  IF l->>'role' IS NULL OR l->>'role' NOT IN ('asset','liability','equity','income','expense') OR length(coalesce(l->>'code', '')) = 0 OR length(coalesce(l->>'label', '')) = 0 THEN RAISE EXCEPTION 'Invalid accounting role or code'; END IF;
  IF l->'source' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(prefs->'books'->'fyRecords', '[]')) fy WHERE fy->>'entityId' = ent AND fy->'docIds' ? (l->'source'->>'docId') AND fy->'details'->((l->'source'->>'detail')::int)->>'docId' = l->'source'->>'docId' AND fy->'details'->((l->'source'->>'detail')::int)->'lines'->((l->'source'->>'line')::int)->>'label' = l->>'label' AND (fy->'details'->((l->'source'->>'detail')::int)->'lines'->((l->'source'->>'line')::int)->>'amount')::numeric = (l->'source'->>'printedAmount')::numeric AND coalesce(fy->'details'->((l->'source'->>'detail')::int)->'lines'->((l->'source'->>'line')::int)->>'quote', '') = l->'source'->>'quote' AND fy->'details'->((l->'source'->>'detail')::int)->'lines'->((l->'source'->>'line')::int)->'page' IS NOT DISTINCT FROM l->'source'->'page') THEN RAISE EXCEPTION 'Opening schedule source differs from retained reading'; END IF;
  IF l->>'debit' IS NULL OR l->>'credit' IS NULL OR jsonb_typeof(l->'debit') <> 'number' OR jsonb_typeof(l->'credit') <> 'number' OR (l->>'debit')::numeric < 0 OR (l->>'credit')::numeric < 0 OR ((l->>'debit')::numeric > 0) = ((l->>'credit')::numeric > 0) OR round((l->>'debit')::numeric, 2) <> (l->>'debit')::numeric OR round((l->>'credit')::numeric, 2) <> (l->>'credit')::numeric THEN RAISE EXCEPTION 'Invalid debit or credit'; END IF;
  IF _journal->>'kind' = 'opening' AND l->>'role' IN ('income','expense') THEN RAISE EXCEPTION 'Opening cannot create profit'; END IF;
  IF l->>'accountId' IS NOT NULL THEN
   SELECT * INTO a FROM public.accounts WHERE id = (l->>'accountId')::uuid AND owner_id = uid AND NOT archived;
   IF NOT FOUND OR NOT coalesce(prefs->'books'->'entityAccounts'->ent, '[]') ? (l->>'accountId') OR l->>'code' <> 'account:' || (l->>'accountId') THEN RAISE EXCEPTION 'Linked company account unavailable'; END IF;
   IF l->>'role' <> (CASE WHEN a.kind IN ('loan','other_liability','credit_card') THEN 'liability' ELSE 'asset' END) THEN RAISE EXCEPTION 'Account role differs'; END IF;
  ELSIF l->>'code' LIKE 'account:%' THEN RAISE EXCEPTION 'Account code requires a link'; END IF;
  IF EXISTS (SELECT 1 FROM public.accounting_posting_lines old WHERE old.owner_id = uid AND old.entity_id = ent AND old.code = l->>'code' AND old.role <> l->>'role') THEN RAISE EXCEPTION 'Account role changed; use a distinct account code'; END IF;
  deb := deb + (l->>'debit')::numeric; cred := cred + (l->>'credit')::numeric;
 END LOOP;
 IF deb <> cred THEN RAISE EXCEPTION 'Unbalanced journal; differences cannot be accepted'; END IF;
 IF _journal->'recurrence' IS NOT NULL THEN
  IF _journal->>'kind' NOT IN ('accrual','prepayment') OR jsonb_array_length(_journal->'legs') <> 2 OR EXISTS (SELECT 1 FROM jsonb_array_elements(_journal->'legs') x WHERE x->>'accountId' IS NOT NULL) OR (_journal->'recurrence'->>'months')::int NOT BETWEEN 1 AND 120 OR (_journal->'recurrence'->>'monthlyAmount')::numeric <= 0 OR round((_journal->'recurrence'->>'monthlyAmount')::numeric, 2) <> (_journal->'recurrence'->>'monthlyAmount')::numeric OR (_journal->'recurrence'->>'start')::date::text <> _journal->'recurrence'->>'start' OR extract(day FROM (_journal->'recurrence'->>'start')::date) <> 1 THEN RAISE EXCEPTION 'Invalid recurring recognition schedule'; END IF;
 END IF;
 IF _journal->'recurringSource' IS NOT NULL AND _journal->>'kind' <> 'reversal' THEN
  SELECT * INTO prior FROM public.accounting_journal_evidence WHERE id = (_journal->'recurringSource'->>'templateId')::uuid AND owner_id = uid AND entity_id = ent;
  IF NOT FOUND OR prior.journal->'recurrence' IS NULL OR EXISTS (SELECT 1 FROM public.accounting_journal_evidence WHERE owner_id = uid AND journal->>'reversesId' = prior.id::text AND journal->'recurringSource' IS NULL) THEN RAISE EXCEPTION 'Recurring source unavailable or reversed'; END IF;
  IF dt::text <> _journal->'recurringSource'->>'date' OR dt <> ((date_trunc('month', dt) + interval '1 month - 1 day')::date) OR date_trunc('month', dt) < (prior.journal->'recurrence'->>'start')::date OR date_trunc('month', dt) >= (prior.journal->'recurrence'->>'start')::date + make_interval(months => (prior.journal->'recurrence'->>'months')::int) OR dt < (prior.journal->>'date')::date THEN RAISE EXCEPTION 'Recurring occurrence date differs'; END IF;
  IF prior.journal->>'kind' = 'accrual' AND date_trunc('month', dt) = date_trunc('month', (prior.journal->>'date')::date) THEN RAISE EXCEPTION 'Template month already recognised'; END IF;
  IF EXISTS (SELECT 1 FROM public.accounting_journal_evidence WHERE owner_id = uid AND entity_id = ent AND journal->'recurringSource'->>'templateId' = prior.id::text AND journal->'recurringSource'->>'date' = dt::text AND journal->>'kind' <> 'reversal') THEN RAISE EXCEPTION 'Recurring occurrence already posted'; END IF;
  IF _journal->'documentIds' IS DISTINCT FROM prior.journal->'documentIds' OR _journal->>'kind' IS DISTINCT FROM prior.journal->>'kind' OR jsonb_array_length(_journal->'legs') <> 2 THEN RAISE EXCEPTION 'Recurring source identity differs'; END IF;
  amount := (prior.journal->'recurrence'->>'monthlyAmount')::numeric;
  IF prior.journal->>'kind' = 'prepayment' THEN
   SELECT x INTO l FROM jsonb_array_elements(prior.journal->'legs') x WHERE x->>'role' = 'asset' AND (x->>'debit')::numeric > 0;
   IF l IS NULL OR coalesce((prior.journal->'recurrence'->>'reverseNextDay')::boolean, false) THEN RAISE EXCEPTION 'Unsupported prepaid release'; END IF;
   amount := least(amount, (l->>'debit')::numeric - coalesce((SELECT sum((s.journal->'recurringSource'->>'amount')::numeric) FROM public.accounting_journal_evidence s WHERE s.owner_id = uid AND s.journal->'recurringSource'->>'templateId' = prior.id::text AND s.journal->>'kind' <> 'reversal' AND NOT EXISTS (SELECT 1 FROM public.accounting_journal_evidence r WHERE r.owner_id = uid AND r.journal->>'reversesId' = s.id::text)), 0));
  END IF;
  IF amount <= 0 OR amount <> (_journal->'recurringSource'->>'amount')::numeric THEN RAISE EXCEPTION 'Recurring amount exceeds schedule or prepaid balance'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(prior.journal->'legs') old WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_journal->'legs') x WHERE (x - 'debit' - 'credit') = (old - 'debit' - 'credit') AND (x->>'debit')::numeric = CASE WHEN ((old->>'debit')::numeric > 0) <> (prior.journal->>'kind' = 'prepayment') THEN amount ELSE 0 END AND (x->>'credit')::numeric = CASE WHEN ((old->>'credit')::numeric > 0) <> (prior.journal->>'kind' = 'prepayment') THEN amount ELSE 0 END)) THEN RAISE EXCEPTION 'Recurring legs differ from retained template'; END IF;
 END IF;
 IF _journal->>'invoiceId' IS NOT NULL AND _journal->>'kind' <> 'reversal' THEN
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(prefs->'books'->'gstInvoices', '[]')) i WHERE i->>'id' = _journal->>'invoiceId' AND (i->>'transactionId' IS NULL) AND _journal->'documentIds' ? (i->>'docId') AND coalesce((SELECT e->'gstins' FROM jsonb_array_elements(prefs->'entities') e WHERE e->>'id' = ent), '[]') ? (i->>'gstin')) THEN RAISE EXCEPTION 'Invoice source or company differs, or already linked'; END IF;
  IF EXISTS (SELECT 1 FROM public.accounting_journal_evidence WHERE owner_id = uid AND journal->>'invoiceId' = _journal->>'invoiceId' AND journal->>'kind' <> 'reversal') THEN RAISE EXCEPTION 'Invoice already posted; correct with source-preserving reversal'; END IF;
 END IF;
 IF _journal->'settlement' IS NOT NULL AND _journal->>'kind' <> 'reversal' THEN
  SELECT * INTO prior FROM public.accounting_journal_evidence WHERE id = (_journal->'settlement'->>'journalId')::uuid AND owner_id = uid AND entity_id = ent;
  IF NOT FOUND OR prior.journal->>'kind' IN ('opening','reversal') OR dt < (prior.journal->>'date')::date OR EXISTS (SELECT 1 FROM public.accounting_journal_evidence WHERE owner_id = uid AND journal->>'reversesId' = prior.id::text) THEN RAISE EXCEPTION 'Accrual source unavailable or reversed'; END IF;
  IF EXISTS (SELECT 1 FROM public.accounting_journal_evidence s WHERE s.owner_id = uid AND s.journal->'settlement'->>'entryId' = _journal->'settlement'->>'entryId' AND s.journal->>'kind' <> 'reversal' AND NOT EXISTS (SELECT 1 FROM public.accounting_journal_evidence r WHERE r.owner_id = uid AND r.journal->>'reversesId' = s.id::text)) THEN RAISE EXCEPTION 'Bank transaction already settled'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = (_journal->'settlement'->>'entryId')::uuid AND e.employee_id = uid AND e.entity_id = ent AND e.expense_date = dt AND e.account_id::text = _journal->'settlement'->'snapshot'->>'accountId' AND e.amount = (_journal->'settlement'->>'amount')::numeric AND e.amount = (_journal->'settlement'->'snapshot'->>'amount')::numeric AND e.currency = 'INR' AND e.category = _journal->'settlement'->'snapshot'->>'category' AND e.txn_type = _journal->'settlement'->'snapshot'->>'txnType' AND e.receipt_details->'accounting' IS NULL) THEN RAISE EXCEPTION 'Bank settlement snapshot changed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = (_journal->'settlement'->>'entryId')::uuid AND coalesce(to_jsonb(e)->'allocations', '[]'::jsonb) = coalesce(_journal->'settlement'->'snapshot'->'allocations', '[]'::jsonb)) THEN RAISE EXCEPTION 'Bank allocation snapshot changed'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_journal->'legs') x WHERE x->>'accountId' IS NOT NULL) THEN RAISE EXCEPTION 'Settlement cannot move bank money again'; END IF;
  SELECT * INTO l FROM jsonb_array_elements(prior.journal->'legs') x WHERE x->>'code' = _journal->'settlement'->>'balanceCode';
  IF l IS NULL OR l->>'role' NOT IN ('asset','liability') OR l->>'accountId' IS NOT NULL THEN RAISE EXCEPTION 'Outstanding balance unavailable'; END IF;
  amount := CASE WHEN l->>'role' = 'liability' THEN (l->>'credit')::numeric - (l->>'debit')::numeric ELSE (l->>'debit')::numeric - (l->>'credit')::numeric END;
  amount := amount - coalesce((SELECT sum((s.journal->'settlement'->>'amount')::numeric) FROM public.accounting_journal_evidence s WHERE s.owner_id = uid AND s.journal->'settlement'->>'journalId' = prior.id::text AND s.journal->'settlement'->>'balanceCode' = l->>'code' AND s.journal->>'kind' <> 'reversal' AND NOT EXISTS (SELECT 1 FROM public.accounting_journal_evidence r WHERE r.owner_id = uid AND r.journal->>'reversesId' = s.id::text)), 0);
  IF (_journal->'settlement'->>'amount')::numeric <= 0 OR (_journal->'settlement'->>'amount')::numeric > amount THEN RAISE EXCEPTION 'Settlement exceeds outstanding balance'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_journal->'legs') x WHERE x->>'code' = l->>'code' AND x->>'role' = l->>'role' AND (x->>'debit')::numeric = (CASE WHEN l->>'role' = 'liability' THEN (_journal->'settlement'->>'amount')::numeric ELSE 0 END) AND (x->>'credit')::numeric = (CASE WHEN l->>'role' = 'asset' THEN (_journal->'settlement'->>'amount')::numeric ELSE 0 END)) THEN RAISE EXCEPTION 'Settlement balance legs differ'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(_journal->'legs')) <> 1 + (SELECT jsonb_array_length(CASE WHEN jsonb_array_length(coalesce(to_jsonb(e)->'allocations', '[]')) > 0 THEN to_jsonb(e)->'allocations' ELSE jsonb_build_array(jsonb_build_object('category', e.category, 'amount', e.amount)) END) FROM public.expenses e WHERE e.id = (_journal->'settlement'->>'entryId')::uuid) THEN RAISE EXCEPTION 'Settlement classification legs differ'; END IF;
  IF EXISTS (SELECT 1 FROM public.expenses e, jsonb_array_elements(CASE WHEN jsonb_array_length(coalesce(to_jsonb(e)->'allocations', '[]')) > 0 THEN to_jsonb(e)->'allocations' ELSE jsonb_build_array(jsonb_build_object('category', e.category, 'amount', e.amount)) END) part WHERE e.id = (_journal->'settlement'->>'entryId')::uuid AND (e.txn_type <> CASE WHEN l->>'role' = 'liability' THEN 'expense' ELSE 'income' END OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_journal->'legs') x WHERE x->>'code' = e.txn_type || ':' || (part->>'category') AND x->>'role' = e.txn_type AND (x->>'debit')::numeric = CASE WHEN e.txn_type = 'income' THEN (part->>'amount')::numeric ELSE 0 END AND (x->>'credit')::numeric = CASE WHEN e.txn_type = 'expense' THEN (part->>'amount')::numeric ELSE 0 END))) THEN RAISE EXCEPTION 'Settlement must reverse the exact bank income or expense classification'; END IF;
 END IF;
 IF _journal->>'kind' = 'opening' AND EXISTS (SELECT 1 FROM public.accounting_journal_evidence WHERE owner_id = uid AND entity_id = ent AND journal->>'kind' = 'opening' AND (journal->>'date')::date = dt) THEN RAISE EXCEPTION 'Opening already posted for this date'; END IF;
 IF _journal->>'reversesId' IS NOT NULL THEN
  SELECT * INTO prior FROM public.accounting_journal_evidence WHERE id = (_journal->>'reversesId')::uuid AND owner_id = uid AND entity_id = ent;
  IF NOT FOUND OR _journal->>'kind' <> 'reversal' OR dt < (prior.journal->>'date')::date THEN RAISE EXCEPTION 'Invalid reversal'; END IF;
  IF EXISTS (SELECT 1 FROM public.accounting_journal_evidence WHERE owner_id = uid AND journal->>'reversesId' = _journal->>'reversesId') THEN RAISE EXCEPTION 'Journal already reversed'; END IF;
  IF EXISTS (SELECT 1 FROM public.accounting_journal_evidence s WHERE s.owner_id = uid AND s.journal->'settlement'->>'journalId' = prior.id::text AND s.journal->>'kind' <> 'reversal' AND NOT EXISTS (SELECT 1 FROM public.accounting_journal_evidence r WHERE r.owner_id = uid AND r.journal->>'reversesId' = s.id::text)) THEN RAISE EXCEPTION 'Reverse retained settlements before correcting the accrual'; END IF;
  IF EXISTS (SELECT 1 FROM public.accounting_journal_evidence s WHERE s.owner_id = uid AND s.journal->'recurringSource'->>'templateId' = prior.id::text AND s.journal->>'kind' <> 'reversal' AND NOT EXISTS (SELECT 1 FROM public.accounting_journal_evidence r WHERE r.owner_id = uid AND r.journal->>'reversesId' = s.id::text)) THEN RAISE EXCEPTION 'Reverse recognition occurrences before correcting the template'; END IF;
  IF (SELECT jsonb_agg(jsonb_set(jsonb_set(x, '{debit}', x->'credit'), '{credit}', x->'debit') ORDER BY x->>'code') FROM jsonb_array_elements(prior.journal->'legs') x) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'code') FROM jsonb_array_elements(_journal->'legs') x) THEN RAISE EXCEPTION 'Reversal must exactly swap original legs'; END IF;
  rev_posting := prior.posting_id;
 ELSIF _journal->>'kind' = 'reversal' THEN RAISE EXCEPTION 'Invalid reversal';
 END IF;
 -- Only linked money legs affect accountBalance. Noncash journals retain one zero-delta canonical anchor.
 PERFORM set_config('ledgerline.accounting_request', _request::text, true);
 FOR l IN SELECT * FROM jsonb_array_elements(_journal->'legs') LOOP
  n := n + 1;
  tid := NULL;
  IF l->>'accountId' IS NOT NULL THEN
   linked := linked + 1;
   amount := (l->>'debit')::numeric - (l->>'credit')::numeric;
   IF l->>'role' = 'liability' THEN amount := -amount; END IF;
   sign := CASE WHEN amount > 0 THEN 1 ELSE -1 END;
   tid := md5(jid::text || ':' || n)::uuid;
   INSERT INTO public.expenses(id, employee_id, title, category, amount, original_amount, currency, expense_date, description, payment_method, scope, txn_type, account_id, adjustment_sign, entity_id, entity_source, receipt_details)
   VALUES (tid, uid, left(_journal->>'description', 200), 'Accounting', abs(amount), abs(amount), 'INR', dt, _journal->>'description', 'other', 'business', 'adjustment', (l->>'accountId')::uuid, sign, ent, 'manual', jsonb_build_object('accounting', jsonb_build_object('journal', _journal, 'primary', primary_entry, 'requestId', _request)));
   ids := ids || tid; primary_entry := false;
  END IF;
  plines := plines || jsonb_build_array(jsonb_build_object('code', l->>'code', 'label', l->>'label', 'role', l->>'role', 'debit', (l->>'debit')::numeric, 'credit', (l->>'credit')::numeric,
   'accountId', l->>'accountId', 'entryId', tid, 'cashFlow', l->>'cashFlow', 'meta', jsonb_strip_nulls(jsonb_build_object('source', l->'source', 'statutory', l->'statutory'))));
 END LOOP;
 IF linked = 0 THEN
  tid := md5(jid::text || ':anchor')::uuid;
  INSERT INTO public.expenses(id, employee_id, title, category, amount, original_amount, currency, expense_date, description, payment_method, scope, txn_type, adjustment_sign, entity_id, entity_source, receipt_details)
  VALUES (tid, uid, left(_journal->>'description', 200), 'Accounting', deb, deb, 'INR', dt, _journal->>'description', 'other', 'business', 'adjustment', 1, ent, 'manual', jsonb_build_object('accounting', jsonb_build_object('journal', _journal, 'primary', true, 'requestId', _request)));
  ids := ids || tid;
 END IF;
 SELECT coalesce(array_agg(value::uuid), '{}') INTO docs FROM jsonb_array_elements_text(_journal->'documentIds');
 UPDATE public.documents SET evidence_locked = true WHERE owner_id = uid AND id = ANY(docs);
 PERFORM accounting_private.insert_posting(uid, ent, dt, 'journal', 'journal:' || _request, plines, _reverses => rev_posting, _description => _journal->>'description',
  _journal => _journal, _request => _request, _entry_ids => ids, _documents => docs, _settlement => (_journal->'settlement'->>'entryId')::uuid);
 UPDATE public.finance_preferences SET revision = revision + 1, updated_at = now() WHERE owner_id = uid;
 PERFORM set_config('ledgerline.accounting_request', '', true);
 RETURN ids;
END $$;

-- ---------------------------------------------------------------------------------------------------------
-- Backfill (never automatic): preview -> owner review -> commit with the reviewed fingerprint; undo by reversal
-- ---------------------------------------------------------------------------------------------------------
CREATE FUNCTION public.accounting_backfill(_mode text, _run uuid DEFAULT NULL, _expected text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); prefs jsonb; proposals jsonb := '[]'; r record; prior public.accounting_backfill_runs; fp text; result jsonb;
 openings jsonb; map jsonb; posted integer := 0;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF _mode NOT IN ('preview', 'commit') OR _mode IS NULL THEN RAISE EXCEPTION 'Choose preview or commit'; END IF;
 IF _mode = 'commit' AND (coalesce((auth.jwt()->>'is_anonymous')::boolean, false) OR _run IS NULL OR _expected IS NULL) THEN RAISE EXCEPTION 'Commit needs a real account, a run id and the reviewed preview fingerprint'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
 SELECT data INTO prefs FROM public.finance_preferences WHERE owner_id = uid FOR UPDATE;
 IF prefs IS NULL THEN RAISE EXCEPTION 'Owner preferences not found'; END IF;
 IF _mode = 'commit' THEN
  SELECT * INTO prior FROM public.accounting_backfill_runs WHERE id = _run;
  IF FOUND THEN
   IF prior.owner_id <> uid OR prior.fingerprint <> _expected THEN RAISE EXCEPTION 'Backfill run identity already used'; END IF;
   RETURN prior.result || jsonb_build_object('replayed', true);
  END IF;
 END IF;
 FOR r IN SELECT id FROM public.expenses WHERE employee_id = uid ORDER BY expense_date, id LOOP
  proposals := proposals || accounting_private.sync_entry(uid, r.id, NULL, false, true, prefs);
 END LOOP;
 FOR r IN SELECT DISTINCT p.source_entry_id AS id FROM public.accounting_postings p WHERE p.owner_id = uid AND p.kind = 'entry' AND NOT EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = p.source_entry_id AND e.employee_id = uid) ORDER BY 1 LOOP
  proposals := proposals || accounting_private.sync_entry(uid, r.id, NULL, false, true, prefs);
 END LOOP;
 map := CASE WHEN jsonb_typeof(prefs->'books'->'entityAccounts') = 'object' THEN prefs->'books'->'entityAccounts' ELSE '{}'::jsonb END;
 SELECT coalesce(jsonb_agg(jsonb_build_object('accountId', a.id, 'entityId', accounting_private.owner_of(map, a.id::text), 'openingBalance', a.opening_balance,
   'exception', 'Saved opening balance has no dated double-entry capital/retained-earnings mapping; post an opening journal.') ORDER BY a.id), '[]')
  INTO openings FROM public.accounts a WHERE a.owner_id = uid AND accounting_private.owner_of(map, a.id::text) IS NOT NULL AND coalesce(a.opening_balance, 0) <> 0
   AND accounting_private.entity_exists(uid, accounting_private.owner_of(map, a.id::text));
 fp := md5(proposals::text);
 result := jsonb_build_object('mode', _mode, 'run', _run, 'fingerprint', fp,
  'proposals', (SELECT coalesce(jsonb_agg(x), '[]') FROM jsonb_array_elements(proposals) x WHERE x->>'action' IN ('post', 'replace', 'reverse') AND NOT (x->>'closed')::boolean),
  'unchanged', (SELECT count(*) FROM jsonb_array_elements(proposals) x WHERE x->>'action' = 'unchanged'),
  'exceptions', (SELECT coalesce(jsonb_agg(jsonb_build_object('entryId', x->>'entryId', 'entityId', x->>'entityId', 'date', x->>'date', 'exception', CASE WHEN (x->>'closed')::boolean THEN 'Accounting period is closed; reopen on Audit or approve a correcting entry' ELSE x->>'exception' END, 'derivedLines', x->'derivedLines')), '[]')
    FROM jsonb_array_elements(proposals) x WHERE x->>'action' = 'exception' OR (x->>'closed')::boolean) || openings,
  'totals', (SELECT coalesce(jsonb_object_agg(ent, jsonb_build_object('debit', d, 'credit', c)), '{}') FROM (SELECT x->>'entityId' AS ent, sum((l->>'debit')::numeric) d, sum((l->>'credit')::numeric) c FROM jsonb_array_elements(proposals) x, jsonb_array_elements(x->'lines') l WHERE x->>'action' IN ('post', 'replace') AND NOT (x->>'closed')::boolean GROUP BY 1) t),
  'trialBalance', (SELECT coalesce(jsonb_agg(jsonb_build_object('entityId', ent, 'code', code, 'role', role, 'debit', d, 'credit', c, 'closing', d - c) ORDER BY ent, code), '[]') FROM (
    SELECT x->>'entityId' AS ent, l->>'code' AS code, l->>'role' AS role, sum((l->>'debit')::numeric) d, sum((l->>'credit')::numeric) c
    FROM jsonb_array_elements(proposals) x, jsonb_array_elements(x->'lines') l WHERE x->>'action' IN ('post', 'replace', 'unchanged') AND NOT (x->>'closed')::boolean GROUP BY 1, 2, 3) t));
 IF _mode = 'preview' THEN RETURN result; END IF;
 IF _expected IS DISTINCT FROM fp THEN RAISE EXCEPTION 'Ledger changed since the reviewed preview; preview again before committing'; END IF;
 FOR r IN SELECT DISTINCT (x->>'entryId')::uuid AS id FROM jsonb_array_elements(proposals) x WHERE x->>'action' IN ('post', 'replace', 'reverse') AND NOT (x->>'closed')::boolean LOOP
  PERFORM accounting_private.sync_entry(uid, r.id, _run, true, true, prefs); posted := posted + 1;
 END LOOP;
 result := result || jsonb_build_object('committedEntries', posted);
 INSERT INTO public.accounting_backfill_runs(id, owner_id, fingerprint, result, actor_id) VALUES (_run, uid, fp, result, uid);
 RETURN result;
END $$;

CREATE FUNCTION public.accounting_backfill_undo(_run uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); run public.accounting_backfill_runs; p record; n integer := 0;
BEGIN
 IF uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Sign in with a real account'; END IF;
 IF length(trim(coalesce(_reason, ''))) < 5 THEN RAISE EXCEPTION 'Write the reason for undoing the backfill'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
 PERFORM 1 FROM public.finance_preferences WHERE owner_id = uid FOR UPDATE;
 SELECT * INTO run FROM public.accounting_backfill_runs WHERE id = _run AND owner_id = uid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Backfill run not found'; END IF;
 IF run.undone_at IS NOT NULL THEN RETURN jsonb_build_object('run', _run, 'reversed', 0, 'replayed', true); END IF;
 IF EXISTS (SELECT 1 FROM public.accounting_backfill_runs r WHERE r.owner_id = uid AND r.id <> _run AND (r.committed_at, r.id) > (run.committed_at, run.id)) THEN RAISE EXCEPTION 'Undo the later backfill first'; END IF;
 -- Reverse every active entry posting (including ones kept in step after activation); originals stay.
 FOR p IN SELECT x.* FROM public.accounting_postings x WHERE x.owner_id = uid AND x.kind = 'entry' AND NOT EXISTS (SELECT 1 FROM public.accounting_postings r WHERE r.reverses_id = x.id) ORDER BY x.posting_date, x.id LOOP
  PERFORM accounting_private.insert_posting(uid, p.entity_id, p.posting_date, 'entry_reversal', 'reverse:' || p.id, accounting_private.lines_of(p.id, true),
   _entry => p.source_entry_id, _reverses => p.id, _run => _run, _description => 'Backfill undone: ' || left(trim(_reason), 200));
  n := n + 1;
 END LOOP;
 UPDATE public.accounting_backfill_runs SET undone_at = clock_timestamp(), undo_reason = trim(_reason) WHERE id = _run;
 RETURN jsonb_build_object('run', _run, 'reversed', n);
END $$;

-- ---------------------------------------------------------------------------------------------------------
-- Restore compatibility: the 0072 restore body is kept unchanged (moved, not edited) and wrapped.
-- ---------------------------------------------------------------------------------------------------------
CREATE FUNCTION accounting_private.rebuild_restored_journals(_owner uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; j jsonb; att jsonb; ent text; prefs jsonb; leg jsonb; plines jsonb; n integer; rebuilt integer := 0; problems jsonb := '[]'; members uuid[]; rev uuid; docs uuid[];
BEGIN
 IF _owner IS NULL OR _owner IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Restore owner differs'; END IF;
 SELECT data INTO prefs FROM public.finance_preferences WHERE owner_id = _owner;
 -- Originals before their reversals so reversal postings can reference them.
 FOR r IN SELECT s.att FROM (SELECT DISTINCT ON (e.receipt_details->'accounting'->'journal'->>'id') e.receipt_details->'accounting' AS att
  FROM public.expenses e WHERE e.employee_id = _owner AND e.receipt_details ? 'accounting' AND (e.receipt_details->'accounting'->>'primary')::boolean
   AND NOT EXISTS (SELECT 1 FROM public.accounting_postings p WHERE p.owner_id = _owner AND p.journal_id::text = e.receipt_details->'accounting'->'journal'->>'id')
  ORDER BY e.receipt_details->'accounting'->'journal'->>'id') s
  ORDER BY s.att->'journal'->>'date', (s.att->'journal'->>'kind' = 'reversal'), s.att->'journal'->>'id' LOOP
  att := r.att; j := att->'journal'; ent := j->>'entityId';
  BEGIN
   SELECT coalesce(array_agg(e.id ORDER BY e.id), '{}') INTO members FROM public.expenses e WHERE e.employee_id = _owner AND e.receipt_details->'accounting'->'journal'->>'id' = j->>'id';
   IF EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = ANY(members) AND (e.receipt_details->'accounting'->'journal' IS DISTINCT FROM j OR e.expense_date::text <> j->>'date')) THEN RAISE EXCEPTION 'Journal evidence differs between restored legs'; END IF;
   IF cardinality(members) <> greatest(1, (SELECT count(*) FROM jsonb_array_elements(j->'legs') x WHERE x->>'accountId' IS NOT NULL)) THEN RAISE EXCEPTION 'Journal ledger membership is incomplete'; END IF;
   IF (SELECT sum((x->>'debit')::numeric) <> sum((x->>'credit')::numeric) FROM jsonb_array_elements(j->'legs') x) THEN RAISE EXCEPTION 'Unbalanced journal'; END IF;
   rev := NULL;
   IF j->>'reversesId' IS NOT NULL THEN
    SELECT id INTO rev FROM public.accounting_postings WHERE owner_id = _owner AND journal_id::text = j->>'reversesId';
    IF rev IS NULL THEN RAISE EXCEPTION 'Reversed journal is not available'; END IF;
   END IF;
   plines := '[]'; n := 0;
   FOR leg IN SELECT value FROM jsonb_array_elements(j->'legs') LOOP
    IF leg->>'accountId' IS NOT NULL AND (NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = (leg->>'accountId')::uuid AND a.owner_id = _owner)
       OR NOT EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = ANY(members) AND e.account_id = (leg->>'accountId')::uuid)) THEN
     RAISE EXCEPTION 'Journal account is not this owner''s restored account';
    END IF;
    plines := plines || jsonb_build_array(jsonb_build_object('code', leg->>'code', 'label', leg->>'label', 'role', leg->>'role', 'debit', (leg->>'debit')::numeric, 'credit', (leg->>'credit')::numeric,
     'accountId', leg->>'accountId', 'entryId', (SELECT e.id FROM public.expenses e WHERE e.id = ANY(members) AND e.account_id = (leg->>'accountId')::uuid LIMIT 1), 'cashFlow', leg->>'cashFlow',
     'meta', jsonb_strip_nulls(jsonb_build_object('source', leg->'source', 'statutory', leg->'statutory'))));
   END LOOP;
   SELECT coalesce(array_agg(value::uuid), '{}') INTO docs FROM jsonb_array_elements_text(coalesce(j->'documentIds', '[]'));
   PERFORM accounting_private.insert_posting(_owner, ent, (j->>'date')::date, 'journal', 'journal:' || (att->>'requestId'), plines, _reverses => rev, _description => j->>'description',
    _journal => j, _request => (att->>'requestId')::uuid, _entry_ids => members, _documents => docs, _settlement => (j->'settlement'->>'entryId')::uuid, _meta => jsonb_build_object('restored', true));
   rebuilt := rebuilt + 1;
  EXCEPTION WHEN others THEN
   problems := problems || jsonb_build_array(jsonb_build_object('journalId', j->>'id', 'message', SQLERRM));
  END;
 END LOOP;
 RETURN jsonb_build_object('rebuiltJournals', rebuilt, 'exceptions', problems);
END $$;

-- Lock down P3's private helpers before the 0072 function moves in, so that function keeps its exact ACL.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA accounting_private FROM PUBLIC, anon, authenticated, service_role;
ALTER FUNCTION public.restore_finance_backup(jsonb, text) RENAME TO restore_finance_backup_0072;
ALTER FUNCTION public.restore_finance_backup_0072(jsonb, text) SET SCHEMA accounting_private;
CREATE FUNCTION public.restore_finance_backup(payload jsonb, display_name text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
 PERFORM set_config('ledgerline.restoring', 'on', true);
 result := accounting_private.restore_finance_backup_0072(payload, display_name);
 PERFORM set_config('ledgerline.restoring', '', true);
 IF auth.uid() IS NOT NULL THEN result := result || jsonb_build_object('accounting', accounting_private.rebuild_restored_journals(auth.uid())); END IF;
 RETURN result;
END $$;

-- ---------------------------------------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION accounting_private.rebuild_restored_journals(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION accounting_private.can_read(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION accounting_private.rebuild_restored_journals(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.restore_finance_backup(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_finance_backup(jsonb, text) TO authenticated;
REVOKE ALL ON FUNCTION public.post_accounting_journal(uuid, jsonb, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_accounting_journal(uuid, jsonb, bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.review_accounting_exception(uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_accounting_exception(uuid, uuid, uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_accounting_review_grant(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_accounting_review_grant(text, text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.accounting_backfill(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounting_backfill(text, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.accounting_backfill_undo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounting_backfill_undo(uuid, text) TO authenticated;
COMMENT ON TABLE public.accounting_postings IS 'P3 posting layer: balanced, immutable postings keyed to the existing ledger (expenses) and manual journals; corrections are reversals.';
