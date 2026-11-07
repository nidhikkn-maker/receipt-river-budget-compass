ALTER TABLE public.import_batches ADD COLUMN statement_identity jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.import_batches ADD COLUMN statement_review jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE public.statement_checkpoints(id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES public.finance_preferences(owner_id) ON DELETE CASCADE,batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,evidence_hash text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.statement_checkpoints TO authenticated;
GRANT ALL ON public.statement_checkpoints TO service_role;
ALTER TABLE public.statement_checkpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads statement checkpoints" ON public.statement_checkpoints FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE INDEX statement_checkpoints_batch_date ON public.statement_checkpoints(batch_id,created_at DESC);
CREATE FUNCTION public.review_statement_evidence(_batch uuid,_expected jsonb,_review jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); b public.import_batches; identity jsonb; coverage jsonb; account_name text;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 SELECT * INTO b FROM public.import_batches WHERE id=_batch AND owner_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Statement unavailable'; END IF;
 IF b.statement_review IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Statement review changed; reload first'; END IF;
 IF jsonb_typeof(_review) IS DISTINCT FROM 'object' OR octet_length(_review::text)>10000 OR EXISTS(SELECT 1 FROM jsonb_object_keys(_review) k WHERE k NOT IN ('identity','coverage','convention')) THEN RAISE EXCEPTION 'Invalid statement review'; END IF;
 identity:=_review->'identity'; coverage:=_review->'coverage';
 SELECT name INTO account_name FROM public.accounts WHERE id=b.account_id AND owner_id=uid AND NOT archived;
 IF NOT FOUND OR identity->>'accountId' IS DISTINCT FROM b.account_id::text OR identity->>'confirmed' IS DISTINCT FROM 'true' OR nullif(trim(identity->>'reference'),'') IS NULL THEN RAISE EXCEPTION 'Confirm the account against the original statement'; END IF;
 IF nullif(trim(identity->>'identifier'),'') IS NULL AND identity->>'missingIdentifierConfirmed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Explicitly confirm missing account identifier'; END IF;
 IF coverage->>'confirmed'='true' THEN
  IF nullif(trim(coverage->>'reference'),'') IS NULL OR coverage->>'from' IS NULL OR coverage->>'to' IS NULL OR (coverage->>'from')::date<'2026-04-01'::date OR (coverage->>'to')::date>current_date OR (coverage->>'from')::date>(coverage->>'to')::date THEN RAISE EXCEPTION 'Confirm the actual statement period'; END IF;
  IF EXISTS(SELECT 1 FROM public.import_rows r WHERE r.batch_id=b.id AND r.owner_id=uid AND ((r.line->>'date')::date<(coverage->>'from')::date OR (r.line->>'date')::date>(coverage->>'to')::date)) THEN RAISE EXCEPTION 'Statement period must contain every parsed row'; END IF;
 END IF;
 IF _review->>'convention' NOT IN ('asset','liability') OR _review->>'convention' IS NULL THEN RAISE EXCEPTION 'Confirm statement balance convention'; END IF;
 identity:=identity||jsonb_build_object('reviewedAt',now());
 IF coverage IS NOT NULL THEN coverage:=coverage||jsonb_build_object('reviewedAt',now()); END IF;
 UPDATE public.import_batches SET statement_review=jsonb_build_object('identity',identity,'coverage',COALESCE(coverage,'{}'::jsonb),'convention',_review->>'convention'),period_from=CASE WHEN coverage->>'confirmed'='true' THEN (coverage->>'from')::date ELSE b.period_from END,period_to=CASE WHEN coverage->>'confirmed'='true' THEN (coverage->>'to')::date ELSE b.period_to END,updated_at=now() WHERE id=b.id AND owner_id=uid;
 INSERT INTO public.import_audit(owner_id,batch_id,action,details) VALUES(uid,b.id,'statement_evidence_reviewed',jsonb_build_object('before',b.statement_review,'after',_review,'account',account_name));
END $$;
REVOKE ALL ON FUNCTION public.review_statement_evidence(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_statement_evidence(uuid,jsonb,jsonb) TO authenticated;
CREATE FUNCTION public.record_statement_checkpoint(_id uuid,_owner uuid,_batch uuid,_expected jsonb,_ledger jsonb,_rows jsonb,_posts jsonb,_hash text,_result jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.import_batches; snapshot jsonb;
BEGIN
 IF _owner IS NULL OR _id IS NULL OR _hash IS NULL THEN RAISE EXCEPTION 'Invalid checkpoint'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_owner::text,0));
 SELECT * INTO b FROM public.import_batches WHERE id=_batch AND owner_id=_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Statement unavailable'; END IF;
 PERFORM 1 FROM public.accounts WHERE id=b.account_id AND owner_id=_owner FOR UPDATE;
 PERFORM 1 FROM public.expenses WHERE employee_id=_owner ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.import_rows WHERE batch_id=b.id AND owner_id=_owner ORDER BY id FOR UPDATE;
 SELECT jsonb_build_object('batch',jsonb_build_object('account_id',b.account_id,'status',b.status,'period_from',b.period_from,'period_to',b.period_to,'currency',b.currency,'opening_balance',b.opening_balance,'closing_balance',b.closing_balance,'statement_review',b.statement_review,'balance_verification',b.balance_verification,'statement_identity',b.statement_identity),'account',(SELECT jsonb_build_object('id',a.id,'name',a.name,'kind',a.kind,'opening_balance',a.opening_balance,'archived',a.archived) FROM public.accounts a WHERE a.id=b.account_id AND a.owner_id=_owner)) INTO snapshot;
 IF snapshot IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Statement or account changed during check; retry'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',e.id,'revision',e.correction_revision) ORDER BY e.id),'[]'::jsonb) INTO snapshot FROM public.expenses e WHERE e.employee_id=_owner AND (e.account_id=b.account_id OR e.to_account_id=b.account_id);
 IF snapshot IS DISTINCT FROM _ledger THEN RAISE EXCEPTION 'Ledger changed during check; retry'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',r.id,'line',r.line,'proposal',r.proposal,'decision',r.decision,'duplicate_kind',r.duplicate_kind,'duplicate_id',r.duplicate_id,'fingerprint',r.fingerprint) ORDER BY r.id),'[]'::jsonb) INTO snapshot FROM public.import_rows r WHERE r.batch_id=b.id AND r.owner_id=_owner;
 IF snapshot IS DISTINCT FROM _rows THEN RAISE EXCEPTION 'Statement rows changed during check; retry'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('fingerprint',p.fingerprint,'transaction_id',p.transaction_id,'posted_at',p.posted_at) ORDER BY p.fingerprint),'[]'::jsonb) INTO snapshot FROM public.import_posts p WHERE p.account_id=b.account_id AND p.owner_id=_owner;
 IF snapshot IS DISTINCT FROM _posts THEN RAISE EXCEPTION 'Posting changed during check; retry'; END IF;
 IF EXISTS(SELECT 1 FROM public.statement_checkpoints WHERE id=_id AND owner_id=_owner AND batch_id=_batch AND evidence_hash=_hash) THEN RETURN; END IF;
 INSERT INTO public.statement_checkpoints(id,owner_id,batch_id,evidence_hash,result) VALUES(_id,_owner,_batch,_hash,_result);
END $$;
REVOKE ALL ON FUNCTION public.record_statement_checkpoint(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_statement_checkpoint(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,text,jsonb) TO service_role;