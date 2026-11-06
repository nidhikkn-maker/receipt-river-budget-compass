CREATE TABLE public.preference_approvals (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, expected_revision bigint,
 previous_data jsonb NOT NULL, approved_data jsonb NOT NULL,
 changed_sections text[] NOT NULL, transaction_id bigint NOT NULL,
 result_revision bigint, approved_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.preference_approvals TO authenticated;
GRANT ALL ON public.preference_approvals TO service_role;
ALTER TABLE public.preference_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.preference_approvals FOR SELECT TO authenticated USING(owner_id=auth.uid());

CREATE FUNCTION public.sensitive_preference_sections(_old jsonb,_new jsonb) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce(array_agg(k ORDER BY k),ARRAY[]::text[]) FROM (
 SELECT k FROM unnest(ARRAY['assets','entities','paymentInstruments','reimbursementProfiles']) k
 WHERE coalesce(_old->k,'null') IS DISTINCT FROM coalesce(_new->k,'null')
 UNION ALL SELECT 'books.'||k FROM unnest(ARRAY['policy','rules','fieldMappings','entityAccounts','fyRecords','properties','leases','propertyCosts','assetEvents','holdings','priceOverrides','goldRate','taxProfiles','entityTaxProfiles','taxCredits','taxDeductions','salaryEvidence','gstInvoices','gstFilings','loanBalances']) k
 WHERE coalesce(_old->'books'->k,'null') IS DISTINCT FROM coalesce(_new->'books'->k,'null')
 ) changed;
$$;

CREATE FUNCTION public.save_reviewed_preferences(_id uuid,_data jsonb,_expected bigint,_approved boolean)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); previous jsonb; rev bigint; old public.preference_approvals; sections text[];
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF _id IS NULL OR jsonb_typeof(_data) IS DISTINCT FROM 'object' OR octet_length(_data::text)>20000000 THEN RAISE EXCEPTION 'Invalid preference review'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 SELECT * INTO old FROM public.preference_approvals WHERE id=_id;
 IF FOUND THEN
   IF old.owner_id<>uid OR old.approved_data IS DISTINCT FROM _data OR old.expected_revision IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Review identifier already used for another change'; END IF;
   RETURN old.result_revision;
 END IF;
 SELECT data,revision INTO previous,rev FROM public.finance_preferences WHERE owner_id=uid FOR UPDATE;
 IF NOT FOUND THEN previous:='{}'; rev:=NULL; END IF;
 IF rev IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Records changed; refresh and review again'; END IF;
 sections:=public.sensitive_preference_sections(previous,_data);
 IF cardinality(sections)>0 AND _approved IS DISTINCT FROM true THEN RAISE EXCEPTION 'Approve the financial changes before saving'; END IF;
 INSERT INTO public.preference_approvals(id,owner_id,expected_revision,previous_data,approved_data,changed_sections,transaction_id)
 VALUES(_id,uid,_expected,previous,_data,sections,txid_current());
 INSERT INTO public.finance_preferences(owner_id,data,updated_at) VALUES(uid,_data,now())
 ON CONFLICT(owner_id) DO UPDATE SET data=excluded.data,updated_at=now() RETURNING revision INTO rev;
 UPDATE public.preference_approvals SET result_revision=rev WHERE id=_id;
 RETURN rev;
END $$;
REVOKE ALL ON FUNCTION public.save_reviewed_preferences(uuid,jsonb,bigint,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_reviewed_preferences(uuid,jsonb,bigint,boolean) TO authenticated;

CREATE FUNCTION public.guard_preference_approval() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous jsonb; rev bigint;
BEGIN
 IF current_setting('ledgerline.erasing',true)='on' THEN RETURN NEW; END IF;
 previous:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE OLD.data END;
 rev:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.revision END;
 IF cardinality(public.sensitive_preference_sections(previous,NEW.data))=0 THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.preference_approvals a WHERE a.owner_id=NEW.owner_id AND a.transaction_id=txid_current()
   AND a.expected_revision IS NOT DISTINCT FROM rev AND a.previous_data=previous AND a.approved_data=NEW.data) THEN RETURN NEW; END IF;
 -- Existing document review is already bound to the exact owner, payload and revision.
 IF auth.uid()=NEW.owner_id AND EXISTS(SELECT 1 FROM public.document_runs r WHERE r.owner_id=NEW.owner_id
   AND r.data->'intakeAttempt'->'data'=NEW.data AND (r.data->'intakeAttempt'->>'expected')::bigint=rev) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Financial registers and sensitive settings must be saved through a reviewed approval' USING ERRCODE='23514';
END $$;
CREATE TRIGGER guard_preference_approval BEFORE INSERT OR UPDATE ON public.finance_preferences FOR EACH ROW EXECUTE FUNCTION public.guard_preference_approval();

-- Preserve the confirmed, owner-scoped recovery function and its security-invoker boundary.
DO $$ DECLARE definition text; old_statement text:='UPDATE public.finance_preferences SET data=r->''data'',updated_at=now() WHERE owner_id=uid;';
BEGIN
 definition:=pg_get_functiondef('public.restore_finance_backup(jsonb,text)'::regprocedure);
 IF strpos(definition,old_statement)=0 THEN RAISE EXCEPTION 'Recovery integration changed; review before installing approval guard'; END IF;
 definition:=replace(definition,old_statement,'PERFORM public.save_reviewed_preferences(gen_random_uuid(),r->''data'',(SELECT revision FROM public.finance_preferences WHERE owner_id=uid),true);');
 EXECUTE definition;
END $$;