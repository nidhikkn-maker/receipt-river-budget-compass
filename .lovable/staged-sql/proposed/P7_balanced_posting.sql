-- ============================================================================================
-- P7_balanced_posting.sql (PROPOSED ONLY: NOT APPLIED to Lovable Cloud, Live or any hosted DB)
-- Prepared 2026-11-10 for KK review (Phase 3, Balanced Accounting; V4 FND-01, DN-04 option A,
-- the 14 approved P3 decisions in docs/registers/master/p3_decisions.csv and KK decision C11).
-- Plan: docs/plans/PHASE3_ACCOUNTING_PLAN_2026-11-10.md. Inventory: docs/plans/PHASE3_POSTING_INVENTORY_2026-11-10.md.
--
-- AUTHORITATIVE posting-layer proposal. It SUPERSEDES P3_accounting_posting_layer.sql (kept for
-- history only; written before the 14 decisions were final). P3 and P7 must never both be installed:
-- this preflight refuses when P3 objects exist and the P3 preflight refuses when P7 exists.
--
-- Order: 0000-0088 -> P1 -> P2 -> P4 -> P5 -> P7 (preflight checks all four). Rollback:
-- P7_balanced_posting.rollback.sql (run BEFORE the P5 rollback, which refuses while P7 is installed).
--
-- What it is: ONE controlled posting layer on the EXISTING ledger (public.expenses stays the single
-- economic-event ledger; nothing here is a second ledger and no existing row is rewritten):
--   posting_events          source event identity (idempotency): one row per economic event
--                           ('ledger_entry:<expense id>' or 'journal:<request id>'), unique per owner
--   posting_event_sources   every piece of evidence of that event (the entry itself, its statement row,
--                           receipts, the transfer counterpart row, journal documents). A source can be
--                           bound to ONE active event, so a receipt + bank row + card row or an upload
--                           retry can never produce a second economic effect
--   posting_batches         balanced double-entry documents, one legal entity each (P5 legal_entities,
--                           including the owner's individual_personal entity = personal books, DN-P3-5 B),
--                           with source currency/amount/rate/date/source (DN-P3-6) and reversal links
--   posting_lines           exact 2-decimal debit/credit lines, explicit currency
--   posting_reversals       audited reversals (reason, actor, session, step-up) incl. the full archived
--                           source row of a reversed ledger entry (DN-P3-10: posted entries are never
--                           erased; their evidence is kept)
--   posting_backfill_runs   append-only commit/undo history; the latest commit activates the owner
-- Database invariants: deferred balance per (batch, currency) = per legal entity and currency; at least
-- two lines; exact decimals; one active batch per (event, entity); reversal mirrors its original
-- exactly and only once; no UPDATE/DELETE/TRUNCATE of posted rows by anyone (confirmed account erasure
-- excepted); closed periods are entity-aware (P5 ll_closed_on); guests and assistant sessions cannot
-- post; every write goes through phase3_p7.write_batch, the ONE posting function.
--
-- Activation is per owner and never automatic (requirement 5): preview_posting_backfill() ->
-- owner review -> commit_posting_backfill(run, fingerprint) (step-up). Before activation nothing is
-- posted and the app behaves exactly as today. After activation every ledger write (finance_operation,
-- corrections, imports, Statement Desk, receipts, opening balances, restores) is posted by the same
-- AFTER trigger through write_batch; edits post reversal + replacement (DN-P3-1); a posted entry can
-- be removed only by reverse_ledger_entry (step-up, reason, audited).
-- ============================================================================================
BEGIN;

-- --------------------------------------------------------------------------------------------
-- 0. Preflight (fail closed on an unexpected catalog)
-- --------------------------------------------------------------------------------------------
DO $pre$
BEGIN
  IF to_regprocedure('public.guard_shared_document_edit()') IS NULL THEN RAISE EXCEPTION 'P7 requires P1_security_containment.sql'; END IF;
  IF to_regprocedure('public.has_permission(uuid,text,text)') IS NULL OR to_regclass('public.access_grants') IS NULL THEN
    RAISE EXCEPTION 'P7 requires P2_v31_role_model.sql';
  END IF;
  IF to_regclass('public.step_up_grants') IS NULL OR to_regprocedure('security_p4.guard(regprocedure,text)') IS NULL THEN
    RAISE EXCEPTION 'P7 requires P4_step_up_and_assistant_limits.sql';
  END IF;
  IF to_regclass('public.legal_entities') IS NULL OR to_regnamespace('phase2_p5') IS NULL
     OR to_regprocedure('public.p5_entity_for_keys(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'P7 requires P5_legal_entities_foundation.sql';
  END IF;
  IF to_regclass('public.accounting_postings') IS NOT NULL OR to_regclass('public.accounting_journal_evidence') IS NOT NULL THEN
    RAISE EXCEPTION 'P7: superseded P3 / accounting-foundation objects exist; they must never be installed together';
  END IF;
  IF to_regnamespace('phase3_p7') IS NOT NULL OR to_regclass('public.posting_batches') IS NOT NULL THEN
    RAISE EXCEPTION 'P7 is already installed';
  END IF;
END $pre$;

CREATE SCHEMA phase3_p7;
REVOKE ALL ON SCHEMA phase3_p7 FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------------------------
-- 1. Tables
-- --------------------------------------------------------------------------------------------
CREATE TABLE public.posting_events (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.finance_preferences(owner_id) ON DELETE CASCADE,
  event_key text NOT NULL CHECK (event_key ~ '^(ledger_entry|journal):[0-9a-f-]{36}$'),
  source_kind text NOT NULL CHECK (source_kind IN ('ledger_entry', 'journal')),
  source_entry_id uuid,
  content_sha256 text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid,
  UNIQUE (owner_id, event_key),
  UNIQUE (owner_id, id),
  CHECK ((source_kind = 'ledger_entry') = (source_entry_id IS NOT NULL))
);
COMMENT ON TABLE public.posting_events IS 'P7: source event identity. One row per economic event (ledger entry or manual journal request); idempotency key = (owner_id, event_key). Written only by P7 functions.';

CREATE TABLE public.posting_event_sources (
  owner_id uuid NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('ledger_entry', 'statement_row', 'receipt', 'counterpart_entry', 'document', 'journal_request')),
  source_key text NOT NULL CHECK (length(source_key) BETWEEN 1 AND 600),
  event_id uuid NOT NULL,
  bound_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  released_at timestamptz,
  FOREIGN KEY (owner_id, event_id) REFERENCES public.posting_events(owner_id, id) ON DELETE CASCADE
);
-- One active binding per piece of evidence: the same statement row / receipt / counterpart can never
-- carry two economic effects (requirement 7).
CREATE UNIQUE INDEX posting_event_sources_active_idx ON public.posting_event_sources(owner_id, source_kind, source_key) WHERE released_at IS NULL;
CREATE INDEX posting_event_sources_event_idx ON public.posting_event_sources(owner_id, event_id);

CREATE TABLE public.posting_batches (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  legal_entity_id uuid NOT NULL,
  event_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('entry', 'opening', 'journal', 'reversal')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 3 AND 300),
  version int CHECK (version IS NULL OR version > 0),
  posting_date date NOT NULL,
  reverses_id uuid REFERENCES public.posting_batches(id) ON DELETE CASCADE,
  -- Source traceability (DN-P3-6): original amount/currency/rate/date/source of the economic event.
  source_currency text CHECK (source_currency IS NULL OR source_currency ~ '^[A-Z]{3}$'),
  source_amount numeric,
  fx_rate numeric,
  fx_date date,
  fx_source text,
  memo text NOT NULL DEFAULT '' CHECK (length(memo) <= 500),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(meta) = 'object'),
  backfill_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid,
  UNIQUE (owner_id, idempotency_key),
  -- CASCADE is reachable only through confirmed erasure: P5 refuses every other legal-entity delete.
  FOREIGN KEY (owner_id, legal_entity_id) REFERENCES public.legal_entities(owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id, event_id) REFERENCES public.posting_events(owner_id, id) ON DELETE CASCADE,
  CHECK ((kind = 'reversal') = (reverses_id IS NOT NULL)),
  CHECK (kind NOT IN ('entry', 'opening') OR version IS NOT NULL)
);
CREATE UNIQUE INDEX posting_batches_one_reversal_idx ON public.posting_batches(reverses_id) WHERE reverses_id IS NOT NULL;
CREATE INDEX posting_batches_event_idx ON public.posting_batches(owner_id, event_id);
CREATE INDEX posting_batches_entity_date_idx ON public.posting_batches(owner_id, legal_entity_id, posting_date);
COMMENT ON TABLE public.posting_batches IS 'P7: balanced posting documents (one legal entity each). Immutable; corrections are reversal batches (reverses_id). Written only by phase3_p7.write_batch.';

