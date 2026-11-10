-- ============================================================================================
-- P10_unposted_entry_withdrawal.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores the exact pre-P10 catalog: the P10 functions and triggers are dropped, the phase3_p10 schema is
-- removed and the 0061 undo_opening_balances body is restored (copied verbatim; into P4's __unguarded body when P4 is installed).
-- Every expenses row stays exactly as stored, including receipt_details.withdrawal (app data): after rollback
-- withdrawn entries are still left out of every figure by the app (ledgerView) and still restorable through
-- the app's pre-P10 server path; only the database enforcement (no DELETE, history only by function) is gone.
-- Run it in any order relative to the P1..P9 rollbacks (P10 does not depend on them).
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase3_p10') IS NULL THEN RAISE EXCEPTION 'P10 is not installed'; END IF;
END $pre$;

DROP TRIGGER IF EXISTS p10_guard_withdrawal ON public.expenses;
DROP TRIGGER IF EXISTS p10_withdraw_only ON public.expenses;
DROP TRIGGER IF EXISTS p10_no_truncate ON public.expenses;
DROP FUNCTION IF EXISTS public.withdraw_entry(uuid, text);
DROP FUNCTION IF EXISTS public.restore_entry(uuid, text);

-- The 0061 body, verbatim, back into whichever function P10 replaced (P4's __unguarded body when P4 is installed).
DO $d$
DECLARE target text := CASE WHEN to_regprocedure('public.undo_opening_balances__unguarded(uuid)') IS NOT NULL
                            THEN 'undo_opening_balances__unguarded' ELSE 'undo_opening_balances' END;
BEGIN
  EXECUTE format($f$
CREATE OR REPLACE FUNCTION public.%I(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); p public.opening_postings;
BEGIN
  SELECT * INTO p FROM public.opening_postings WHERE id = _id AND owner_id = uid AND undone_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nothing to undo'; END IF;
  IF EXISTS (SELECT 1 FROM public.expenses WHERE id = ANY(p.txn_ids) AND (updated_at > p.posted_at + interval '5 seconds' OR employee_id <> uid)) THEN
    RAISE EXCEPTION 'An opening entry was edited after posting — change it directly instead';
  END IF;
  DELETE FROM public.expenses WHERE id = ANY(p.txn_ids) AND employee_id = uid;
  UPDATE public.opening_postings SET undone_at = now(), undone_by = uid WHERE id = _id;
END $$;$f$, target);
END $d$;

DROP SCHEMA phase3_p10 CASCADE;
COMMIT;
