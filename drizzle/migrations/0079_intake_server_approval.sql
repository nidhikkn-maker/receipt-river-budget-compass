CREATE OR REPLACE FUNCTION public.commit_document_intake_reviewed(_id uuid,_document uuid,_data jsonb,_lock boolean,_expected bigint) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); rev bigint; doc public.documents; old public.document_intake_commits; req jsonb; previous jsonb; attempt jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF _id IS NULL OR _document IS NULL OR jsonb_typeof(_data) IS DISTINCT FROM 'object' OR _lock IS NULL THEN RAISE EXCEPTION 'Invalid intake request'; END IF;
 SELECT revision,data INTO rev,previous FROM public.finance_preferences WHERE owner_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Refresh owner records before saving'; END IF;
 req:=jsonb_build_object('document',_document,'data',_data,'lock',_lock);
 SELECT * INTO old FROM public.document_intake_commits WHERE id=_id;
 IF FOUND THEN IF old.owner_id<>uid OR old.request<>req THEN RAISE EXCEPTION 'Intake operation ID already used'; END IF; RETURN old.result_revision; END IF;
 SELECT r.data->'intakeAttempt' INTO attempt FROM public.document_runs r
   WHERE r.owner_id=uid AND r.data->'intakeAttempt'->>'id'=_id::text LIMIT 1;
 IF attempt IS NULL THEN RAISE EXCEPTION 'Review the document and approve the proposal before saving'; END IF;
 IF attempt->>'documentId' IS DISTINCT FROM _document::text
    OR attempt->'data' IS DISTINCT FROM _data
    OR (attempt->>'lock')::boolean IS DISTINCT FROM _lock
    OR (attempt->>'expected')::bigint IS DISTINCT FROM _expected THEN
   RAISE EXCEPTION 'This save does not match the approved review; refresh and review again';
 END IF;
 IF rev IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Records changed; refresh and review the document again'; END IF;
 SELECT * INTO doc FROM public.documents WHERE id=_document AND owner_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owner document not found'; END IF;
 IF doc.evidence_locked THEN RAISE EXCEPTION 'Document evidence is locked; use a new reviewed correction'; END IF;
 PERFORM public.validate_intake_records(previous,_data,doc.doc_type);
 UPDATE public.finance_preferences SET data=_data WHERE owner_id=uid RETURNING revision INTO rev;
 IF _lock THEN UPDATE public.documents SET evidence_locked=true WHERE id=_document AND owner_id=uid; END IF;
 INSERT INTO public.document_intake_commits(id,owner_id,document_id,request,result_revision) VALUES(_id,uid,_document,req,rev);
 RETURN rev; END $$;
REVOKE ALL ON FUNCTION public.commit_document_intake_reviewed(uuid,uuid,jsonb,boolean,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commit_document_intake_reviewed(uuid,uuid,jsonb,boolean,bigint) TO authenticated;