CREATE TABLE public.posting_lines (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES public.posting_batches(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  line_no int NOT NULL CHECK (line_no > 0),
  code text NOT NULL CHECK (length(code) BETWEEN 1 AND 300),
  role text NOT NULL CHECK (role IN ('asset', 'liability', 'equity', 'income', 'expense')),
  account_id uuid,
  counter_entity_id uuid,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  signed_amount numeric GENERATED ALWAYS AS (debit - credit) STORED,
  memo text NOT NULL DEFAULT '' CHECK (length(memo) <= 300),
  UNIQUE (batch_id, line_no),
  -- Exactly one strictly positive side; exact paise; NaN/Infinity rejected by the bound.
  CONSTRAINT posting_lines_one_side CHECK (debit >= 0 AND credit >= 0 AND (debit > 0) <> (credit > 0)),
  CONSTRAINT posting_lines_exact CHECK (debit = round(debit, 2) AND credit = round(credit, 2) AND debit < 1e13 AND credit < 1e13)
);
CREATE INDEX posting_lines_batch_idx ON public.posting_lines(batch_id);
CREATE INDEX posting_lines_account_idx ON public.posting_lines(owner_id, account_id) WHERE account_id IS NOT NULL;

CREATE TABLE public.posting_reversals (
  id uuid PRIMARY KEY, -- the client request id (idempotent replay)
  owner_id uuid NOT NULL REFERENCES public.finance_preferences(owner_id) ON DELETE CASCADE,
  target text NOT NULL CHECK (target IN ('ledger_entry', 'journal', 'backfill')),
  entry_id uuid,
  batch_ids uuid[] NOT NULL DEFAULT '{}',
  reversal_batch_ids uuid[] NOT NULL DEFAULT '{}',
  entry_snapshot jsonb,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  actor_id uuid NOT NULL,
  session_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
COMMENT ON TABLE public.posting_reversals IS 'P7: audited reversals (step-up). entry_snapshot keeps the complete reversed ledger row as source evidence (DN-P3-10). Append-only.';

CREATE TABLE public.posting_backfill_runs (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.finance_preferences(owner_id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('commit', 'undo')),
  fingerprint text NOT NULL,
  report jsonb NOT NULL,
  actor_id uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  seq bigserial NOT NULL UNIQUE
);
CREATE INDEX posting_backfill_runs_owner_idx ON public.posting_backfill_runs(owner_id, seq DESC);
COMMENT ON TABLE public.posting_backfill_runs IS 'P7: append-only previewed backfill history. The latest row decides activation (commit = active, undo = inactive).';

-- --------------------------------------------------------------------------------------------
-- 2. Small helpers (internal)
-- --------------------------------------------------------------------------------------------
-- Demo guests and anonymous sessions (DN-P3-14 B): never grant, convert or post.
CREATE FUNCTION phase3_p7.is_guest() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
      OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid() AND coalesce(u.is_anonymous, false))
      OR EXISTS (SELECT 1 FROM public.demo_sessions d WHERE d.owner_id = auth.uid())
$$;

CREATE FUNCTION phase3_p7.active(_owner uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((SELECT r.kind = 'commit' FROM public.posting_backfill_runs r WHERE r.owner_id = _owner ORDER BY r.seq DESC LIMIT 1), false)
$$;

CREATE FUNCTION phase3_p7.account_role(_kind text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _kind IN ('credit_card', 'loan', 'other_liability') THEN 'liability' ELSE 'asset' END
$$;

-- Legal entity of an owned account on a date: P5 dated assignment, else legacy JSON link, else personal.
-- NULL = ambiguous / unknown (never guessed).
CREATE FUNCTION phase3_p7.account_entity(_owner uuid, _account uuid, _on date) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.p5_entity_for_keys(_owner, public.p5_account_entity_keys(_owner, _account, _on))
$$;

CREATE FUNCTION phase3_p7.leg(_code text, _role text, _signed numeric, _account uuid, _counter uuid, _memo text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _signed IS NULL OR _signed = 0 THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object(
    'code', _code, 'role', _role, 'debit', greatest(_signed, 0), 'credit', greatest(-_signed, 0),
    'accountId', _account, 'counterEntityId', _counter, 'memo', left(coalesce(_memo, ''), 300))) END
$$;

CREATE FUNCTION phase3_p7.add(_acc jsonb, _entity uuid, _legs jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_set(_acc, ARRAY[_entity::text], coalesce(_acc->(_entity::text), '[]'::jsonb) || _legs)
$$;

-- Order-independent identity of a batch's financial content (memo is presentation only).
CREATE FUNCTION phase3_p7.canon(_lines jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_array(x->>'code', x->>'role', (x->>'debit')::numeric, (x->>'credit')::numeric, x->>'accountId', x->>'counterEntityId', coalesce(x->>'currency', 'INR'))
    ORDER BY x->>'code', x->>'role', (x->>'debit')::numeric, (x->>'credit')::numeric, x->>'accountId', x->>'counterEntityId'), '[]'::jsonb)
  FROM jsonb_array_elements(coalesce(_lines, '[]'::jsonb)) x
$$;

CREATE FUNCTION phase3_p7.lines_of(_batch uuid, _swap boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('code', code, 'role', role,
    'debit', CASE WHEN _swap THEN credit ELSE debit END, 'credit', CASE WHEN _swap THEN debit ELSE credit END,
    'accountId', account_id, 'counterEntityId', counter_entity_id, 'currency', currency, 'memo', memo) ORDER BY line_no), '[]'::jsonb)
  FROM public.posting_lines WHERE batch_id = _batch
$$;

CREATE FUNCTION phase3_p7.entity_key(_owner uuid, _entity uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT e.entity_key FROM public.legal_entities e WHERE e.owner_id = _owner AND e.id = _entity
$$;

-- Entity-aware closed period for a batch (DN-P3-8 B): the same P5 ll_closed_on the legacy guard uses,
-- with the same scope semantics: a period without entityId closes every legal entity; a company period
-- closes that company. The legacy guard (P5 p5_entry_closed) has no personal-only period, so the personal
-- entity is evaluated like the legacy "no company" case (only all-entity periods close it). Both guards
-- therefore agree entry by entity (tested); a personal-only close needs both changed together.
CREATE FUNCTION phase3_p7.closed(_owner uuid, _entity uuid, _on date) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.ll_closed_on((SELECT p.data->'books'->'closedPeriods' FROM public.finance_preferences p WHERE p.owner_id = _owner), _on::text,
    (SELECT CASE WHEN e.kind = 'individual_personal' THEN NULL ELSE e.entity_key END FROM public.legal_entities e WHERE e.owner_id = _owner AND e.id = _entity))
$$;

CREATE FUNCTION phase3_p7.lock_owner(_owner uuid) RETURNS void LANGUAGE sql VOLATILE AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('phase3_p7:' || _owner::text, 0))
$$;

-- --------------------------------------------------------------------------------------------
-- 3. Invariant guards
-- --------------------------------------------------------------------------------------------
CREATE FUNCTION phase3_p7.guard_writer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF coalesce(current_setting('phase3_p7.writer', true), '') <> 'on' THEN
    RAISE EXCEPTION 'P7_WRITER_ONLY: postings are written only by the posting function' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NOT NULL AND (public.is_assistant_session() OR phase3_p7.is_guest()) THEN
    RAISE EXCEPTION 'P7_NOT_ALLOWED: assistant sessions and guests cannot post' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION phase3_p7.guard_batch_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE orig public.posting_batches; ent public.legal_entities;
BEGIN
  SELECT * INTO ent FROM public.legal_entities e WHERE e.owner_id = NEW.owner_id AND e.id = NEW.legal_entity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'P7: legal entity unavailable for posting'; END IF;
  IF ent.archived_at IS NOT NULL AND NEW.kind <> 'reversal' THEN RAISE EXCEPTION 'P7: archived legal entity cannot receive new postings'; END IF;
  IF phase3_p7.closed(NEW.owner_id, NEW.legal_entity_id, NEW.posting_date) THEN
    RAISE EXCEPTION 'P7_CLOSED_PERIOD: % is in a closed period for %; reopen it on the Audit page or post a correction in an open period', NEW.posting_date, ent.readable_id USING ERRCODE = 'P0001';
  END IF;
  IF NEW.reverses_id IS NOT NULL THEN
    SELECT * INTO orig FROM public.posting_batches WHERE id = NEW.reverses_id;
    IF NOT FOUND OR orig.owner_id <> NEW.owner_id OR orig.legal_entity_id <> NEW.legal_entity_id OR orig.event_id <> NEW.event_id
       OR orig.kind = 'reversal' OR NEW.posting_date <> orig.posting_date THEN
      RAISE EXCEPTION 'P7: invalid reversal (original unavailable, already a reversal, other scope or other date)';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION phase3_p7.guard_line_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE b public.posting_batches;
BEGIN
  SELECT * INTO b FROM public.posting_batches WHERE id = NEW.batch_id;
  IF NOT FOUND OR b.owner_id <> NEW.owner_id THEN RAISE EXCEPTION 'P7: line owner differs from its batch'; END IF;
  IF NEW.account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = NEW.account_id AND a.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'P7: line account belongs to another owner';
  END IF;
  IF NEW.counter_entity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.legal_entities e WHERE e.id = NEW.counter_entity_id AND e.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'P7: counterpart entity belongs to another owner';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION phase3_p7.guard_event_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.source_entry_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = NEW.source_entry_id AND e.employee_id <> NEW.owner_id) THEN
    RAISE EXCEPTION 'P7: posting source belongs to another owner';
  END IF;
  RETURN NEW;
END $$;

-- Posted rows are immutable for everyone (service_role and the table owner included). Only confirmed
-- erasure of the caller's own data (delete_my_finance_data sets ledgerline.erasing) may delete, through
-- the finance_preferences cascade. Source bindings may only be released (released_at NULL -> time).
CREATE FUNCTION phase3_p7.guard_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('ledgerline.erasing', true) = 'on' AND (auth.uid() IS NULL OR OLD.owner_id = auth.uid()) THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'posting_event_sources' AND coalesce(current_setting('phase3_p7.writer', true), '') = 'on' THEN
    IF to_jsonb(OLD)->>'released_at' IS NULL AND to_jsonb(NEW)->>'released_at' IS NOT NULL
       AND (to_jsonb(NEW) - 'released_at') = (to_jsonb(OLD) - 'released_at') THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'P7_IMMUTABLE: posted accounting records cannot be changed or deleted; post an audited reversal' USING ERRCODE = '42501';
END $$;
CREATE FUNCTION phase3_p7.guard_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'P7_IMMUTABLE: posted accounting records cannot be truncated' USING ERRCODE = '42501'; END $$;

CREATE TRIGGER a_guard_writer BEFORE INSERT ON public.posting_events FOR EACH ROW EXECUTE FUNCTION phase3_p7.guard_writer();
CREATE TRIGGER a_guard_writer BEFORE INSERT ON public.posting_event_sources FOR EACH ROW EXECUTE FUNCTION phase3_p7.guard_writer();
CREATE TRIGGER a_guard_writer BEFORE INSERT ON public.posting_batches FOR EACH ROW EXECUTE FUNCTION phase3_p7.guard_writer();
CREATE TRIGGER a_guard_writer BEFORE INSERT ON public.posting_lines FOR EACH ROW EXECUTE FUNCTION phase3_p7.guard_writer();
CREATE TRIGGER a_guard_writer BEFORE INSERT ON public.posting_reversals FOR EACH ROW EXECUTE FUNCTION phase3_p7.guard_writer();
CREATE TRIGGER a_guard_writer BEFORE INSERT ON public.posting_backfill_runs FOR EACH ROW EXECUTE FUNCTION phase3_p7.guard_writer();
CREATE TRIGGER b_guard_event BEFORE INSERT ON public.posting_events FOR EACH ROW EXECUTE FUNCTION phase3_p7.guard_event_insert();
CREATE TRIGGER b_guard_batch BEFORE INSERT ON public.posting_batches FOR EACH ROW EXECUTE FUNCTION phase3_p7.guard_batch_insert();
CREATE TRIGGER b_guard_line BEFORE INSERT ON public.posting_lines FOR EACH ROW EXECUTE FUNCTION phase3_p7.guard_line_insert();
DO $imm$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['posting_events', 'posting_event_sources', 'posting_batches', 'posting_lines', 'posting_reversals', 'posting_backfill_runs'] LOOP
    EXECUTE format('CREATE TRIGGER c_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION phase3_p7.guard_immutable()', t);
    EXECUTE format('CREATE TRIGGER c_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION phase3_p7.guard_truncate()', t);
  END LOOP;
END $imm$;

-- Deferred (commit-time) invariants of one batch. Balance is checked per currency inside a batch, and
-- a batch has exactly one legal entity, so this is "per legal entity and currency" (requirement 2).
CREATE FUNCTION phase3_p7.check_batch(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE b public.posting_batches; n int;
BEGIN
  SELECT * INTO b FROM public.posting_batches WHERE id = _id;
  IF NOT FOUND THEN RETURN; END IF; -- removed by confirmed erasure in the same transaction
  SELECT count(*) INTO n FROM public.posting_lines WHERE batch_id = _id;
  IF n < 2 THEN RAISE EXCEPTION 'P7_UNBALANCED: a posting needs at least two lines' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM public.posting_lines WHERE batch_id = _id GROUP BY currency HAVING sum(debit) <> sum(credit)) THEN
    RAISE EXCEPTION 'P7_UNBALANCED: debits must equal credits for each legal entity and currency' USING ERRCODE = '23514';
  END IF;
  IF b.reverses_id IS NOT NULL AND phase3_p7.canon(phase3_p7.lines_of(b.reverses_id, true)) IS DISTINCT FROM phase3_p7.canon(phase3_p7.lines_of(_id)) THEN
    RAISE EXCEPTION 'P7: a reversal must exactly mirror the original batch' USING ERRCODE = '23514';
  END IF;
  IF b.kind IN ('entry', 'opening', 'reversal') AND (
      SELECT count(*) FROM public.posting_batches x WHERE x.owner_id = b.owner_id AND x.event_id = b.event_id AND x.legal_entity_id = b.legal_entity_id
        AND x.kind IN ('entry', 'opening') AND NOT EXISTS (SELECT 1 FROM public.posting_batches r WHERE r.reverses_id = x.id)) > 1 THEN
    RAISE EXCEPTION 'P7_DUPLICATE_EFFECT: this economic event already has an active posting for this legal entity' USING ERRCODE = '23505';
  END IF;
END $$;
CREATE FUNCTION phase3_p7.check_batch_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME = 'posting_batches' THEN PERFORM phase3_p7.check_batch((to_jsonb(NEW)->>'id')::uuid);
  ELSE PERFORM phase3_p7.check_batch((to_jsonb(NEW)->>'batch_id')::uuid); END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER z_batch_balanced AFTER INSERT ON public.posting_batches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION phase3_p7.check_batch_trigger();
CREATE CONSTRAINT TRIGGER z_lines_balanced AFTER INSERT ON public.posting_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION phase3_p7.check_batch_trigger();

-- --------------------------------------------------------------------------------------------
-- 4. THE posting function. Every batch (entry, opening, journal, reversal, backfill) is written here.
-- --------------------------------------------------------------------------------------------
CREATE FUNCTION phase3_p7.write_batch(_owner uuid, _event uuid, _entity uuid, _kind text, _key text, _on date, _version int,
  _reverses uuid, _lines jsonb, _src jsonb, _memo text, _meta jsonb, _run uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE bid uuid := md5(_owner::text || ':batch:' || _key)::uuid; l jsonb; n int := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.posting_batches WHERE id = bid) THEN RETURN bid; END IF; -- idempotent replay
  PERFORM set_config('phase3_p7.writer', 'on', true);
  INSERT INTO public.posting_batches(id, owner_id, legal_entity_id, event_id, kind, idempotency_key, version, posting_date, reverses_id,
    source_currency, source_amount, fx_rate, fx_date, fx_source, memo, meta, backfill_run_id, created_by)
  VALUES (bid, _owner, _entity, _event, _kind, _key, _version, _on, _reverses,
    _src->>'currency', (_src->>'amount')::numeric, (_src->>'rate')::numeric, (_src->>'fxDate')::date, _src->>'fxSource',
    left(coalesce(_memo, ''), 500), coalesce(_meta, '{}'::jsonb), _run, auth.uid());
  FOR l IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    n := n + 1;
    INSERT INTO public.posting_lines(id, batch_id, owner_id, line_no, code, role, account_id, counter_entity_id, currency, debit, credit, memo)
    VALUES (md5(bid::text || ':' || n)::uuid, bid, _owner, n, l->>'code', l->>'role', (l->>'accountId')::uuid, (l->>'counterEntityId')::uuid,
      coalesce(l->>'currency', 'INR'), (l->>'debit')::numeric, (l->>'credit')::numeric, coalesce(l->>'memo', ''));
  END LOOP;
  PERFORM set_config('phase3_p7.writer', '', true);
  RETURN bid;
END $$;

CREATE FUNCTION phase3_p7.ensure_event(_owner uuid, _key text, _kind text, _entry uuid, _sha text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE eid uuid;
BEGIN
  SELECT id INTO eid FROM public.posting_events WHERE owner_id = _owner AND event_key = _key;
  IF FOUND THEN RETURN eid; END IF;
  eid := md5(_owner::text || ':event:' || _key)::uuid;
  PERFORM set_config('phase3_p7.writer', 'on', true);
  INSERT INTO public.posting_events(id, owner_id, event_key, source_kind, source_entry_id, content_sha256, created_by)
  VALUES (eid, _owner, _key, _kind, _entry, _sha, auth.uid());
  PERFORM set_config('phase3_p7.writer', '', true);
  RETURN eid;
END $$;

CREATE FUNCTION phase3_p7.event_active(_event uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.posting_batches x WHERE x.event_id = _event AND x.kind <> 'reversal'
                 AND NOT EXISTS (SELECT 1 FROM public.posting_batches r WHERE r.reverses_id = x.id))
$$;

-- Bind evidence to an event. A source already bound to ANOTHER event that still has an active posting
-- is a duplicate economic effect and is refused; a stale binding (event fully reversed) is released.
-- Bindings of this event that are no longer evidence (e.g. statement reference changed) are released.
CREATE FUNCTION phase3_p7.bind_sources(_owner uuid, _event uuid, _sources jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s jsonb; cur public.posting_event_sources;
BEGIN
  PERFORM set_config('phase3_p7.writer', 'on', true);
  UPDATE public.posting_event_sources x SET released_at = clock_timestamp()
  WHERE x.owner_id = _owner AND x.event_id = _event AND x.released_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_sources) y WHERE y->>'kind' = x.source_kind AND y->>'key' = x.source_key);
  FOR s IN SELECT value FROM jsonb_array_elements(_sources) LOOP
    SELECT * INTO cur FROM public.posting_event_sources x WHERE x.owner_id = _owner AND x.source_kind = s->>'kind' AND x.source_key = s->>'key' AND x.released_at IS NULL;
    IF FOUND AND cur.event_id = _event THEN CONTINUE; END IF;
    IF FOUND AND phase3_p7.event_active(cur.event_id) THEN
      RAISE EXCEPTION 'P7_DUPLICATE_SOURCE: % % is already posted as another economic event', s->>'kind', left(s->>'key', 120) USING ERRCODE = '23505';
    END IF;
    IF FOUND THEN UPDATE public.posting_event_sources x SET released_at = clock_timestamp() WHERE x.owner_id = _owner AND x.source_kind = cur.source_kind AND x.source_key = cur.source_key AND x.released_at IS NULL; END IF;
    INSERT INTO public.posting_event_sources(owner_id, source_kind, source_key, event_id) VALUES (_owner, s->>'kind', s->>'key', _event);
  END LOOP;
  PERFORM set_config('phase3_p7.writer', '', true);
END $$;

CREATE FUNCTION phase3_p7.release_sources(_owner uuid, _event uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM set_config('phase3_p7.writer', 'on', true);
  UPDATE public.posting_event_sources SET released_at = clock_timestamp() WHERE owner_id = _owner AND event_id = _event AND released_at IS NULL;
  PERFORM set_config('phase3_p7.writer', '', true);
END $$;

CREATE FUNCTION phase3_p7.reverse_batch(_b public.posting_batches, _meta jsonb, _run uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT phase3_p7.write_batch(_b.owner_id, _b.event_id, _b.legal_entity_id, 'reversal', 'reverse:' || _b.id, _b.posting_date, NULL, _b.id,
    phase3_p7.lines_of(_b.id, true), jsonb_build_object('currency', _b.source_currency, 'amount', _b.source_amount, 'rate', _b.fx_rate, 'fxDate', _b.fx_date, 'fxSource', _b.fx_source),
    left('Reversal of ' || _b.idempotency_key, 500), coalesce(_meta, '{}'::jsonb), _run)
$$;

-- --------------------------------------------------------------------------------------------
-- 5. Derivation of one ledger entry (personal AND company scopes, DN-P3-5 B)
--    Returns {skip} | {exception, detail} | {kind, date, batches:[{entity, lines}], sources, source}
--    Unknown counterparts are exceptions, never fabricated lines (DN-P3-2).
-- --------------------------------------------------------------------------------------------
CREATE FUNCTION phase3_p7.derive_entry(_e public.expenses) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  k text := coalesce(_e.txn_type, 'expense'); amt numeric := _e.amount; x uuid := _e.legal_entity_id;
  ka text; kb text; ra text; rb text; ea uuid; eb uuid; acc jsonb := '{}'::jsonb; parts jsonb; p jsonb; legs jsonb;
  sgn int; principal numeric; interest numeric := 0; total numeric; op public.opening_postings; kind text := 'entry';
  sources jsonb; batches jsonb; src jsonb; signed numeric; ent text;
  exc text; detail text;
BEGIN
  IF _e.transfer_counterpart_of IS NOT NULL THEN RETURN jsonb_build_object('skip', true); END IF;
  IF _e.account_id IS NOT NULL THEN
    SELECT a.kind INTO ka FROM public.accounts a WHERE a.id = _e.account_id AND a.owner_id = _e.employee_id;
    ra := phase3_p7.account_role(ka); ea := phase3_p7.account_entity(_e.employee_id, _e.account_id, _e.expense_date);
  END IF;
  IF _e.to_account_id IS NOT NULL THEN
    SELECT a.kind INTO kb FROM public.accounts a WHERE a.id = _e.to_account_id AND a.owner_id = _e.employee_id;
    rb := phase3_p7.account_role(kb); eb := phase3_p7.account_entity(_e.employee_id, _e.to_account_id, _e.expense_date);
  END IF;
  -- C11: an automatically classified row needs its explicit review before it can post.
  IF _e.receipt_details->'classification'->>'automatic' = 'true' AND coalesce(_e.receipt_details->'review'->>'approvedAt', '') = '' THEN
    exc := 'review_required'; detail := 'Automatically classified row has no explicit review';
  ELSIF amt IS NULL OR amt <= 0 OR amt <> round(amt, 2) OR amt >= 1e13 THEN
    exc := 'inexact_amount'; detail := 'Amount must be positive and exact to the paisa';
  ELSIF x IS NULL OR (_e.account_id IS NOT NULL AND ea IS NULL) OR (_e.to_account_id IS NOT NULL AND eb IS NULL) THEN
    exc := 'entity_unresolved'; detail := 'Legal entity of the entry or one of its accounts is ambiguous or unknown';
  ELSIF k IN ('expense', 'income', 'refund', 'reimbursement') AND (_e.account_id IS NULL OR ka IS NULL) THEN
    exc := 'no_account'; detail := 'No owned paying/receiving account: counterpart unknown';
  ELSIF k IN ('transfer', 'card_payment', 'investment', 'loan_repayment') AND (ka IS NULL OR kb IS NULL OR _e.account_id = _e.to_account_id) THEN
    exc := 'missing_destination'; detail := 'Movement needs two different owned accounts';
  ELSIF k IN ('advance', 'advance_settlement') THEN
    exc := 'advance_needs_classification'; detail := 'Advance counterpart (who owes whom) is not recorded';
  ELSIF k NOT IN ('expense', 'income', 'refund', 'reimbursement', 'transfer', 'card_payment', 'investment', 'loan_repayment', 'adjustment') THEN
    exc := 'unknown_type'; detail := k;
  END IF;
  IF exc IS NULL AND k IN ('expense', 'income', 'refund', 'reimbursement') THEN
    IF k <> 'reimbursement' AND jsonb_typeof(_e.allocations) = 'array' AND jsonb_array_length(_e.allocations) > 0 THEN
      SELECT jsonb_agg(jsonb_build_object('category', coalesce(nullif(btrim(a->>'category'), ''), 'Uncategorised'), 'amount', (a->>'amount')::numeric) ORDER BY o)
        INTO parts FROM jsonb_array_elements(_e.allocations) WITH ORDINALITY t(a, o);
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(parts) q WHERE (q->>'amount')::numeric IS NULL OR (q->>'amount')::numeric <= 0 OR (q->>'amount')::numeric <> round((q->>'amount')::numeric, 2))
         OR (SELECT sum((q->>'amount')::numeric) FROM jsonb_array_elements(parts) q) <> amt THEN
        exc := 'invalid_allocation'; detail := 'Category allocation does not equal the entry amount exactly';
      END IF;
    ELSE
      parts := jsonb_build_array(jsonb_build_object('category', coalesce(nullif(btrim(_e.category), ''), 'Uncategorised'), 'amount', amt));
    END IF;
  END IF;
  IF exc IS NULL AND k = 'adjustment' THEN
    SELECT * INTO op FROM public.opening_postings o WHERE o.owner_id = _e.employee_id AND o.undone_at IS NULL AND _e.id = ANY (o.txn_ids) ORDER BY o.posted_at LIMIT 1;
    IF NOT FOUND THEN exc := 'unclassified_adjustment'; detail := 'Balance adjustment has no confirmed counterpart';
    ELSIF op.source_doc_id IS NULL THEN exc := 'opening_without_evidence'; detail := 'Opening balance journal needs its source document (DN-P3-3)';
    ELSIF _e.account_id IS NULL OR ka IS NULL THEN exc := 'no_account'; detail := 'Opening balance without an owned account';
    END IF;
  END IF;
  IF exc IS NOT NULL THEN RETURN jsonb_build_object('exception', exc, 'detail', detail, 'entryId', _e.id, 'date', _e.expense_date, 'amount', amt, 'type', k); END IF;

  IF k IN ('expense', 'income', 'refund', 'reimbursement') THEN
    sgn := CASE WHEN k = 'expense' THEN -1 ELSE 1 END; -- money out of / into the account
    acc := phase3_p7.add(acc, ea, phase3_p7.leg('account:' || _e.account_id, ra, sgn * amt, _e.account_id, NULL, _e.title));
    legs := '[]'::jsonb;
    FOR p IN SELECT value FROM jsonb_array_elements(parts) LOOP
      legs := legs || phase3_p7.leg(CASE WHEN k = 'income' THEN 'income:' ELSE 'expense:' END || (p->>'category'),
                                    CASE WHEN k = 'income' THEN 'income' ELSE 'expense' END, -sgn * (p->>'amount')::numeric, NULL, NULL, p->>'category');
    END LOOP;
    acc := phase3_p7.add(acc, x, legs);
    IF x <> ea THEN -- paid/received through another legal entity's account: due to/from, never profit
      acc := phase3_p7.add(acc, ea, phase3_p7.leg('due:' || x, CASE WHEN sgn < 0 THEN 'asset' ELSE 'liability' END, -sgn * amt, NULL, x, 'Inter-entity'));
      acc := phase3_p7.add(acc, x, phase3_p7.leg('due:' || ea, CASE WHEN sgn < 0 THEN 'liability' ELSE 'asset' END, sgn * amt, NULL, ea, 'Inter-entity'));
    END IF;
  ELSIF k IN ('transfer', 'card_payment', 'investment', 'loan_repayment') THEN
    principal := amt;
    IF k = 'loan_repayment' AND _e.principal IS NOT NULL AND _e.interest IS NOT NULL THEN -- ledger.ts repaymentParts
      total := coalesce(_e.original_amount, amt);
      interest := CASE WHEN total > 0 THEN round(amt * _e.interest / total, 2) ELSE 0 END;
      principal := amt - interest;
    END IF;
    acc := phase3_p7.add(acc, ea, phase3_p7.leg('account:' || _e.account_id, ra, -amt, _e.account_id, NULL, _e.title));
    acc := phase3_p7.add(acc, eb, phase3_p7.leg('account:' || _e.to_account_id, rb, principal, _e.to_account_id, NULL, _e.title));
    acc := phase3_p7.add(acc, eb, phase3_p7.leg('expense:Loan interest', 'expense', interest, NULL, NULL, 'Loan interest'));
    IF ea <> eb THEN
      acc := phase3_p7.add(acc, ea, phase3_p7.leg('due:' || eb, 'asset', amt, NULL, eb, 'Inter-entity'));
      acc := phase3_p7.add(acc, eb, phase3_p7.leg('due:' || ea, 'liability', -amt, NULL, ea, 'Inter-entity'));
    END IF;
  ELSE -- opening journal from a source-backed opening posting (DN-P3-3)
    kind := 'opening';
    signed := CASE WHEN ra = 'liability' THEN -amt * coalesce(_e.adjustment_sign, 1) ELSE amt * coalesce(_e.adjustment_sign, 1) END;
    acc := phase3_p7.add(acc, ea, phase3_p7.leg('account:' || _e.account_id, ra, signed, _e.account_id, NULL, _e.title));
    acc := phase3_p7.add(acc, ea, phase3_p7.leg('equity:opening:' || op.fy, 'equity', -signed, NULL, NULL, 'Opening balance FY ' || op.fy));
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('entity', key::uuid, 'lines', value) ORDER BY key), '[]'::jsonb) INTO batches
  FROM jsonb_each(acc) WHERE jsonb_array_length(value) > 0;
  -- Evidence of this event (requirement 7): the entry, its statement row, its receipts, the transfer
  -- counterpart row and that row's statement line.
  SELECT jsonb_agg(DISTINCT s) INTO sources FROM (
    SELECT jsonb_build_object('kind', 'ledger_entry', 'key', _e.id::text) s
    UNION ALL SELECT jsonb_build_object('kind', 'statement_row', 'key', _e.statement_ref) WHERE nullif(btrim(_e.statement_ref), '') IS NOT NULL
    UNION ALL SELECT jsonb_build_object('kind', 'receipt', 'key', r->>'path') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_e.receipts) = 'array' THEN _e.receipts ELSE '[]'::jsonb END) r WHERE nullif(r->>'path', '') IS NOT NULL
    UNION ALL SELECT jsonb_build_object('kind', 'counterpart_entry', 'key', c.id::text) FROM public.expenses c WHERE c.transfer_counterpart_of = _e.id AND c.employee_id = _e.employee_id
    UNION ALL SELECT jsonb_build_object('kind', 'statement_row', 'key', c.statement_ref) FROM public.expenses c WHERE c.transfer_counterpart_of = _e.id AND c.employee_id = _e.employee_id AND nullif(btrim(c.statement_ref), '') IS NOT NULL
  ) q;
  src := jsonb_build_object('currency', _e.currency, 'amount', coalesce(_e.original_amount, amt), 'rate', _e.fx_rate, 'fxDate', _e.fx_date,
    'fxSource', CASE WHEN _e.currency = 'INR' THEN 'functional_currency' ELSE 'server_fx_rate' END);
  RETURN jsonb_build_object('kind', kind, 'date', _e.expense_date, 'batches', batches, 'sources', sources, 'source', src, 'entryId', _e.id);
