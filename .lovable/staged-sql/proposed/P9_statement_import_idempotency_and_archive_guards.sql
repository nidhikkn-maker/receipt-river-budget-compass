-- ============================================================================================
-- P9_statement_import_idempotency_and_archive_guards.sql (PROPOSED ONLY: NOT APPLIED to Lovable
-- Cloud, Live or any hosted DB). Prepared 10 Nov 2026 (Phase 3 completion, Track A) for KK review.
-- Tested only in isolated PGlite: src/lib/p9-statement-archive-sql.test.ts.
--
-- Depends on the applied migrations 0000-0088 only. Independent of P1-P8: it can be applied before or
-- after them (the test applies it on the bare schema and after the full P1..P8 stack). Re-running it is
-- safe (IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS). Rollback:
-- P9_statement_import_idempotency_and_archive_guards.rollback.sql.
-- No existing row or column value is changed: two NULL-able columns are added to
-- statement_line_imports; every existing row keeps its values (existing rows read as "already imported").
--
-- A. P0-025 Statement Inbox idempotency (database-backed)
--    statement_line_imports already has UNIQUE (owner_id, account_key, fingerprint) (0020); the
--    fingerprint is src/lib/statement-fingerprint.ts fingerprintLines (account key | date | direction |
--    amount | bank reference or cleaned narration, #n for identical same-day lines), reused unchanged.
--    P9 adds the entry each line was registered as:
--      entry_id       the expenses.id the line is (to be) registered as; UNIQUE per owner
--      registered_at  set once that entry exists (confirm_statement_lines)
--    claim_statement_lines(account, batch, label, lines[{fingerprint,line_date,entry_id}]) inserts one
--    row per line with ON CONFLICT DO NOTHING BEFORE anything is saved, and returns per line:
--      claimed     new now: save it with entry_id
--      pending     claimed earlier but never confirmed (failed save, lost response, timeout): save it
--                  again with the SAME stored entry_id; the id-upsert save adds nothing if it exists
--      registered  imported before (confirmed, or a plain "seen" row): never registered again
--    Concurrent double submits serialise on the unique index; the second caller gets 'pending' with the
--    first caller's entry_id, so both saves target one expenses primary key: one entry per line.
--    Clients cannot write entry_id / registered_at directly (guard trigger); only the functions do.
--
-- B. Database delete protection for archive-controlled table rows (P0-007..P0-016, Track C C1)
--    loans, goals, commitments, asset_valuations, documents: BEFORE DELETE (and TRUNCATE) guards refuse
--    deletes by signed-in users (role authenticated/anon or any request with auth.uid()). Allowed paths:
--      * confirmed erasure of the caller's own data: delete_my_finance_data sets ledgerline.erasing
--        (the same exemption P7 uses for posted rows);
--      * service / maintenance / operator rollback: no auth.uid() and not the authenticated/anon role
--        (demo cleanup cron with the service role, auth-user cascades, operator SQL);
--      * documents only: discard_used_pending_document(id), the post-save cleanup of a "saved to add
--        later" receipt whose bytes were copied into a saved entry (verified here: an entry of the owner
--        has a receipt with the same file name, a different path, and a stored object of the same size).
--    Representation decision: the archive STATUS of these rows stays where Track C put it, in
--    finance_preferences.data.recordArchive (one entry per row: id "<table>:<row id>", archivedAt/By,
--    archiveReason, append-only archiveHistory). It is NOT moved to columns because (1) the rows stay
--    byte-identical (no change to historical records; documents originals stay untouched for the
--    evidence guards), (2) the app, backup remap (backup-remap.ts) and retention rules already use it,
--    so moving would need a data migration of every archived row and a second source of truth during
--    rollout, and (3) archive/restore never changes a figure, so it does not need row-level columns.
--    Instead P9 makes that history database-enforced: a BEFORE INSERT/UPDATE trigger on
--    finance_preferences keeps every stored entry and lets its archiveHistory only grow by valid events
--    (action archived/restored alternating, reason >= 5 letters, by = the signed-in owner, status fields
--    matching the last event). A save that drops an entry or sends an older copy of its history (e.g. a
--    restore of an older backup) keeps the stored entry; a save that rewrites history is refused.
--    0069 guard_books_registers is NOT changed: it guards data.books.* and data.assets only, and
--    recordArchive is a top-level key it never reads, so no archive-field exemption is needed there.
--    P0-028 (failure-injection, 10 Nov 2026): the append-only comparison needs the stored row, so the
--    owner-preferences row itself cannot be deleted by signed-in users either (a DELETE, or DELETE then
--    INSERT with a forged recordArchive, erased or rewrote every archive history). Allowed paths are the
--    same as for the archive-controlled rows: confirmed erasure of the caller's own data
--    (ledgerline.erasing) and the service / operator path (demo cleanup cron, auth-user cascades). App
--    saves and backup restore UPDATE the existing row, so keep_record_archive still applies to them.
--    TRUNCATE (which ignores RLS) is refused for signed-in roles on finance_preferences and expenses too.
--    Hosted check item for RB-P1-06: confirm whether hosted roles anon/authenticated hold TRUNCATE on
--    public tables (the PGlite harness grants it through default privileges); revoke it there if so.
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regclass('public.statement_line_imports') IS NULL THEN RAISE EXCEPTION 'P9 requires migration 0020 (statement_line_imports)'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c WHERE c.conrelid = 'public.statement_line_imports'::regclass AND c.contype = 'u'
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM unnest(c.conkey) k JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k) = ARRAY['account_key','fingerprint','owner_id']
  ) THEN RAISE EXCEPTION 'P9 requires UNIQUE (owner_id, account_key, fingerprint) on statement_line_imports'; END IF;
  IF to_regclass('public.loans') IS NULL OR to_regclass('public.goals') IS NULL OR to_regclass('public.commitments') IS NULL
     OR to_regclass('public.asset_valuations') IS NULL OR to_regclass('public.documents') IS NULL THEN
    RAISE EXCEPTION 'P9 requires loans, goals, commitments, asset_valuations and documents';
  END IF;
