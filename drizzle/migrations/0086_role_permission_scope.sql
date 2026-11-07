-- A signed-in person only ever needs the switches for their own role; the whole matrix stays admin-only.
CREATE OR REPLACE FUNCTION public.my_team_role() RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.role FROM public.user_roles r WHERE r.user_id = auth.uid() LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.my_team_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_team_role() TO authenticated;

DROP POLICY IF EXISTS "Signed-in users read role switches" ON public.role_permissions;
CREATE POLICY "Staff read own role switches" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (role = public.my_team_role() OR public.is_admin());