END $$;

-- Compare one entry's derived postings with its active batches and optionally apply the difference
-- (reversal of the superseded batch + new version; never an in-place change). Returns one action per
-- legal entity: unchanged | post | replace | reverse | exception, with the closed-period flag.
CREATE FUNCTION phase3_p7.sync_entry(_owner uuid, _entry uuid, _apply boolean, _ctx jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE e public.expenses; d jsonb := jsonb_build_object('batches', '[]'::jsonb); ev uuid; ent uuid; want jsonb; act public.posting_batches;
  out jsonb := '[]'::jsonb; action text; closed boolean; ver int; key text := 'ledger_entry:' || _entry; any_post boolean := false;
  meta jsonb := jsonb_build_object('reason', coalesce(_ctx->>'reason', 'Ledger entry changed'), 'request', _ctx->>'request', 'actor', auth.uid());
BEGIN
  SELECT * INTO e FROM public.expenses WHERE id = _entry AND employee_id = _owner;
  IF FOUND THEN d := phase3_p7.derive_entry(e); END IF;
  IF d ? 'exception' THEN
    IF _apply AND d->>'exception' = 'review_required' THEN
      RAISE EXCEPTION 'C11_REVIEW_REQUIRED: approve this automatically classified row before it is saved' USING ERRCODE = '23514';
    END IF;
    out := out || jsonb_build_array(jsonb_build_object('entryId', _entry, 'action', 'exception', 'exception', d->>'exception', 'detail', d->>'detail', 'date', d->>'date', 'amount', d->'amount', 'type', d->>'type'));
  END IF;
  SELECT id INTO ev FROM public.posting_events WHERE owner_id = _owner AND event_key = key;
  FOR ent IN
    SELECT (b->>'entity')::uuid FROM jsonb_array_elements(coalesce(d->'batches', '[]'::jsonb)) b
    UNION SELECT x.legal_entity_id FROM public.posting_batches x WHERE ev IS NOT NULL AND x.event_id = ev AND x.kind IN ('entry', 'opening')
            AND NOT EXISTS (SELECT 1 FROM public.posting_batches r WHERE r.reverses_id = x.id)
    ORDER BY 1
  LOOP
    SELECT b INTO want FROM jsonb_array_elements(coalesce(d->'batches', '[]'::jsonb)) b WHERE (b->>'entity')::uuid = ent;
    act := NULL;
    IF ev IS NOT NULL THEN
      SELECT x.* INTO act FROM public.posting_batches x WHERE x.event_id = ev AND x.legal_entity_id = ent AND x.kind IN ('entry', 'opening')
        AND NOT EXISTS (SELECT 1 FROM public.posting_batches r WHERE r.reverses_id = x.id) ORDER BY x.version DESC LIMIT 1;
    END IF;
    IF act.id IS NOT NULL AND want IS NOT NULL AND act.kind = d->>'kind' AND act.posting_date = (d->>'date')::date
       AND phase3_p7.canon(phase3_p7.lines_of(act.id)) = phase3_p7.canon(want->'lines') THEN action := 'unchanged';
    ELSIF act.id IS NULL THEN action := 'post';
    ELSIF want IS NULL THEN action := 'reverse';
    ELSE action := 'replace'; END IF;
    closed := (want IS NOT NULL AND action <> 'unchanged' AND phase3_p7.closed(_owner, ent, (d->>'date')::date))
           OR (act.id IS NOT NULL AND action <> 'unchanged' AND phase3_p7.closed(_owner, ent, act.posting_date));
    out := out || jsonb_build_array(jsonb_build_object('entryId', _entry, 'entity', ent, 'action', action, 'closed', closed, 'date', coalesce(d->>'date', act.posting_date::text),
      'kind', d->>'kind', 'lines', CASE WHEN want IS NULL THEN '[]'::jsonb ELSE want->'lines' END, 'reverses', act.id));
    IF want IS NOT NULL AND action IN ('post', 'replace', 'unchanged') THEN any_post := true; END IF;
    IF _apply AND action <> 'unchanged' THEN
      IF ev IS NULL THEN ev := phase3_p7.ensure_event(_owner, key, 'ledger_entry', _entry, NULL); END IF;
      IF act.id IS NOT NULL THEN PERFORM phase3_p7.reverse_batch(act, meta, (_ctx->>'run')::uuid); END IF;
      IF want IS NOT NULL THEN
        SELECT coalesce(max(x.version), 0) + 1 INTO ver FROM public.posting_batches x WHERE x.event_id = ev AND x.legal_entity_id = ent AND x.kind IN ('entry', 'opening');
        PERFORM phase3_p7.write_batch(_owner, ev, ent, d->>'kind', 'entry:' || _entry || ':' || ent || ':v' || ver, (d->>'date')::date, ver, NULL,
          want->'lines', d->'source', left(coalesce(e.title, ''), 200), meta, (_ctx->>'run')::uuid);
      END IF;
    END IF;
  END LOOP;
  IF _apply AND ev IS NOT NULL THEN
    IF any_post THEN PERFORM phase3_p7.bind_sources(_owner, ev, d->'sources'); ELSE PERFORM phase3_p7.release_sources(_owner, ev); END IF;
  END IF;
  RETURN out;
END $$;

-- --------------------------------------------------------------------------------------------
-- 6. Ledger hooks on public.expenses (active owners only)
-- --------------------------------------------------------------------------------------------
-- A posted entry is never physically deleted by a client: only reverse_ledger_entry (step-up, reason,
-- audit) may remove it from the working ledger, after posting its reversal and archiving the row.
-- Unposted entries (owner not active, or an exception that never posted) delete as today.
CREATE FUNCTION phase3_p7.guard_posted_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ev uuid;
BEGIN
  IF current_setting('ledgerline.erasing', true) = 'on' OR NOT phase3_p7.active(OLD.employee_id) THEN RETURN OLD; END IF;
  IF current_setting('phase3_p7.reversing', true) IS NOT DISTINCT FROM OLD.id::text THEN RETURN OLD; END IF;
  -- P0-022 / DN-P3-7: once the owner's books are active, nobody but the owner removes entries (the team
  -- "delete_expenses" policy of 0066 no longer reaches them), and the owner removes posted ones only by reversal.
  IF auth.uid() IS NOT NULL AND auth.uid() <> OLD.employee_id THEN
    RAISE EXCEPTION 'P7_TEAM_DELETE: only the owner can remove entries from active books, by reversal' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO ev FROM public.posting_events WHERE owner_id = OLD.employee_id AND event_key = 'ledger_entry:' || OLD.id;
  IF ev IS NOT NULL AND phase3_p7.event_active(ev) THEN
    RAISE EXCEPTION 'P7_POSTED_ENTRY: posted entries are corrected by reversal, not deleted; use Reverse entry' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER p7_guard_posted_delete BEFORE DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION phase3_p7.guard_posted_delete();

