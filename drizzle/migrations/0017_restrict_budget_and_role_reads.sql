ALTER POLICY "Anyone signed in can view budgets" ON public.department_budgets USING (department = public.my_department() OR public.has_role(auth.uid(), 'finance'::public.app_role));
ALTER POLICY "Team members can view roles" ON public.user_roles USING (user_id = auth.uid());
REVOKE ALL ON public.user_roles FROM anon;
GRANT SELECT ON public.user_roles TO authenticated;
