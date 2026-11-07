-- Compatible with new owner/companies/<UTF-8 entity hex>/ paths. Not installed on Live:
-- deploy compatible caller and explicitly approve live access changes before applying.
CREATE OR REPLACE FUNCTION public.can_upload_company_file(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.entity_members m
    JOIN public.finance_preferences p ON p.owner_id = m.owner_id
    WHERE m.member_id = auth.uid() AND m.revoked_at IS NULL AND m.can_write
      AND split_part(_path,'/',1) = m.owner_id::text
      AND split_part(_path,'/',2) = 'companies'
      AND split_part(_path,'/',3) = encode(convert_to(m.entity_id,'UTF8'),'hex')
      AND array_length(string_to_array(_path,'/'),1) = 4
      AND split_part(_path,'/',4) ~ '^[a-zA-Z0-9_.-]+$'
      AND split_part(_path,'/',4) NOT IN ('.','..')
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p.data->'entities','[]')) e WHERE e->>'id'=m.entity_id)
  )
$$;
REVOKE ALL ON FUNCTION public.can_upload_company_file(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_upload_company_file(text) TO authenticated;
-- Test reference existence behind RLS: a retagged hidden document is still linked, never an orphan.
CREATE OR REPLACE FUNCTION public.is_unlinked_company_file(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.can_upload_company_file(_path) AND NOT EXISTS(SELECT 1 FROM public.documents d WHERE d.file_path=_path)
$$;
REVOKE ALL ON FUNCTION public.is_unlinked_company_file(text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.is_unlinked_company_file(text) TO authenticated;
DROP POLICY IF EXISTS "Entity editors upload document files" ON storage.objects;
CREATE POLICY "Entity editors upload document files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='receipts' AND owner_id=auth.uid()::text AND public.can_upload_company_file(name));
-- Do not remove originals after a successful/lost-response document save. Owner cleanup remains unchanged.
CREATE POLICY "Entity editors clean unlinked company uploads" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='receipts' AND owner_id=auth.uid()::text AND public.is_unlinked_company_file(name));
CREATE POLICY "Entity editors read own pending uploads" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='receipts' AND owner_id=auth.uid()::text AND public.is_unlinked_company_file(name));
-- Metadata may reference only its company's namespace, not a personal/other-company original.
CREATE OR REPLACE FUNCTION public.guard_company_document_path()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.owner_id<>auth.uid() THEN
    IF NEW.entity_id IS NULL OR NOT public.can_access_entity(NEW.owner_id,NEW.entity_id,true) THEN
      RAISE EXCEPTION 'Company edit access required';
    END IF;
    IF TG_OP='UPDATE' THEN
      IF NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.entity_id IS DISTINCT FROM OLD.entity_id THEN
        RAISE EXCEPTION 'Company ownership cannot be changed';
      END IF;
      IF NEW.file_path IS DISTINCT FROM OLD.file_path THEN
        RAISE EXCEPTION 'Shared editors cannot replace source evidence';
      END IF;
      RETURN NEW;
    END IF;
    IF split_part(NEW.file_path,'/',1)<>NEW.owner_id::text
       OR split_part(NEW.file_path,'/',2)<>'companies'
       OR split_part(NEW.file_path,'/',3)<>encode(convert_to(NEW.entity_id,'UTF8'),'hex')
       OR NOT public.can_upload_company_file(NEW.file_path) THEN
      RAISE EXCEPTION 'File must belong to this exact company';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_company_document_path BEFORE INSERT OR UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.guard_company_document_path();