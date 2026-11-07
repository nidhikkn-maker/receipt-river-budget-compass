-- Shared end-of-day exchange prices (official NSE/BSE daily files); written only by the scheduled job.
CREATE TABLE public.market_quotes (
  exchange text NOT NULL CHECK (exchange IN ('NSE','BSE','AMFI')),
  symbol text NOT NULL,
  isin text,
  series text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  close numeric NOT NULL CHECK (close > 0),
  prev_close numeric,
  price_date date NOT NULL,
  source text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (exchange, symbol, series, price_date)
);
CREATE INDEX market_quotes_isin_idx ON public.market_quotes (isin, price_date DESC);
GRANT SELECT ON public.market_quotes TO authenticated;
GRANT ALL ON public.market_quotes TO service_role;
ALTER TABLE public.market_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read exchange closing prices" ON public.market_quotes FOR SELECT TO authenticated USING (true);

-- Single-flight lease + pause state for background jobs.
CREATE TABLE public.job_state (
  name text PRIMARY KEY,
  lease_until timestamptz NOT NULL DEFAULT 'epoch',
  status text NOT NULL DEFAULT 'idle',
  reason text,
  last_success timestamptz,
  last_run timestamptz,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.job_state TO authenticated;
GRANT ALL ON public.job_state TO service_role;
ALTER TABLE public.job_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read job status" ON public.job_state FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.claim_job(_name text, _minutes integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean;
BEGIN
  INSERT INTO public.job_state(name) VALUES (_name) ON CONFLICT (name) DO NOTHING;
  UPDATE public.job_state SET lease_until = now() + make_interval(mins => _minutes), last_run = now()
   WHERE name = _name AND lease_until < now() AND status <> 'paused'
  RETURNING true INTO ok;
  RETURN coalesce(ok, false);
END $$;
REVOKE ALL ON FUNCTION public.claim_job(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_job(text, integer) TO service_role;

-- Official regulatory page snapshots and detected changes (global, read-only to users).
CREATE TABLE public.regulatory_snapshots (
  source_id text NOT NULL,
  url text NOT NULL,
  fingerprint text NOT NULL,
  excerpt text NOT NULL DEFAULT '',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, fingerprint)
);
GRANT SELECT ON public.regulatory_snapshots TO authenticated;
GRANT ALL ON public.regulatory_snapshots TO service_role;
ALTER TABLE public.regulatory_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read rule snapshots" ON public.regulatory_snapshots FOR SELECT TO authenticated USING (true);

CREATE TABLE public.regulatory_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL,
  url text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  previous_fingerprint text,
  fingerprint text NOT NULL,
  summary text NOT NULL DEFAULT '',
  proposals jsonb NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (source_id, fingerprint)
);
GRANT SELECT ON public.regulatory_changes TO authenticated;
GRANT ALL ON public.regulatory_changes TO service_role;
ALTER TABLE public.regulatory_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read detected rule changes" ON public.regulatory_changes FOR SELECT TO authenticated USING (true);

-- Durable Statement Desk document processing state (resume/retry, no half-saved records).
CREATE TABLE public.document_runs (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  file_name text NOT NULL,
  context text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'upload',
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','waiting','failed','done','cancelled')),
  error text,
  document_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_runs_owner_idx ON public.document_runs (owner_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_runs TO authenticated;
GRANT ALL ON public.document_runs TO service_role;
ALTER TABLE public.document_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their document runs" ON public.document_runs FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Evidence preservation: originals marked as evidence cannot be deleted (account erasure still allowed).
ALTER TABLE public.documents ADD COLUMN evidence_locked boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.guard_evidence_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.evidence_locked AND auth.uid() IS NOT NULL AND coalesce(current_setting('ledgerline.erasing', true), '') <> 'on' THEN
    RAISE EXCEPTION 'This original is kept as audit evidence. Unlock it before deleting.' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER documents_guard_evidence BEFORE DELETE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.guard_evidence_delete();