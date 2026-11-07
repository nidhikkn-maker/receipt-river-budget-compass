DROP POLICY IF EXISTS "Signed-in users read exchange closing prices" ON public.market_quotes;
CREATE POLICY "Signed-in users read exchange closing prices" ON public.market_quotes FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Signed-in users read job status" ON public.job_state;
CREATE POLICY "Signed-in users read job status" ON public.job_state FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Signed-in users read rule snapshots" ON public.regulatory_snapshots;
CREATE POLICY "Signed-in users read rule snapshots" ON public.regulatory_snapshots FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Signed-in users read detected rule changes" ON public.regulatory_changes;
CREATE POLICY "Signed-in users read detected rule changes" ON public.regulatory_changes FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);