END $pre$;

CREATE SCHEMA IF NOT EXISTS phase3_p9;
REVOKE ALL ON SCHEMA phase3_p9 FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS phase3_p9.installed (installed_at timestamptz NOT NULL DEFAULT clock_timestamp());
INSERT INTO phase3_p9.installed SELECT WHERE NOT EXISTS (SELECT 1 FROM phase3_p9.installed);

-- --------------------------------------------------------------------------------------------
-- A. Statement line claims
-- --------------------------------------------------------------------------------------------
ALTER TABLE public.statement_line_imports ADD COLUMN IF NOT EXISTS entry_id uuid;
ALTER TABLE public.statement_line_imports ADD COLUMN IF NOT EXISTS registered_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS statement_line_imports_owner_entry_uidx ON public.statement_line_imports (owner_id, entry_id) WHERE entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS statement_line_imports_pending_idx ON public.statement_line_imports (owner_id, account_key) WHERE entry_id IS NOT NULL AND registered_at IS NULL;

-- Direct client writes keep working for plain "seen" rows (markSeen upsert, Forget last upload), but only
-- the P9 functions may set or change the registration columns.
CREATE OR REPLACE FUNCTION phase3_p9.guard_line_claims() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF coalesce(current_setting('phase3_p9.claiming', true), '') = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN NEW.entry_id := NULL; NEW.registered_at := NULL; RETURN NEW; END IF;
  IF NEW.entry_id IS DISTINCT FROM OLD.entry_id OR NEW.registered_at IS DISTINCT FROM OLD.registered_at THEN
    RAISE EXCEPTION 'P9_LINE_CLAIM: statement line registration is recorded only by claim_statement_lines / confirm_statement_lines' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS p9_guard_line_claims ON public.statement_line_imports;
CREATE TRIGGER p9_guard_line_claims BEFORE INSERT OR UPDATE ON public.statement_line_imports FOR EACH ROW EXECUTE FUNCTION phase3_p9.guard_line_claims();

