CREATE OR REPLACE FUNCTION public.family_invite_owner(_invite uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT owner_id FROM public.family_invites WHERE id = _invite AND accepted_by = auth.uid() AND NOT revoked
$$;
REVOKE ALL ON FUNCTION public.family_invite_owner(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.family_invite_owner(uuid) TO authenticated;