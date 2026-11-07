CREATE TABLE public.family_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  member_id uuid NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  accepted_by uuid,
  accepted_at timestamptz,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_invites TO authenticated;
GRANT ALL ON public.family_invites TO service_role;
ALTER TABLE public.family_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their invites" ON public.family_invites FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid() AND EXISTS (SELECT 1 FROM public.family_members m WHERE m.id = member_id AND m.owner_id = auth.uid()));

CREATE TABLE public.family_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  requester_id uuid NOT NULL,
  invite_id uuid NOT NULL REFERENCES public.family_invites(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  amount numeric(14,2) NOT NULL CHECK (amount > 0 AND amount < 100000000),
  category text NOT NULL DEFAULT 'Miscellaneous' CHECK (length(category) <= 60),
  needed_by date,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  evidence_path text,
  evidence_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','withdrawn')),
  decision_note text NOT NULL DEFAULT '' CHECK (length(decision_note) <= 500),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.family_requests TO authenticated;
GRANT ALL ON public.family_requests TO service_role;
ALTER TABLE public.family_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Requester or owner reads requests" ON public.family_requests FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR owner_id = auth.uid());
CREATE POLICY "Linked members send requests" ON public.family_requests FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = auth.uid() AND status = 'pending' AND decided_at IS NULL AND decision_note = ''
    AND (evidence_path IS NULL OR evidence_path LIKE auth.uid()::text || '/requests/%')
    AND EXISTS (SELECT 1 FROM public.family_invites i WHERE i.id = invite_id AND i.owner_id = family_requests.owner_id AND i.accepted_by = auth.uid() AND NOT i.revoked)
  );

CREATE OR REPLACE FUNCTION public.my_family_invites()
RETURNS TABLE (id uuid, member_name text, inviter_email text, accepted boolean, revoked boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, m.name, u.email::text, i.accepted_by IS NOT NULL, i.revoked
  FROM public.family_invites i
  JOIN public.family_members m ON m.id = i.member_id
  JOIN auth.users u ON u.id = i.owner_id
  WHERE i.owner_id <> auth.uid()
    AND ((i.accepted_by IS NULL AND i.email = (SELECT lower(email) FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL))
      OR i.accepted_by = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.my_family_invites() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_family_invites() TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_family_invite(_invite uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE my_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT lower(email) INTO my_email FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;
  IF my_email IS NULL THEN RAISE EXCEPTION 'Confirm your email address first'; END IF;
  UPDATE public.family_invites SET accepted_by = auth.uid(), accepted_at = now()
   WHERE id = _invite AND email = my_email AND accepted_by IS NULL AND NOT revoked AND owner_id <> auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'This invitation is not available'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.accept_family_invite(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_family_invite(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_family_request(_id uuid, _status text, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF _status IN ('approved','declined') THEN
    UPDATE public.family_requests SET status = _status, decision_note = left(coalesce(_note,''), 500), decided_at = now()
     WHERE id = _id AND owner_id = auth.uid() AND status = 'pending';
  ELSIF _status = 'withdrawn' THEN
    UPDATE public.family_requests SET status = 'withdrawn', decided_at = now()
     WHERE id = _id AND requester_id = auth.uid() AND status = 'pending';
  ELSE RAISE EXCEPTION 'Unknown decision'; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'This request was already decided'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.decide_family_request(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.decide_family_request(uuid, text, text) TO authenticated;

CREATE POLICY "Owners read family request evidence" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND EXISTS (SELECT 1 FROM public.family_requests r WHERE r.evidence_path = storage.objects.name AND r.owner_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.delete_my_finance_data()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 DELETE FROM public.family_requests WHERE owner_id=uid OR requester_id=uid;
 DELETE FROM public.family_invites WHERE owner_id=uid;
 UPDATE public.family_invites SET accepted_by=NULL, accepted_at=NULL, revoked=true WHERE accepted_by=uid;
 DELETE FROM public.documents WHERE owner_id=uid;
 DELETE FROM public.asset_valuations WHERE owner_id=uid;
 DELETE FROM public.loans WHERE owner_id=uid;
 DELETE FROM public.expenses WHERE employee_id=uid;
 DELETE FROM public.commitments WHERE owner_id=uid;
 DELETE FROM public.goals WHERE owner_id=uid;
 DELETE FROM public.category_budgets WHERE owner_id=uid;
 DELETE FROM public.accounts WHERE owner_id=uid;
 DELETE FROM public.family_members WHERE owner_id=uid;
 DELETE FROM public.finance_preferences WHERE owner_id=uid;
 DELETE FROM public.push_subscriptions WHERE owner_id=uid;
 DELETE FROM public.push_reminder_log WHERE owner_id=uid;
 DELETE FROM public.transaction_audit WHERE owner_id=uid;
 DELETE FROM public.finance_operations WHERE owner_id=uid;
 DELETE FROM public.monthly_reviews WHERE owner_id=uid;
 DELETE FROM public.category_batches WHERE owner_id=uid;
 DELETE FROM public.statement_line_imports WHERE owner_id=uid;
END $function$;