CREATE OR REPLACE FUNCTION public.claim_statement_lines(p_account_key text, p_batch_id uuid, p_file_label text, p_lines jsonb)
RETURNS TABLE(fingerprint text, entry_id uuid, outcome text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE uid uuid := auth.uid(); n integer; claimed text[];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF coalesce(btrim(p_account_key), '') = '' OR length(p_account_key) > 200 THEN RAISE EXCEPTION 'P9_INVALID: statement account is missing' USING ERRCODE = '22023'; END IF;
  IF p_batch_id IS NULL THEN RAISE EXCEPTION 'P9_INVALID: upload batch is missing' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'P9_INVALID: lines must be a list' USING ERRCODE = '22023'; END IF;
  n := jsonb_array_length(p_lines);
  IF n = 0 THEN RETURN; END IF;
  IF n > 500 THEN RAISE EXCEPTION 'P9_INVALID: at most 500 lines per call' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_lines) x
             WHERE jsonb_typeof(x) <> 'object' OR coalesce(x->>'fingerprint', '') = '' OR length(x->>'fingerprint') > 1000
                OR coalesce(x->>'entry_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                OR coalesce(x->>'line_date', '') !~ '^\d{4}-\d{2}-\d{2}$') THEN
    RAISE EXCEPTION 'P9_INVALID: each line needs a fingerprint, a date and an entry id' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT x->>'fingerprint') FROM jsonb_array_elements(p_lines) x) <> n
     OR (SELECT count(DISTINCT lower(x->>'entry_id')) FROM jsonb_array_elements(p_lines) x) <> n THEN
    RAISE EXCEPTION 'P9_INVALID: a line or entry id appears twice' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('phase3_p9.claiming', 'on', true);
  WITH ins AS (
    INSERT INTO public.statement_line_imports AS s (owner_id, account_key, fingerprint, line_date, batch_id, file_label, entry_id)
    SELECT uid, p_account_key, x->>'fingerprint', (x->>'line_date')::date, p_batch_id, left(coalesce(p_file_label, ''), 200), (x->>'entry_id')::uuid
    FROM jsonb_array_elements(p_lines) x
    ON CONFLICT DO NOTHING
    RETURNING s.fingerprint
  ) SELECT coalesce(array_agg(ins.fingerprint), '{}') INTO claimed FROM ins;
  PERFORM set_config('phase3_p9.claiming', '', true);

  -- A line with no row now collided on its entry id (one id can register one line only): refuse the call.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_lines) x WHERE NOT EXISTS (
      SELECT 1 FROM public.statement_line_imports s WHERE s.owner_id = uid AND s.account_key = p_account_key AND s.fingerprint = x->>'fingerprint')) THEN
    RAISE EXCEPTION 'P9_ENTRY_CONFLICT: that entry id already registers another statement line' USING ERRCODE = '23505';
  END IF;

  RETURN QUERY
    SELECT s.fingerprint, s.entry_id,
           CASE WHEN s.fingerprint = ANY (claimed) THEN 'claimed'
                WHEN s.entry_id IS NOT NULL AND s.registered_at IS NULL THEN 'pending'
                ELSE 'registered' END
    FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS x(v, ord)
    JOIN public.statement_line_imports s ON s.owner_id = uid AND s.account_key = p_account_key AND s.fingerprint = x.v->>'fingerprint'
    ORDER BY x.ord;
END $$;

