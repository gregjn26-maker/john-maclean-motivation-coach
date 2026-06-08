CREATE POLICY "No user inserts on user_roles" ON public.user_roles
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "No user updates on user_roles" ON public.user_roles
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No user deletes on user_roles" ON public.user_roles
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);