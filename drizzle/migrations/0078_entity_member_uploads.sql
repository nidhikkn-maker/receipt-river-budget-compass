DROP POLICY IF EXISTS "Entity editors add company documents" ON public.documents;
CREATE POLICY "Entity editors add company documents" ON public.documents FOR INSERT TO authenticated
  WITH CHECK (owner_id <> auth.uid() AND entity_id IS NOT NULL AND public.can_access_entity(owner_id, entity_id, true));
DROP POLICY IF EXISTS "Entity editors upload document files" ON storage.objects;
CREATE POLICY "Entity editors upload document files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND split_part(name, '/', 1) <> auth.uid()::text AND EXISTS (
    SELECT 1 FROM public.entity_members m
    WHERE m.owner_id = split_part(name, '/', 1)::uuid AND m.member_id = auth.uid() AND m.revoked_at IS NULL AND m.can_write));