CREATE OR REPLACE FUNCTION public.confirm_statement_lines(p_entry_ids uuid[]) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); n integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF coalesce(cardinality(p_entry_ids), 0) > 500 THEN RAISE EXCEPTION 'P9_INVALID: at most 500 entries per call' USING ERRCODE = '22023'; END IF;
  PERFORM set_config('phase3_p9.claiming', 'on', true);
  UPDATE public.statement_line_imports s SET registered_at = now()
   WHERE s.owner_id = uid AND s.entry_id = ANY (coalesce(p_entry_ids, '{}')) AND s.registered_at IS NULL
     AND EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = s.entry_id AND e.employee_id = uid);
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('phase3_p9.claiming', '', true);
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.pending_statement_lines(p_account_key text)
RETURNS TABLE(fingerprint text, entry_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.fingerprint, s.entry_id FROM public.statement_line_imports s
   WHERE s.owner_id = auth.uid() AND s.account_key = p_account_key AND s.entry_id IS NOT NULL AND s.registered_at IS NULL
   ORDER BY s.created_at, s.fingerprint LIMIT 5000
$$;

-- --------------------------------------------------------------------------------------------
-- B. Archive-controlled rows: no deletes by signed-in users
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION phase3_p9.guard_archive_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_setting('ledgerline.erasing', true) = 'on' AND (auth.uid() IS NULL OR OLD.owner_id = auth.uid()) THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME = 'documents' AND coalesce(current_setting('phase3_p9.discarding', true), '') = OLD.id::text THEN RETURN OLD; END IF;
  IF auth.uid() IS NULL AND current_user NOT IN ('authenticated', 'anon') THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'P9_ARCHIVE_ONLY: % records are archived, not deleted. Archive keeps who, when and why, and Restore brings the record back.', TG_TABLE_NAME USING ERRCODE = '42501';
END $$;
CREATE OR REPLACE FUNCTION phase3_p9.guard_archive_truncate() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') OR auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'P9_ARCHIVE_ONLY: % records cannot be truncated', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END $$;
DO $t$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['loans', 'goals', 'commitments', 'asset_valuations', 'documents'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS p9_archive_only ON public.%I', t);
    EXECUTE format('CREATE TRIGGER p9_archive_only BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION phase3_p9.guard_archive_delete()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS p9_archive_no_truncate ON public.%I', t);
    EXECUTE format('CREATE TRIGGER p9_archive_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION phase3_p9.guard_archive_truncate()', t);
  END LOOP;
END $t$;

-- The post-save cleanup of a "saved to add later" receipt (src/routes/_authenticated/new.tsx, after a
-- successful save): only an unlinked, unlocked, not archived pending receipt whose bytes are now stored
-- with one of the owner's entries. Returns the file path so the client removes the staging file after.
CREATE OR REPLACE FUNCTION public.discard_used_pending_document(p_document uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); d public.documents; used uuid; prefs jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  SELECT * INTO d FROM public.documents WHERE id = p_document AND owner_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'P9_NOT_FOUND: that saved receipt was not found' USING ERRCODE = 'P0002'; END IF;
  IF d.notes IS DISTINCT FROM 'pending-receipt' OR d.transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'P9_NOT_STAGING: only an unlinked receipt saved to add later is cleared after use; archive other documents' USING ERRCODE = '42501';
  END IF;
  IF d.evidence_locked THEN RAISE EXCEPTION 'P9_NOT_STAGING: this original is kept as audit evidence' USING ERRCODE = '42501'; END IF;
  SELECT data INTO prefs FROM public.finance_preferences WHERE owner_id = uid;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(prefs->'recordArchive') = 'array' THEN prefs->'recordArchive' ELSE '[]'::jsonb END) e
             WHERE e->>'id' = 'documents:' || d.id::text AND coalesce(e->>'archivedAt', '') <> '') THEN
    RAISE EXCEPTION 'P9_ARCHIVED: archived documents are kept; restore it first' USING ERRCODE = '42501';
  END IF;
  SELECT e.id INTO used
    FROM public.expenses e
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(e.receipts) = 'array' THEN e.receipts ELSE '[]'::jsonb END) r
    JOIN storage.objects o ON o.bucket_id = 'receipts' AND o.name = r->>'path'
   WHERE e.employee_id = uid AND r->>'name' = d.file_name AND r->>'path' IS DISTINCT FROM d.file_path
     AND (storage.foldername(o.name))[1] = uid::text
     AND coalesce(o.metadata->>'size', '') ~ '^\d+$' AND (o.metadata->>'size')::bigint = d.size_bytes
   ORDER BY e.updated_at DESC LIMIT 1;
  IF used IS NULL THEN
    RAISE EXCEPTION 'P9_NOT_COPIED: this receipt is not saved with an entry yet, so it is kept' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('phase3_p9.discarding', d.id::text, true);
  DELETE FROM public.documents WHERE id = d.id;
  PERFORM set_config('phase3_p9.discarding', '', true);
  RETURN jsonb_build_object('document', d.id, 'entry', used, 'file_path', d.file_path);
END $$;

