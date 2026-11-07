-- Protect internal reference tables from guest (anonymous demo) sessions.
-- job_state and regulatory_changes stay readable by real signed-in accounts (the app
-- shows feed/rule-watch status), but anonymous guests no longer qualify.
-- regulatory_snapshots has no client readers at all: service_role only.
-- market_quotes is intentionally left readable: public exchange closing prices (owner decision).

drop policy "Signed-in users read job status" on public.job_state;
create policy "Real accounts read job status" on public.job_state
  for select to authenticated
  using (auth.uid() is not null and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false));

drop policy "Signed-in users read detected rule changes" on public.regulatory_changes;
create policy "Real accounts read detected rule changes" on public.regulatory_changes
  for select to authenticated
  using (auth.uid() is not null and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false));

drop policy "Signed-in users read rule snapshots" on public.regulatory_snapshots;
revoke select on public.regulatory_snapshots from authenticated;