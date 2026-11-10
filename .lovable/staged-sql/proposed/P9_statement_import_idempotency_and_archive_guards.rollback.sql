-- ============================================================================================
-- P9_statement_import_idempotency_and_archive_guards.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores the exact pre-P9 catalog: the P9 functions, triggers, indexes and the two added
-- statement_line_imports columns (entry_id, registered_at) are dropped and the phase3_p9 schema is removed.
-- Every original column value is unchanged; every statement_line_imports row stays, so each line imported
-- before or under P9 is still "already imported" after rollback. finance_preferences.data.recordArchive
-- (Track C archive status and history) is app data and is left exactly as stored.
-- Claimed-but-unconfirmed lines (pending) would read as "already imported" after rollback, hiding a line
-- whose entry was never saved, so the rollback refuses while any exist unless the operator sets, in the
-- same transaction and with KK approval: SET LOCAL phase3_p9.rollback_with_pending = 'on'.
-- Run it in any order relative to the P1..P8 rollbacks (P9 does not depend on them).
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase3_p9') IS NULL THEN RAISE EXCEPTION 'P9 is not installed'; END IF;
  IF EXISTS (SELECT 1 FROM public.statement_line_imports WHERE entry_id IS NOT NULL AND registered_at IS NULL)
     AND coalesce(current_setting('phase3_p9.rollback_with_pending', true), '') <> 'on' THEN
    RAISE EXCEPTION 'P9 rollback: unconfirmed statement line claims exist; register or forget them, or obtain KK approval and SET LOCAL phase3_p9.rollback_with_pending = ''on''';
  END IF;
END $pre$;

DROP TRIGGER IF EXISTS p9_keep_record_archive ON public.finance_preferences;
DO $t$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['loans', 'goals', 'commitments', 'asset_valuations', 'documents'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS p9_archive_only ON public.%I', t);
    EXECUTE format('DROP TRIGGER IF EXISTS p9_archive_no_truncate ON public.%I', t);
  END LOOP;
END $t$;
DROP TRIGGER IF EXISTS p9_guard_line_claims ON public.statement_line_imports;

DROP FUNCTION IF EXISTS public.claim_statement_lines(text, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.confirm_statement_lines(uuid[]);
DROP FUNCTION IF EXISTS public.pending_statement_lines(text);
DROP FUNCTION IF EXISTS public.discard_used_pending_document(uuid);

DROP INDEX IF EXISTS public.statement_line_imports_pending_idx;
DROP INDEX IF EXISTS public.statement_line_imports_owner_entry_uidx;
ALTER TABLE public.statement_line_imports DROP COLUMN IF EXISTS registered_at;
ALTER TABLE public.statement_line_imports DROP COLUMN IF EXISTS entry_id;

DROP SCHEMA phase3_p9 CASCADE;
COMMIT;