-- --------------------------------------------------------------------------------------------
-- B2. Append-only archive history for table rows (finance_preferences.data.recordArchive)
-- --------------------------------------------------------------------------------------------
-- 'same' | 'stale' (proposed history is a prefix of the stored one) | 'extends' (valid new events) |
-- 'invalid: <why>'. _old NULL = a new entry.
CREATE OR REPLACE FUNCTION phase3_p9.archive_change(_old jsonb, _new jsonb, _strict_actor boolean) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE oh jsonb; nh jsonb; i integer; ev jsonb; last text; lastev jsonb;
BEGIN
  IF jsonb_typeof(_new) IS DISTINCT FROM 'object' THEN RETURN 'invalid: entry is not a record'; END IF;
  IF _old IS NOT NULL AND (_new->'id' IS DISTINCT FROM _old->'id' OR _new->'table' IS DISTINCT FROM _old->'table' OR _new->'recordId' IS DISTINCT FROM _old->'recordId') THEN
    RETURN 'invalid: archive entry identity cannot change';
  END IF;
  IF _new->>'id' IS DISTINCT FROM (_new->>'table') || ':' || (_new->>'recordId') THEN RETURN 'invalid: archive entry id must be <table>:<record id>'; END IF;
  oh := CASE WHEN _old IS NULL THEN '[]'::jsonb WHEN jsonb_typeof(_old->'archiveHistory') = 'array' THEN _old->'archiveHistory' ELSE '[]'::jsonb END;
  -- an older entry archived without stored history counts as one archive event (archive.ts archiveHistory)
  IF _old IS NOT NULL AND jsonb_array_length(oh) = 0 AND coalesce(_old->>'archivedAt', '') <> '' THEN
    oh := jsonb_build_array(jsonb_build_object('action', 'archived', 'at', _old->'archivedAt', 'by', coalesce(_old->'archivedBy', '""'), 'reason', coalesce(_old->'archiveReason', '""')));
  END IF;
  nh := CASE WHEN jsonb_typeof(_new->'archiveHistory') = 'array' THEN _new->'archiveHistory' ELSE '[]'::jsonb END;
  IF jsonb_array_length(nh) <= jsonb_array_length(oh) THEN
    FOR i IN 0 .. jsonb_array_length(nh) - 1 LOOP IF nh->i IS DISTINCT FROM oh->i THEN RETURN 'invalid: archive history is append-only'; END IF; END LOOP;
    RETURN CASE WHEN _old IS NOT NULL AND jsonb_array_length(nh) = jsonb_array_length(oh) AND _new = _old THEN 'same' ELSE 'stale' END;
  END IF;
  FOR i IN 0 .. jsonb_array_length(oh) - 1 LOOP IF nh->i IS DISTINCT FROM oh->i THEN RETURN 'invalid: archive history is append-only'; END IF; END LOOP;
  last := CASE WHEN jsonb_array_length(oh) = 0 THEN 'restored' ELSE oh->(jsonb_array_length(oh) - 1)->>'action' END;
  FOR i IN jsonb_array_length(oh) .. jsonb_array_length(nh) - 1 LOOP
    ev := nh->i;
    IF jsonb_typeof(ev) IS DISTINCT FROM 'object' OR coalesce(ev->>'action', '') NOT IN ('archived', 'restored') THEN RETURN 'invalid: unknown archive event'; END IF;
    IF ev->>'action' = last THEN RETURN 'invalid: archive and restore must alternate'; END IF;
    IF coalesce(ev->>'at', '') = '' THEN RETURN 'invalid: archive event time is missing'; END IF;
    IF length(btrim(coalesce(ev->>'reason', ''))) < 5 THEN RETURN 'invalid: a reason of at least 5 letters is required'; END IF;
    IF coalesce(ev->>'by', '') = '' OR (_strict_actor AND ev->>'by' IS DISTINCT FROM auth.uid()::text) THEN RETURN 'invalid: archive events are recorded for the signed-in owner'; END IF;
    last := ev->>'action';
  END LOOP;
  lastev := nh->(jsonb_array_length(nh) - 1);
  IF last = 'archived' AND (_new->>'archivedAt' IS DISTINCT FROM lastev->>'at' OR _new->>'archivedBy' IS DISTINCT FROM lastev->>'by' OR _new->>'archiveReason' IS DISTINCT FROM lastev->>'reason') THEN
    RETURN 'invalid: archive status must match the last archive event';
  END IF;
  IF last = 'restored' AND coalesce(_new->>'archivedAt', '') <> '' THEN RETURN 'invalid: a restored record has no archive status'; END IF;
  RETURN 'extends';
END $$;