CREATE FUNCTION phase3_p7.sync_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE owner uuid := coalesce(NEW.employee_id, OLD.employee_id);
  ctx jsonb := jsonb_build_object('reason', coalesce(nullif(current_setting('phase3_p7.reason', true), ''), CASE TG_OP WHEN 'INSERT' THEN 'Ledger entry saved' WHEN 'DELETE' THEN 'Ledger entry removed' ELSE 'Ledger entry changed' END),
                                  'request', nullif(current_setting('phase3_p7.request', true), ''));
BEGIN
  IF current_setting('ledgerline.erasing', true) = 'on' OR NOT phase3_p7.active(owner) THEN RETURN NULL; END IF;
  PERFORM phase3_p7.lock_owner(owner);
  PERFORM phase3_p7.sync_entry(owner, coalesce(NEW.id, OLD.id), true, ctx);
  -- A transfer counterpart's link changes the evidence of the movement it belongs to.
  IF TG_OP <> 'DELETE' AND NEW.transfer_counterpart_of IS NOT NULL THEN PERFORM phase3_p7.sync_entry(owner, NEW.transfer_counterpart_of, true, ctx); END IF;
  IF TG_OP <> 'INSERT' AND OLD.transfer_counterpart_of IS NOT NULL AND OLD.transfer_counterpart_of IS DISTINCT FROM NEW.transfer_counterpart_of THEN
    PERFORM phase3_p7.sync_entry(owner, OLD.transfer_counterpart_of, true, ctx);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER zz_p7_sync_postings AFTER INSERT OR UPDATE OR DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION phase3_p7.sync_trigger();

