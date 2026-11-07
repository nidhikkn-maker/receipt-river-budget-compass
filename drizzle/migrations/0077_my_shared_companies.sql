CREATE OR REPLACE FUNCTION public.my_shared_companies()
RETURNS TABLE(grant_id uuid, owner_id uuid, entity_id text, company_name text, owner_email text, can_write boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.owner_id, m.entity_id,
    coalesce((SELECT e->>'name' FROM public.finance_preferences p, jsonb_array_elements(coalesce(p.data->'entities','[]'::jsonb)) e
              WHERE p.owner_id = m.owner_id AND e->>'id' = m.entity_id LIMIT 1), 'Company'),
    coalesce((SELECT u.email FROM auth.users u WHERE u.id = m.owner_id), ''),
    m.can_write
  FROM public.entity_members m
  WHERE m.member_id = auth.uid() AND m.revoked_at IS NULL
  ORDER BY 4
$$;
REVOKE ALL ON FUNCTION public.my_shared_companies() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_shared_companies() TO authenticated;