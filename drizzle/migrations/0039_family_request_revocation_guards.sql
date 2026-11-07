ALTER POLICY "Requester or owner reads requests" ON public.family_requests USING (owner_id = auth.uid() OR (requester_id = auth.uid() AND public.family_invite_owner(invite_id) = owner_id));
ALTER POLICY "Linked members send requests" ON public.family_requests WITH CHECK (requester_id = auth.uid() AND status = 'pending' AND decided_at IS NULL AND decision_note = '' AND (evidence_path IS NULL OR evidence_path LIKE auth.uid()::text || '/requests/%') AND public.family_invite_owner(invite_id) = owner_id);
CREATE OR REPLACE FUNCTION public.decide_family_request(_id uuid, _status text, _note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
IF _status IN ('approved','declined') THEN
UPDATE public.family_requests SET status = _status, decision_note = left(coalesce(_note,''), 500), decided_at = now() WHERE id = _id AND owner_id = auth.uid() AND status = 'pending';
ELSIF _status = 'withdrawn' THEN
UPDATE public.family_requests SET status = 'withdrawn', decided_at = now() WHERE id = _id AND requester_id = auth.uid() AND status = 'pending' AND public.family_invite_owner(invite_id) = owner_id;
ELSE RAISE EXCEPTION 'Unknown decision'; END IF;
IF NOT FOUND THEN RAISE EXCEPTION 'This request is unavailable or already decided'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.decide_family_request(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.decide_family_request(uuid, text, text) TO authenticated;