-- post_opening_balances (0061) inserts the adjustment entries BEFORE their opening_postings row, so the
-- entries become source-backed openings only when that row arrives: re-sync them then (and on undo).
CREATE FUNCTION phase3_p7.sync_opening_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t uuid;
BEGIN
  IF current_setting('ledgerline.erasing', true) = 'on' OR NOT phase3_p7.active(NEW.owner_id) THEN RETURN NULL; END IF;
  PERFORM phase3_p7.lock_owner(NEW.owner_id);
  FOR t IN SELECT DISTINCT x FROM unnest(NEW.txn_ids || CASE WHEN TG_OP = 'UPDATE' THEN OLD.txn_ids ELSE '{}'::uuid[] END) x LOOP
    PERFORM phase3_p7.sync_entry(NEW.owner_id, t, true, jsonb_build_object('reason', 'Opening balance journal ' || CASE WHEN TG_OP = 'INSERT' THEN 'posted' ELSE 'changed' END));
  END LOOP;
  RETURN NULL;
END $$;
CREATE TRIGGER zz_p7_sync_opening AFTER INSERT OR UPDATE ON public.opening_postings FOR EACH ROW EXECUTE FUNCTION phase3_p7.sync_opening_trigger();

-- --------------------------------------------------------------------------------------------
-- 7. Previewed backfill (requirement 5) and reconciliation (requirement 10)
-- --------------------------------------------------------------------------------------------
-- Plan for one owner: every entry (and every event whose entry no longer exists) through sync_entry
-- in preview mode, duplicate evidence across entries flagged, closed-period work skipped (DN-P3-4),
-- static account opening balances listed (DN-P3-3). Read-only.
CREATE FUNCTION phase3_p7.plan(_owner uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; acts jsonb; a jsonb; proposals jsonb := '[]'::jsonb; exceptions jsonb := '[]'::jsonb; seen jsonb := '{}'::jsonb; d jsonb;
  dup text; s jsonb; skipped jsonb := '[]'::jsonb; rows_sha text; e public.expenses; unchanged int := 0;
BEGIN
  FOR r IN SELECT x.id FROM public.expenses x WHERE x.employee_id = _owner
           UNION SELECT ev.source_entry_id FROM public.posting_events ev WHERE ev.owner_id = _owner AND ev.source_kind = 'ledger_entry'
           ORDER BY 1 LOOP
    acts := phase3_p7.sync_entry(_owner, r.id, false);
    -- duplicate evidence between two entries in the same plan (earliest-dated entry keeps it)
    SELECT * INTO e FROM public.expenses WHERE id = r.id;
    dup := NULL;
    IF FOUND AND EXISTS (SELECT 1 FROM jsonb_array_elements(acts) q WHERE q->>'action' IN ('post', 'replace')) THEN
      d := phase3_p7.derive_entry(e);
      FOR s IN SELECT value FROM jsonb_array_elements(coalesce(d->'sources', '[]'::jsonb)) LOOP
        IF seen ? (s->>'kind' || '|' || (s->>'key')) THEN dup := s->>'kind' || ' ' || (s->>'key') || ' also on ' || (seen->>(s->>'kind' || '|' || (s->>'key'))); EXIT; END IF;
        IF EXISTS (SELECT 1 FROM public.posting_event_sources b WHERE b.owner_id = _owner AND b.source_kind = s->>'kind' AND b.source_key = s->>'key' AND b.released_at IS NULL
                   AND b.event_id IS DISTINCT FROM (SELECT ev.id FROM public.posting_events ev WHERE ev.owner_id = _owner AND ev.event_key = 'ledger_entry:' || r.id)
                   AND phase3_p7.event_active(b.event_id)) THEN
          dup := s->>'kind' || ' ' || (s->>'key') || ' already posted'; EXIT;
        END IF;
      END LOOP;
      IF dup IS NULL THEN
        FOR s IN SELECT value FROM jsonb_array_elements(coalesce(d->'sources', '[]'::jsonb)) LOOP seen := seen || jsonb_build_object(s->>'kind' || '|' || (s->>'key'), r.id::text); END LOOP;
      END IF;
    END IF;
    FOR a IN SELECT value FROM jsonb_array_elements(acts) LOOP
      IF a->>'action' = 'exception' THEN exceptions := exceptions || jsonb_build_array(a);
      ELSIF a->>'action' = 'unchanged' THEN unchanged := unchanged + 1;
      ELSIF dup IS NOT NULL THEN exceptions := exceptions || jsonb_build_array(a || jsonb_build_object('action', 'exception', 'exception', 'duplicate_source', 'detail', dup));
      ELSIF (a->>'closed')::boolean THEN skipped := skipped || jsonb_build_array(a || jsonb_build_object('exception', 'closed_period'));
      ELSE proposals := proposals || jsonb_build_array(a); END IF;
    END LOOP;
  END LOOP;
  SELECT exceptions || coalesce(jsonb_agg(jsonb_build_object('accountId', a.id, 'action', 'exception', 'exception', 'account_opening_balance',
           'detail', 'accounts.opening_balance needs a dated source-backed opening journal (DN-P3-3)', 'amount', a.opening_balance) ORDER BY a.id), '[]'::jsonb)
    INTO exceptions FROM public.accounts a WHERE a.owner_id = _owner AND a.opening_balance <> 0;
  SELECT public.legacy_sha256(jsonb_build_object(
      'expenses', (SELECT coalesce(jsonb_agg(md5(to_jsonb(x)::text) ORDER BY x.id), '[]'::jsonb) FROM public.expenses x WHERE x.employee_id = _owner),
      'accounts', (SELECT coalesce(jsonb_agg(md5(to_jsonb(x)::text) ORDER BY x.id), '[]'::jsonb) FROM public.accounts x WHERE x.owner_id = _owner),
      'openings', (SELECT coalesce(jsonb_agg(md5(to_jsonb(x)::text) ORDER BY x.id), '[]'::jsonb) FROM public.opening_postings x WHERE x.owner_id = _owner),
      'entities', (SELECT coalesce(jsonb_agg(md5(to_jsonb(x)::text) ORDER BY x.id), '[]'::jsonb) FROM public.legal_entities x WHERE x.owner_id = _owner),
      'assignments', (SELECT coalesce(jsonb_agg(md5(to_jsonb(x)::text) ORDER BY x.id), '[]'::jsonb) FROM public.account_entity_assignments x WHERE x.owner_id = _owner),
      'periods', (SELECT p.data->'books'->'closedPeriods' FROM public.finance_preferences p WHERE p.owner_id = _owner),
      'entityAccounts', (SELECT p.data->'books'->'entityAccounts' FROM public.finance_preferences p WHERE p.owner_id = _owner),
      'batches', (SELECT count(*) FROM public.posting_batches b WHERE b.owner_id = _owner))) INTO rows_sha;
  RETURN jsonb_build_object('proposals', proposals, 'exceptions', exceptions, 'skippedClosed', skipped, 'unchanged', unchanged,
    'fingerprint', public.legacy_sha256(jsonb_build_object('p', proposals, 'x', exceptions, 's', skipped, 'rows', rows_sha)),
    'counts', jsonb_build_object('proposals', jsonb_array_length(proposals), 'exceptions', jsonb_array_length(exceptions), 'skippedClosed', jsonb_array_length(skipped), 'unchanged', unchanged));
END $$;

-- Legacy ledger movements per (entity, account, currency, period), computed DIRECTLY from expenses with
-- the ledger.ts accountBalance rule (independent of derive_entry), debit-signed (asset +, liability -).
CREATE FUNCTION phase3_p7.legacy_movements(_owner uuid)
RETURNS TABLE(legal_entity_id uuid, account_id uuid, currency text, period text, amount numeric, entry_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH m AS (
    SELECT e.id, e.account_id acc, e.expense_date d,
      CASE WHEN coalesce(e.txn_type, 'expense') = 'expense' THEN -e.amount
           WHEN e.txn_type IN ('income', 'refund', 'reimbursement', 'advance') THEN e.amount
           WHEN e.txn_type = 'adjustment' THEN e.amount * coalesce(e.adjustment_sign, 1) * (CASE WHEN phase3_p7.account_role(a.kind) = 'liability' THEN -1 ELSE 1 END)
           WHEN e.txn_type IN ('transfer', 'card_payment', 'loan_repayment', 'investment', 'advance_settlement') THEN -e.amount
           ELSE 0 END signed
    FROM public.expenses e JOIN public.accounts a ON a.id = e.account_id AND a.owner_id = e.employee_id
    WHERE e.employee_id = _owner AND e.transfer_counterpart_of IS NULL
    UNION ALL
    SELECT e.id, e.to_account_id, e.expense_date,
      CASE WHEN e.txn_type = 'loan_repayment' AND e.principal IS NOT NULL AND e.interest IS NOT NULL AND coalesce(e.original_amount, e.amount) > 0
           THEN e.amount - round(e.amount * e.interest / coalesce(e.original_amount, e.amount), 2) ELSE e.amount END
    FROM public.expenses e JOIN public.accounts a ON a.id = e.to_account_id AND a.owner_id = e.employee_id
    WHERE e.employee_id = _owner AND e.transfer_counterpart_of IS NULL AND e.txn_type IN ('transfer', 'card_payment', 'loan_repayment', 'investment'))
  SELECT phase3_p7.account_entity(_owner, m.acc, m.d), m.acc, 'INR', to_char(m.d, 'YYYY-MM'), m.signed, m.id FROM m WHERE m.signed <> 0
  UNION ALL
  SELECT phase3_p7.account_entity(_owner, a.id, NULL), a.id, 'INR', 'opening',
         CASE WHEN phase3_p7.account_role(a.kind) = 'liability' THEN -a.opening_balance ELSE a.opening_balance END, NULL
  FROM public.accounts a WHERE a.owner_id = _owner AND a.opening_balance <> 0
$$;

CREATE FUNCTION phase3_p7.report(_owner uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE rows jsonb; diffs jsonb; tb jsonb; pl jsonb; unposted jsonb;
BEGIN
  pl := phase3_p7.plan(_owner);
  WITH both_sides AS (
    SELECT legal_entity_id ent, account_id acc, currency cur, period per, amount legacy, 0::numeric journal FROM phase3_p7.legacy_movements(_owner)
    UNION ALL
    SELECT b.legal_entity_id, l.account_id, l.currency, to_char(b.posting_date, 'YYYY-MM'), 0::numeric, l.signed_amount
    FROM public.posting_lines l JOIN public.posting_batches b ON b.id = l.batch_id
    WHERE b.owner_id = _owner AND l.account_id IS NOT NULL),
  j AS (SELECT ent, acc, cur, per, sum(legacy) legacy, sum(journal) journal FROM both_sides GROUP BY ent, acc, cur, per)
  SELECT coalesce(jsonb_agg(jsonb_build_object('entityId', ent, 'entityKey', phase3_p7.entity_key(_owner, ent), 'accountId', acc, 'currency', cur, 'period', per,
           'legacy', legacy, 'journal', journal, 'difference', legacy - journal) ORDER BY ent, acc, cur, per), '[]'::jsonb)
    INTO rows FROM j;
  -- Each difference is listed with the entries that explain it (exceptions, closed-period skips and
  -- not-yet-posted entries); nothing is ever auto-fixed.
  WITH open_ids AS (
    SELECT (x->>'entryId')::uuid id FROM jsonb_array_elements(coalesce(pl->'exceptions', '[]'::jsonb) || coalesce(pl->'skippedClosed', '[]'::jsonb) || coalesce(pl->'proposals', '[]'::jsonb)) x
    WHERE x ? 'entryId'),
  mv AS (SELECT * FROM phase3_p7.legacy_movements(_owner))
  SELECT coalesce(jsonb_agg(r || jsonb_build_object(
      'explainedBy', (SELECT coalesce(jsonb_agg(DISTINCT m.entry_id), '[]'::jsonb) FROM mv m WHERE m.account_id = (r->>'accountId')::uuid AND m.period = r->>'period'
                       AND m.legal_entity_id IS NOT DISTINCT FROM (r->>'entityId')::uuid AND m.entry_id IN (SELECT id FROM open_ids)),
      'explainedAmount', (SELECT coalesce(sum(m.amount), 0) FROM mv m WHERE m.account_id = (r->>'accountId')::uuid AND m.period = r->>'period'
                       AND m.legal_entity_id IS NOT DISTINCT FROM (r->>'entityId')::uuid
                       AND (m.entry_id IN (SELECT id FROM open_ids) OR (m.entry_id IS NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(pl->'exceptions') x
                            WHERE x->>'exception' = 'account_opening_balance' AND x->>'accountId' = r->>'accountId')))))
    ORDER BY r->>'entityId', r->>'accountId', r->>'period'), '[]'::jsonb) INTO diffs
  FROM jsonb_array_elements(rows) r WHERE (r->>'difference')::numeric <> 0;
  SELECT coalesce(jsonb_agg(d || jsonb_build_object('explained', (d->>'explainedAmount')::numeric = (d->>'difference')::numeric)), '[]'::jsonb) INTO diffs FROM jsonb_array_elements(diffs) d;
  SELECT coalesce(jsonb_agg(jsonb_build_object('entityId', ent, 'entityKey', phase3_p7.entity_key(_owner, ent), 'currency', cur, 'debit', dr, 'credit', cr, 'balanced', dr = cr) ORDER BY ent, cur), '[]'::jsonb)
    INTO tb FROM (SELECT b.legal_entity_id ent, l.currency cur, sum(l.debit) dr, sum(l.credit) cr
                  FROM public.posting_lines l JOIN public.posting_batches b ON b.id = l.batch_id WHERE b.owner_id = _owner GROUP BY 1, 2) t;
  unposted := pl->'proposals';
  RETURN jsonb_build_object('rows', rows, 'differences', diffs, 'trialBalance', tb, 'exceptions', pl->'exceptions', 'skippedClosed', pl->'skippedClosed',
    'unposted', unposted, 'active', phase3_p7.active(_owner),
    'balanced', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(tb) t WHERE NOT (t->>'balanced')::boolean),
    'matches', jsonb_array_length(diffs) = 0,
    'allDifferencesExplained', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(diffs) d WHERE NOT (d->>'explained')::boolean));
