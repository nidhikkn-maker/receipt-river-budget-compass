ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS entity_id text;
CREATE INDEX IF NOT EXISTS documents_owner_entity_idx ON public.documents(owner_id, entity_id);
CREATE TABLE IF NOT EXISTS public.entity_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  entity_id text NOT NULL,
  member_id uuid NOT NULL,
  member_email text NOT NULL,
  can_write boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (owner_id <> member_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS entity_members_active_idx ON public.entity_members(owner_id, entity_id, member_id) WHERE revoked_at IS NULL;
GRANT SELECT ON public.entity_members TO authenticated;
GRANT ALL ON public.entity_members TO service_role;
ALTER TABLE public.entity_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner or member reads entity grants" ON public.entity_members;
CREATE POLICY "Owner or member reads entity grants" ON public.entity_members FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR member_id = auth.uid());
CREATE OR REPLACE FUNCTION public.can_access_entity(_owner uuid, _entity text, _write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (auth.uid() = _owner OR (_entity IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.entity_members m
    WHERE m.owner_id = _owner AND m.entity_id = _entity AND m.member_id = auth.uid()
      AND m.revoked_at IS NULL AND (NOT _write OR m.can_write))))
$$;
REVOKE ALL ON FUNCTION public.can_access_entity(uuid, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_access_entity(uuid, text, boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.grant_entity_access(_entity text, _email text, _write boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); target uuid; gid uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.finance_preferences p, jsonb_array_elements(coalesce(p.data->'entities','[]'::jsonb)) e
                 WHERE p.owner_id = me AND e->>'id' = _entity) THEN RAISE EXCEPTION 'Company not found'; END IF;
  SELECT id INTO target FROM auth.users WHERE lower(email) = lower(trim(_email)) AND email_confirmed_at IS NOT NULL LIMIT 1;
  IF target IS NULL THEN RAISE EXCEPTION 'No verified Ledgerline account uses that email'; END IF;
  IF target = me THEN RAISE EXCEPTION 'You already own this company'; END IF;
  UPDATE public.entity_members SET can_write = _write WHERE owner_id = me AND entity_id = _entity AND member_id = target AND revoked_at IS NULL RETURNING id INTO gid;
  IF gid IS NULL THEN
    INSERT INTO public.entity_members(owner_id, entity_id, member_id, member_email, can_write) VALUES (me, _entity, target, lower(trim(_email)), _write) RETURNING id INTO gid;
  END IF;
  RETURN gid;
END $$;
REVOKE ALL ON FUNCTION public.grant_entity_access(text, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.grant_entity_access(text, text, boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.revoke_entity_access(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.entity_members SET revoked_at = now() WHERE id = _id AND owner_id = auth.uid() AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Access grant not found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.revoke_entity_access(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.revoke_entity_access(uuid) TO authenticated;
DROP POLICY IF EXISTS "Entity members read documents" ON public.documents;
CREATE POLICY "Entity members read documents" ON public.documents FOR SELECT TO authenticated
  USING (entity_id IS NOT NULL AND owner_id <> auth.uid() AND public.can_access_entity(owner_id, entity_id, false));
DROP POLICY IF EXISTS "Entity members read document files" ON storage.objects;
CREATE POLICY "Entity members read document files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND EXISTS (SELECT 1 FROM public.documents d
    WHERE d.file_path = storage.objects.name AND d.entity_id IS NOT NULL AND public.can_access_entity(d.owner_id, d.entity_id, false)));