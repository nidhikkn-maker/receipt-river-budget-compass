-- STAGED ONLY: protects private DocuRepo paths even when a permissive team-receipt policy exists.
-- Must accompany company-bound-uploads.sql and compatible release; no Live activation here.
CREATE POLICY "DocuRepo originals require current document access" ON storage.objects
 AS RESTRICTIVE FOR SELECT TO authenticated
 USING (
  bucket_id <> 'receipts'
  OR split_part(name,'/',1)=auth.uid()::text
  OR (
   split_part(name,'/',2) NOT IN ('docs','companies')
   AND NOT EXISTS(SELECT 1 FROM public.documents d WHERE d.file_path=storage.objects.name)
  )
  OR EXISTS (
   SELECT 1 FROM public.documents d WHERE d.file_path=storage.objects.name
   AND public.can_access_entity(d.owner_id,d.entity_id,false)
  )
  OR (owner_id=auth.uid()::text AND public.is_unlinked_company_file(name))
 );