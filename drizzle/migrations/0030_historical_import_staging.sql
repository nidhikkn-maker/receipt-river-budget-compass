CREATE TABLE public.import_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL DEFAULT auth.uid(), account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
 file_name text NOT NULL, file_path text NOT NULL, file_hash text NOT NULL, currency text NOT NULL DEFAULT 'INR', status text NOT NULL DEFAULT 'queued',
 raw_lines jsonb NOT NULL DEFAULT '[]', period_from date, period_to date, opening_balance numeric, closing_balance numeric,
 error text, attempts integer NOT NULL DEFAULT 0, lease_until timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,account_id,file_hash), CHECK(status IN ('queued','processing','review','failed')), CHECK(jsonb_typeof(raw_lines)='array')
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_batch_owner ON public.import_batches TO authenticated USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid() AND file_path LIKE auth.uid()::text || '/%' AND EXISTS(SELECT 1 FROM public.accounts a WHERE a.id=account_id AND a.owner_id=auth.uid()));
CREATE TABLE public.import_rows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL DEFAULT auth.uid(), batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
 fingerprint text NOT NULL, line jsonb NOT NULL, proposal jsonb NOT NULL, review_group text NOT NULL, confidence text NOT NULL DEFAULT 'low', decision text NOT NULL DEFAULT 'review',
 duplicate_id uuid, duplicate_kind text NOT NULL DEFAULT 'new', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(batch_id,fingerprint),
 CHECK(decision IN ('review','approved','excluded')), CHECK(jsonb_typeof(proposal)='object')
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.import_rows TO authenticated;
GRANT ALL ON public.import_rows TO service_role;
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_row_owner ON public.import_rows TO authenticated USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid() AND EXISTS(SELECT 1 FROM public.import_batches b WHERE b.id=batch_id AND b.owner_id=auth.uid()));
CREATE TABLE public.import_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL DEFAULT auth.uid(), merchant text NOT NULL, account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
 mappings jsonb NOT NULL DEFAULT '{}', enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(length(merchant)>0), CHECK(jsonb_typeof(mappings)='object')
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.import_rules TO authenticated;
GRANT ALL ON public.import_rules TO service_role;
ALTER TABLE public.import_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_rule_owner ON public.import_rules TO authenticated USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid() AND (account_id IS NULL OR EXISTS(SELECT 1 FROM public.accounts a WHERE a.id=account_id AND a.owner_id=auth.uid())));
CREATE TABLE public.import_posts (
 owner_id uuid NOT NULL, account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE, fingerprint text NOT NULL,
 transaction_id uuid NOT NULL, batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL, original_line jsonb NOT NULL, posted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,account_id,fingerprint)
);
GRANT SELECT ON public.import_posts TO authenticated;
GRANT ALL ON public.import_posts TO service_role;
ALTER TABLE public.import_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_post_owner ON public.import_posts FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE TABLE public.import_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL DEFAULT auth.uid(), batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
 action text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT ON public.import_audit TO authenticated;