END $$;

-- --------------------------------------------------------------------------------------------
-- 8. Client entry points
-- --------------------------------------------------------------------------------------------
-- Capability probe for the app (fails closed: missing function = production schema = today's behaviour).
CREATE FUNCTION public.posting_status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('installed', true, 'version', 'P7', 'active', auth.uid() IS NOT NULL AND phase3_p7.active(auth.uid()),
    'guest', auth.uid() IS NOT NULL AND phase3_p7.is_guest(), 'canPost', auth.uid() IS NOT NULL AND NOT phase3_p7.is_guest() AND NOT public.is_assistant_session())
$$;

CREATE FUNCTION public.preview_posting_backfill() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF phase3_p7.is_guest() THEN RAISE EXCEPTION 'P7_GUEST: demo guests cannot convert records to journals' USING ERRCODE = '42501'; END IF;
  IF public.p5_personal_entity(uid) IS NULL THEN RAISE EXCEPTION 'P7: run the legal-entity backfill (P5) first'; END IF;
  RETURN phase3_p7.plan(uid) || jsonb_build_object('active', phase3_p7.active(uid));
END $$;

CREATE FUNCTION public.posting_reconciliation_report() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF public.p5_personal_entity(auth.uid()) IS NULL THEN RAISE EXCEPTION 'P7: run the legal-entity backfill (P5) first'; END IF;
  RETURN phase3_p7.report(auth.uid());
END $$;

-- Commit exactly the reviewed preview (fingerprint), once. Step-up (P4 guard below), never guests.
CREATE FUNCTION public.commit_posting_backfill(_run uuid, _fingerprint text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); pl jsonb; a jsonb; prev public.posting_backfill_runs; posted int := 0; result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF phase3_p7.is_guest() THEN RAISE EXCEPTION 'P7_GUEST: demo guests cannot convert records to journals' USING ERRCODE = '42501'; END IF;
  IF _run IS NULL OR coalesce(_fingerprint, '') = '' THEN RAISE EXCEPTION 'Run id and reviewed preview fingerprint required'; END IF;
  PERFORM 1 FROM public.finance_preferences WHERE owner_id = uid FOR UPDATE;
  PERFORM phase3_p7.lock_owner(uid);
  SELECT * INTO prev FROM public.posting_backfill_runs WHERE id = _run;
  IF FOUND THEN
    IF prev.owner_id <> uid OR prev.kind <> 'commit' OR prev.fingerprint <> _fingerprint THEN RAISE EXCEPTION 'P7: run id already used'; END IF;
    RETURN prev.report || jsonb_build_object('replayed', true);
  END IF;
  IF public.p5_personal_entity(uid) IS NULL THEN RAISE EXCEPTION 'P7: run the legal-entity backfill (P5) first'; END IF;
  pl := phase3_p7.plan(uid);
  IF pl->>'fingerprint' IS DISTINCT FROM _fingerprint THEN
    RAISE EXCEPTION 'P7_PREVIEW_STALE: records changed since the preview; review a new preview' USING ERRCODE = '40001';
  END IF;
  FOR a IN SELECT DISTINCT ON (value->>'entryId') value FROM jsonb_array_elements(pl->'proposals') ORDER BY value->>'entryId' LOOP
    PERFORM phase3_p7.sync_entry(uid, (a->>'entryId')::uuid, true, jsonb_build_object('reason', 'Reviewed historical backfill', 'run', _run));
    posted := posted + 1;
  END LOOP;
  result := jsonb_build_object('run', _run, 'entriesPosted', posted, 'counts', pl->'counts', 'exceptions', pl->'exceptions', 'skippedClosed', pl->'skippedClosed');
  PERFORM set_config('phase3_p7.writer', 'on', true);
  INSERT INTO public.posting_backfill_runs(id, owner_id, kind, fingerprint, report, actor_id) VALUES (_run, uid, 'commit', _fingerprint, result, uid);
  PERFORM set_config('phase3_p7.writer', '', true);
  RETURN result;
END $$;

-- Deactivate: reverse every active entry/opening batch (history kept, DN-P3-10), then append 'undo'.
CREATE FUNCTION public.undo_posting_backfill(_run uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); latest public.posting_backfill_runs; b public.posting_batches; n int := 0; ids uuid[] := '{}'; rid uuid;
BEGIN
  IF uid IS NULL OR phase3_p7.is_guest() THEN RAISE EXCEPTION 'P7_GUEST: sign in with a real account' USING ERRCODE = '42501'; END IF;
  IF length(btrim(coalesce(_reason, ''))) < 5 THEN RAISE EXCEPTION 'A reason of at least five characters is required'; END IF;
  PERFORM 1 FROM public.finance_preferences WHERE owner_id = uid FOR UPDATE;
  PERFORM phase3_p7.lock_owner(uid);
  IF EXISTS (SELECT 1 FROM public.posting_backfill_runs WHERE id = md5(_run::text || ':undo')::uuid) THEN
    RETURN (SELECT report || jsonb_build_object('replayed', true) FROM public.posting_backfill_runs WHERE id = md5(_run::text || ':undo')::uuid);
  END IF;
  SELECT * INTO latest FROM public.posting_backfill_runs WHERE owner_id = uid ORDER BY seq DESC LIMIT 1;
  IF NOT FOUND OR latest.id <> _run OR latest.kind <> 'commit' THEN RAISE EXCEPTION 'P7: only the latest active backfill run can be undone'; END IF;
  FOR b IN SELECT x.* FROM public.posting_batches x WHERE x.owner_id = uid AND x.kind IN ('entry', 'opening')
           AND NOT EXISTS (SELECT 1 FROM public.posting_batches r WHERE r.reverses_id = x.id) ORDER BY x.created_at, x.id LOOP
    rid := phase3_p7.reverse_batch(b, jsonb_build_object('reason', btrim(_reason), 'actor', uid, 'undo', _run), _run);
    ids := ids || rid; n := n + 1;
    PERFORM phase3_p7.release_sources(uid, b.event_id);
  END LOOP;
  PERFORM set_config('phase3_p7.writer', 'on', true);
  INSERT INTO public.posting_reversals(id, owner_id, target, batch_ids, reversal_batch_ids, reason, actor_id, session_id)
  VALUES (md5(_run::text || ':undo-audit')::uuid, uid, 'backfill', '{}', ids, btrim(_reason), uid, public.jwt_session_id());
  INSERT INTO public.posting_backfill_runs(id, owner_id, kind, fingerprint, report, actor_id, reason)
  VALUES (md5(_run::text || ':undo')::uuid, uid, 'undo', latest.fingerprint, jsonb_build_object('reversed', n, 'run', _run), uid, btrim(_reason));
  PERFORM set_config('phase3_p7.writer', '', true);
  RETURN jsonb_build_object('reversed', n, 'run', _run);
END $$;

-- Remove a POSTED entry from the working ledger by audited reversal (DN-P3-1/10, REQ-SEC-053).
-- Step-up (P4 guard below), reason, idempotent request id, entity-aware period check (the reversal is
-- dated with the original so period reports stay exact; a closed original must be reopened first).
-- The full row is archived in posting_reversals; receipts and documents are kept.
CREATE FUNCTION public.reverse_ledger_entry(_request uuid, _entry uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); e public.expenses; prev public.posting_reversals; ev uuid; olds uuid[]; news uuid[]; b record; links jsonb;
BEGIN
  IF uid IS NULL OR phase3_p7.is_guest() THEN RAISE EXCEPTION 'P7_GUEST: demo guests cannot post or reverse' USING ERRCODE = '42501'; END IF;
  IF _request IS NULL OR _entry IS NULL THEN RAISE EXCEPTION 'Request and entry required'; END IF;
  SELECT * INTO prev FROM public.posting_reversals WHERE id = _request;
  IF FOUND THEN
    IF prev.owner_id <> uid OR prev.entry_id IS DISTINCT FROM _entry OR prev.target <> 'ledger_entry' THEN RAISE EXCEPTION 'P7: request id already used'; END IF;
    RETURN jsonb_build_object('request', _request, 'entryId', _entry, 'reversalBatches', to_jsonb(prev.reversal_batch_ids), 'replayed', true);
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 5 THEN RAISE EXCEPTION 'A reason of at least five characters is required'; END IF;
  IF NOT phase3_p7.active(uid) THEN RAISE EXCEPTION 'P7_NOT_ACTIVE: balanced posting is not active for this account' USING ERRCODE = '55000'; END IF;
  PERFORM 1 FROM public.finance_preferences WHERE owner_id = uid FOR UPDATE;
  PERFORM phase3_p7.lock_owner(uid);
  SELECT * INTO e FROM public.expenses WHERE id = _entry AND employee_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found'; END IF;
  IF e.transfer_counterpart_of IS NOT NULL OR EXISTS (SELECT 1 FROM public.expenses c WHERE c.transfer_counterpart_of = e.id) THEN
    RAISE EXCEPTION 'P7: this entry is part of a linked transfer; unlink the transfer first';
  END IF;
  SELECT id INTO ev FROM public.posting_events WHERE owner_id = uid AND event_key = 'ledger_entry:' || _entry;
  FOR b IN SELECT x.legal_entity_id, x.posting_date FROM public.posting_batches x WHERE x.event_id = ev AND x.kind IN ('entry', 'opening')
           AND NOT EXISTS (SELECT 1 FROM public.posting_batches r WHERE r.reverses_id = x.id) LOOP
    IF phase3_p7.closed(uid, b.legal_entity_id, b.posting_date) THEN
      RAISE EXCEPTION 'P7_CLOSED_PERIOD: the entry is in a closed period; reopen it on the Audit page first' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  SELECT coalesce(array_agg(x.id ORDER BY x.id), '{}') INTO olds FROM public.posting_batches x WHERE x.event_id = ev AND x.kind IN ('entry', 'opening')
    AND NOT EXISTS (SELECT 1 FROM public.posting_batches r WHERE r.reverses_id = x.id);
  -- P0-005a: everything that a delete would cascade away, unlink or leave dangling is archived with the
  -- reversal (approval history, linked documents/loans, import fingerprints, drafts, transfer links and,
  -- when this is the owner's last entry, the bulk-category undo history that 0016 clears).
  links := jsonb_build_object(
    'expenseHistory', (SELECT coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb) FROM public.expense_history h WHERE h.expense_id = _entry),
    'documents', (SELECT coalesce(jsonb_agg(d.id ORDER BY d.id), '[]'::jsonb) FROM public.documents d WHERE d.transaction_id = _entry AND d.owner_id = uid),
    'loans', (SELECT coalesce(jsonb_agg(l.id ORDER BY l.id), '[]'::jsonb) FROM public.loans l WHERE l.source_transaction_id = _entry AND l.owner_id = uid),
    'importPosts', (SELECT coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) FROM public.import_posts i WHERE i.transaction_id = _entry AND i.owner_id = uid),
    'drafts', (SELECT coalesce(jsonb_agg(x.id ORDER BY x.id), '[]'::jsonb) FROM public.expense_drafts x WHERE x.transaction_id = _entry AND x.owner_id = uid),
    'categoryBatches', CASE WHEN NOT EXISTS (SELECT 1 FROM public.expenses o WHERE o.employee_id = uid AND o.id <> _entry)
      THEN (SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) FROM public.category_batches c WHERE c.owner_id = uid) ELSE '[]'::jsonb END);
  PERFORM set_config('phase3_p7.reversing', _entry::text, true);
  PERFORM set_config('phase3_p7.reason', 'Reversed: ' || left(btrim(_reason), 480), true);
  PERFORM set_config('phase3_p7.request', _request::text, true);
  DELETE FROM public.expenses WHERE id = _entry AND employee_id = uid; -- AFTER trigger posts the reversal batches
  PERFORM set_config('phase3_p7.reversing', '', true);
  PERFORM set_config('phase3_p7.reason', '', true);
  PERFORM set_config('phase3_p7.request', '', true);
  SELECT coalesce(array_agg(r.id ORDER BY r.reverses_id), '{}') INTO news FROM public.posting_batches r WHERE r.reverses_id = ANY (olds);
  PERFORM set_config('phase3_p7.writer', 'on', true);
  INSERT INTO public.posting_reversals(id, owner_id, target, entry_id, batch_ids, reversal_batch_ids, entry_snapshot, reason, actor_id, session_id)
  VALUES (_request, uid, 'ledger_entry', _entry, olds, news, to_jsonb(e) || jsonb_build_object('_linked', links), btrim(_reason), uid, public.jwt_session_id());
  PERFORM set_config('phase3_p7.writer', '', true);
  RETURN jsonb_build_object('request', _request, 'entryId', _entry, 'reversalBatches', to_jsonb(news), 'replayed', false);
