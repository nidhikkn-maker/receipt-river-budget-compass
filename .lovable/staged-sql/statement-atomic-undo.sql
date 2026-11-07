-- STAGED ONLY. Requires compatible caller and explicit release approval; never install on Live here.
-- Receives owner-read full snapshots, not client financial replacements. Any mismatch rolls back all rows.
CREATE TABLE public.statement_undo_receipts (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, request jsonb NOT NULL,
 completed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.statement_undo_receipts TO authenticated;
GRANT ALL ON public.statement_undo_receipts TO service_role;
ALTER TABLE public.statement_undo_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads statement Undo receipts" ON public.statement_undo_receipts
 FOR SELECT TO authenticated USING(owner_id=auth.uid());

CREATE FUNCTION public.undo_statement_rows(_id uuid, _items jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); prior public.statement_undo_receipts; item jsonb; row_now jsonb;
BEGIN
 IF uid IS NULL OR _id IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items) NOT BETWEEN 1 AND 3000
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(_items) x WHERE x->>'action' NOT IN ('delete','unreconcile') OR x->>'action' IS NULL)
 OR (SELECT count(DISTINCT x->'snapshot'->>'id') FROM jsonb_array_elements(_items) x)<>jsonb_array_length(_items)
 THEN RAISE EXCEPTION 'Invalid Undo manifest'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 SELECT * INTO prior FROM public.statement_undo_receipts WHERE id=_id FOR UPDATE;
 IF FOUND THEN
  IF prior.owner_id<>uid OR prior.request<>_items THEN RAISE EXCEPTION 'Undo identifier already used'; END IF;
  RETURN _id;
 END IF;
 -- Same ordering as existing finance operations; row locks protect against ordinary direct edits too.
 PERFORM 1 FROM public.accounts WHERE owner_id=uid ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.expenses WHERE employee_id=uid ORDER BY id FOR UPDATE;
 FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
  SELECT to_jsonb(e) INTO row_now FROM public.expenses e
   WHERE e.id=(item->'snapshot'->>'id')::uuid AND e.employee_id=uid;
  IF NOT FOUND OR row_now IS DISTINCT FROM item->'snapshot' THEN
   RAISE EXCEPTION 'Record changed; Undo retained for fresh review';
  END IF;
  IF row_now->>'statement_ref' IS DISTINCT FROM item->>'ref' THEN RAISE EXCEPTION 'Source evidence changed'; END IF;
  IF row_now->>'transfer_counterpart_of' IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.expenses e WHERE e.employee_id=uid
    AND e.transfer_counterpart_of=(item->'snapshot'->>'id')::uuid
  ) THEN RAISE EXCEPTION 'Linked transfer requires individual review'; END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
  IF item->>'action'='delete' THEN
   DELETE FROM public.expenses WHERE id=(item->'snapshot'->>'id')::uuid AND employee_id=uid;
  ELSE
   UPDATE public.expenses SET statement_ref=NULL,reconciled_at=NULL
    WHERE id=(item->'snapshot'->>'id')::uuid AND employee_id=uid;
  END IF;
 END LOOP;
 INSERT INTO public.statement_undo_receipts(id,owner_id,request) VALUES(_id,uid,_items);
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.undo_statement_rows(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.undo_statement_rows(uuid,jsonb) TO authenticated;