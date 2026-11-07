CREATE TABLE public.opening_postings (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  entity_id text NOT NULL,
  fy text NOT NULL,
  opening_date date NOT NULL,
  lines jsonb NOT NULL DEFAULT '[]',
  exceptions jsonb NOT NULL DEFAULT '[]',
  txn_ids uuid[] NOT NULL DEFAULT '{}',
  source_doc_id uuid,
  posted_at timestamptz NOT NULL DEFAULT now(),
  posted_by uuid NOT NULL DEFAULT auth.uid(),
  undone_at timestamptz,
  undone_by uuid
);
CREATE UNIQUE INDEX opening_postings_active ON public.opening_postings(owner_id, entity_id, fy) WHERE undone_at IS NULL;
GRANT SELECT ON public.opening_postings TO authenticated;
GRANT ALL ON public.opening_postings TO service_role;
ALTER TABLE public.opening_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read opening postings" ON public.opening_postings FOR SELECT TO authenticated USING (owner_id = auth.uid());

-- Posts dated opening entries for one entity/year in one transaction; repeating the same id is a no-op.
CREATE OR REPLACE FUNCTION public.post_opening_balances(_id uuid, _entity text, _fy text, _date date, _lines jsonb, _exceptions jsonb, _doc uuid)
RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); l jsonb; ids uuid[] := '{}'; existing uuid[]; tid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  SELECT txn_ids INTO existing FROM public.opening_postings WHERE id = _id AND owner_id = uid;
  IF FOUND THEN RETURN existing; END IF;
  IF EXISTS (SELECT 1 FROM public.opening_postings WHERE owner_id = uid AND entity_id = _entity AND fy = _fy AND undone_at IS NULL) THEN
    RAISE EXCEPTION 'Opening balances for this year are already posted — undo them first';
  END IF;
  IF _doc IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.documents WHERE id = _doc AND owner_id = uid) THEN RAISE EXCEPTION 'Source document not found'; END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = (l->>'accountId')::uuid AND owner_id = uid) THEN RAISE EXCEPTION 'Account not found'; END IF;
    IF NOT ((l->>'amount')::numeric > 0) OR (l->>'sign')::int NOT IN (1, -1) THEN RAISE EXCEPTION 'Invalid opening amount'; END IF;
    tid := (l->>'txnId')::uuid;
    INSERT INTO public.expenses(id, employee_id, title, merchant, category, amount, expense_date, description, currency, payment_method, scope, txn_type, account_id, adjustment_sign, tags)
    VALUES (tid, uid, left(l->>'title', 200), NULL, 'Adjustment', (l->>'amount')::numeric, _date, left(coalesce(l->>'description', ''), 2000), 'INR', 'other', 'business', 'adjustment', (l->>'accountId')::uuid, (l->>'sign')::int, ARRAY['Opening balance FY ' || _fy]);
    ids := ids || tid;
  END LOOP;
  INSERT INTO public.opening_postings(id, owner_id, entity_id, fy, opening_date, lines, exceptions, txn_ids, source_doc_id, posted_by)
  VALUES (_id, uid, _entity, _fy, _date, _lines, coalesce(_exceptions, '[]'), ids, _doc, uid);
  RETURN ids;
END $$;

-- Undo removes exactly the entries that posting created, only while none were edited afterwards.
CREATE OR REPLACE FUNCTION public.undo_opening_balances(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); p public.opening_postings;
BEGIN
  SELECT * INTO p FROM public.opening_postings WHERE id = _id AND owner_id = uid AND undone_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nothing to undo'; END IF;
  IF EXISTS (SELECT 1 FROM public.expenses WHERE id = ANY(p.txn_ids) AND (updated_at > p.posted_at + interval '5 seconds' OR employee_id <> uid)) THEN
    RAISE EXCEPTION 'An opening entry was edited after posting — change it directly instead';
  END IF;
  DELETE FROM public.expenses WHERE id = ANY(p.txn_ids) AND employee_id = uid;
  UPDATE public.opening_postings SET undone_at = now(), undone_by = uid WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.post_opening_balances(uuid, text, text, date, jsonb, jsonb, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.undo_opening_balances(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.post_opening_balances(uuid, text, text, date, jsonb, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_opening_balances(uuid) TO authenticated;