END $$;

-- Manual journal (accruals, provisions, depreciation, inter-entity settlements). Owner only for now
-- (DN-P3-7 B), active owners only, never guests/assistants, never bank/card account lines: money moves
-- only through ledger entries, so journal and ledger cannot diverge.
CREATE FUNCTION public.post_journal_batch(_request uuid, _entity uuid, _on date, _lines jsonb, _memo text, _sources jsonb) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); ev uuid; sha text; l jsonb; prev public.posting_events; bid uuid; docs jsonb := coalesce(_sources, '[]'::jsonb);
BEGIN
  IF uid IS NULL OR phase3_p7.is_guest() THEN RAISE EXCEPTION 'P7_GUEST: demo guests cannot post journals' USING ERRCODE = '42501'; END IF;
  IF _request IS NULL OR _entity IS NULL OR _on IS NULL THEN RAISE EXCEPTION 'Request, legal entity and date required'; END IF;
  sha := public.legacy_sha256(jsonb_build_object('entity', _entity, 'on', _on, 'lines', phase3_p7.canon(_lines), 'memo', _memo, 'sources', docs));
  SELECT * INTO prev FROM public.posting_events WHERE owner_id = uid AND event_key = 'journal:' || _request;
  IF FOUND THEN
    IF prev.content_sha256 IS DISTINCT FROM sha THEN RAISE EXCEPTION 'P7: journal request id already used with different content'; END IF;
    RETURN (SELECT x.id FROM public.posting_batches x WHERE x.event_id = prev.id AND x.kind = 'journal' LIMIT 1);
  END IF;
  IF NOT phase3_p7.active(uid) THEN RAISE EXCEPTION 'P7_NOT_ACTIVE: balanced posting is not active for this account' USING ERRCODE = '55000'; END IF;
  IF length(btrim(coalesce(_memo, ''))) < 5 THEN RAISE EXCEPTION 'Journal explanation of at least five characters required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.legal_entities e WHERE e.owner_id = uid AND e.id = _entity) THEN RAISE EXCEPTION 'Legal entity unavailable'; END IF;
  IF jsonb_typeof(_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(_lines) < 2 OR jsonb_array_length(_lines) > 200 THEN RAISE EXCEPTION 'Journal needs 2 to 200 lines'; END IF;
  FOR l IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    IF jsonb_typeof(l->'debit') IS DISTINCT FROM 'number' OR jsonb_typeof(l->'credit') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Journal amounts must be numbers'; END IF;
    IF l ? 'accountId' OR coalesce(l->>'code', '') LIKE 'account:%' THEN
      RAISE EXCEPTION 'P7: journals cannot move bank, card or wallet accounts; record the money movement as a ledger entry';
    END IF;
    IF coalesce(l->>'code', '') LIKE 'due:%' AND NOT EXISTS (SELECT 1 FROM public.legal_entities e WHERE e.owner_id = uid AND e.id::text = substr(l->>'code', 5)) THEN
      RAISE EXCEPTION 'P7: inter-entity line must name one of your legal entities';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(docs) s WHERE s->>'kind' NOT IN ('document', 'receipt')
             OR (s->>'kind' = 'document' AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id::text = s->>'key' AND d.owner_id = uid))) THEN
    RAISE EXCEPTION 'P7: journal evidence must be your own documents';
  END IF;
  PERFORM 1 FROM public.finance_preferences WHERE owner_id = uid FOR UPDATE;
  PERFORM phase3_p7.lock_owner(uid);
  ev := phase3_p7.ensure_event(uid, 'journal:' || _request, 'journal', NULL, sha);
  bid := phase3_p7.write_batch(uid, ev, _entity, 'journal', 'journal:' || _request, _on, NULL, NULL,
    (SELECT jsonb_agg(jsonb_build_object('code', x->>'code', 'role', x->>'role', 'debit', x->'debit', 'credit', x->'credit', 'counterEntityId',
       CASE WHEN x->>'code' LIKE 'due:%' THEN substr(x->>'code', 5) END, 'currency', coalesce(x->>'currency', 'INR'), 'memo', x->>'memo')) FROM jsonb_array_elements(_lines) x),
    jsonb_build_object('currency', 'INR'), btrim(_memo), jsonb_build_object('actor', uid), NULL);
  PERFORM phase3_p7.bind_sources(uid, ev, docs || jsonb_build_array(jsonb_build_object('kind', 'journal_request', 'key', _request::text)));
  RETURN bid;
