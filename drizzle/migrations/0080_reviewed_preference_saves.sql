CREATE TABLE public.preference_approvals (id uuid PRIMARY KEY, owner_id uuid NOT NULL, expected_revision bigint, previous_data jsonb NOT NULL, approved_data jsonb NOT NULL, changed_sections text[] NOT NULL, transaction_id bigint NOT NULL, result_revision bigint, approved_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.preference_approvals TO authenticated;
GRANT ALL ON public.preference_approvals TO service_role;
ALTER TABLE public.preference_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.preference_approvals FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE FUNCTION public.sensitive_preference_sections(_old jsonb,_new jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=public AS $$
SELECT coalesce(array_agg(k ORDER BY k),ARRAY[]::text[]) FROM (
SELECT k FROM unnest(ARRAY['assets','entities','paymentInstruments','reimbursementProfiles']) k WHERE coalesce(_old->k,'null') IS DISTINCT FROM coalesce(_new->k,'null')
UNION ALL SELECT 'books.'||k FROM unnest(ARRAY['policy','rules','fieldMappings','entityAccounts','fyRecords','properties','leases','propertyCosts','assetEvents','holdings','priceOverrides','goldRate','taxProfiles','entityTaxProfiles','taxCredits','taxDeductions','salaryEvidence','gstInvoices','gstFilings','loanBalances']) k WHERE coalesce(_old->'books'->k,'null') IS DISTINCT FROM coalesce(_new->'books'->k,'null')) changed;
$$;
CREATE FUNCTION public.save_reviewed_preferences(_id uuid,_data jsonb,_expected bigint,_approved boolean) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); previous jsonb; rev bigint; old public.preference_approvals; sections text[]; existed boolean;
BEGIN
IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
IF _id IS NULL OR jsonb_typeof(_data) IS DISTINCT FROM 'object' OR octet_length(_data::text)>20000000 THEN RAISE EXCEPTION 'Invalid preference review'; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
SELECT * INTO old FROM public.preference_approvals WHERE id=_id;
IF FOUND THEN IF old.owner_id<>uid OR old.approved_data IS DISTINCT FROM _data OR old.expected_revision IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Review identifier already used for another change'; END IF; RETURN old.result_revision; END IF;
SELECT data,revision INTO previous,rev FROM public.finance_preferences WHERE owner_id=uid FOR UPDATE;
existed:=FOUND; IF NOT existed THEN previous:='{}'; rev:=NULL; END IF;
IF rev IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Records changed; refresh and review again'; END IF;
sections:=public.sensitive_preference_sections(previous,_data);
IF cardinality(sections)>0 AND _approved IS DISTINCT FROM true THEN RAISE EXCEPTION 'Approve the financial changes before saving'; END IF;
INSERT INTO public.preference_approvals(id,owner_id,expected_revision,previous_data,approved_data,changed_sections,transaction_id) VALUES(_id,uid,_expected,previous,_data,sections,txid_current());
IF existed THEN UPDATE public.finance_preferences SET data=_data,updated_at=now() WHERE owner_id=uid RETURNING revision INTO rev;
ELSE INSERT INTO public.finance_preferences(owner_id,data,updated_at) VALUES(uid,_data,now()) RETURNING revision INTO rev; END IF;
UPDATE public.preference_approvals SET result_revision=rev WHERE id=_id; RETURN rev;
END $$;
REVOKE ALL ON FUNCTION public.save_reviewed_preferences(uuid,jsonb,bigint,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_reviewed_preferences(uuid,jsonb,bigint,boolean) TO authenticated;
COMMENT ON FUNCTION public.save_reviewed_preferences(uuid,jsonb,bigint,boolean) IS 'Reviewed owner preference saves with revision guards and retry-safe audit. Direct-write enforcement is staged until the compatible client is published.';