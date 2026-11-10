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
--
-- REVISION 2 (Phase 3 completion, 10 Nov 2026, KK's binding decisions 1-6):
--  1. Reversals NEVER remove the original from the journal or the working ledger. reverse_ledger_entry
--     keeps the original row unchanged and records a SEPARATE linked reversal row in public.expenses
--     (expenses.reverses_entry_id = original) plus mirrored reversal batches. Every reader counts the
--     original plus its reversal (net zero, each on its own date): ledger.ts ledgerView, the server and
--     MCP readers, and legacy_movements here. Originals and reversals are immutable history.
--  2. Reversals are dated on the authorised correction date (default today) in an OPEN period; closed
--     periods are never reopened automatically. Prior-period adjustments are a separate approved
--     workflow (submit_posting_request kind prior_period_adjustment -> decide_posting_request with
--     step-up), tagged with the explicit closed target period and reported by
--     prior_period_adjustment_report() next to the unchanged closed figures.
--  3. Personal-only closed periods ('personal:<owner>') are enforced by BOTH the legacy entry guard
--     (p5_entry_closed, replaced here, restored by the rollback) and the posting guard (closed()).
--  4. Reimbursement types are distinguished: merchant refunds reduce the purchase; employee
--     reimbursements, insurance recoveries and inter-party settlements are claims (receivable +
--     separate recovery, gross expense preserved; money back settles the receivable); advances are a
--     liability. An unlinked reimbursement is an exception, never a reduction of some expense.
--  5. Posting stays owner-only; phase3_p7.may() is the single permission check, with a reserved,
--     default-off delegation path for explicitly authorised accountants/bookkeepers (P2 post/approve)
--     that legacy company roles can never use.
--  Also: Statement Desk Undo by audited per-entry reversal (reverse_statement_upload), card payments
--  through one idempotent action (record_card_payment, P0-005b), linked-record states kept as history
--  (posting_link_states), an approval queue for journals, reversals and the historical conversion
--  (submit_posting_request / decide_posting_request), and the 0016 trigger that wiped bulk-category
--  history on the last delete is disabled (P0-021). Depreciation posting lives in
--  P8_asset_depreciation_posting.sql (needs P6) through the phase3_p7.classify_adjustment hook.
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

-- Decision 1: the reversal of a posted entry is its own working-ledger row, linked to the original.
-- New nullable column only: no existing value changes. One reversal per original; never self.
ALTER TABLE public.expenses ADD COLUMN reverses_entry_id uuid REFERENCES public.expenses(id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_reversal_not_self CHECK (reverses_entry_id IS NULL OR reverses_entry_id <> id);
CREATE UNIQUE INDEX expenses_one_reversal_idx ON public.expenses(reverses_entry_id) WHERE reverses_entry_id IS NOT NULL;
COMMENT ON COLUMN public.expenses.reverses_entry_id IS 'P7 r2: this row is the audited reversal of that original entry (same amounts and accounts, dated on the correction date). Readers count original + reversal (net zero). Set only by phase3_p7.reverse_entry; immutable.';

-- --------------------------------------------------------------------------------------------
-- 1. Tables
-- --------------------------------------------------------------------------------------------
CREATE TABLE public.posting_events (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.finance_preferences(owner_id) ON DELETE CASCADE,
  -- claim:<expense id> = the reimbursement claim (receivable + recovery) recognised on an expense (decision 4)
  event_key text NOT NULL CHECK (event_key ~ '^(ledger_entry|journal|claim):[0-9a-f-]{36}$'),
  source_kind text NOT NULL CHECK (source_kind IN ('ledger_entry', 'journal', 'claim')),
  source_entry_id uuid,
  content_sha256 text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid,
  UNIQUE (owner_id, event_key),
  UNIQUE (owner_id, id),
  CHECK ((source_kind IN ('ledger_entry', 'claim')) = (source_entry_id IS NOT NULL))
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
  kind text NOT NULL CHECK (kind IN ('entry', 'opening', 'journal', 'reversal', 'prior_period')),
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
  target text NOT NULL CHECK (target IN ('ledger_entry', 'journal', 'backfill', 'prior_period')),
  entry_id uuid,
  reversal_entry_id uuid,          -- decision 1: the linked reversal row in public.expenses
  correction_date date,            -- decision 2: the authorised correction date (open period)
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

-- r2: state changes of records linked to a reversed entry (import fingerprints, drafts, transfer links
-- and counterparts, documents, loans, claim receipts, bulk-category history, statement uploads). The
-- linked records themselves keep pointing at the original (which is never deleted); this append-only
-- table says what the reversal changed or left as history. Nothing is ever deleted.
CREATE TABLE public.posting_link_states (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.finance_preferences(owner_id) ON DELETE CASCADE,
  entry_id uuid NOT NULL,
  reversal_entry_id uuid NOT NULL,
  link_kind text NOT NULL CHECK (link_kind IN ('import_post', 'draft', 'transfer_link', 'counterpart', 'document', 'loan', 'claim_receipt', 'claim', 'category_batch', 'statement_upload')),
  link_key text NOT NULL CHECK (length(link_key) BETWEEN 1 AND 600),
  state text NOT NULL CHECK (state IN ('kept_as_history', 'reversed', 'receipt_reversed', 'reopened', 'undo_blocked')),
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX posting_link_states_entry_idx ON public.posting_link_states(owner_id, entry_id);
COMMENT ON TABLE public.posting_link_states IS 'P7 r2: append-only states of records linked to a reversed entry (DN-P3-10, P0-005a R4). Links keep pointing at the original; nothing is deleted.';

-- r2: approval queue (item 5). A request is immutable; its single decision is a separate row.
-- Pending = no decision. Approval executes the posting in the same transaction (or nothing changes).
CREATE TABLE public.posting_requests (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.finance_preferences(owner_id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('journal', 'journal_reversal', 'reversal', 'backfill', 'prior_period_adjustment')),
  legal_entity_id uuid,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 200000),
  payload_sha256 text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  requested_by uuid NOT NULL,
  session_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  seq bigserial NOT NULL UNIQUE
);
CREATE INDEX posting_requests_owner_idx ON public.posting_requests(owner_id, seq DESC);
CREATE TABLE public.posting_request_decisions (
  request_id uuid PRIMARY KEY REFERENCES public.posting_requests(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected', 'cancelled')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  result jsonb,
  decided_by uuid NOT NULL,
  session_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
COMMENT ON TABLE public.posting_requests IS 'P7 r2: approval queue for journals, journal reversals, entry reversals, the historical conversion and prior-period adjustments. Immutable; decisions in posting_request_decisions.';

-- r2: Statement Desk Undo receipts (item 1): exactly what one upload Undo reversed, deleted (unposted
-- rows, today''s rule) and unmatched. Replay by request id.
CREATE TABLE public.statement_upload_reversals (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.finance_preferences(owner_id) ON DELETE CASCADE,
  upload_id uuid NOT NULL,
  items_sha256 text NOT NULL,
  result jsonb NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  actor_id uuid NOT NULL,
  session_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
COMMENT ON TABLE public.statement_upload_reversals IS 'P7 r2: audited Statement Desk Undo: posted rows reversed (linked reversal entries), unposted rows deleted as before, matches cleared. Append-only.';

-- r2 (decision 5): RESERVED delegation of posting to explicitly authorised accountants/bookkeepers.
-- Default off: no function writes this table in this release, so posting is owner-only. When a later,
-- separately approved release adds the owner's grant workflow, phase3_p7.may() already requires BOTH a
-- delegation row and a P2 grant whose role matrix allows the action; legacy company roles never qualify.
CREATE TABLE public.posting_delegations (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.finance_preferences(owner_id) ON DELETE CASCADE,
  entity_key text NOT NULL,
  grantee_id uuid NOT NULL,
  actions text[] NOT NULL CHECK (actions <@ ARRAY['propose', 'post', 'approve', 'reverse']::text[] AND cardinality(actions) > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz
);
COMMENT ON TABLE public.posting_delegations IS 'P7 r2: reserved, default-off posting delegation (KK decision 5). No writer in this release.';

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
-- closes that company; r2 (KK decision 3): a personal-only period (entityId 'personal:<owner>', the
-- personal legal entity's key) closes the personal books. The legacy entry guard (p5_entry_closed,
-- replaced below) applies the same rule, so both guards agree entity by entity (tested).
CREATE FUNCTION phase3_p7.closed(_owner uuid, _entity uuid, _on date) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.ll_closed_on((SELECT p.data->'books'->'closedPeriods' FROM public.finance_preferences p WHERE p.owner_id = _owner), _on::text,
    (SELECT e.entity_key FROM public.legal_entities e WHERE e.owner_id = _owner AND e.id = _entity))
$$;

-- r2 (decision 5): the ONE posting permission check. Owner-only in this release (accepted temporarily);
-- guests and assistant sessions never. The delegation branch is the reserved extension point for
-- explicitly authorised accountants/bookkeepers: it needs an owner-created posting_delegations row
-- (no writer exists yet, so it is off) AND an accepted, unexpired, unrevoked P2 grant whose role matrix
-- allows the action for that entity. legacy_company_editor/viewer never qualify, whatever the matrix says.
CREATE FUNCTION phase3_p7.may(_owner uuid, _entity uuid, _action text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND _owner IS NOT NULL AND _action IN ('propose', 'post', 'approve', 'reverse')
    AND NOT phase3_p7.is_guest() AND NOT public.is_assistant_session()
    AND (auth.uid() = _owner OR (
      NOT coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
      AND EXISTS (SELECT 1 FROM public.posting_delegations d JOIN public.legal_entities e ON e.owner_id = d.owner_id AND e.entity_key = d.entity_key
                  WHERE d.owner_id = _owner AND d.grantee_id = auth.uid() AND d.revoked_at IS NULL AND _action = ANY (d.actions)
                    AND (_entity IS NULL OR e.id = _entity))
      AND EXISTS (SELECT 1 FROM public.access_grants g
                  JOIN public.access_role_permissions p ON p.role = g.role AND p.allowed AND p.action = CASE WHEN _action = 'reverse' THEN 'post' ELSE _action END
                  WHERE g.workspace_owner_id = _owner AND g.grantee_id = auth.uid()
                    AND g.role NOT IN ('legacy_company_editor', 'legacy_company_viewer')
                    AND g.accepted_at IS NOT NULL AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > now())
                    AND (g.entity_id IS NULL OR g.entity_id = (SELECT x.entity_key FROM public.legal_entities x WHERE x.owner_id = _owner AND x.id = _entity)))))
$$;
CREATE FUNCTION phase3_p7.require_may(_owner uuid, _entity uuid, _action text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT phase3_p7.may(_owner, _entity, _action) THEN
    RAISE EXCEPTION 'P7_NOT_AUTHORISED: % is limited to the owner of these books (authorised accountants need a separately approved delegation)', _action USING ERRCODE = '42501';
  END IF;
END $$;

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
    -- r2 (decision 2): a reversal is dated on or after its original (the correction date), never before.
    IF NOT FOUND OR orig.owner_id <> NEW.owner_id OR orig.legal_entity_id <> NEW.legal_entity_id OR orig.event_id <> NEW.event_id
       OR orig.kind = 'reversal' OR NEW.posting_date < orig.posting_date THEN
      RAISE EXCEPTION 'P7: invalid reversal (original unavailable, already a reversal, other scope or dated before the original)';
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
CREATE TRIGGER a_guard_writer BEFORE INSERT ON public.posting_link_states FOR EACH ROW EXECUTE FUNCTION phase3_p7.guard_writer();
CREATE TRIGGER a_guard_writer BEFORE INSERT ON public.posting_requests FOR EACH ROW EXECUTE FUNCTION phase3_p7.guard_writer();
CREATE TRIGGER a_guard_writer BEFORE INSERT ON public.posting_request_decisions FOR EACH ROW EXECUTE FUNCTION phase3_p7.guard_writer();
CREATE TRIGGER a_guard_writer BEFORE INSERT ON public.statement_upload_reversals FOR EACH ROW EXECUTE FUNCTION phase3_p7.guard_writer();
CREATE TRIGGER a_guard_writer BEFORE INSERT ON public.posting_delegations FOR EACH ROW EXECUTE FUNCTION phase3_p7.guard_writer();
CREATE TRIGGER b_guard_event BEFORE INSERT ON public.posting_events FOR EACH ROW EXECUTE FUNCTION phase3_p7.guard_event_insert();
CREATE TRIGGER b_guard_batch BEFORE INSERT ON public.posting_batches FOR EACH ROW EXECUTE FUNCTION phase3_p7.guard_batch_insert();
CREATE TRIGGER b_guard_line BEFORE INSERT ON public.posting_lines FOR EACH ROW EXECUTE FUNCTION phase3_p7.guard_line_insert();
DO $imm$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['posting_events', 'posting_event_sources', 'posting_batches', 'posting_lines', 'posting_reversals', 'posting_backfill_runs',
                           'posting_link_states', 'posting_requests', 'posting_request_decisions', 'statement_upload_reversals', 'posting_delegations'] LOOP
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

-- _on: the reversal's posting date (r2, decision 2): the correction date for reversals of posted entries
-- and journals; the original's own date only for an in-period reverse-and-replace edit (DN-P3-1).
CREATE FUNCTION phase3_p7.reverse_batch(_b public.posting_batches, _meta jsonb, _run uuid, _on date DEFAULT NULL) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT phase3_p7.write_batch(_b.owner_id, _b.event_id, _b.legal_entity_id, 'reversal', 'reverse:' || _b.id, coalesce(_on, _b.posting_date), NULL, _b.id,
    phase3_p7.lines_of(_b.id, true), jsonb_build_object('currency', _b.source_currency, 'amount', _b.source_amount, 'rate', _b.fx_rate, 'fxDate', _b.fx_date, 'fxSource', _b.fx_source),
    left('Reversal of ' || _b.idempotency_key, 500), coalesce(_meta, '{}'::jsonb), _run)
$$;

-- --------------------------------------------------------------------------------------------
-- 5. Derivation of one ledger entry (personal AND company scopes, DN-P3-5 B)
--    Returns {skip} | {exception, detail} | {kind, date, batches:[{entity, lines}], sources, source}
--    Unknown counterparts are exceptions, never fabricated lines (DN-P3-2).
-- --------------------------------------------------------------------------------------------
-- Hook for adjustment entries that are not opening balances. P7 classifies none (they stay
-- 'unclassified_adjustment' exceptions); P8_asset_depreciation_posting.sql replaces this body to post
-- approved book depreciation in the asset's legal entity. Returns NULL (not classified),
-- {exception, detail} or {entity, lines}.
CREATE FUNCTION phase3_p7.classify_adjustment(_e public.expenses, _account_entity uuid, _account_role text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT NULL::jsonb
$$;

-- The claim (if any) whose receipts list this money-back entry (decision 4). n = how many claims list it.
CREATE FUNCTION phase3_p7.claim_of(_owner uuid, _entry uuid) RETURNS TABLE(n int, claim_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(*)::int, (array_agg(c.id ORDER BY c.id))[1] FROM public.expenses c
  WHERE c.employee_id = _owner AND c.id <> _entry AND jsonb_typeof(c.reimbursement->'receipts') = 'array'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(c.reimbursement->'receipts') r WHERE r->>'txnId' = _entry::text)
$$;

CREATE FUNCTION phase3_p7.derive_entry(_e public.expenses) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  k text := coalesce(_e.txn_type, 'expense'); amt numeric := _e.amount; x uuid := _e.legal_entity_id;
  ka text; kb text; ra text; rb text; ea uuid; eb uuid; acc jsonb := '{}'::jsonb; parts jsonb; p jsonb; legs jsonb;
  sgn int; principal numeric; interest numeric := 0; total numeric; op public.opening_postings; kind text := 'entry';
  sources jsonb; batches jsonb; src jsonb; signed numeric; cls jsonb;
  exc text; detail text; nclaims int := 0; claim public.expenses; ckind text;
BEGIN
  -- r2: a reversal row is posted as the mirrored reversal of its original (sync_entry of the original).
  IF _e.reverses_entry_id IS NOT NULL THEN RETURN jsonb_build_object('skip', true, 'reversalOf', _e.reverses_entry_id); END IF;
  IF _e.transfer_counterpart_of IS NOT NULL THEN RETURN jsonb_build_object('skip', true); END IF;
  -- R-P10-1 (11 Nov 2026): a withdrawn entry (receipt_details.withdrawal, RB-LED-01 / P10; only unposted entries can be
  -- withdrawn) is never posted, by a backfill or a later sync; Restore makes it postable again.
  IF jsonb_typeof(_e.receipt_details) = 'object' AND _e.receipt_details->'withdrawal'->>'state' = 'withdrawn' THEN
    RETURN jsonb_build_object('skip', true, 'withdrawn', true);
  END IF;
  IF _e.account_id IS NOT NULL THEN
    SELECT a.kind INTO ka FROM public.accounts a WHERE a.id = _e.account_id AND a.owner_id = _e.employee_id;
    ra := phase3_p7.account_role(ka); ea := phase3_p7.account_entity(_e.employee_id, _e.account_id, _e.expense_date);
  END IF;
  IF _e.to_account_id IS NOT NULL THEN
    SELECT a.kind INTO kb FROM public.accounts a WHERE a.id = _e.to_account_id AND a.owner_id = _e.employee_id;
    rb := phase3_p7.account_role(kb); eb := phase3_p7.account_entity(_e.employee_id, _e.to_account_id, _e.expense_date);
  END IF;
  IF k = 'reimbursement' THEN
    SELECT c.n INTO nclaims FROM phase3_p7.claim_of(_e.employee_id, _e.id) c;
    SELECT x2.* INTO claim FROM public.expenses x2 WHERE x2.id = (SELECT c.claim_id FROM phase3_p7.claim_of(_e.employee_id, _e.id) c);
    ckind := coalesce(nullif(claim.reimbursement->>'kind', ''), 'claim');
  END IF;
  -- C11: an automatically classified row needs its explicit review before it can post.
  IF _e.receipt_details->'classification'->>'automatic' = 'true' AND coalesce(_e.receipt_details->'review'->>'approvedAt', '') = '' THEN
    exc := 'review_required'; detail := 'Automatically classified row has no explicit review';
  ELSIF amt IS NULL OR amt <= 0 OR amt <> round(amt, 2) OR amt >= 1e13 THEN
    exc := 'inexact_amount'; detail := 'Amount must be positive and exact to the paisa';
  ELSIF x IS NULL OR (_e.account_id IS NOT NULL AND ea IS NULL) OR (_e.to_account_id IS NOT NULL AND eb IS NULL) THEN
    exc := 'entity_unresolved'; detail := 'Legal entity of the entry or one of its accounts is ambiguous or unknown';
  ELSIF k IN ('expense', 'income', 'refund', 'reimbursement', 'advance', 'advance_settlement') AND (_e.account_id IS NULL OR ka IS NULL) THEN
    exc := 'no_account'; detail := 'No owned paying/receiving account: counterpart unknown';
  ELSIF k IN ('transfer', 'card_payment', 'investment', 'loan_repayment') AND (ka IS NULL OR kb IS NULL OR _e.account_id = _e.to_account_id) THEN
    exc := 'missing_destination'; detail := 'Movement needs two different owned accounts';
  ELSIF k = 'reimbursement' AND nclaims = 0 THEN
    -- decision 4: money back is never assumed to reduce some expense; without its claim it is unclassified
    exc := 'reimbursement_unlinked'; detail := 'Money received as a reimbursement is not linked to a claim; link it to its claim or record it as a refund';
  ELSIF k = 'reimbursement' AND nclaims > 1 THEN
    exc := 'reimbursement_ambiguous'; detail := 'The same money-back entry is listed on more than one claim';
  ELSIF k = 'reimbursement' AND ckind = 'advance' THEN
    exc := 'advance_claim_receipt'; detail := 'A claim settled against an advance receives no money back; record an advance return instead';
  ELSIF k = 'reimbursement' AND (claim.legal_entity_id IS NULL OR claim.reverses_entry_id IS NOT NULL) THEN
    exc := 'entity_unresolved'; detail := 'Legal entity of the claim is ambiguous or unknown';
  ELSIF k NOT IN ('expense', 'income', 'refund', 'reimbursement', 'transfer', 'card_payment', 'investment', 'loan_repayment', 'adjustment', 'advance', 'advance_settlement') THEN
    exc := 'unknown_type'; detail := k;
  END IF;
  IF exc IS NULL AND k IN ('expense', 'income', 'refund') THEN
    IF jsonb_typeof(_e.allocations) = 'array' AND jsonb_array_length(_e.allocations) > 0 THEN
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
    IF NOT FOUND THEN
      cls := CASE WHEN _e.account_id IS NULL OR ka IS NULL THEN NULL ELSE phase3_p7.classify_adjustment(_e, ea, ra) END;
      IF cls IS NULL THEN exc := 'unclassified_adjustment'; detail := 'Balance adjustment has no confirmed counterpart';
      ELSIF cls ? 'exception' THEN exc := cls->>'exception'; detail := cls->>'detail';
      END IF;
    ELSIF op.source_doc_id IS NULL THEN exc := 'opening_without_evidence'; detail := 'Opening balance journal needs its source document (DN-P3-3)';
    ELSIF _e.account_id IS NULL OR ka IS NULL THEN exc := 'no_account'; detail := 'Opening balance without an owned account';
    END IF;
  END IF;
  IF exc IS NOT NULL THEN RETURN jsonb_build_object('exception', exc, 'detail', detail, 'entryId', _e.id, 'date', _e.expense_date, 'amount', amt, 'type', k); END IF;

  IF k IN ('expense', 'income', 'refund') THEN
    -- decision 4: a merchant REFUND is the only money back that reduces the purchase (contra on its category)
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
  ELSIF k = 'reimbursement' THEN
    -- decision 4: money back on an employee/insurance/inter-party claim SETTLES the claim receivable; the
    -- gross expense and its separate recovery (claim event) are untouched, so nothing is recognised twice.
    x := claim.legal_entity_id;
    acc := phase3_p7.add(acc, ea, phase3_p7.leg('account:' || _e.account_id, ra, amt, _e.account_id, NULL, _e.title));
    acc := phase3_p7.add(acc, x, phase3_p7.leg('receivable:claim:' || claim.id, 'asset', -amt, NULL, NULL, 'Claim settlement'));
    IF x <> ea THEN
      acc := phase3_p7.add(acc, ea, phase3_p7.leg('due:' || x, 'liability', -amt, NULL, x, 'Inter-entity'));
      acc := phase3_p7.add(acc, x, phase3_p7.leg('due:' || ea, 'asset', amt, NULL, ea, 'Inter-entity'));
    END IF;
  ELSIF k IN ('advance', 'advance_settlement') THEN
    -- decision 4: an advance received is owed back (liability), never income; its return is never spending
    sgn := CASE WHEN k = 'advance' THEN 1 ELSE -1 END;
    acc := phase3_p7.add(acc, ea, phase3_p7.leg('account:' || _e.account_id, ra, sgn * amt, _e.account_id, NULL, _e.title));
    acc := phase3_p7.add(acc, ea, phase3_p7.leg('advance:received', 'liability', -sgn * amt, NULL, NULL, 'Advance received'));
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
  ELSIF cls IS NOT NULL THEN -- an adjustment classified by the hook (P8: approved depreciation)
    acc := phase3_p7.add(acc, (cls->>'entity')::uuid, cls->'lines');
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

-- Claim recognised on an expense (decision 4): {} when the expense is not a tracked claim (or is
-- reversed), {exception, detail}, or {entity, date, lines}. The gross expense batch is never touched:
--   employer / insurance / party / claim (legacy, kind unset): Dr receivable:claim:<expense>  Cr recovery:<kind>:<category>
--   advance (costs settled against an advance received):       Dr advance:received           Cr recovery:advance:<category>
-- Amount = the reimbursable part (least of amount and reimbursable); a rejected or written-off claim
-- recovers only what was actually received (the rest stays personal cost), as reimbursements.ts does.
CREATE FUNCTION phase3_p7.derive_claim(_e public.expenses) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE info jsonb := CASE WHEN jsonb_typeof(_e.reimbursement) = 'object' THEN _e.reimbursement ELSE '{}'::jsonb END;
  st text := nullif(info->>'stage', ''); ck text := coalesce(nullif(info->>'kind', ''), 'claim'); claim numeric; got numeric; rec numeric; cat text;
BEGIN
  IF _e.id IS NULL OR _e.reverses_entry_id IS NOT NULL OR coalesce(_e.txn_type, 'expense') <> 'expense'
     OR NOT (coalesce(_e.reimbursement_status, 'none') <> 'none' OR st IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.expenses r WHERE r.reverses_entry_id = _e.id) THEN RETURN '{}'::jsonb; END IF;
  IF ck NOT IN ('employer', 'insurance', 'party', 'advance', 'claim') THEN
    RETURN jsonb_build_object('exception', 'unknown_recovery_kind', 'detail', 'Claim kind must be employer, insurance, party or advance', 'entryId', _e.id, 'date', _e.expense_date, 'amount', _e.amount, 'type', 'claim');
  END IF;
  claim := least(_e.amount, coalesce((info->>'reimbursable')::numeric, _e.amount));
  SELECT coalesce(sum((r->>'amount')::numeric), 0) INTO got FROM jsonb_array_elements(CASE WHEN jsonb_typeof(info->'receipts') = 'array' THEN info->'receipts' ELSE '[]'::jsonb END) r;
  rec := CASE WHEN st IN ('rejected', 'written_off') THEN least(got, claim) ELSE claim END;
  IF rec IS NULL OR rec <= 0 THEN RETURN '{}'::jsonb; END IF;
  IF rec <> round(rec, 2) OR rec >= 1e13 THEN
    RETURN jsonb_build_object('exception', 'inexact_amount', 'detail', 'Claim amount must be exact to the paisa', 'entryId', _e.id, 'date', _e.expense_date, 'amount', rec, 'type', 'claim');
  END IF;
  IF _e.legal_entity_id IS NULL THEN
    RETURN jsonb_build_object('exception', 'entity_unresolved', 'detail', 'Legal entity of the claim is ambiguous or unknown', 'entryId', _e.id, 'date', _e.expense_date, 'amount', rec, 'type', 'claim');
  END IF;
  cat := coalesce(nullif(btrim(_e.category), ''), 'Uncategorised');
  RETURN jsonb_build_object('entity', _e.legal_entity_id, 'date', _e.expense_date, 'kind', ck,
    'lines', phase3_p7.leg(CASE WHEN ck = 'advance' THEN 'advance:received' ELSE 'receivable:claim:' || _e.id END,
                           CASE WHEN ck = 'advance' THEN 'liability' ELSE 'asset' END, rec, NULL, NULL, 'Claim: ' || left(coalesce(info->>'payer', ''), 120))
          || phase3_p7.leg('recovery:' || ck || ':' || cat, 'expense', -rec, NULL, NULL, 'Recovery (' || ck || ')'));
END $$;

-- Apply / preview the claim event of one expense. A claim is posted on the expense date when that is
-- open, otherwise on the correction date (decision 2: a claim recognised after the period closed never
-- changes the closed period); its reversal likewise.
CREATE FUNCTION phase3_p7.sync_claim(_owner uuid, _entry uuid, _apply boolean, _ctx jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE e public.expenses; want jsonb := '{}'::jsonb; ev uuid; act public.posting_batches; key text := 'claim:' || _entry; action text; ver int;
  ent uuid; d date; rd date; cl boolean := false;
  meta jsonb := jsonb_build_object('reason', coalesce(_ctx->>'reason', 'Claim changed'), 'request', _ctx->>'request', 'actor', auth.uid(), 'claim', _entry);
BEGIN
  SELECT * INTO e FROM public.expenses WHERE id = _entry AND employee_id = _owner;
  IF FOUND THEN want := phase3_p7.derive_claim(e); END IF;
  IF want ? 'exception' THEN
    RETURN jsonb_build_array(jsonb_build_object('entryId', _entry, 'action', 'exception', 'exception', want->>'exception', 'detail', want->>'detail', 'date', want->>'date', 'amount', want->'amount', 'type', 'claim'));
  END IF;
  SELECT id INTO ev FROM public.posting_events WHERE owner_id = _owner AND event_key = key;
  IF ev IS NOT NULL THEN
    SELECT x.* INTO act FROM public.posting_batches x WHERE x.event_id = ev AND x.kind = 'entry'
      AND NOT EXISTS (SELECT 1 FROM public.posting_batches r WHERE r.reverses_id = x.id) ORDER BY x.version DESC LIMIT 1;
  END IF;
  IF act.id IS NULL AND NOT (want ? 'lines') THEN RETURN '[]'::jsonb; END IF;
  ent := (want->>'entity')::uuid;
  IF act.id IS NOT NULL AND want ? 'lines' AND act.legal_entity_id = ent AND phase3_p7.canon(phase3_p7.lines_of(act.id)) = phase3_p7.canon(want->'lines') THEN
    RETURN jsonb_build_array(jsonb_build_object('entryId', _entry, 'claim', true, 'entity', ent, 'action', 'unchanged', 'closed', false, 'date', act.posting_date));
  END IF;
  action := CASE WHEN act.id IS NULL THEN 'post' WHEN NOT (want ? 'lines') THEN 'reverse' ELSE 'replace' END;
  IF want ? 'lines' THEN
    d := (want->>'date')::date;
    IF phase3_p7.closed(_owner, ent, d) THEN d := greatest(current_date, d); END IF;
    cl := phase3_p7.closed(_owner, ent, d);
  END IF;
  IF act.id IS NOT NULL THEN
    -- a reversed expense takes its claim with it, on the reversal's correction date (decision 2)
    SELECT r.expense_date INTO rd FROM public.expenses r WHERE r.reverses_entry_id = _entry AND r.employee_id = _owner;
    IF rd IS NULL OR rd < act.posting_date THEN
      rd := CASE WHEN phase3_p7.closed(_owner, act.legal_entity_id, act.posting_date) THEN greatest(current_date, act.posting_date) ELSE act.posting_date END;
    END IF;
    cl := cl OR phase3_p7.closed(_owner, act.legal_entity_id, rd);
  END IF;
  IF _apply THEN
    IF ev IS NULL THEN ev := phase3_p7.ensure_event(_owner, key, 'claim', _entry, NULL); END IF;
    IF act.id IS NOT NULL THEN PERFORM phase3_p7.reverse_batch(act, meta, (_ctx->>'run')::uuid, rd); END IF;
    IF want ? 'lines' THEN
      SELECT coalesce(max(x.version), 0) + 1 INTO ver FROM public.posting_batches x WHERE x.event_id = ev AND x.kind = 'entry';
      PERFORM phase3_p7.write_batch(_owner, ev, ent, 'entry', 'claim:' || _entry || ':' || ent || ':v' || ver, d, ver, NULL,
        want->'lines', jsonb_build_object('currency', 'INR', 'amount', NULL), left('Claim on ' || coalesce(e.title, ''), 200), meta || jsonb_build_object('claimKind', want->>'kind'), (_ctx->>'run')::uuid);
    END IF;
  END IF;
  RETURN jsonb_build_array(jsonb_build_object('entryId', _entry, 'claim', true, 'entity', coalesce(ent, act.legal_entity_id), 'action', action, 'closed', cl,
    'date', coalesce(d, rd), 'kind', 'claim', 'lines', CASE WHEN want ? 'lines' THEN want->'lines' ELSE '[]'::jsonb END, 'reverses', act.id));
END $$;

-- Compare one entry's derived postings with its active batches and optionally apply the difference
-- (reversal of the superseded batch + new version; never an in-place change). Returns one action per
-- legal entity: unchanged | post | replace | reverse | exception, with the closed-period flag; then the
-- entry's reversal (decision 1) and its claim event (decision 4).
CREATE FUNCTION phase3_p7.sync_entry(_owner uuid, _entry uuid, _apply boolean, _ctx jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE e public.expenses; rv public.expenses; d jsonb := jsonb_build_object('batches', '[]'::jsonb); ev uuid; ent uuid; want jsonb; act public.posting_batches;
  out jsonb := '[]'::jsonb; action text; closed boolean; ver int; key text := 'ledger_entry:' || _entry; any_post boolean := false; settled boolean := false;
  meta jsonb := jsonb_build_object('reason', coalesce(_ctx->>'reason', 'Ledger entry changed'), 'request', _ctx->>'request', 'actor', auth.uid())
              || CASE WHEN jsonb_typeof(_ctx->'meta') = 'object' THEN _ctx->'meta' ELSE '{}'::jsonb END;
BEGIN
  SELECT * INTO e FROM public.expenses WHERE id = _entry AND employee_id = _owner;
  IF FOUND AND e.reverses_entry_id IS NOT NULL THEN RETURN phase3_p7.sync_entry(_owner, e.reverses_entry_id, _apply, _ctx); END IF;
  IF FOUND THEN d := phase3_p7.derive_entry(e); END IF;
  SELECT id INTO ev FROM public.posting_events WHERE owner_id = _owner AND event_key = key;
  SELECT * INTO rv FROM public.expenses WHERE reverses_entry_id = _entry AND employee_id = _owner;
  -- A reversed original whose reversal is already posted is settled history: nothing to derive again.
  settled := rv.id IS NOT NULL AND ev IS NOT NULL AND EXISTS (SELECT 1 FROM public.posting_batches b WHERE b.event_id = ev AND b.meta->>'reversalEntry' = rv.id::text);
  IF NOT settled THEN
    IF d ? 'exception' THEN
      IF _apply AND d->>'exception' = 'review_required' THEN
        RAISE EXCEPTION 'C11_REVIEW_REQUIRED: approve this automatically classified row before it is saved' USING ERRCODE = '23514';
      END IF;
      out := out || jsonb_build_array(jsonb_build_object('entryId', _entry, 'action', 'exception', 'exception', d->>'exception', 'detail', d->>'detail', 'date', d->>'date', 'amount', d->'amount', 'type', d->>'type'));
    END IF;
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
        -- An edit (DN-P3-1) replaces the superseded version within its own (open) period.
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
    -- Decision 1: the linked reversal row reverses every active batch on ITS date (the correction date).
    IF rv.id IS NOT NULL AND ev IS NOT NULL THEN
      FOR act IN SELECT x.* FROM public.posting_batches x WHERE x.event_id = ev AND x.kind IN ('entry', 'opening')
                 AND NOT EXISTS (SELECT 1 FROM public.posting_batches r WHERE r.reverses_id = x.id) ORDER BY x.legal_entity_id LOOP
        out := out || jsonb_build_array(jsonb_build_object('entryId', _entry, 'entity', act.legal_entity_id, 'action', 'reverse', 'reversalEntryId', rv.id,
          'closed', phase3_p7.closed(_owner, act.legal_entity_id, rv.expense_date), 'date', rv.expense_date, 'kind', 'reversal', 'lines', '[]'::jsonb, 'reverses', act.id));
        IF _apply THEN PERFORM phase3_p7.reverse_batch(act, meta || jsonb_build_object('reversalEntry', rv.id), (_ctx->>'run')::uuid, rv.expense_date); END IF;
      END LOOP;
      IF _apply THEN PERFORM phase3_p7.release_sources(_owner, ev); END IF;
    END IF;
  END IF;
  RETURN out || phase3_p7.sync_claim(_owner, _entry, _apply, _ctx);
END $$;

-- --------------------------------------------------------------------------------------------
-- 6. Ledger hooks on public.expenses (active owners only)
-- --------------------------------------------------------------------------------------------
-- A posted entry is never physically deleted by a client. r2 (decision 1): reverse_ledger_entry keeps
-- it AND records a linked reversal row; originals and reversal rows are history for every owner,
-- active or not (deleting one would silently revive or erase an economic effect). Unposted entries
-- (owner not active, or an exception that never posted) delete as today.
CREATE FUNCTION phase3_p7.guard_posted_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ev uuid;
BEGIN
  IF current_setting('ledgerline.erasing', true) = 'on' THEN RETURN OLD; END IF;
  IF OLD.reverses_entry_id IS NOT NULL OR EXISTS (SELECT 1 FROM public.expenses r WHERE r.reverses_entry_id = OLD.id) THEN
    RAISE EXCEPTION 'P7_REVERSAL_HISTORY: a reversed entry and its reversal are kept as history; neither can be deleted' USING ERRCODE = '42501';
  END IF;
  IF NOT phase3_p7.active(OLD.employee_id) THEN RETURN OLD; END IF;
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

-- r2 (decision 1): reversal rows are created only by phase3_p7.reverse_entry for active books (reason,
-- step-up, audit) and must mirror the original exactly; restoring a backup into books that are not
-- active may re-create a mirrored pair. Reversal rows never change; a reversed original keeps its
-- financial content (metadata such as title, tags or reconciliation may still change, DN-P3-11), and the
-- receiving side of a reversed transfer cannot be unlinked (that would revive the movement).
CREATE FUNCTION phase3_p7.guard_reversal_rows() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o public.expenses;
BEGIN
  IF current_setting('ledgerline.erasing', true) = 'on' THEN RETURN NEW; END IF;
  -- the readable copy of the link (receipt_details.reversal, read by narrow app selects) exists exactly on reversal rows
  IF (jsonb_typeof(NEW.receipt_details) = 'object' AND NEW.receipt_details ? 'reversal') IS DISTINCT FROM (NEW.reverses_entry_id IS NOT NULL) THEN
    RAISE EXCEPTION 'P7_REVERSAL_LINK: only a reversal entry carries reversal details' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.reverses_entry_id IS NULL THEN RETURN NEW; END IF;
    SELECT * INTO o FROM public.expenses WHERE id = NEW.reverses_entry_id;
    IF NOT FOUND OR o.employee_id <> NEW.employee_id OR o.reverses_entry_id IS NOT NULL THEN
      RAISE EXCEPTION 'P7_REVERSAL_INVALID: a reversal must point at one of your own original entries' USING ERRCODE = '23514';
    END IF;
    IF phase3_p7.active(NEW.employee_id) AND current_setting('phase3_p7.reversal_insert', true) IS DISTINCT FROM o.id::text THEN
      RAISE EXCEPTION 'P7_REVERSAL_ONLY_BY_FUNCTION: reversals are recorded by Reverse entry (reason and re-confirmation)' USING ERRCODE = '42501';
    END IF;
    IF (NEW.amount, NEW.original_amount, NEW.currency, NEW.fx_rate, NEW.fx_date, NEW.txn_type, NEW.account_id, NEW.to_account_id, NEW.category,
        NEW.allocations, NEW.principal, NEW.interest, NEW.adjustment_sign, NEW.entity_source, NEW.entity_id, NEW.splits, NEW.legal_entity_id)
       IS DISTINCT FROM (o.amount, o.original_amount, o.currency, o.fx_rate, o.fx_date, o.txn_type, o.account_id, o.to_account_id, o.category,
        o.allocations, o.principal, o.interest, o.adjustment_sign, o.entity_source, o.entity_id, o.splits, o.legal_entity_id)
       OR NEW.expense_date < o.expense_date OR NEW.transfer_counterpart_of IS NOT NULL OR nullif(NEW.statement_ref, '') IS NOT NULL THEN
      RAISE EXCEPTION 'P7_REVERSAL_MIRROR: a reversal must mirror its original exactly (amounts, currency and rate, accounts, categories, legal entity) and be dated on or after it' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.reverses_entry_id IS DISTINCT FROM OLD.reverses_entry_id THEN
    RAISE EXCEPTION 'P7_REVERSAL_LINK: the link between an entry and its reversal never changes' USING ERRCODE = '42501';
  END IF;
  -- (only the derived legal-entity link and revision counters may move, e.g. P5 reassign_account_entity)
  IF OLD.reverses_entry_id IS NOT NULL AND (to_jsonb(NEW) - ARRAY['legal_entity_id', 'correction_revision', 'category_revision', 'updated_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['legal_entity_id', 'correction_revision', 'category_revision', 'updated_at']) THEN
    RAISE EXCEPTION 'P7_REVERSAL_HISTORY: a reversal entry cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.expenses r WHERE r.reverses_entry_id = OLD.id)
     AND (NEW.amount, NEW.original_amount, NEW.currency, NEW.fx_rate, NEW.expense_date, NEW.txn_type, NEW.account_id, NEW.to_account_id, NEW.category,
          NEW.allocations, NEW.principal, NEW.interest, NEW.adjustment_sign, NEW.entity_source, NEW.entity_id, NEW.transfer_counterpart_of, NEW.employee_id)
     IS DISTINCT FROM (OLD.amount, OLD.original_amount, OLD.currency, OLD.fx_rate, OLD.expense_date, OLD.txn_type, OLD.account_id, OLD.to_account_id, OLD.category,
          OLD.allocations, OLD.principal, OLD.interest, OLD.adjustment_sign, OLD.entity_source, OLD.entity_id, OLD.transfer_counterpart_of, OLD.employee_id) THEN
    RAISE EXCEPTION 'P7_REVERSED_ENTRY: this entry was reversed and is kept as history; record a new entry instead of editing it' USING ERRCODE = '42501';
  END IF;
  IF OLD.transfer_counterpart_of IS NOT NULL AND NEW.transfer_counterpart_of IS DISTINCT FROM OLD.transfer_counterpart_of
     AND EXISTS (SELECT 1 FROM public.expenses r WHERE r.reverses_entry_id = OLD.transfer_counterpart_of) THEN
    RAISE EXCEPTION 'P7_REVERSED_ENTRY: the transfer this row belongs to was reversed; its receiving side stays linked as history' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER zz_p7_guard_reversals BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION phase3_p7.guard_reversal_rows();

CREATE FUNCTION phase3_p7.sync_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE owner uuid := coalesce(NEW.employee_id, OLD.employee_id); t uuid;
  ctx jsonb := jsonb_build_object('reason', coalesce(nullif(current_setting('phase3_p7.reason', true), ''), CASE TG_OP WHEN 'INSERT' THEN 'Ledger entry saved' WHEN 'DELETE' THEN 'Ledger entry removed' ELSE 'Ledger entry changed' END),
                                  'request', nullif(current_setting('phase3_p7.request', true), ''),
                                  'meta', coalesce(nullif(current_setting('phase3_p7.meta', true), ''), '{}')::jsonb);
BEGIN
  IF current_setting('ledgerline.erasing', true) = 'on' OR NOT phase3_p7.active(owner) THEN RETURN NULL; END IF;
  PERFORM phase3_p7.lock_owner(owner);
  PERFORM phase3_p7.sync_entry(owner, coalesce(NEW.id, OLD.id), true, ctx);
  -- A transfer counterpart's link changes the evidence of the movement it belongs to.
  IF TG_OP <> 'DELETE' AND NEW.transfer_counterpart_of IS NOT NULL THEN PERFORM phase3_p7.sync_entry(owner, NEW.transfer_counterpart_of, true, ctx); END IF;
  IF TG_OP <> 'INSERT' AND OLD.transfer_counterpart_of IS NOT NULL AND OLD.transfer_counterpart_of IS DISTINCT FROM NEW.transfer_counterpart_of THEN
    PERFORM phase3_p7.sync_entry(owner, OLD.transfer_counterpart_of, true, ctx);
  END IF;
  -- Decision 4: the money-back entries listed on a claim are classified by that claim; re-sync them when
  -- the claim's receipts change (receive_claim_receipt inserts the entry before it updates the claim).
  IF TG_OP = 'INSERT' OR NEW.reimbursement IS DISTINCT FROM OLD.reimbursement OR TG_OP = 'DELETE' THEN
    FOR t IN SELECT DISTINCT (r->>'txnId')::uuid FROM jsonb_array_elements(
               CASE WHEN TG_OP <> 'DELETE' AND jsonb_typeof(NEW.reimbursement->'receipts') = 'array' THEN NEW.reimbursement->'receipts' ELSE '[]'::jsonb END
               || CASE WHEN TG_OP <> 'INSERT' AND jsonb_typeof(OLD.reimbursement->'receipts') = 'array' THEN OLD.reimbursement->'receipts' ELSE '[]'::jsonb END) r
             WHERE r->>'txnId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND (r->>'txnId')::uuid <> coalesce(NEW.id, OLD.id) LOOP
      PERFORM phase3_p7.sync_entry(owner, t, true, ctx);
    END LOOP;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER zz_p7_sync_postings AFTER INSERT OR UPDATE OR DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION phase3_p7.sync_trigger();

-- P0-021: the 0016 trigger deleted ALL bulk-category undo history when the owner's last entry was
-- deleted. History is kept (undo of a changed, reversed or deleted entry is refused by undo_category_change
-- itself). Disabled, not dropped; the rollback re-enables it. Erasure still deletes the history.
ALTER TABLE public.expenses DISABLE TRIGGER clear_empty_category_history;

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
  -- reversal rows are planned with their original (sync_entry of the original posts the reversal)
  FOR r IN SELECT x.id FROM public.expenses x WHERE x.employee_id = _owner AND x.reverses_entry_id IS NULL
           UNION SELECT ev.source_entry_id FROM public.posting_events ev WHERE ev.owner_id = _owner AND ev.source_kind IN ('ledger_entry', 'claim')
             AND NOT EXISTS (SELECT 1 FROM public.expenses z WHERE z.id = ev.source_entry_id AND z.reverses_entry_id IS NOT NULL)
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
-- r2: a reversal row counts as the negative of its original on its own date (ledger.ts ledgerView).
CREATE FUNCTION phase3_p7.legacy_movements(_owner uuid)
RETURNS TABLE(legal_entity_id uuid, account_id uuid, currency text, period text, amount numeric, entry_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH m AS (
    SELECT e.id, e.account_id acc, e.expense_date d,
      CASE WHEN coalesce(e.txn_type, 'expense') = 'expense' THEN -e.amount
           WHEN e.txn_type IN ('income', 'refund', 'reimbursement', 'advance') THEN e.amount
           WHEN e.txn_type = 'adjustment' THEN e.amount * coalesce(e.adjustment_sign, 1) * (CASE WHEN phase3_p7.account_role(a.kind) = 'liability' THEN -1 ELSE 1 END)
           WHEN e.txn_type IN ('transfer', 'card_payment', 'loan_repayment', 'investment', 'advance_settlement') THEN -e.amount
           ELSE 0 END * CASE WHEN e.reverses_entry_id IS NULL THEN 1 ELSE -1 END signed
    FROM public.expenses e JOIN public.accounts a ON a.id = e.account_id AND a.owner_id = e.employee_id
    WHERE e.employee_id = _owner AND e.transfer_counterpart_of IS NULL
    UNION ALL
    SELECT e.id, e.to_account_id, e.expense_date,
      CASE WHEN e.txn_type = 'loan_repayment' AND e.principal IS NOT NULL AND e.interest IS NOT NULL AND coalesce(e.original_amount, e.amount) > 0
           THEN e.amount - round(e.amount * e.interest / coalesce(e.original_amount, e.amount), 2) ELSE e.amount END
           * CASE WHEN e.reverses_entry_id IS NULL THEN 1 ELSE -1 END
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
  SELECT jsonb_build_object('installed', true, 'version', 'P7.2', 'active', auth.uid() IS NOT NULL AND phase3_p7.active(auth.uid()),
    'guest', auth.uid() IS NOT NULL AND phase3_p7.is_guest(), 'canPost', auth.uid() IS NOT NULL AND NOT phase3_p7.is_guest() AND NOT public.is_assistant_session(),
    'features', jsonb_build_array('reversal_entries', 'correction_date', 'prior_period_adjustments', 'personal_periods', 'claims', 'card_payment',
                                  'statement_undo', 'approvals', 'link_states'))
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

-- Commit exactly the reviewed preview (fingerprint), once. Shared by commit_posting_backfill (direct,
-- step-up) and an approved 'backfill' request.
CREATE FUNCTION phase3_p7.commit_backfill(_uid uuid, _run uuid, _fingerprint text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pl jsonb; a jsonb; prev public.posting_backfill_runs; posted int := 0; result jsonb;
BEGIN
  IF _run IS NULL OR coalesce(_fingerprint, '') = '' THEN RAISE EXCEPTION 'Run id and reviewed preview fingerprint required'; END IF;
  PERFORM phase3_p7.require_may(_uid, NULL, 'approve');
  PERFORM 1 FROM public.finance_preferences WHERE owner_id = _uid FOR UPDATE;
  PERFORM phase3_p7.lock_owner(_uid);
  SELECT * INTO prev FROM public.posting_backfill_runs WHERE id = _run;
  IF FOUND THEN
    IF prev.owner_id <> _uid OR prev.kind <> 'commit' OR prev.fingerprint <> _fingerprint THEN RAISE EXCEPTION 'P7: run id already used'; END IF;
    RETURN prev.report || jsonb_build_object('replayed', true);
  END IF;
  IF public.p5_personal_entity(_uid) IS NULL THEN RAISE EXCEPTION 'P7: run the legal-entity backfill (P5) first'; END IF;
  pl := phase3_p7.plan(_uid);
  IF pl->>'fingerprint' IS DISTINCT FROM _fingerprint THEN
    RAISE EXCEPTION 'P7_PREVIEW_STALE: records changed since the preview; review a new preview' USING ERRCODE = '40001';
  END IF;
  FOR a IN SELECT DISTINCT ON (value->>'entryId') value FROM jsonb_array_elements(pl->'proposals') ORDER BY value->>'entryId' LOOP
    PERFORM phase3_p7.sync_entry(_uid, (a->>'entryId')::uuid, true, jsonb_build_object('reason', 'Reviewed historical backfill', 'run', _run));
    posted := posted + 1;
  END LOOP;
  result := jsonb_build_object('run', _run, 'entriesPosted', posted, 'counts', pl->'counts', 'exceptions', pl->'exceptions', 'skippedClosed', pl->'skippedClosed');
  PERFORM set_config('phase3_p7.writer', 'on', true);
  INSERT INTO public.posting_backfill_runs(id, owner_id, kind, fingerprint, report, actor_id) VALUES (_run, _uid, 'commit', _fingerprint, result, _uid);
  PERFORM set_config('phase3_p7.writer', '', true);
  RETURN result;
END $$;

CREATE FUNCTION public.commit_posting_backfill(_run uuid, _fingerprint text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF phase3_p7.is_guest() THEN RAISE EXCEPTION 'P7_GUEST: demo guests cannot convert records to journals' USING ERRCODE = '42501'; END IF;
  RETURN phase3_p7.commit_backfill(auth.uid(), _run, _fingerprint);
END $$;

-- Deactivate: reverse every active entry/opening batch on the correction date (history kept, DN-P3-10,
-- decision 2), then append 'undo'.
CREATE FUNCTION public.undo_posting_backfill(_run uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); latest public.posting_backfill_runs; b public.posting_batches; n int := 0; ids uuid[] := '{}'; rid uuid;
BEGIN
  IF uid IS NULL OR phase3_p7.is_guest() THEN RAISE EXCEPTION 'P7_GUEST: sign in with a real account' USING ERRCODE = '42501'; END IF;
  IF length(btrim(coalesce(_reason, ''))) < 5 THEN RAISE EXCEPTION 'A reason of at least five characters is required'; END IF;
  PERFORM phase3_p7.require_may(uid, NULL, 'approve');
  PERFORM 1 FROM public.finance_preferences WHERE owner_id = uid FOR UPDATE;
  PERFORM phase3_p7.lock_owner(uid);
  IF EXISTS (SELECT 1 FROM public.posting_backfill_runs WHERE id = md5(_run::text || ':undo')::uuid) THEN
    RETURN (SELECT report || jsonb_build_object('replayed', true) FROM public.posting_backfill_runs WHERE id = md5(_run::text || ':undo')::uuid);
  END IF;
  SELECT * INTO latest FROM public.posting_backfill_runs WHERE owner_id = uid ORDER BY seq DESC LIMIT 1;
  IF NOT FOUND OR latest.id <> _run OR latest.kind <> 'commit' THEN RAISE EXCEPTION 'P7: only the latest active backfill run can be undone'; END IF;
  FOR b IN SELECT x.* FROM public.posting_batches x WHERE x.owner_id = uid AND x.kind IN ('entry', 'opening')
           AND NOT EXISTS (SELECT 1 FROM public.posting_batches r WHERE r.reverses_id = x.id) ORDER BY x.created_at, x.id LOOP
    rid := phase3_p7.reverse_batch(b, jsonb_build_object('reason', btrim(_reason), 'actor', uid, 'undo', _run), _run, greatest(current_date, b.posting_date));
    ids := ids || rid; n := n + 1;
    PERFORM phase3_p7.release_sources(uid, b.event_id);
  END LOOP;
  PERFORM set_config('phase3_p7.writer', 'on', true);
  INSERT INTO public.posting_reversals(id, owner_id, target, batch_ids, reversal_batch_ids, reason, actor_id, session_id, correction_date)
  VALUES (md5(_run::text || ':undo-audit')::uuid, uid, 'backfill', '{}', ids, btrim(_reason), uid, public.jwt_session_id(), current_date);
  INSERT INTO public.posting_backfill_runs(id, owner_id, kind, fingerprint, report, actor_id, reason)
  VALUES (md5(_run::text || ':undo')::uuid, uid, 'undo', latest.fingerprint, jsonb_build_object('reversed', n, 'run', _run), uid, btrim(_reason));
  PERFORM set_config('phase3_p7.writer', '', true);
  RETURN jsonb_build_object('reversed', n, 'run', _run);
END $$;

-- Append one link state (internal).
CREATE FUNCTION phase3_p7.link_state(_owner uuid, _entry uuid, _rev uuid, _kind text, _key text, _state text, _before jsonb, _after jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM set_config('phase3_p7.writer', 'on', true);
  INSERT INTO public.posting_link_states(id, owner_id, entry_id, reversal_entry_id, link_kind, link_key, state, before, after)
  VALUES (md5(_rev::text || ':' || _kind || ':' || _key)::uuid, _owner, _entry, _rev, _kind, left(_key, 600), _state, _before, _after)
  ON CONFLICT (id) DO NOTHING;
  PERFORM set_config('phase3_p7.writer', '', true);
  RETURN jsonb_build_object('kind', _kind, 'key', _key, 'state', _state);
END $$;

-- Item 2: the records linked to a reversed entry. The original is kept, so documents, loans, drafts,
-- import fingerprints, counterparts and bulk-category history keep pointing at a row that exists; their
-- state is recorded. Two links change state because their meaning changes:
--   * a transfer link of the reversed movement becomes status 'reversed' (cancel_transfer can no longer
--     revive its receiving side, which stays linked evidence);
--   * a reversed money-back entry moves from its claim's receipts to reversedReceipts (with the reversal
--     reference), so the claim is outstanding again and the claim status follows; nothing is removed.
CREATE FUNCTION phase3_p7.mark_links(_owner uuid, _entry uuid, _rev uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE out jsonb := '[]'::jsonb; r record; c public.expenses; info jsonb; kept jsonb; moved jsonb; got numeric; claim numeric; st text;
BEGIN
  FOR r IN SELECT i.* FROM public.import_posts i WHERE i.owner_id = _owner AND i.transaction_id = _entry LOOP
    out := out || phase3_p7.link_state(_owner, _entry, _rev, 'import_post', r.account_id || '|' || r.fingerprint, 'kept_as_history', to_jsonb(r), jsonb_build_object('note', 'fingerprint stays bound to the original; re-importing the same line stays blocked'));
  END LOOP;
  FOR r IN SELECT x.id, x.status FROM public.expense_drafts x WHERE x.owner_id = _owner AND x.transaction_id = _entry LOOP
    out := out || phase3_p7.link_state(_owner, _entry, _rev, 'draft', r.id::text, 'kept_as_history', to_jsonb(r), jsonb_build_object('status', r.status, 'reversedBy', _rev));
  END LOOP;
  FOR r IN SELECT t.* FROM public.transfer_links t WHERE t.owner_id = _owner AND (t.debit_id = _entry OR t.credit_id = _entry) AND t.cancelled_at IS NULL LOOP
    UPDATE public.transfer_links SET status = 'reversed', updated_at = now() WHERE id = r.id;
    out := out || phase3_p7.link_state(_owner, _entry, _rev, 'transfer_link', r.id::text, 'reversed', jsonb_build_object('status', r.status), jsonb_build_object('status', 'reversed'));
  END LOOP;
  FOR r IN SELECT x.id FROM public.expenses x WHERE x.employee_id = _owner AND x.transfer_counterpart_of = _entry LOOP
    out := out || phase3_p7.link_state(_owner, _entry, _rev, 'counterpart', r.id::text, 'kept_as_history', NULL, jsonb_build_object('note', 'receiving-side evidence stays linked; the reversal cancels both sides'));
  END LOOP;
  FOR r IN SELECT d.id FROM public.documents d WHERE d.owner_id = _owner AND d.transaction_id = _entry LOOP
    out := out || phase3_p7.link_state(_owner, _entry, _rev, 'document', r.id::text, 'kept_as_history', NULL, NULL);
  END LOOP;
  FOR r IN SELECT l.id FROM public.loans l WHERE l.owner_id = _owner AND l.source_transaction_id = _entry LOOP
    out := out || phase3_p7.link_state(_owner, _entry, _rev, 'loan', r.id::text, 'kept_as_history', NULL, jsonb_build_object('note', 'loan kept; its funding entry is reversed: review the loan'));
  END LOOP;
  FOR r IN SELECT b.id FROM public.category_batches b WHERE b.owner_id = _owner AND b.undone_at IS NULL
           AND EXISTS (SELECT 1 FROM jsonb_array_elements(b.entries) x WHERE x->>'id' = _entry::text) LOOP
    out := out || phase3_p7.link_state(_owner, _entry, _rev, 'category_batch', r.id::text, 'undo_blocked', NULL, jsonb_build_object('note', 'history kept; undo is refused for a reversed entry'));
  END LOOP;
  FOR r IN SELECT u->>'id' uid FROM public.finance_preferences p, jsonb_array_elements(CASE WHEN jsonb_typeof(p.data->'statementUploads') = 'array' THEN p.data->'statementUploads' ELSE '[]'::jsonb END) u
           WHERE p.owner_id = _owner AND jsonb_typeof(u->'posted') = 'array' AND u->'posted' ? _entry::text LOOP
    out := out || phase3_p7.link_state(_owner, _entry, _rev, 'statement_upload', coalesce(r.uid, '?'), 'kept_as_history', NULL, NULL);
  END LOOP;
  -- the reversed entry is money back on a claim: the claim is outstanding again
  FOR c IN SELECT x.* FROM public.expenses x WHERE x.employee_id = _owner AND x.id <> _entry AND jsonb_typeof(x.reimbursement->'receipts') = 'array'
           AND EXISTS (SELECT 1 FROM jsonb_array_elements(x.reimbursement->'receipts') q WHERE q->>'txnId' = _entry::text) FOR UPDATE LOOP
    info := c.reimbursement;
    SELECT coalesce(jsonb_agg(q) FILTER (WHERE q->>'txnId' IS DISTINCT FROM _entry::text), '[]'::jsonb),
           coalesce(jsonb_agg(q || jsonb_build_object('reversal', jsonb_build_object('entryId', _rev, 'at', clock_timestamp(), 'reason', _reason))) FILTER (WHERE q->>'txnId' = _entry::text), '[]'::jsonb)
      INTO kept, moved FROM jsonb_array_elements(info->'receipts') q;
    info := jsonb_set(info, '{receipts}', kept) || jsonb_build_object('reversedReceipts', coalesce(info->'reversedReceipts', '[]'::jsonb) || moved);
    claim := least(c.amount, coalesce((info->>'reimbursable')::numeric, c.amount));
    SELECT coalesce(sum((q->>'amount')::numeric), 0) INTO got FROM jsonb_array_elements(kept) q;
    st := CASE WHEN info->>'stage' IN ('rejected', 'written_off') THEN 'none' WHEN claim > 0 AND got >= claim THEN 'received' ELSE 'pending' END;
    UPDATE public.expenses SET reimbursement = info, reimbursement_status = st WHERE id = c.id;
    out := out || phase3_p7.link_state(_owner, _entry, _rev, 'claim_receipt', c.id::text, 'receipt_reversed',
      jsonb_build_object('receipts', c.reimbursement->'receipts', 'status', c.reimbursement_status), jsonb_build_object('receipts', kept, 'status', st));
  END LOOP;
  -- the reversed entry is itself a claim with money already received: those receipts stay; the claim
  -- receivable is reversed, so the money received is now owed back to the payer
  SELECT * INTO c FROM public.expenses WHERE id = _entry;
  IF jsonb_typeof(c.reimbursement->'receipts') = 'array' AND jsonb_array_length(c.reimbursement->'receipts') > 0 THEN
    out := out || phase3_p7.link_state(_owner, _entry, _rev, 'claim', _entry::text, 'kept_as_history', jsonb_build_object('receipts', c.reimbursement->'receipts'),
      jsonb_build_object('note', 'claim recognition reversed; money already received is owed back to the payer'));
  END IF;
  RETURN out;
END $$;

-- Decision 1 + 2: reverse ONE posted entry. The original row stays unchanged; a linked reversal row is
-- added to the working ledger dated on the correction date (default today; never before the original,
-- never in the future, never in a closed period), its mirrored reversal batches post through the one
-- posting path, linked records get their states, and the audit keeps the full original row. Idempotent
-- by request id. Shared by reverse_ledger_entry, Statement Desk Undo and approved requests.
CREATE FUNCTION phase3_p7.reverse_entry(_owner uuid, _request uuid, _entry uuid, _reason text, _on date DEFAULT NULL, _meta jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE e public.expenses; prev public.posting_reversals; ev uuid; olds uuid[]; news uuid[]; b record; links jsonb; rid uuid; on_date date := coalesce(_on, current_date);
  rr text := btrim(coalesce(_reason, '')); tgt text := CASE WHEN _meta ? 'priorPeriod' THEN 'prior_period' ELSE 'ledger_entry' END;
BEGIN
  IF _request IS NULL OR _entry IS NULL THEN RAISE EXCEPTION 'Request and entry required'; END IF;
  SELECT * INTO prev FROM public.posting_reversals WHERE id = _request;
  IF FOUND THEN
    IF prev.owner_id <> _owner OR prev.entry_id IS DISTINCT FROM _entry OR prev.target NOT IN ('ledger_entry', 'prior_period') THEN RAISE EXCEPTION 'P7: request id already used'; END IF;
    RETURN jsonb_build_object('request', _request, 'entryId', _entry, 'reversalEntryId', prev.reversal_entry_id, 'correctionDate', prev.correction_date,
      'reversalBatches', to_jsonb(prev.reversal_batch_ids), 'replayed', true);
  END IF;
  IF length(rr) < 5 THEN RAISE EXCEPTION 'A reason of at least five characters is required'; END IF;
  IF NOT phase3_p7.active(_owner) THEN RAISE EXCEPTION 'P7_NOT_ACTIVE: balanced posting is not active for this account' USING ERRCODE = '55000'; END IF;
  PERFORM 1 FROM public.finance_preferences WHERE owner_id = _owner FOR UPDATE;
  PERFORM phase3_p7.lock_owner(_owner);
  SELECT * INTO e FROM public.expenses WHERE id = _entry AND employee_id = _owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found'; END IF;
  PERFORM phase3_p7.require_may(_owner, e.legal_entity_id, 'reverse');
  IF e.reverses_entry_id IS NOT NULL THEN RAISE EXCEPTION 'P7_REVERSAL_ROW: a reversal cannot itself be reversed; record a new entry instead' USING ERRCODE = '55000'; END IF;
  IF EXISTS (SELECT 1 FROM public.expenses r WHERE r.reverses_entry_id = _entry) THEN
    RAISE EXCEPTION 'P7_ALREADY_REVERSED: this entry was already reversed' USING ERRCODE = '55000';
  END IF;
  IF e.transfer_counterpart_of IS NOT NULL THEN
    RAISE EXCEPTION 'P7_COUNTERPART: this row is the receiving side of transfer %; reverse that movement instead', e.transfer_counterpart_of USING ERRCODE = '55000';
  END IF;
  IF on_date < e.expense_date THEN RAISE EXCEPTION 'P7_CORRECTION_DATE: the correction date cannot be before the entry date (%)', e.expense_date; END IF;
  IF on_date > current_date THEN RAISE EXCEPTION 'P7_CORRECTION_DATE: the correction date cannot be in the future'; END IF;
  SELECT id INTO ev FROM public.posting_events WHERE owner_id = _owner AND event_key = 'ledger_entry:' || _entry;
  IF ev IS NULL OR NOT phase3_p7.event_active(ev) THEN
    RAISE EXCEPTION 'P7_NOT_POSTED: this entry was never posted (it is a listed exception); remove it instead' USING ERRCODE = '55000';
  END IF;
  FOR b IN SELECT x.legal_entity_id, le.readable_id FROM public.posting_batches x JOIN public.legal_entities le ON le.id = x.legal_entity_id
           WHERE x.event_id = ev AND x.kind IN ('entry', 'opening') AND NOT EXISTS (SELECT 1 FROM public.posting_batches r WHERE r.reverses_id = x.id) LOOP
    IF phase3_p7.closed(_owner, b.legal_entity_id, on_date) THEN
      RAISE EXCEPTION 'P7_CLOSED_PERIOD: the correction date % is in a closed period for %; choose a date in an open period or submit a prior-period adjustment', on_date, b.readable_id USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  SELECT coalesce(array_agg(x.id ORDER BY x.id), '{}') INTO olds FROM public.posting_batches x WHERE x.event_id = ev AND x.kind IN ('entry', 'opening')
    AND NOT EXISTS (SELECT 1 FROM public.posting_batches r WHERE r.reverses_id = x.id);
  rid := md5(_owner::text || ':reversal-entry:' || _request::text)::uuid;
  PERFORM set_config('phase3_p7.reversal_insert', _entry::text, true);
  PERFORM set_config('phase3_p7.reason', 'Reversed: ' || left(rr, 480), true);
  PERFORM set_config('phase3_p7.request', _request::text, true);
  PERFORM set_config('phase3_p7.meta', coalesce(_meta, '{}'::jsonb)::text, true);
  INSERT INTO public.expenses SELECT (jsonb_populate_record(NULL::public.expenses, to_jsonb(e) || jsonb_build_object(
    'id', rid, 'expense_date', on_date, 'title', left('Reversal: ' || coalesce(e.title, ''), 200),
    'description', left('Reversal of entry ' || e.id || ' dated ' || e.expense_date || ': ' || rr, 1000),
    'receipts', '[]'::jsonb, 'reimbursement', '{}'::jsonb, 'reimbursement_status', 'none', 'statement_ref', NULL, 'reconciled_at', NULL,
    'transfer_counterpart_of', NULL, 'reverses_entry_id', e.id, 'created_at', clock_timestamp(), 'updated_at', clock_timestamp(),
    'category_revision', 0, 'correction_revision', 0,
    'receipt_details', jsonb_build_object('reversal', jsonb_build_object('of', e.id, 'request', _request, 'reason', rr, 'actor', auth.uid(), 'correctionDate', on_date)
                                          || CASE WHEN _meta ? 'priorPeriod' THEN jsonb_build_object('priorPeriod', _meta->'priorPeriod') ELSE '{}'::jsonb END)))).*;
  -- the AFTER trigger has posted the mirrored reversal batches of the original, dated on_date
  PERFORM set_config('phase3_p7.reversal_insert', '', true);
  PERFORM set_config('phase3_p7.reason', '', true);
  PERFORM set_config('phase3_p7.request', '', true);
  PERFORM set_config('phase3_p7.meta', '', true);
  SELECT coalesce(array_agg(r.id ORDER BY r.reverses_id), '{}') INTO news FROM public.posting_batches r WHERE r.reverses_id = ANY (olds);
  IF cardinality(news) <> cardinality(olds) THEN RAISE EXCEPTION 'P7: reversal batches were not posted'; END IF;
  links := phase3_p7.mark_links(_owner, _entry, rid, rr);
  PERFORM set_config('phase3_p7.writer', 'on', true);
  INSERT INTO public.posting_reversals(id, owner_id, target, entry_id, reversal_entry_id, correction_date, batch_ids, reversal_batch_ids, entry_snapshot, reason, actor_id, session_id)
  VALUES (_request, _owner, tgt, _entry, rid, on_date, olds, news, to_jsonb(e) || jsonb_build_object('_linked', links, '_meta', _meta), rr, auth.uid(), public.jwt_session_id());
  PERFORM set_config('phase3_p7.writer', '', true);
  RETURN jsonb_build_object('request', _request, 'entryId', _entry, 'reversalEntryId', rid, 'correctionDate', on_date, 'reversalBatches', to_jsonb(news),
    'linked', links, 'replayed', false);
END $$;

-- Direct owner path (step-up guard below): reverse one posted entry with a reason (DN-P3-1/10, REQ-SEC-053).
CREATE FUNCTION public.reverse_ledger_entry(_request uuid, _entry uuid, _reason text, _on date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR phase3_p7.is_guest() THEN RAISE EXCEPTION 'P7_GUEST: demo guests cannot post or reverse' USING ERRCODE = '42501'; END IF;
  RETURN phase3_p7.reverse_entry(auth.uid(), _request, _entry, _reason, _on, '{}'::jsonb);
END $$;

-- Validate a manual journal (accruals, provisions, inter-entity settlements, prior-period adjustments).
-- Never bank/card account lines: money moves only through ledger entries, so journal and ledger cannot diverge.
CREATE FUNCTION phase3_p7.check_journal(_uid uuid, _entity uuid, _on date, _lines jsonb, _memo text, _sources jsonb) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE l jsonb;
BEGIN
  IF _entity IS NULL OR _on IS NULL THEN RAISE EXCEPTION 'Request, legal entity and date required'; END IF;
  IF length(btrim(coalesce(_memo, ''))) < 5 THEN RAISE EXCEPTION 'Journal explanation of at least five characters required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.legal_entities e WHERE e.owner_id = _uid AND e.id = _entity) THEN RAISE EXCEPTION 'Legal entity unavailable'; END IF;
  IF jsonb_typeof(_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(_lines) < 2 OR jsonb_array_length(_lines) > 200 THEN RAISE EXCEPTION 'Journal needs 2 to 200 lines'; END IF;
  FOR l IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    IF jsonb_typeof(l->'debit') IS DISTINCT FROM 'number' OR jsonb_typeof(l->'credit') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Journal amounts must be numbers'; END IF;
    IF l ? 'accountId' OR coalesce(l->>'code', '') LIKE 'account:%' THEN
      RAISE EXCEPTION 'P7: journals cannot move bank, card or wallet accounts; record the money movement as a ledger entry';
    END IF;
    IF coalesce(l->>'code', '') LIKE 'due:%' AND NOT EXISTS (SELECT 1 FROM public.legal_entities e WHERE e.owner_id = _uid AND e.id::text = substr(l->>'code', 5)) THEN
      RAISE EXCEPTION 'P7: inter-entity line must name one of your legal entities';
    END IF;
  END LOOP;
  IF jsonb_typeof(coalesce(_sources, '[]'::jsonb)) IS DISTINCT FROM 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(_sources, '[]'::jsonb)) s WHERE s->>'kind' NOT IN ('document', 'receipt')
             OR (s->>'kind' = 'document' AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id::text = s->>'key' AND d.owner_id = _uid))) THEN
    RAISE EXCEPTION 'P7: journal evidence must be your own documents';
  END IF;
  IF phase3_p7.closed(_uid, _entity, _on) THEN
    RAISE EXCEPTION 'P7_CLOSED_PERIOD: % is in a closed period; post in an open period or submit a prior-period adjustment', _on USING ERRCODE = 'P0001';
  END IF;
END $$;

-- Post a manual journal or a prior-period adjustment (kind 'prior_period', meta.priorPeriod). Idempotent
-- by request id with content check. Owner only for now (DN-P3-7 B, decision 5).
CREATE FUNCTION phase3_p7.post_journal(_uid uuid, _request uuid, _entity uuid, _on date, _lines jsonb, _memo text, _sources jsonb, _kind text DEFAULT 'journal', _meta jsonb DEFAULT '{}'::jsonb) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ev uuid; sha text; prev public.posting_events; bid uuid; docs jsonb := coalesce(_sources, '[]'::jsonb);
BEGIN
  IF _request IS NULL THEN RAISE EXCEPTION 'Request, legal entity and date required'; END IF;
  sha := public.legacy_sha256(jsonb_build_object('entity', _entity, 'on', _on, 'lines', phase3_p7.canon(_lines), 'memo', _memo, 'sources', docs, 'kind', _kind));
  SELECT * INTO prev FROM public.posting_events WHERE owner_id = _uid AND event_key = 'journal:' || _request;
  IF FOUND THEN
    IF prev.content_sha256 IS DISTINCT FROM sha THEN RAISE EXCEPTION 'P7: journal request id already used with different content'; END IF;
    RETURN (SELECT x.id FROM public.posting_batches x WHERE x.event_id = prev.id AND x.kind IN ('journal', 'prior_period') LIMIT 1);
  END IF;
  IF NOT phase3_p7.active(_uid) THEN RAISE EXCEPTION 'P7_NOT_ACTIVE: balanced posting is not active for this account' USING ERRCODE = '55000'; END IF;
  PERFORM phase3_p7.require_may(_uid, _entity, 'post');
  PERFORM phase3_p7.check_journal(_uid, _entity, _on, _lines, _memo, docs);
  PERFORM 1 FROM public.finance_preferences WHERE owner_id = _uid FOR UPDATE;
  PERFORM phase3_p7.lock_owner(_uid);
  ev := phase3_p7.ensure_event(_uid, 'journal:' || _request, 'journal', NULL, sha);
  bid := phase3_p7.write_batch(_uid, ev, _entity, _kind, 'journal:' || _request, _on, NULL, NULL,
    (SELECT jsonb_agg(jsonb_build_object('code', x->>'code', 'role', x->>'role', 'debit', x->'debit', 'credit', x->'credit', 'counterEntityId',
       CASE WHEN x->>'code' LIKE 'due:%' THEN substr(x->>'code', 5) END, 'currency', coalesce(x->>'currency', 'INR'), 'memo', x->>'memo')) FROM jsonb_array_elements(_lines) x),
    jsonb_build_object('currency', 'INR'), btrim(_memo), jsonb_build_object('actor', auth.uid()) || coalesce(_meta, '{}'::jsonb), NULL);
  PERFORM phase3_p7.bind_sources(_uid, ev, docs || jsonb_build_array(jsonb_build_object('kind', 'journal_request', 'key', _request::text)));
  RETURN bid;
END $$;

CREATE FUNCTION public.post_journal_batch(_request uuid, _entity uuid, _on date, _lines jsonb, _memo text, _sources jsonb) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR phase3_p7.is_guest() THEN RAISE EXCEPTION 'P7_GUEST: demo guests cannot post journals' USING ERRCODE = '42501'; END IF;
  RETURN phase3_p7.post_journal(auth.uid(), _request, _entity, _on, _lines, _memo, _sources, 'journal', '{}'::jsonb);
END $$;

-- Reverse a manual journal (or prior-period adjustment) on the correction date (decision 2).
CREATE FUNCTION phase3_p7.reverse_journal(_uid uuid, _request uuid, _batch uuid, _reason text, _on date DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE b public.posting_batches; prev public.posting_reversals; rid uuid; on_date date;
BEGIN
  SELECT * INTO prev FROM public.posting_reversals WHERE id = _request;
  IF FOUND THEN
    IF prev.owner_id <> _uid OR prev.target <> 'journal' OR NOT (_batch = ANY (prev.batch_ids)) THEN RAISE EXCEPTION 'P7: request id already used'; END IF;
    RETURN prev.reversal_batch_ids[1];
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 5 THEN RAISE EXCEPTION 'A reason of at least five characters is required'; END IF;
  PERFORM phase3_p7.lock_owner(_uid);
  SELECT * INTO b FROM public.posting_batches WHERE id = _batch AND owner_id = _uid AND kind IN ('journal', 'prior_period');
  IF NOT FOUND THEN RAISE EXCEPTION 'Journal not found'; END IF;
  PERFORM phase3_p7.require_may(_uid, b.legal_entity_id, 'reverse');
  IF EXISTS (SELECT 1 FROM public.posting_batches r WHERE r.reverses_id = b.id) THEN RAISE EXCEPTION 'P7: journal already reversed'; END IF;
  on_date := coalesce(_on, greatest(current_date, b.posting_date));
  IF on_date < b.posting_date OR on_date > greatest(current_date, b.posting_date) THEN RAISE EXCEPTION 'P7_CORRECTION_DATE: the correction date must be on or after the journal date and not in the future'; END IF;
  rid := phase3_p7.reverse_batch(b, jsonb_build_object('reason', btrim(_reason), 'request', _request, 'actor', auth.uid()), NULL, on_date);
  PERFORM phase3_p7.release_sources(_uid, b.event_id);
  PERFORM set_config('phase3_p7.writer', 'on', true);
  INSERT INTO public.posting_reversals(id, owner_id, target, batch_ids, reversal_batch_ids, reason, actor_id, session_id, correction_date)
  VALUES (_request, _uid, 'journal', ARRAY[b.id], ARRAY[rid], btrim(_reason), auth.uid(), public.jwt_session_id(), on_date);
  PERFORM set_config('phase3_p7.writer', '', true);
  RETURN rid;
END $$;

CREATE FUNCTION public.reverse_journal_batch(_request uuid, _batch uuid, _reason text, _on date DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR phase3_p7.is_guest() THEN RAISE EXCEPTION 'P7_GUEST: demo guests cannot post or reverse' USING ERRCODE = '42501'; END IF;
  RETURN phase3_p7.reverse_journal(auth.uid(), _request, _batch, _reason, _on);
END $$;

-- Closed period of the owner by id: {id, from, to, entityId} or NULL.
CREATE FUNCTION phase3_p7.period_by_id(_owner uuid, _period text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c FROM public.finance_preferences p, jsonb_array_elements(CASE WHEN jsonb_typeof(p.data->'books'->'closedPeriods') = 'array' THEN p.data->'books'->'closedPeriods' ELSE '[]'::jsonb END) c
  WHERE p.owner_id = _owner AND c->>'id' = _period AND (c->>'from') ~ '^\d{4}-\d{2}-\d{2}$' AND (c->>'to') ~ '^\d{4}-\d{2}-\d{2}$' LIMIT 1
$$;

-- Decision 2: authorised prior-period adjustment. The target period must exist and be CLOSED for the
-- legal entity; nothing is posted inside it (closed periods are never silently changed or reopened).
-- The adjustment is posted on the correction date in an open period and tagged meta.priorPeriod, so
-- prior_period_adjustment_report() shows the closed figures unchanged next to the adjustments.
--   payload {entityId, periodId, correctionDate?, lines, memo, sources}   -> a 'prior_period' journal
--   payload {entryId, periodId, correctionDate?}                          -> reversal of an entry of that period
CREATE FUNCTION phase3_p7.check_prior_period(_uid uuid, _payload jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE per jsonb := phase3_p7.period_by_id(_uid, _payload->>'periodId'); on_date date := coalesce((_payload->>'correctionDate')::date, current_date);
  ent uuid; e public.expenses;
BEGIN
  IF per IS NULL THEN RAISE EXCEPTION 'P7_PRIOR_PERIOD: choose one of your closed periods as the target'; END IF;
  IF on_date <= (per->>'to')::date OR on_date > current_date THEN RAISE EXCEPTION 'P7_PRIOR_PERIOD: the adjustment is posted after the closed period and not in the future'; END IF;
  IF _payload ? 'entryId' THEN
    SELECT * INTO e FROM public.expenses WHERE id = (_payload->>'entryId')::uuid AND employee_id = _uid;
    IF NOT FOUND OR e.expense_date NOT BETWEEN (per->>'from')::date AND (per->>'to')::date THEN RAISE EXCEPTION 'P7_PRIOR_PERIOD: the entry is not dated in the target period'; END IF;
    ent := e.legal_entity_id;
  ELSE
    ent := (_payload->>'entityId')::uuid;
    PERFORM phase3_p7.check_journal(_uid, ent, on_date, _payload->'lines', _payload->>'memo', _payload->'sources');
  END IF;
  IF ent IS NULL OR NOT phase3_p7.closed(_uid, ent, (per->>'to')::date) THEN
    RAISE EXCEPTION 'P7_PRIOR_PERIOD: the target period is not closed for this legal entity; correct it directly instead';
  END IF;
  RETURN jsonb_build_object('period', per, 'entity', ent, 'on', on_date);
END $$;

CREATE FUNCTION phase3_p7.post_prior_period(_uid uuid, _request uuid, _payload jsonb, _reason text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE chk jsonb := phase3_p7.check_prior_period(_uid, _payload); per jsonb := chk->'period';
  tag jsonb := jsonb_build_object('priorPeriod', jsonb_build_object('id', per->>'id', 'from', per->>'from', 'to', per->>'to', 'entityId', per->>'entityId'), 'reason', btrim(_reason), 'request', _request);
  bid uuid;
BEGIN
  IF _payload ? 'entryId' THEN
    RETURN phase3_p7.reverse_entry(_uid, _request, (_payload->>'entryId')::uuid, 'Prior-period adjustment (' || (per->>'id') || '): ' || btrim(_reason), (chk->>'on')::date, tag)
      || jsonb_build_object('priorPeriod', tag->'priorPeriod');
  END IF;
  bid := phase3_p7.post_journal(_uid, _request, (chk->>'entity')::uuid, (chk->>'on')::date, _payload->'lines', _payload->>'memo', _payload->'sources', 'prior_period', tag);
  RETURN jsonb_build_object('request', _request, 'batch', bid, 'correctionDate', chk->>'on', 'priorPeriod', tag->'priorPeriod');
END $$;

-- How prior-period adjustments are reported: per closed period and legal entity, the figures AS CLOSED
-- (recomputed now from the batches dated in the period, with the close-evidence hash; they never
-- change), the adjustments that relate to it (posted later, in open periods) and the restated view.
CREATE FUNCTION public.prior_period_adjustment_report() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); out jsonb := '[]'::jsonb; per jsonb; ent record; reported jsonb; adj jsonb; snap jsonb; closed_ev jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  FOR per IN SELECT c FROM public.finance_preferences p, jsonb_array_elements(CASE WHEN jsonb_typeof(p.data->'books'->'closedPeriods') = 'array' THEN p.data->'books'->'closedPeriods' ELSE '[]'::jsonb END) c
             WHERE p.owner_id = uid AND (c->>'from') ~ '^\d{4}-\d{2}-\d{2}$' AND (c->>'to') ~ '^\d{4}-\d{2}-\d{2}$' ORDER BY c->>'from' LOOP
    FOR ent IN SELECT le.id, le.entity_key FROM public.legal_entities le WHERE le.owner_id = uid
               AND (nullif(per->>'entityId', '') IS NULL OR le.entity_key = per->>'entityId') ORDER BY le.entity_key LOOP
      SELECT coalesce(jsonb_object_agg(code, s), '{}'::jsonb) INTO reported FROM (
        SELECT l.code, sum(l.signed_amount) s FROM public.posting_lines l JOIN public.posting_batches b ON b.id = l.batch_id
        WHERE b.owner_id = uid AND b.legal_entity_id = ent.id AND b.posting_date BETWEEN (per->>'from')::date AND (per->>'to')::date GROUP BY 1 HAVING sum(l.signed_amount) <> 0) t;
      SELECT coalesce(jsonb_agg(jsonb_build_object('batchId', b.id, 'kind', b.kind, 'postedOn', b.posting_date, 'reason', b.meta->>'reason', 'request', b.meta->>'request',
               'lines', phase3_p7.lines_of(b.id)) ORDER BY b.posting_date, b.id), '[]'::jsonb) INTO adj
      FROM public.posting_batches b WHERE b.owner_id = uid AND b.legal_entity_id = ent.id AND b.meta->'priorPeriod'->>'id' = per->>'id';
      WITH pb AS (SELECT b.id FROM public.posting_batches b WHERE b.owner_id = uid AND b.legal_entity_id = ent.id AND b.posting_date BETWEEN (per->>'from')::date AND (per->>'to')::date)
      SELECT jsonb_build_object('batches', (SELECT coalesce(jsonb_agg(pb.id ORDER BY pb.id), '[]'::jsonb) FROM pb),
        'debit', (SELECT coalesce(sum(l.debit), 0) FROM public.posting_lines l JOIN pb ON pb.id = l.batch_id),
        'credit', (SELECT coalesce(sum(l.credit), 0) FROM public.posting_lines l JOIN pb ON pb.id = l.batch_id)) INTO snap;
      SELECT x.evidence->'postings' INTO closed_ev FROM public.period_close_evidence x WHERE x.owner_id = uid AND x.period_id = per->>'id' AND x.action = 'closed' ORDER BY x.created_at DESC LIMIT 1;
      out := out || jsonb_build_array(jsonb_build_object('periodId', per->>'id', 'from', per->>'from', 'to', per->>'to', 'entityId', ent.id, 'entityKey', ent.entity_key,
        'asClosed', reported, 'currentSnapshot', snap || jsonb_build_object('sha256', public.legacy_sha256(snap)), 'closeEvidence', closed_ev,
        'unchangedSinceClose', closed_ev IS NULL OR (closed_ev->>'sha256') IS NOT DISTINCT FROM public.legacy_sha256(snap),
        'adjustments', adj,
        'restated', (SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb) FROM (
            SELECT k, sum(v) v FROM (SELECT key k, value::numeric v FROM jsonb_each_text(reported)
              UNION ALL SELECT l->>'code', (l->>'debit')::numeric - (l->>'credit')::numeric FROM jsonb_array_elements(adj) a, jsonb_array_elements(a->'lines') l) z
            GROUP BY k HAVING sum(v) <> 0) y)));
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('periods', out);
END $$;

-- Item 1: Statement Desk Undo by audited per-entry reversal. One transaction: every row is re-checked
-- against the owner-read snapshot the app shows (same rule as the staged undo); POSTED rows are reversed
-- (linked reversal entries, reason, correction date today), UNPOSTED rows follow today's rule (deleted;
-- nothing was ever posted for them), matched rows lose only their statement match (metadata, DN-P3-11).
-- Idempotent by request id; reports exactly what it did. Step-up guard below.
CREATE FUNCTION public.reverse_statement_upload(_request uuid, _upload uuid, _items jsonb, _reason text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); prev public.statement_upload_reversals; item jsonb; row_now jsonb; up jsonb; eid uuid; ev uuid; sha text;
  reversed jsonb := '[]'::jsonb; deleted jsonb := '[]'::jsonb; unmatched jsonb := '[]'::jsonb; r jsonb; result jsonb; rr text := btrim(coalesce(_reason, ''));
BEGIN
  IF uid IS NULL OR phase3_p7.is_guest() THEN RAISE EXCEPTION 'P7_GUEST: sign in with a real account' USING ERRCODE = '42501'; END IF;
  IF _request IS NULL OR _upload IS NULL THEN RAISE EXCEPTION 'Request and upload required'; END IF;
  IF jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items) NOT BETWEEN 1 AND 3000
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(_items) x WHERE x->>'action' IS NULL OR x->>'action' NOT IN ('remove', 'unreconcile') OR jsonb_typeof(x->'snapshot') IS DISTINCT FROM 'object')
     OR (SELECT count(DISTINCT x->'snapshot'->>'id') FROM jsonb_array_elements(_items) x) <> jsonb_array_length(_items) THEN
    RAISE EXCEPTION 'Invalid Undo manifest';
  END IF;
  sha := public.legacy_sha256(jsonb_build_object('upload', _upload, 'items', (SELECT jsonb_agg(jsonb_build_array(x->>'action', x->'snapshot'->>'id', x->>'ref') ORDER BY x->'snapshot'->>'id') FROM jsonb_array_elements(_items) x)));
  PERFORM 1 FROM public.finance_preferences WHERE owner_id = uid FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  SELECT * INTO prev FROM public.statement_upload_reversals WHERE id = _request;
  IF FOUND THEN
    IF prev.owner_id <> uid OR prev.items_sha256 <> sha THEN RAISE EXCEPTION 'Undo identifier already used'; END IF;
    RETURN prev.result || jsonb_build_object('replayed', true);
  END IF;
  IF length(rr) < 5 THEN RAISE EXCEPTION 'A reason of at least five characters is required'; END IF;
  SELECT u INTO up FROM public.finance_preferences p, jsonb_array_elements(CASE WHEN jsonb_typeof(p.data->'statementUploads') = 'array' THEN p.data->'statementUploads' ELSE '[]'::jsonb END) u
  WHERE p.owner_id = uid AND u->>'id' = _upload::text LIMIT 1;
  IF up IS NULL THEN RAISE EXCEPTION 'Upload history is unavailable. Recovery is retained.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_items) x WHERE NOT (CASE WHEN x->>'action' = 'remove' THEN coalesce(up->'posted', '[]'::jsonb) ELSE coalesce(up->'reconciled', '[]'::jsonb) END ? (x->'snapshot'->>'id'))) THEN
    RAISE EXCEPTION 'Undo does not match the saved upload. Recovery is retained.';
  END IF;
  PERFORM 1 FROM public.expenses WHERE employee_id = uid AND id IN (SELECT (x->'snapshot'->>'id')::uuid FROM jsonb_array_elements(_items) x) ORDER BY id FOR UPDATE;
  FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    SELECT to_jsonb(e) INTO row_now FROM public.expenses e WHERE e.id = (item->'snapshot'->>'id')::uuid AND e.employee_id = uid;
    IF NOT FOUND OR row_now IS DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::public.expenses, item->'snapshot')) THEN
      RAISE EXCEPTION 'Record changed; Undo retained for fresh review';
    END IF;
    IF row_now->>'statement_ref' IS DISTINCT FROM item->>'ref' THEN RAISE EXCEPTION 'Source evidence changed'; END IF;
    IF row_now->>'transfer_counterpart_of' IS NOT NULL OR EXISTS (SELECT 1 FROM public.expenses e WHERE e.employee_id = uid AND e.transfer_counterpart_of = (item->'snapshot'->>'id')::uuid) THEN
      RAISE EXCEPTION 'Linked transfer requires individual review';
    END IF;
    IF row_now->>'reverses_entry_id' IS NOT NULL OR EXISTS (SELECT 1 FROM public.expenses e WHERE e.reverses_entry_id = (item->'snapshot'->>'id')::uuid) THEN
      RAISE EXCEPTION 'A record was already reversed; review it individually';
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(_items) ORDER BY value->'snapshot'->>'id' LOOP
    eid := (item->'snapshot'->>'id')::uuid;
    IF item->>'action' = 'remove' THEN
      SELECT id INTO ev FROM public.posting_events WHERE owner_id = uid AND event_key = 'ledger_entry:' || eid;
      IF phase3_p7.active(uid) AND ev IS NOT NULL AND phase3_p7.event_active(ev) THEN
        r := phase3_p7.reverse_entry(uid, md5(_request::text || ':' || eid::text)::uuid, eid, 'Statement upload undone: ' || rr, current_date,
               jsonb_build_object('statementUpload', _upload));
        reversed := reversed || jsonb_build_array(jsonb_build_object('entryId', eid, 'reversalEntryId', r->'reversalEntryId', 'correctionDate', r->'correctionDate'));
      ELSE
        DELETE FROM public.expenses WHERE id = eid AND employee_id = uid; -- never posted: today's rule
        deleted := deleted || to_jsonb(eid);
      END IF;
    ELSE
      UPDATE public.expenses SET statement_ref = NULL, reconciled_at = NULL WHERE id = eid AND employee_id = uid;
      unmatched := unmatched || to_jsonb(eid);
    END IF;
  END LOOP;
  result := jsonb_build_object('request', _request, 'upload', _upload, 'reversed', reversed, 'deleted', deleted, 'unreconciled', unmatched, 'replayed', false);
  PERFORM set_config('phase3_p7.writer', 'on', true);
  INSERT INTO public.statement_upload_reversals(id, owner_id, upload_id, items_sha256, result, reason, actor_id, session_id)
  VALUES (_request, uid, _upload, sha, result, rr, uid, public.jwt_session_id());
  PERFORM set_config('phase3_p7.writer', '', true);
  RETURN result;
END $$;

-- P0-005b: ONE card-payment action. The request id is the entry id and the operation key, so a lost
-- response + retry (same id) records exactly one payment; for active books the trigger posts it once
-- (Cr bank, Dr card). Works whether or not the owner has activated balanced posting.
CREATE FUNCTION public.record_card_payment(_request uuid, _from uuid, _card uuid, _amount numeric, _on date DEFAULT NULL, _note text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); key text; prior jsonb; src public.accounts; card public.accounts; on_date date := coalesce(_on, current_date); e public.expenses; result jsonb;
BEGIN
  IF uid IS NULL OR phase3_p7.is_guest() THEN RAISE EXCEPTION 'P7_GUEST: sign in with a real account' USING ERRCODE = '42501'; END IF;
  IF _request IS NULL THEN RAISE EXCEPTION 'Missing payment identifier'; END IF;
  key := 'card_payment:' || _request;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  SELECT o.result INTO prior FROM public.finance_operations o WHERE o.owner_id = uid AND o.operation_key = key;
  IF FOUND THEN RETURN prior || jsonb_build_object('replayed', true); END IF;
  SELECT * INTO src FROM public.accounts WHERE id = _from AND owner_id = uid;
  IF NOT FOUND OR src.archived OR src.kind NOT IN ('savings', 'current', 'cash', 'wallet') THEN RAISE EXCEPTION 'Choose a cash or bank account to pay from'; END IF;
  SELECT * INTO card FROM public.accounts WHERE id = _card AND owner_id = uid;
  IF NOT FOUND OR card.archived OR card.kind <> 'credit_card' THEN RAISE EXCEPTION 'Choose one of your credit cards'; END IF;
  IF _amount IS NULL OR _amount::text IN ('NaN', 'Infinity', '-Infinity') OR _amount <= 0 OR _amount <> round(_amount, 2) OR _amount > 100000000 THEN
    RAISE EXCEPTION 'Enter a positive amount with no more than two decimal places';
  END IF;
  IF on_date > current_date THEN RAISE EXCEPTION 'Payment date cannot be in the future'; END IF;
  SELECT * INTO e FROM public.expenses WHERE id = _request;
  IF FOUND THEN
    -- an earlier attempt of this payment saved through the fallback path: confirm it, never add another
    IF e.employee_id <> uid OR e.txn_type <> 'card_payment' OR e.account_id <> _from OR e.to_account_id <> _card OR e.amount <> _amount THEN
      RAISE EXCEPTION 'Payment identifier already used for a different entry';
    END IF;
  ELSE
    INSERT INTO public.expenses(id, employee_id, title, merchant, category, scope, amount, original_amount, currency, fx_rate, fx_date, expense_date,
      payment_method, txn_type, account_id, to_account_id, description)
    VALUES (_request, uid, left(card.name || ' bill payment', 200), nullif(card.issuer, ''), 'Card payment', 'personal', _amount, _amount, 'INR', 1, on_date, on_date,
      'bank_transfer', 'card_payment', _from, _card, left(coalesce(nullif(btrim(_note), ''), 'Credit card settlement'), 1000));
  END IF;
  result := jsonb_build_object('id', _request, 'amount', _amount, 'date', on_date, 'from', _from, 'card', _card);
  INSERT INTO public.finance_operations(owner_id, operation_key, result) VALUES (uid, key, result);
  RETURN result || jsonb_build_object('replayed', false);
END $$;

-- Item 5: approval queue. submit validates without posting; decide (step-up) approves (executes the
-- posting atomically through the internal functions above), rejects or cancels. Owner-only today
-- (decision 5); phase3_p7.may() is the single check a future delegation release extends.
CREATE FUNCTION phase3_p7.validate_request(_uid uuid, _kind text, _payload jsonb) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE e public.expenses; b public.posting_batches; ev uuid; on_date date; chk jsonb;
BEGIN
  IF _kind = 'journal' THEN
    PERFORM phase3_p7.check_journal(_uid, (_payload->>'entityId')::uuid, (_payload->>'date')::date, _payload->'lines', _payload->>'memo', _payload->'sources');
    RETURN (_payload->>'entityId')::uuid;
  ELSIF _kind = 'journal_reversal' THEN
    SELECT * INTO b FROM public.posting_batches WHERE id = (_payload->>'batchId')::uuid AND owner_id = _uid AND kind IN ('journal', 'prior_period');
    IF NOT FOUND OR EXISTS (SELECT 1 FROM public.posting_batches r WHERE r.reverses_id = b.id) THEN RAISE EXCEPTION 'Journal not found or already reversed'; END IF;
    RETURN b.legal_entity_id;
  ELSIF _kind = 'reversal' THEN
    SELECT * INTO e FROM public.expenses WHERE id = (_payload->>'entryId')::uuid AND employee_id = _uid;
    IF NOT FOUND OR e.reverses_entry_id IS NOT NULL OR EXISTS (SELECT 1 FROM public.expenses r WHERE r.reverses_entry_id = e.id) THEN RAISE EXCEPTION 'Entry not found or already reversed'; END IF;
    SELECT id INTO ev FROM public.posting_events WHERE owner_id = _uid AND event_key = 'ledger_entry:' || e.id;
    IF ev IS NULL OR NOT phase3_p7.event_active(ev) THEN RAISE EXCEPTION 'P7_NOT_POSTED: this entry was never posted (it is a listed exception); remove it instead'; END IF;
    on_date := coalesce((_payload->>'correctionDate')::date, current_date);
    IF on_date < e.expense_date OR on_date > current_date THEN RAISE EXCEPTION 'P7_CORRECTION_DATE: the correction date must be on or after the entry date and not in the future'; END IF;
    IF EXISTS (SELECT 1 FROM public.posting_batches x WHERE x.event_id = ev AND x.kind IN ('entry', 'opening') AND NOT EXISTS (SELECT 1 FROM public.posting_batches r WHERE r.reverses_id = x.id)
               AND phase3_p7.closed(_uid, x.legal_entity_id, on_date)) THEN
      RAISE EXCEPTION 'P7_CLOSED_PERIOD: the correction date % is in a closed period; choose an open date or submit a prior-period adjustment', on_date;
    END IF;
    RETURN e.legal_entity_id;
  ELSIF _kind = 'backfill' THEN
    IF coalesce(_payload->>'fingerprint', '') = '' THEN RAISE EXCEPTION 'Reviewed preview fingerprint required'; END IF;
    IF phase3_p7.plan(_uid)->>'fingerprint' IS DISTINCT FROM _payload->>'fingerprint' THEN RAISE EXCEPTION 'P7_PREVIEW_STALE: records changed since the preview; review a new preview' USING ERRCODE = '40001'; END IF;
    RETURN NULL;
  ELSIF _kind = 'prior_period_adjustment' THEN
    chk := phase3_p7.check_prior_period(_uid, _payload);
    RETURN (chk->>'entity')::uuid;
  END IF;
  RAISE EXCEPTION 'Unknown request kind';
END $$;

CREATE FUNCTION public.submit_posting_request(_request uuid, _kind text, _payload jsonb, _reason text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); prev public.posting_requests; ent uuid; sha text;
BEGIN
  IF uid IS NULL OR phase3_p7.is_guest() THEN RAISE EXCEPTION 'P7_GUEST: demo guests cannot prepare postings' USING ERRCODE = '42501'; END IF;
  IF _request IS NULL OR jsonb_typeof(_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Request id and payload required'; END IF;
  sha := public.legacy_sha256(jsonb_build_object('kind', _kind, 'payload', _payload, 'reason', btrim(coalesce(_reason, ''))));
  SELECT * INTO prev FROM public.posting_requests WHERE id = _request;
  IF FOUND THEN
    IF prev.owner_id <> uid OR prev.payload_sha256 <> sha THEN RAISE EXCEPTION 'P7: request id already used'; END IF;
    RETURN jsonb_build_object('request', _request, 'kind', prev.kind, 'status', coalesce((SELECT d.decision FROM public.posting_request_decisions d WHERE d.request_id = _request), 'pending'), 'replayed', true);
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 5 THEN RAISE EXCEPTION 'A reason of at least five characters is required'; END IF;
  IF NOT phase3_p7.active(uid) THEN
    IF _kind <> 'backfill' THEN RAISE EXCEPTION 'P7_NOT_ACTIVE: balanced posting is not active for this account' USING ERRCODE = '55000'; END IF;
    IF public.p5_personal_entity(uid) IS NULL THEN RAISE EXCEPTION 'P7: run the legal-entity backfill (P5) first'; END IF;
  END IF;
  ent := phase3_p7.validate_request(uid, _kind, _payload);
  PERFORM phase3_p7.require_may(uid, ent, 'propose');
  PERFORM set_config('phase3_p7.writer', 'on', true);
  INSERT INTO public.posting_requests(id, owner_id, kind, legal_entity_id, payload, payload_sha256, reason, requested_by, session_id)
  VALUES (_request, uid, _kind, ent, _payload, sha, btrim(_reason), uid, public.jwt_session_id());
  PERFORM set_config('phase3_p7.writer', '', true);
  RETURN jsonb_build_object('request', _request, 'kind', _kind, 'status', 'pending', 'entityId', ent, 'replayed', false);
END $$;

CREATE FUNCTION public.decide_posting_request(_request uuid, _decision text, _note text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); r public.posting_requests; prev public.posting_request_decisions; res jsonb; dec text;
BEGIN
  IF uid IS NULL OR phase3_p7.is_guest() THEN RAISE EXCEPTION 'P7_GUEST: demo guests cannot approve postings' USING ERRCODE = '42501'; END IF;
  dec := CASE _decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' WHEN 'cancel' THEN 'cancelled' END;
  IF dec IS NULL THEN RAISE EXCEPTION 'Decision must be approve, reject or cancel'; END IF;
  PERFORM 1 FROM public.finance_preferences WHERE owner_id = uid FOR UPDATE;
  PERFORM phase3_p7.lock_owner(uid);
  SELECT * INTO r FROM public.posting_requests WHERE id = _request AND owner_id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  SELECT * INTO prev FROM public.posting_request_decisions WHERE request_id = _request;
  IF FOUND THEN
    IF prev.decision <> dec THEN RAISE EXCEPTION 'P7_ALREADY_DECIDED: this request was already %', prev.decision; END IF;
    RETURN jsonb_build_object('request', _request, 'status', prev.decision, 'result', prev.result, 'replayed', true);
  END IF;
  PERFORM phase3_p7.require_may(uid, r.legal_entity_id, CASE WHEN dec = 'cancelled' THEN 'propose' ELSE 'approve' END);
  IF dec = 'approved' THEN
    res := CASE r.kind
      WHEN 'journal' THEN jsonb_build_object('batch', phase3_p7.post_journal(uid, r.id, (r.payload->>'entityId')::uuid, (r.payload->>'date')::date, r.payload->'lines', r.payload->>'memo', r.payload->'sources', 'journal',
                                               jsonb_build_object('approvedRequest', r.id)))
      WHEN 'journal_reversal' THEN jsonb_build_object('reversalBatch', phase3_p7.reverse_journal(uid, r.id, (r.payload->>'batchId')::uuid, r.reason, (r.payload->>'correctionDate')::date))
      WHEN 'reversal' THEN phase3_p7.reverse_entry(uid, r.id, (r.payload->>'entryId')::uuid, r.reason, (r.payload->>'correctionDate')::date, jsonb_build_object('approvedRequest', r.id))
      WHEN 'backfill' THEN phase3_p7.commit_backfill(uid, r.id, r.payload->>'fingerprint')
      WHEN 'prior_period_adjustment' THEN phase3_p7.post_prior_period(uid, r.id, r.payload, r.reason)
    END;
  END IF;
  PERFORM set_config('phase3_p7.writer', 'on', true);
  INSERT INTO public.posting_request_decisions(request_id, owner_id, decision, note, result, decided_by, session_id)
  VALUES (_request, uid, dec, left(coalesce(_note, ''), 500), res, uid, public.jwt_session_id());
  PERFORM set_config('phase3_p7.writer', '', true);
  RETURN jsonb_build_object('request', _request, 'kind', r.kind, 'status', dec, 'result', res, 'replayed', false);
END $$;

-- Read model for the screens: the owner's requests with their status (pending until decided).
CREATE FUNCTION public.posting_requests_overview(_limit int DEFAULT 100) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('request', r.id, 'kind', r.kind, 'entityId', r.legal_entity_id, 'payload', r.payload, 'reason', r.reason,
           'requestedAt', r.created_at, 'status', coalesce(d.decision, 'pending'), 'decidedAt', d.created_at, 'note', d.note, 'result', d.result) ORDER BY r.seq DESC), '[]'::jsonb)
  FROM (SELECT * FROM public.posting_requests WHERE owner_id = auth.uid() ORDER BY seq DESC LIMIT greatest(1, least(coalesce(_limit, 100), 500))) r
  LEFT JOIN public.posting_request_decisions d ON d.request_id = r.id
$$;

-- --------------------------------------------------------------------------------------------
-- r2 (decision 3): the legacy entry guard honours personal-only closed periods. 0058 + P5
-- p5_entry_closed with ONE addition: a period whose entityId is the personal books' key
-- ('personal:<owner>') closes entries that touch the personal books (a personal paying or receiving
-- account, or no account and no hand-picked company). Same signature, volatility and security; the P7
-- rollback restores the P5 body exactly. Every entry the P5 version refused is still refused.
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.p5_entry_closed(_owner uuid, _periods jsonb, _entity_accounts jsonb, _d date, _source text, _entity text, _account uuid, _to_account uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p jsonb; keys text[];
BEGIN
  IF _d IS NULL OR jsonb_typeof(_periods) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(_periods)
           WHERE (value->>'from') ~ '^\d{4}-\d{2}-\d{2}$' AND (value->>'to') ~ '^\d{4}-\d{2}-\d{2}$'
             AND _d BETWEEN (value->>'from')::date AND (value->>'to')::date LOOP
    IF nullif(p->>'entityId', '') IS NULL THEN RETURN true; END IF;
    IF p->>'entityId' = 'personal:' || _owner::text THEN
      IF (_account IS NOT NULL AND cardinality(public.p5_account_entity_keys(_owner, _account, _d, _entity_accounts)) = 0)
         OR (_to_account IS NOT NULL AND cardinality(public.p5_account_entity_keys(_owner, _to_account, _d, _entity_accounts)) = 0)
         OR (_account IS NULL AND _to_account IS NULL AND NOT (_source = 'manual' AND nullif(_entity, '') IS NOT NULL)) THEN
        RETURN true;
      END IF;
      CONTINUE;
    END IF;
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

REVOKE ALL ON public.posting_events, public.posting_event_sources, public.posting_batches, public.posting_lines, public.posting_reversals, public.posting_backfill_runs,
  public.posting_link_states, public.posting_requests, public.posting_request_decisions, public.statement_upload_reversals, public.posting_delegations
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.posting_backfill_runs_seq_seq, public.posting_requests_seq_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.posting_events, public.posting_event_sources, public.posting_batches, public.posting_lines, public.posting_reversals, public.posting_backfill_runs,
  public.posting_link_states, public.posting_requests, public.posting_request_decisions, public.statement_upload_reversals, public.posting_delegations
  TO authenticated, service_role;
ALTER TABLE public.posting_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posting_event_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posting_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posting_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posting_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posting_backfill_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posting_link_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posting_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posting_request_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statement_upload_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posting_delegations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner or authorised accountant reads posting batches" ON public.posting_batches FOR SELECT TO authenticated
  USING (public.p7_can_read(owner_id, legal_entity_id));
CREATE POLICY "Owner or authorised accountant reads posting lines" ON public.posting_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posting_batches b WHERE b.id = posting_lines.batch_id AND public.p7_can_read(b.owner_id, b.legal_entity_id)));
CREATE POLICY "Owner reads posting events" ON public.posting_events FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner reads posting sources" ON public.posting_event_sources FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner reads posting reversals" ON public.posting_reversals FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner reads posting backfill runs" ON public.posting_backfill_runs FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner reads posting link states" ON public.posting_link_states FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner reads posting requests" ON public.posting_requests FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner reads posting request decisions" ON public.posting_request_decisions FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner reads statement upload reversals" ON public.statement_upload_reversals FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner reads posting delegations" ON public.posting_delegations FOR SELECT TO authenticated USING (owner_id = auth.uid());

-- P4 RESTRICTIVE assistant policies on every new table (same names and expressions as P4 section 8 / P5).
DO $pol$
DECLARE t record; rd text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
           AND c.relname IN ('posting_events', 'posting_event_sources', 'posting_batches', 'posting_lines', 'posting_reversals', 'posting_backfill_runs',
                             'posting_link_states', 'posting_requests', 'posting_request_decisions', 'statement_upload_reversals', 'posting_delegations') ORDER BY c.relname LOOP
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
      'reverse_ledger_entry', 'post_journal_batch', 'reverse_journal_batch', 'p7_can_read', 'reverse_statement_upload', 'record_card_payment',
      'submit_posting_request', 'decide_posting_request', 'posting_requests_overview', 'prior_period_adjustment_report') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f.sig);
  END LOOP;
END $grants$;
GRANT EXECUTE ON FUNCTION public.posting_status(), public.preview_posting_backfill(), public.posting_reconciliation_report(),
  public.commit_posting_backfill(uuid, text), public.undo_posting_backfill(uuid, text), public.reverse_ledger_entry(uuid, uuid, text, date),
  public.post_journal_batch(uuid, uuid, date, jsonb, text, jsonb), public.reverse_journal_batch(uuid, uuid, text, date), public.p7_can_read(uuid, uuid),
  public.reverse_statement_upload(uuid, uuid, jsonb, text), public.record_card_payment(uuid, uuid, uuid, numeric, date, text),
  public.submit_posting_request(uuid, text, jsonb, text), public.decide_posting_request(uuid, text, text), public.posting_requests_overview(int),
  public.prior_period_adjustment_report() TO authenticated;

-- P4 guards: step-up for conversion, undo and reversals (approvals/reopen-class actions); assistant
-- refusal for journal posting. Registered in security_p4.guarded_functions; the P7 rollback removes them.
DO $guard$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure sig, CASE WHEN p.proname IN ('post_journal_batch', 'record_card_payment', 'submit_posting_request') THEN 'assistant' ELSE 'step_up' END mode
           FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN (
             'commit_posting_backfill', 'undo_posting_backfill', 'reverse_ledger_entry', 'reverse_journal_batch', 'post_journal_batch',
             'reverse_statement_upload', 'record_card_payment', 'submit_posting_request', 'decide_posting_request')
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