END $$;

CREATE FUNCTION public.reverse_journal_batch(_request uuid, _batch uuid, _reason text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); b public.posting_batches; prev public.posting_reversals; rid uuid;
BEGIN
  IF uid IS NULL OR phase3_p7.is_guest() THEN RAISE EXCEPTION 'P7_GUEST: demo guests cannot post or reverse' USING ERRCODE = '42501'; END IF;
  SELECT * INTO prev FROM public.posting_reversals WHERE id = _request;
  IF FOUND THEN
    IF prev.owner_id <> uid OR prev.target <> 'journal' OR NOT (_batch = ANY (prev.batch_ids)) THEN RAISE EXCEPTION 'P7: request id already used'; END IF;
    RETURN prev.reversal_batch_ids[1];
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 5 THEN RAISE EXCEPTION 'A reason of at least five characters is required'; END IF;
  PERFORM phase3_p7.lock_owner(uid);
  SELECT * INTO b FROM public.posting_batches WHERE id = _batch AND owner_id = uid AND kind = 'journal';
  IF NOT FOUND THEN RAISE EXCEPTION 'Journal not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.posting_batches r WHERE r.reverses_id = b.id) THEN RAISE EXCEPTION 'P7: journal already reversed'; END IF;
  rid := phase3_p7.reverse_batch(b, jsonb_build_object('reason', btrim(_reason), 'request', _request, 'actor', uid), NULL);
  PERFORM phase3_p7.release_sources(uid, b.event_id);
  PERFORM set_config('phase3_p7.writer', 'on', true);
  INSERT INTO public.posting_reversals(id, owner_id, target, batch_ids, reversal_batch_ids, reason, actor_id, session_id)
  VALUES (_request, uid, 'journal', ARRAY[b.id], ARRAY[rid], btrim(_reason), uid, public.jwt_session_id());
  PERFORM set_config('phase3_p7.writer', '', true);
  RETURN rid;
END $$;

-- --------------------------------------------------------------------------------------------
-- 9. Period close / reopen evidence includes postings (DN-P3-13, C5). For an ACTIVE owner a close is
--    refused while any entry in the range is unposted, an exception or awaiting review, and the
--    evidence of every close/reopen records the posting snapshot (batch ids + trial balance + hash).
--    Owners who are not active keep today's evidence (not journal-authoritative).
-- --------------------------------------------------------------------------------------------
CREATE FUNCTION phase3_p7.guard_period_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE f date; t date; ent text; pending jsonb := '[]'::jsonb; r record; acts jsonb; snap jsonb;
BEGIN
  IF NOT phase3_p7.active(NEW.owner_id) THEN RETURN NEW; END IF;
  f := (NEW.request->>'from')::date; t := (NEW.request->>'to')::date; ent := nullif(coalesce(NEW.request->>'entityId', NEW.request->>'entity'), '');
  IF (f IS NULL OR t IS NULL) AND jsonb_typeof(NEW.evidence->'period') = 'object' THEN -- reopen: the removed period is in the evidence
    f := (NEW.evidence->'period'->>'from')::date; t := (NEW.evidence->'period'->>'to')::date; ent := nullif(NEW.evidence->'period'->>'entityId', '');
  END IF;
  IF f IS NULL OR t IS NULL THEN
    SELECT (c->>'from')::date, (c->>'to')::date, nullif(c->>'entityId', '') INTO f, t, ent
    FROM public.finance_preferences p, jsonb_array_elements(coalesce(p.data->'books'->'closedPeriods', '[]'::jsonb)) c
    WHERE p.owner_id = NEW.owner_id AND c->>'id' = NEW.period_id LIMIT 1;
  END IF;
  IF f IS NULL OR t IS NULL THEN RETURN NEW; END IF;
  IF NEW.action = 'closed' THEN
    FOR r IN SELECT x.id FROM public.expenses x WHERE x.employee_id = NEW.owner_id AND x.expense_date BETWEEN f AND t ORDER BY x.id LOOP
      acts := phase3_p7.sync_entry(NEW.owner_id, r.id, false);
      SELECT pending || coalesce(jsonb_agg(a), '[]'::jsonb) INTO pending FROM jsonb_array_elements(acts) a
      WHERE a->>'action' <> 'unchanged' AND (ent IS NULL OR a->>'action' = 'exception' OR phase3_p7.entity_key(NEW.owner_id, (a->>'entity')::uuid) = ent);
    END LOOP;
    IF jsonb_array_length(pending) > 0 THEN
      RAISE EXCEPTION 'P7_CLOSE_BLOCKED: % entr(ies) in this period are not posted, are exceptions or await review', jsonb_array_length(pending) USING ERRCODE = 'P0001';
    END IF;
  END IF;
  WITH pb AS (SELECT b.id FROM public.posting_batches b WHERE b.owner_id = NEW.owner_id AND b.posting_date BETWEEN f AND t
                AND (ent IS NULL OR phase3_p7.entity_key(NEW.owner_id, b.legal_entity_id) = ent))
  SELECT jsonb_build_object('batches', (SELECT coalesce(jsonb_agg(pb.id ORDER BY pb.id), '[]'::jsonb) FROM pb),
    'debit', (SELECT coalesce(sum(l.debit), 0) FROM public.posting_lines l JOIN pb ON pb.id = l.batch_id),
    'credit', (SELECT coalesce(sum(l.credit), 0) FROM public.posting_lines l JOIN pb ON pb.id = l.batch_id)) INTO snap;
  NEW.evidence := NEW.evidence || jsonb_build_object('postings', snap || jsonb_build_object('sha256', public.legacy_sha256(snap), 'from', f, 'to', t, 'entityId', ent));
  RETURN NEW;
END $$;
CREATE TRIGGER p7_period_evidence BEFORE INSERT ON public.period_close_evidence FOR EACH ROW EXECUTE FUNCTION phase3_p7.guard_period_evidence();

-- --------------------------------------------------------------------------------------------
-- 10. Privileges and RLS. Read: the owner, or an explicitly authorised ACCOUNTANT (P2 access_grants
--     role 'accountant', accepted, unexpired, unrevoked; never anonymous) for that legal entity
--     (DN-P3-7 B). Company members, bookkeepers, viewers and legacy company grants never read postings.
--     Personal books need an explicit grant on 'personal:<owner>'; workspace-wide grants do not cover them.
-- --------------------------------------------------------------------------------------------
CREATE FUNCTION public.p7_can_read(_owner uuid, _entity uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND (auth.uid() = _owner OR (
    NOT coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
    AND EXISTS (SELECT 1 FROM public.legal_entities e JOIN public.access_grants g ON g.workspace_owner_id = e.owner_id
      WHERE e.owner_id = _owner AND e.id = _entity AND e.kind <> 'legacy_unknown'
        AND g.grantee_id = auth.uid() AND g.role = 'accountant' AND g.accepted_at IS NOT NULL AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
        AND (g.entity_id = e.entity_key OR (g.entity_id IS NULL AND e.kind <> 'individual_personal')))))
$$;

REVOKE ALL ON public.posting_events, public.posting_event_sources, public.posting_batches, public.posting_lines, public.posting_reversals, public.posting_backfill_runs
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.posting_backfill_runs_seq_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.posting_events, public.posting_event_sources, public.posting_batches, public.posting_lines, public.posting_reversals, public.posting_backfill_runs
  TO authenticated, service_role;
ALTER TABLE public.posting_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posting_event_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posting_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posting_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posting_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posting_backfill_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner or authorised accountant reads posting batches" ON public.posting_batches FOR SELECT TO authenticated
  USING (public.p7_can_read(owner_id, legal_entity_id));
CREATE POLICY "Owner or authorised accountant reads posting lines" ON public.posting_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posting_batches b WHERE b.id = posting_lines.batch_id AND public.p7_can_read(b.owner_id, b.legal_entity_id)));
CREATE POLICY "Owner reads posting events" ON public.posting_events FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner reads posting sources" ON public.posting_event_sources FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner reads posting reversals" ON public.posting_reversals FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner reads posting backfill runs" ON public.posting_backfill_runs FOR SELECT TO authenticated USING (owner_id = auth.uid());

-- P4 RESTRICTIVE assistant policies on every new table (same names and expressions as P4 section 8 / P5).
DO $pol$
DECLARE t record; rd text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
           AND c.relname IN ('posting_events', 'posting_event_sources', 'posting_batches', 'posting_lines', 'posting_reversals', 'posting_backfill_runs') ORDER BY c.relname LOOP
    rd := '(SELECT NOT public.is_assistant_session()) OR NOT public.assistant_client_revoked(owner_id)';
    EXECUTE format('CREATE POLICY "P4 assistants cannot insert" ON public.%I AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (NOT (SELECT public.is_assistant_session()))', t.relname);
    EXECUTE format('CREATE POLICY "P4 assistants cannot update" ON public.%I AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (NOT (SELECT public.is_assistant_session())) WITH CHECK (NOT (SELECT public.is_assistant_session()))', t.relname);
    EXECUTE format('CREATE POLICY "P4 assistants cannot delete" ON public.%I AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (NOT (SELECT public.is_assistant_session()))', t.relname);
    EXECUTE format('CREATE POLICY "P4 revoked assistants cannot read" ON public.%I AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (%s)', t.relname, rd);
    EXECUTE format('CREATE POLICY "P7 postings cannot be changed by clients" ON public.%I AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false)', t.relname);
    EXECUTE format('CREATE POLICY "P7 postings cannot be deleted by clients" ON public.%I AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false)', t.relname);
  END LOOP;
END $pol$;

-- Function privileges: internal schema closed; clients get only the entry points.
DO $grants$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p WHERE p.pronamespace = 'phase3_p7'::regnamespace LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN (
      'posting_status', 'preview_posting_backfill', 'posting_reconciliation_report', 'commit_posting_backfill', 'undo_posting_backfill',
      'reverse_ledger_entry', 'post_journal_batch', 'reverse_journal_batch', 'p7_can_read') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f.sig);
  END LOOP;
END $grants$;
GRANT EXECUTE ON FUNCTION public.posting_status(), public.preview_posting_backfill(), public.posting_reconciliation_report(),
  public.commit_posting_backfill(uuid, text), public.undo_posting_backfill(uuid, text), public.reverse_ledger_entry(uuid, uuid, text),
  public.post_journal_batch(uuid, uuid, date, jsonb, text, jsonb), public.reverse_journal_batch(uuid, uuid, text), public.p7_can_read(uuid, uuid) TO authenticated;

-- P4 guards: step-up for conversion, undo and reversals (approvals/reopen-class actions); assistant
-- refusal for journal posting. Registered in security_p4.guarded_functions; the P7 rollback removes them.
DO $guard$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure sig, CASE WHEN p.proname = 'post_journal_batch' THEN 'assistant' ELSE 'step_up' END mode
           FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN (
             'commit_posting_backfill', 'undo_posting_backfill', 'reverse_ledger_entry', 'reverse_journal_batch', 'post_journal_batch')
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
  IF n > 0 THEN RAISE EXCEPTION 'P7: % unguarded client-callable writer function(s) in public', n; END IF;
END $check$;

COMMIT;
