CREATE OR REPLACE FUNCTION public.undo_financial_correction(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); batch public.financial_corrections; item jsonb; e public.expenses; old public.expenses;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 SELECT * INTO batch FROM public.financial_corrections WHERE id=_id AND owner_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Correction unavailable'; END IF;
 IF batch.request->>'kind'='review_metadata' THEN RAISE EXCEPTION 'Use mapping restoration for this batch'; END IF;
 IF batch.undone_at IS NOT NULL THEN RETURN; END IF;
 PERFORM 1 FROM public.accounts WHERE owner_id=uid ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.expenses WHERE employee_id=uid ORDER BY id FOR UPDATE;
 FOR item IN SELECT value FROM jsonb_array_elements(batch.entries) LOOP
  SELECT * INTO e FROM public.expenses WHERE id=(item->'after'->>'id')::uuid AND employee_id=uid;
  IF NOT FOUND OR e.correction_revision<>(item->'after'->>'correction_revision')::bigint THEN RAISE EXCEPTION 'Later edit prevents restoration'; END IF;
  old:=jsonb_populate_record(NULL::public.expenses,item->'before');
  IF EXISTS(SELECT 1 FROM public.accounts WHERE owner_id=uid AND id IN (old.account_id,old.to_account_id) AND archived) THEN RAISE EXCEPTION 'Original account is archived; review individually'; END IF;
  UPDATE public.expenses SET txn_type=old.txn_type,account_id=old.account_id,to_account_id=old.to_account_id,principal=old.principal,interest=old.interest,reconciled_at=old.reconciled_at,reconciled_by=old.reconciled_by WHERE id=e.id AND employee_id=uid;
 END LOOP;
 UPDATE public.financial_corrections SET undone_at=now() WHERE id=_id AND owner_id=uid;
END $$;
REVOKE ALL ON FUNCTION public.undo_financial_correction(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.undo_financial_correction(uuid) TO authenticated;