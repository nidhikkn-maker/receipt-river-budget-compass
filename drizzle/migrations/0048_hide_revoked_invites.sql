-- Removed family members no longer see the inviter's email or member name.
CREATE OR REPLACE FUNCTION public.my_family_invites()
RETURNS TABLE (id uuid, member_name text, inviter_email text, accepted boolean, revoked boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, m.name, u.email::text, i.accepted_by IS NOT NULL, i.revoked
  FROM public.family_invites i
  JOIN public.family_members m ON m.id = i.member_id
  JOIN auth.users u ON u.id = i.owner_id
  WHERE i.owner_id <> auth.uid() AND NOT i.revoked
    AND ((i.accepted_by IS NULL AND i.email = (SELECT lower(email) FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL))
      OR i.accepted_by = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.my_family_invites() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_family_invites() TO authenticated;