GRANT ALL ON public.import_audit TO service_role;
ALTER TABLE public.import_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_audit_read ON public.import_audit FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE POLICY import_audit_insert ON public.import_audit FOR INSERT TO authenticated WITH CHECK(owner_id=auth.uid() AND EXISTS(SELECT 1 FROM public.import_batches b WHERE b.id=batch_id AND b.owner_id=auth.uid()));
CREATE INDEX import_pending ON public.import_batches(status,lease_until);
CREATE INDEX import_rows_owner_batch ON public.import_rows(owner_id,batch_id);
CREATE FUNCTION public.claim_import_batches() RETURNS SETOF public.import_batches LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.import_batches SET status='processing', attempts=attempts+1, lease_until=now()+interval '5 minutes',updated_at=now()
 WHERE id IN (SELECT id FROM public.import_batches WHERE status IN ('queued','processing') AND lease_until<=now() AND attempts<3 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_import_batches() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_import_batches() TO service_role;
CREATE FUNCTION public.post_import_rows(_batch uuid, _rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b public.import_batches; r public.import_rows; x jsonb; p jsonb; tid uuid; inserted integer; total integer:=0; source uuid; dest uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 SELECT * INTO b FROM public.import_batches WHERE id=_batch AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Import not found'; END IF;
 IF jsonb_typeof(_rows)<>'array' OR jsonb_array_length(_rows)>100 THEN RAISE EXCEPTION 'Approve up to 100 rows at a time'; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(_rows) LOOP
  SELECT * INTO r FROM public.import_rows WHERE id=(x->>'id')::uuid AND batch_id=b.id AND owner_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR r.decision<>'approved' THEN RAISE EXCEPTION 'Approve the reviewed transaction first'; END IF;
  p:=r.proposal; tid:=r.id;
  source:=NULLIF(p->>'accountId','')::uuid; dest:=NULLIF(p->>'toAccountId','')::uuid;
  IF r.duplicate_kind='exact' OR (r.duplicate_kind IN ('likely','possible') AND COALESCE((p->>'duplicateOverride')::boolean,false)=false) THEN RAISE EXCEPTION 'Review possible duplicates individually'; END IF;
  IF source IS NULL OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=source AND owner_id=auth.uid()) THEN RAISE EXCEPTION 'Confirm payment account'; END IF;
  IF (p->>'date')::date < DATE '2026-04-01' OR (p->>'date')::date > CURRENT_DATE OR (p->>'amount')::numeric<=0 THEN RAISE EXCEPTION 'Invalid historical date or amount'; END IF;
  IF p->>'txnType' NOT IN ('expense','income','refund','transfer','card_payment','loan_repayment','investment','reimbursement','advance','advance_settlement') THEN RAISE EXCEPTION 'Confirm transaction type'; END IF;
  IF p->>'txnType' IN ('transfer','card_payment','loan_repayment','investment') AND (dest IS NULL OR source=dest OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=dest AND owner_id=auth.uid())) THEN RAISE EXCEPTION 'Confirm two different owned accounts'; END IF;
  IF NULLIF(p->>'memberId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.family_members WHERE id=(p->>'memberId')::uuid AND owner_id=auth.uid()) THEN RAISE EXCEPTION 'Invalid person'; END IF;
  IF p->>'scope' NOT IN ('personal','family','business','official') THEN RAISE EXCEPTION 'Confirm workspace'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.finance_preferences f, jsonb_array_elements(f.data->'categories') c WHERE f.owner_id=auth.uid() AND c->>'name'=p->>'category' AND COALESCE((c->>'archived')::boolean,false)=false) THEN RAISE EXCEPTION 'Choose an active category'; END IF;
  IF (x->>'rate')::numeric<=0 OR (x->>'homeAmount')::numeric<=0 THEN RAISE EXCEPTION 'Invalid conversion'; END IF;
  INSERT INTO public.expenses(id,employee_id,title,merchant,category,amount,expense_date,description,currency,original_amount,fx_rate,fx_date,payment_method,scope,member_id,txn_type,account_id,to_account_id,tags,reimbursement_status,statement_ref)
  SELECT tid,auth.uid(),p->>'title',p->>'merchant',p->>'category',(x->>'homeAmount')::numeric,(p->>'date')::date,left('Imported from '||b.file_name||' · '||(r.line->>'description'),2000),b.currency,(p->>'amount')::numeric,(x->>'rate')::numeric,(x->>'fxDate')::date,p->>'paymentMethod',p->>'scope',NULLIF(p->>'memberId','')::uuid,p->>'txnType',source,dest,ARRAY(SELECT jsonb_array_elements_text(COALESCE(p->'tags','[]'))),CASE WHEN p->>'reimbursable'='true' THEN 'pending' ELSE 'none' END,left(b.file_name||' · '||(r.line->>'ref')||' · '||(r.line->>'description'),300)
  WHERE NOT EXISTS(SELECT 1 FROM public.import_posts WHERE owner_id=auth.uid() AND account_id=b.account_id AND fingerprint=r.fingerprint) ON CONFLICT(id) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  IF inserted=1 THEN
   INSERT INTO public.import_posts(owner_id,account_id,fingerprint,transaction_id,batch_id,original_line) VALUES(auth.uid(),b.account_id,r.fingerprint,tid,b.id,r.line);
   INSERT INTO public.statement_line_imports(owner_id,account_key,fingerprint,line_date,batch_id,file_label) VALUES(auth.uid(),b.account_id::text,r.fingerprint,(r.line->>'date')::date,b.id,b.file_name) ON CONFLICT(owner_id,account_key,fingerprint) DO NOTHING;
   total:=total+1;
  END IF;
 END LOOP;
 INSERT INTO public.import_audit(owner_id,batch_id,action,details) VALUES(auth.uid(),b.id,'posted',jsonb_build_object('count',total));
 RETURN total;
END;
$$;
REVOKE ALL ON FUNCTION public.post_import_rows(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_import_rows(uuid,jsonb) TO authenticated;
