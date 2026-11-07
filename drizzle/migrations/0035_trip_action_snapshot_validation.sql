CREATE OR REPLACE FUNCTION public.manage_trip_expenses(_trip uuid, _items jsonb, _action text, _value text DEFAULT '') RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); t jsonb; e public.expenses%ROWTYPE; item jsonb; n integer:=0; tg text; next_tags text[];
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF _items IS NULL OR jsonb_typeof(_items)<>'array' OR jsonb_array_length(_items)<1 OR jsonb_array_length(_items)>500 THEN RAISE EXCEPTION 'Select between 1 and 500 expenses'; END IF;
 IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(_items) x)<>jsonb_array_length(_items) THEN RAISE EXCEPTION 'Select each expense once'; END IF;
 IF _action IS NULL OR _action NOT IN ('link','unlink','add_tag','organisation','reimbursable') THEN RAISE EXCEPTION 'Unsupported action'; END IF;
 IF _value IS NULL OR length(_value)>120 OR (_action IN ('add_tag','organisation') AND length(trim(_value))=0) THEN RAISE EXCEPTION 'Enter a value of 120 characters or less'; END IF;
 IF _action='add_tag' AND _value ILIKE 'Trip:%' THEN RAISE EXCEPTION 'Use Link trip to change trip associations'; END IF;
 SELECT x INTO t FROM public.finance_preferences p CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.data->'trips','[]')) x WHERE p.owner_id=uid AND x->>'id'=_trip::text FOR UPDATE OF p;
 IF t IS NULL OR t->>'closedAt' IS NOT NULL OR t->>'cancelledAt' IS NOT NULL THEN RAISE EXCEPTION 'Trip unavailable or closed'; END IF;
 tg:='Trip: '||(t->>'name');
 FOR item IN SELECT value FROM jsonb_array_elements(_items) ORDER BY value->>'id' LOOP
  SELECT * INTO e FROM public.expenses WHERE id=(item->>'id')::uuid AND employee_id=uid FOR UPDATE;
  IF NOT FOUND OR e.txn_type<>'expense' THEN RAISE EXCEPTION 'Expense unavailable'; END IF;
  IF jsonb_build_object('id',e.id,'tags',e.tags,'tripId',e.trip_id,'department',e.department,'amount',e.amount,'date',e.expense_date::text,'reimbursementStatus',e.reimbursement_status) IS DISTINCT FROM item THEN RAISE EXCEPTION 'An expense changed. Refresh and select again'; END IF;
  IF _action<>'link' AND NOT (COALESCE(e.trip_id=_trip,false) OR tg=ANY(e.tags)) THEN RAISE EXCEPTION 'Select expenses belonging to this trip'; END IF;
  IF _action='link' AND ((e.trip_id IS NOT NULL AND e.trip_id<>_trip) OR EXISTS(SELECT 1 FROM unnest(e.tags) z WHERE z LIKE 'Trip: %' AND z<>tg)) THEN RAISE EXCEPTION 'Expense already linked to another trip'; END IF;
  IF _action='unlink' AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(t->'bookings','[]')) b WHERE b->>'expenseId'=e.id::text OR COALESCE(b->'expenseIds','[]') ? e.id::text) THEN RAISE EXCEPTION 'Unlink the booking payment first'; END IF;
  next_tags:=e.tags;
  IF _action='link' THEN SELECT ARRAY(SELECT DISTINCT z FROM unnest(e.tags||ARRAY[tg]) z) INTO next_tags;
  ELSIF _action='unlink' THEN next_tags:=array_remove(e.tags,tg);
  ELSIF _action='add_tag' THEN SELECT ARRAY(SELECT DISTINCT z FROM unnest(e.tags||ARRAY[trim(_value)]) z) INTO next_tags;
  ELSIF _action='organisation' THEN SELECT ARRAY(SELECT z FROM unnest(e.tags) z WHERE z NOT LIKE 'Organisation: %')||ARRAY['Organisation: '||trim(_value)] INTO next_tags;
  ELSIF _action='reimbursable' THEN SELECT ARRAY(SELECT DISTINCT z FROM unnest(e.tags||ARRAY['Purpose: Reimbursable']) z) INTO next_tags;
  END IF;
  UPDATE public.expenses SET tags=next_tags, trip_id=CASE WHEN _action='link' THEN _trip WHEN _action='unlink' AND trip_id=_trip THEN NULL ELSE trip_id END, department=CASE WHEN _action='organisation' THEN trim(_value) ELSE department END WHERE id=e.id AND employee_id=uid;
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.manage_trip_expenses(uuid,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_trip_expenses(uuid,jsonb,text,text) TO authenticated;