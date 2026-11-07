CREATE OR REPLACE FUNCTION public.commit_document_intake(p_document_id uuid, p_data jsonb, p_lock boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.documents WHERE id = p_document_id AND owner_id = uid) THEN
    RAISE EXCEPTION 'document not found';
  END IF;
  INSERT INTO public.finance_preferences (owner_id, data, updated_at) VALUES (uid, p_data, now())
  ON CONFLICT (owner_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now();
  IF p_lock THEN
    UPDATE public.documents SET evidence_locked = true WHERE id = p_document_id AND owner_id = uid;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.commit_document_intake(uuid, jsonb, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.commit_document_intake(uuid, jsonb, boolean) TO authenticated;