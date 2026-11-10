-- ============================================================================================
-- P17_locked_evidence_storage.sql (PROPOSED ONLY: NOT APPLIED to Lovable Cloud, Live or any hosted DB).
-- Prepared 11 Nov 2026 (D8 / P0-035, Track A) for KK review. Tested only in isolated PGlite:
-- src/lib/p17-locked-evidence-storage-sql.test.ts (applied schema and the whole proposed stack; catalog-exact rollback).
--
-- Defect D8: documents.evidence_locked (0059) protects the documents ROW (guard_evidence_delete), but the storage
-- policies "Delete own receipts" (0002) and "owner deletes accountant uploads" (0052) let the owner delete the FILE,
-- leaving a locked row that points at nothing. Starting point: WS-E proposal
-- docs/workstreams/requests/sql/ws-e-d8-locked-evidence-storage.sql (ws/e-records), reworked here:
--  * RESTRICTIVE policies instead of rewriting the permissive ones: they AND with every DELETE/UPDATE/INSERT policy on
--    storage.objects, present (0002, 0052, P1 "Entity editors clean unlinked company uploads", P4) and future, so no
--    other delete path can bypass the lock and the original policies stay byte-for-byte as they are.
--  * UPDATE (Storage upsert = INSERT .. ON CONFLICT DO UPDATE, and move/rename) and INSERT (re-planting bytes at a
--    locked path) are refused too. No permissive UPDATE policy exists today, so UPDATE is already denied; the
--    restrictive one keeps it denied for locked files if one is ever added.
--  * No cross-owner oracle: the helper answers only for documents the caller may already read (owner, or a member
--    with read access to the document's company, mirroring the documents SELECT policies) and is false for anything
--    else. Another owner's objects are refused by the permissive policies regardless (owner folder only; company
--    editors may clean only files with no documents row), so the false answer never permits a delete.
--  * No session-setting exemption. The WS-E draft (and 0059 guard_evidence_delete) trust ledgerline.erasing, which any
--    role can set with SET / set_config in plain SQL; the attack test proves a GUC-trusting helper would let an owner
--    delete a locked file. P17 trusts only the documents row. The authorised paths are explicit and tested:
--      1. the owner unlocks the document (documents UPDATE evidence_locked = false; P1 refuses it for shared editors);
--      2. account erasure: delete_my_finance_data removes the owner's documents rows in its own transaction, then the
--         app removes the files (delete-data.ts); with the rows gone nothing is locked. A failed erasure keeps the rows,
--         so the files stay. Storage needs no exemption, so there is none to audit here; delete_my_finance_data itself
--         records no audit (gap reported with finding P0-036);
--      3. server code using the service role (BYPASSRLS in Supabase; never reachable by clients), e.g. the accountant
--         upload route's cleanup of a failed upload.
--  * Unlocking stays the owner's authorised documents UPDATE (evidence_locked = false; P1 refuses it for shared
--    editors); once unlocked, the file follows the ordinary policies again.
--
-- Requires: 0059 (documents.evidence_locked), 0075 (can_access_entity). Re-running is safe.
-- Rollback: P17_locked_evidence_storage.rollback.sql (drops the three policies and the helper; nothing else changed).
-- ============================================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.storage_object_is_locked_evidence(_bucket text, _name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT _bucket IN ('receipts', 'statement-uploads')
     AND auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.documents d
        WHERE d.file_path = _name AND d.evidence_locked
          AND (d.owner_id = auth.uid()
               OR (d.entity_id IS NOT NULL AND public.can_access_entity(d.owner_id, d.entity_id, false))))
$$;
REVOKE ALL ON FUNCTION public.storage_object_is_locked_evidence(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_object_is_locked_evidence(text, text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "P17 locked evidence files cannot be deleted" ON storage.objects;
CREATE POLICY "P17 locked evidence files cannot be deleted" ON storage.objects AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (NOT public.storage_object_is_locked_evidence(bucket_id, name));

DROP POLICY IF EXISTS "P17 locked evidence files cannot be changed" ON storage.objects;
CREATE POLICY "P17 locked evidence files cannot be changed" ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (NOT public.storage_object_is_locked_evidence(bucket_id, name))
  WITH CHECK (NOT public.storage_object_is_locked_evidence(bucket_id, name));

DROP POLICY IF EXISTS "P17 locked evidence paths cannot be replanted" ON storage.objects;
CREATE POLICY "P17 locked evidence paths cannot be replanted" ON storage.objects AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (NOT public.storage_object_is_locked_evidence(bucket_id, name));

COMMIT;