CREATE OR REPLACE FUNCTION phase3_p9.keep_record_archive() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE old_list jsonb := '[]'::jsonb; new_list jsonb; merged jsonb := '[]'::jsonb; e jsonb; n jsonb; verdict text; seen text[] := '{}';
BEGIN
  IF current_setting('ledgerline.erasing', true) = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND jsonb_typeof(OLD.data->'recordArchive') = 'array' THEN old_list := OLD.data->'recordArchive'; END IF;
  new_list := CASE WHEN jsonb_typeof(NEW.data->'recordArchive') = 'array' THEN NEW.data->'recordArchive' ELSE '[]'::jsonb END;
  IF old_list = new_list THEN RETURN NEW; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(old_list) LOOP
    IF jsonb_typeof(e) IS DISTINCT FROM 'object' OR coalesce(e->>'id', '') = '' OR e->>'id' = ANY (seen) THEN merged := merged || jsonb_build_array(e); CONTINUE; END IF;
    seen := seen || (e->>'id');
    SELECT value INTO n FROM jsonb_array_elements(new_list) WHERE jsonb_typeof(value) = 'object' AND value->>'id' = e->>'id' LIMIT 1;
    IF n IS NULL THEN merged := merged || jsonb_build_array(e); CONTINUE; END IF;   -- dropped: the stored entry stays
    verdict := phase3_p9.archive_change(e, n, auth.uid() IS NOT NULL);
    IF verdict LIKE 'invalid%' THEN RAISE EXCEPTION 'P9_ARCHIVE_HISTORY: %', substr(verdict, 10) USING ERRCODE = '23514'; END IF;
    merged := merged || jsonb_build_array(CASE WHEN verdict = 'extends' THEN n ELSE e END);
  END LOOP;
  FOR n IN SELECT value FROM jsonb_array_elements(new_list) LOOP
    IF jsonb_typeof(n) = 'object' AND n->>'id' = ANY (seen) THEN CONTINUE; END IF;
    -- new entries (also imported by a backup restore, whose events keep their original actor)
    verdict := phase3_p9.archive_change(NULL, n, false);
    IF verdict LIKE 'invalid%' THEN RAISE EXCEPTION 'P9_ARCHIVE_HISTORY: %', substr(verdict, 10) USING ERRCODE = '23514'; END IF;
    merged := merged || jsonb_build_array(n);
    seen := seen || (n->>'id');
  END LOOP;
  NEW.data := jsonb_set(NEW.data, '{recordArchive}', merged);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS p9_keep_record_archive ON public.finance_preferences;
CREATE TRIGGER p9_keep_record_archive BEFORE INSERT OR UPDATE ON public.finance_preferences FOR EACH ROW EXECUTE FUNCTION phase3_p9.keep_record_archive();

-- --------------------------------------------------------------------------------------------
-- B3. The owner-preferences row (holds recordArchive) is never deleted by signed-in users (P0-028)
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION phase3_p9.guard_preferences_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_setting('ledgerline.erasing', true) = 'on' AND (auth.uid() IS NULL OR OLD.owner_id = auth.uid()) THEN RETURN OLD; END IF;
  IF auth.uid() IS NULL AND current_user NOT IN ('authenticated', 'anon') THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'P9_PREFERENCES_KEPT: owner preferences hold the archive history and are removed only by confirmed data deletion' USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS p9_preferences_kept ON public.finance_preferences;
CREATE TRIGGER p9_preferences_kept BEFORE DELETE ON public.finance_preferences FOR EACH ROW EXECUTE FUNCTION phase3_p9.guard_preferences_delete();
DO $t$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['finance_preferences', 'expenses'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS p9_no_truncate ON public.%I', t);
    EXECUTE format('CREATE TRIGGER p9_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION phase3_p9.guard_archive_truncate()', t);
  END LOOP;
END $t$;

-- --------------------------------------------------------------------------------------------
-- Grants
-- --------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.claim_statement_lines(text, uuid, text, jsonb), public.confirm_statement_lines(uuid[]),
  public.pending_statement_lines(text), public.discard_used_pending_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_statement_lines(text, uuid, text, jsonb), public.confirm_statement_lines(uuid[]),
  public.pending_statement_lines(text), public.discard_used_pending_document(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION phase3_p9.guard_line_claims(), phase3_p9.guard_archive_delete(), phase3_p9.guard_archive_truncate(),
  phase3_p9.archive_change(jsonb, jsonb, boolean), phase3_p9.keep_record_archive(), phase3_p9.guard_preferences_delete() FROM PUBLIC, anon, authenticated;
COMMIT;
