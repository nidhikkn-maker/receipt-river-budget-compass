ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS allow_ai boolean NOT NULL DEFAULT false;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS next_page integer NOT NULL DEFAULT 0;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS total_pages integer;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS source_balances jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS balance_verification jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.import_batches DROP CONSTRAINT import_batches_status_check;
ALTER TABLE public.import_batches ADD CONSTRAINT import_batches_status_check CHECK(status IN ('queued','processing','review','failed','paused','refused','cancelled'));
CREATE TABLE public.import_ai_state(owner_id uuid PRIMARY KEY, paused boolean NOT NULL DEFAULT false, reason text, pause_kind text, lease_until timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.import_ai_state TO authenticated;
GRANT ALL ON public.import_ai_state TO service_role;
ALTER TABLE public.import_ai_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_ai_state_owner ON public.import_ai_state FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE TABLE public.import_pdf_pages(batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE, owner_id uuid NOT NULL, page_start integer NOT NULL, page_end integer NOT NULL, rows jsonb NOT NULL, balances jsonb NOT NULL, run_id text, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(batch_id,page_start));
GRANT SELECT ON public.import_pdf_pages TO authenticated;
GRANT ALL ON public.import_pdf_pages TO service_role;
ALTER TABLE public.import_pdf_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_pdf_pages_owner ON public.import_pdf_pages FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE OR REPLACE FUNCTION public.claim_import_batches() RETURNS SETOF public.import_batches LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.import_batches SET status='processing',attempts=attempts+1,lease_until=now()+interval '10 minutes',updated_at=now()
 WHERE id IN (SELECT b.id FROM public.import_batches b WHERE b.status IN ('queued','processing') AND b.lease_until<=now() AND b.attempts<3 AND NOT EXISTS(SELECT 1 FROM public.import_ai_state s WHERE s.owner_id=b.owner_id AND s.paused) ORDER BY b.created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *;
$$;
CREATE FUNCTION public.claim_import_ai(_owner uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE claimed uuid;
BEGIN
 INSERT INTO public.import_ai_state(owner_id) VALUES(_owner) ON CONFLICT DO NOTHING;
 UPDATE public.import_ai_state SET lease_until=now()+interval '10 minutes' WHERE owner_id=_owner AND NOT paused AND lease_until<=now() RETURNING owner_id INTO claimed;
 RETURN claimed IS NOT NULL;
END; $$;
REVOKE ALL ON FUNCTION public.claim_import_ai(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_import_ai(uuid) TO service_role;
CREATE FUNCTION public.save_import_balance_review(_batch uuid,_review jsonb,_opening numeric,_closing numeric,_from date,_to date) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 PERFORM 1 FROM public.import_batches WHERE id=_batch AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Import not found'; END IF;
 IF _from<DATE '2026-04-01' OR _to<_from OR _to>CURRENT_DATE THEN RAISE EXCEPTION 'Invalid statement period'; END IF;
 IF EXISTS(SELECT 1 FROM public.import_rows WHERE batch_id=_batch AND ((line->>'date')::date<_from OR (line->>'date')::date>_to)) THEN RAISE EXCEPTION 'Period must include every transaction'; END IF;
 UPDATE public.import_batches SET opening_balance=_opening,closing_balance=_closing,period_from=_from,period_to=_to,balance_verification=_review,updated_at=now() WHERE id=_batch AND owner_id=auth.uid();
 INSERT INTO public.import_audit(owner_id,batch_id,action,details) VALUES(auth.uid(),_batch,'balance_verification',_review);
END; $$;
REVOKE ALL ON FUNCTION public.save_import_balance_review(uuid,jsonb,numeric,numeric,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_import_balance_review(uuid,jsonb,numeric,numeric,date,date) TO authenticated;
CREATE TRIGGER cleanup_import_ai_on_preferences_delete AFTER DELETE ON public.finance_preferences FOR EACH ROW EXECUTE FUNCTION public.cleanup_import_records();
CREATE OR REPLACE FUNCTION public.cleanup_import_records() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN DELETE FROM public.import_batches WHERE owner_id=OLD.owner_id; DELETE FROM public.import_rules WHERE owner_id=OLD.owner_id; DELETE FROM public.import_ai_state WHERE owner_id=OLD.owner_id; RETURN OLD; END; $$;