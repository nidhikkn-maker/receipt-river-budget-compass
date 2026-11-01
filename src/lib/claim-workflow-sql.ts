// Additive V5.7 schema; also executed by isolated PGlite acceptance tests before Cloud application.
export const claimWorkflowSql = `
CREATE TABLE public.claim_preparations (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, data jsonb NOT NULL DEFAULT '{}', revision integer NOT NULL DEFAULT 1,
 mutation_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT claim_preparation_owner FOREIGN KEY(owner_id) REFERENCES public.finance_preferences(owner_id) ON DELETE CASCADE
);
GRANT SELECT,DELETE ON public.claim_preparations TO authenticated;
GRANT ALL ON public.claim_preparations TO service_role;
ALTER TABLE public.claim_preparations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads claim preparations" ON public.claim_preparations FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE POLICY "Owner deletes claim preparations" ON public.claim_preparations FOR DELETE TO authenticated USING(owner_id=auth.uid());
CREATE INDEX claim_preparations_owner_updated ON public.claim_preparations(owner_id,updated_at DESC);

CREATE TABLE public.reimbursement_config_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES public.finance_preferences(owner_id) ON DELETE CASCADE,
 action text NOT NULL, changed_sections jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reimbursement_config_audit TO authenticated;
GRANT ALL ON public.reimbursement_config_audit TO service_role;
ALTER TABLE public.reimbursement_config_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads reimbursement configuration audit" ON public.reimbursement_config_audit FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE FUNCTION public.log_reimbursement_config() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous jsonb; current_data jsonb; sections jsonb; BEGIN
 previous:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE COALESCE(OLD.data->'reimbursementSettings','{}') END;
 current_data:=COALESCE(NEW.data->'reimbursementSettings','{}');
 IF previous IS DISTINCT FROM current_data THEN
  SELECT COALESCE(jsonb_agg(k),'[]') INTO sections FROM (SELECT DISTINCT jsonb_object_keys(previous||current_data) k) keys WHERE previous->k IS DISTINCT FROM current_data->k;
  INSERT INTO public.reimbursement_config_audit(owner_id,action,changed_sections) VALUES(NEW.owner_id,'configuration_updated',sections);
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER reimbursement_config_audit AFTER INSERT OR UPDATE OF data ON public.finance_preferences FOR EACH ROW EXECUTE FUNCTION public.log_reimbursement_config();

CREATE FUNCTION public.save_claim_preparation(_id uuid,_data jsonb,_expected integer,_mutation uuid) RETURNS public.claim_preparations LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); existing public.claim_preparations; result public.claim_preparations; BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF _id IS NULL OR _mutation IS NULL OR _expected IS NULL OR _expected<0 OR jsonb_typeof(_data) IS DISTINCT FROM 'object' OR octet_length(_data::text)>200000 THEN RAISE EXCEPTION 'Invalid claim preparation'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_id::text,0));
 SELECT * INTO existing FROM public.claim_preparations WHERE id=_id FOR UPDATE;
 IF FOUND THEN
  IF existing.owner_id<>uid THEN RAISE EXCEPTION 'Preparation unavailable'; END IF;
  IF existing.mutation_id=_mutation THEN RETURN existing; END IF;
  IF existing.revision<>_expected THEN RAISE EXCEPTION 'Preparation changed on another device. Reload before saving'; END IF;
  UPDATE public.claim_preparations SET data=_data,revision=revision+1,mutation_id=_mutation,updated_at=now() WHERE id=_id AND owner_id=uid RETURNING * INTO result;
 ELSE
  IF _expected<>0 THEN RAISE EXCEPTION 'Preparation unavailable or removed'; END IF;
  INSERT INTO public.finance_preferences(owner_id,data) VALUES(uid,'{}') ON CONFLICT(owner_id) DO NOTHING;
  INSERT INTO public.claim_preparations(id,owner_id,data,mutation_id) VALUES(_id,uid,_data,_mutation) RETURNING * INTO result;
 END IF; RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_claim_preparation(uuid,jsonb,integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_claim_preparation(uuid,jsonb,integer,uuid) TO authenticated;

CREATE FUNCTION public.link_activity_expenses(_tag text,_items jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); e public.expenses%ROWTYPE; item jsonb; n integer:=0; BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF _tag IS NULL OR _tag !~ '^(Project|Event|Purpose|Client): .+' OR length(_tag)>120 THEN RAISE EXCEPTION 'Choose an activity tag'; END IF;
 IF jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items)<1 OR jsonb_array_length(_items)>500 THEN RAISE EXCEPTION 'Select 1 to 500 expenses'; END IF;
 IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(_items) x)<>jsonb_array_length(_items) THEN RAISE EXCEPTION 'Select each expense once'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_preferences p CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.data->'tags','[]')) t WHERE p.owner_id=uid AND t->>'group'||': '|| (t->>'name')=_tag)
 AND NOT EXISTS(SELECT 1 FROM public.expenses WHERE employee_id=uid AND _tag=ANY(tags)) THEN RAISE EXCEPTION 'Activity unavailable'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(_items) ORDER BY value->>'id' LOOP
  SELECT * INTO e FROM public.expenses WHERE id=(item->>'id')::uuid AND employee_id=uid FOR UPDATE;
  IF NOT FOUND OR e.txn_type<>'expense' THEN RAISE EXCEPTION 'Expense unavailable'; END IF;
  IF jsonb_build_object('id',e.id,'tags',e.tags,'tripId',e.trip_id,'department',e.department,'amount',e.amount,'date',e.expense_date::text,'reimbursementStatus',e.reimbursement_status) IS DISTINCT FROM item THEN RAISE EXCEPTION 'An expense changed. Refresh and select again'; END IF;
  UPDATE public.expenses SET tags=ARRAY(SELECT DISTINCT z FROM unnest(e.tags||ARRAY[_tag]) z) WHERE id=e.id AND employee_id=uid;
  n:=n+1;
 END LOOP; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.link_activity_expenses(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.link_activity_expenses(text,jsonb) TO authenticated;
COMMENT ON TABLE public.claim_preparations IS 'Owner-only report configuration drafts; never ledger entries or submissions. Revision checks reject stale writes.';
COMMENT ON TABLE public.reimbursement_config_audit IS 'Owner-only section-level configuration audit; no copied employment or bank details.';
`;