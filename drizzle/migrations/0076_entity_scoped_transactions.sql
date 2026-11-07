DROP POLICY IF EXISTS "Entity members read company transactions" ON public.expenses;
CREATE POLICY "Entity members read company transactions" ON public.expenses FOR SELECT TO authenticated
  USING (entity_id IS NOT NULL AND employee_id <> auth.uid() AND public.can_access_entity(employee_id, entity_id, false));
DROP POLICY IF EXISTS "Entity editors update company transactions" ON public.expenses;
CREATE POLICY "Entity editors update company transactions" ON public.expenses FOR UPDATE TO authenticated
  USING (entity_id IS NOT NULL AND employee_id <> auth.uid() AND public.can_access_entity(employee_id, entity_id, true))
  WITH CHECK (entity_id IS NOT NULL AND public.can_access_entity(employee_id, entity_id, true));
DROP POLICY IF EXISTS "Entity editors update company documents" ON public.documents;
CREATE POLICY "Entity editors update company documents" ON public.documents FOR UPDATE TO authenticated
  USING (entity_id IS NOT NULL AND owner_id <> auth.uid() AND public.can_access_entity(owner_id, entity_id, true))
  WITH CHECK (entity_id IS NOT NULL AND public.can_access_entity(owner_id, entity_id, true));