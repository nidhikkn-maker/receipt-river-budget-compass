CREATE OR REPLACE FUNCTION public.team_names() RETURNS TABLE(id uuid, full_name text, department text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.department FROM public.profiles p WHERE public.can_access_expense(p.id, 'view_expenses')
$$;
REVOKE ALL ON FUNCTION public.team_names() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_names() TO authenticated;