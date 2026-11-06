ALTER TABLE public.finance_preferences ADD COLUMN revision bigint NOT NULL DEFAULT 0;
CREATE FUNCTION public.bump_preferences_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.revision:=OLD.revision+1; NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER bump_preferences_revision BEFORE UPDATE ON public.finance_preferences FOR EACH ROW EXECUTE FUNCTION public.bump_preferences_revision();
CREATE TABLE public.document_intake_commits (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES public.finance_preferences(owner_id) ON DELETE CASCADE,
 document_id uuid NOT NULL, request jsonb NOT NULL, result_revision bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.document_intake_commits TO authenticated;
GRANT ALL ON public.document_intake_commits TO service_role;
ALTER TABLE public.document_intake_commits ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.document_intake_commits FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE FUNCTION public.commit_document_intake_reviewed(_id uuid,_document uuid,_data jsonb,_lock boolean,_expected bigint) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); rev bigint; doc public.documents; old public.document_intake_commits; req jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF _id IS NULL OR _document IS NULL OR jsonb_typeof(_data) IS DISTINCT FROM 'object' OR _lock IS NULL THEN RAISE EXCEPTION 'Invalid intake request'; END IF;
 SELECT revision INTO rev FROM public.finance_preferences WHERE owner_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Refresh owner records before saving'; END IF;
 req:=jsonb_build_object('document',_document,'data',_data,'lock',_lock);
 SELECT * INTO old FROM public.document_intake_commits WHERE id=_id;
 IF FOUND THEN
  IF old.owner_id<>uid OR old.request<>req THEN RAISE EXCEPTION 'Intake operation ID already used'; END IF;
  RETURN old.result_revision;
 END IF;
 IF rev IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Records changed; refresh and review the document again'; END IF;
 SELECT * INTO doc FROM public.documents WHERE id=_document AND owner_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owner document not found'; END IF;
 IF doc.evidence_locked THEN RAISE EXCEPTION 'Document evidence is locked; use a new reviewed correction'; END IF;
 UPDATE public.finance_preferences SET data=_data WHERE owner_id=uid RETURNING revision INTO rev;
 IF _lock THEN UPDATE public.documents SET evidence_locked=true WHERE id=_document AND owner_id=uid; END IF;
 INSERT INTO public.document_intake_commits(id,owner_id,document_id,request,result_revision) VALUES(_id,uid,_document,req,rev);
 RETURN rev;
END $$;
REVOKE ALL ON FUNCTION public.commit_document_intake_reviewed(uuid,uuid,jsonb,boolean,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commit_document_intake_reviewed(uuid,uuid,jsonb,boolean,bigint) TO authenticated;
-- Retire the unguarded browser operation without removing its signature.
REVOKE EXECUTE ON FUNCTION public.commit_document_intake(uuid,jsonb,boolean) FROM authenticated;