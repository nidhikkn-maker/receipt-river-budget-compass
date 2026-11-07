CREATE TABLE public.report_jobs (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  kind text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  style text NOT NULL DEFAULT 'signature',
  status text NOT NULL DEFAULT 'running',
  attempts integer NOT NULL DEFAULT 0,
  error text,
  lease_until timestamptz NOT NULL DEFAULT (now() + interval '3 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_jobs_pending_idx ON public.report_jobs (status, lease_until);
GRANT SELECT, INSERT ON public.report_jobs TO authenticated;
GRANT ALL ON public.report_jobs TO service_role;
ALTER TABLE public.report_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their report jobs" ON public.report_jobs FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners queue their report jobs" ON public.report_jobs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND status = 'running' AND attempts = 0 AND error IS NULL
    AND lease_until <= now() + interval '5 minutes' AND length(kind) <= 64);

-- Owner marks their own job finished after the open app saved the PDF.
CREATE OR REPLACE FUNCTION public.finish_my_report_job(_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.report_jobs SET status = 'done', updated_at = now()
  WHERE id = _id AND owner_id = auth.uid() AND status <> 'done';
$$;
REVOKE ALL ON FUNCTION public.finish_my_report_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_my_report_job(uuid) TO authenticated;

-- Owner asks for a failed job to run again on the server.
CREATE OR REPLACE FUNCTION public.retry_my_report_job(_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.report_jobs SET status = 'queued', attempts = 0, error = NULL, lease_until = now(), updated_at = now()
  WHERE id = _id AND owner_id = auth.uid() AND status = 'failed';
$$;
REVOKE ALL ON FUNCTION public.retry_my_report_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_my_report_job(uuid) TO authenticated;

-- Server worker claims abandoned jobs (lease expired) one batch at a time.
CREATE OR REPLACE FUNCTION public.claim_report_jobs(_limit integer) RETURNS SETOF public.report_jobs
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.report_jobs j SET status = 'running', attempts = j.attempts + 1, lease_until = now() + interval '3 minutes', updated_at = now()
  WHERE j.id IN (
    SELECT id FROM public.report_jobs
    WHERE status IN ('queued', 'running') AND lease_until < now() AND attempts < 3
    ORDER BY created_at LIMIT greatest(1, least(_limit, 5))
    FOR UPDATE SKIP LOCKED)
  RETURNING j.*;
$$;
REVOKE ALL ON FUNCTION public.claim_report_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_report_jobs(integer) TO service_role;