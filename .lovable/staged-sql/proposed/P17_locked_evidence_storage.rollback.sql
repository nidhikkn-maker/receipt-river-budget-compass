-- ============================================================================================
-- P17_locked_evidence_storage.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores the exact pre-P17 catalog: the three RESTRICTIVE storage.objects policies and the helper are dropped. The
-- permissive policies (0002 "Delete own receipts", 0052 "owner deletes accountant uploads", P1, P4) were never changed.
-- After it, D8 is open again: an owner can delete the file behind an evidence_locked documents row.
-- ============================================================================================
BEGIN;
DROP POLICY IF EXISTS "P17 locked evidence files cannot be deleted" ON storage.objects;
DROP POLICY IF EXISTS "P17 locked evidence files cannot be changed" ON storage.objects;
DROP POLICY IF EXISTS "P17 locked evidence paths cannot be replanted" ON storage.objects;
DROP FUNCTION IF EXISTS public.storage_object_is_locked_evidence(text, text);
COMMIT;
