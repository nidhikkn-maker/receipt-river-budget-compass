-- STAGED ONLY. Do not install on production without explicit activation approval.
-- Independent of the staged financial approval trigger. Validates ALL preference writes.
CREATE OR REPLACE FUNCTION public.merchant_group_key(raw text, aliases jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE k text; seen text[] := '{}'; words text[];
BEGIN
 LOOP
  raw := regexp_replace(lower(raw), '\m(upi|pos|imps|neft|ach|vps|ecom|pvt|ltd|limited|india|inc|llp|www|com|in)\M', ' ', 'g');
  words := regexp_split_to_array(btrim(regexp_replace(raw,'[^a-z]+',' ','g')), '\s+');
  k := array_to_string(words[1:3], ' ');
  IF k=ANY(seen) OR coalesce(aliases->>k,'')='' THEN RETURN k; END IF;
  seen := array_append(seen,k); raw := aliases->>k;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.guard_budget_merchant_authority() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior jsonb; trip jsonb; dimension text; field text; line jsonb; total numeric; budget numeric;
 old_history jsonb; new_history jsonb; old_aliases jsonb; new_aliases jsonb; event jsonb;
 old_count int; new_count int; i int; original jsonb; original_index int; later jsonb; k text;
 restored jsonb; changed_keys text[]; affected jsonb; records jsonb;
BEGIN
 prior := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE OLD.data END;
 -- Erasure is the existing authenticated atomic cleanup path, never a bypass for ordinary writes.
 IF current_setting('ledgerline.erasing',true)='on' THEN RETURN NEW; END IF;
 FOR trip IN SELECT value FROM jsonb_array_elements(coalesce(NEW.data->'trips','[]')) LOOP
  -- Existing untouched legacy plans do not block unrelated settings or require a migration of records.
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(prior->'trips','[]')) x
    WHERE x->>'id'=trip->>'id' AND x=trip) THEN CONTINUE; END IF;
  FOR dimension IN SELECT jsonb_array_elements_text(coalesce(trip->'completeBudgetDimensions','[]')) LOOP
   field := CASE dimension WHEN 'workspace' THEN 'workspaceBudgets' WHEN 'traveller' THEN 'travellerBudgets'
    WHEN 'category' THEN 'budgetLines' WHEN 'currency' THEN 'currencyBudgets' WHEN 'organisation' THEN 'organisationBudgets' END;
   IF field IS NULL OR jsonb_typeof(trip->'budget') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid complete budget dimension'; END IF;
   budget := round((trip->>'budget')::numeric,2); total := 0;
   FOR line IN SELECT value FROM jsonb_array_elements(coalesce(trip->field,'[]')) LOOP
    IF jsonb_typeof(line->'amount') IS DISTINCT FROM 'number' OR (line->>'amount')::numeric<=0 THEN RAISE EXCEPTION 'Invalid budget allocation'; END IF;
    IF dimension='currency' THEN
     IF jsonb_typeof(line->'planningRate') IS DISTINCT FROM 'number' OR (line->>'planningRate')::numeric<=0 THEN RAISE EXCEPTION 'Invalid planning exchange rate'; END IF;
     total := total + round((line->>'amount')::numeric*(line->>'planningRate')::numeric,2);
    ELSE total := total + (line->>'amount')::numeric; END IF;
   END LOOP;
   IF budget<=0 OR round(total,2)<>budget THEN RAISE EXCEPTION 'Complete % allocation must match the primary budget',dimension USING ERRCODE='23514'; END IF;
  END LOOP;
 END LOOP;
 old_history := coalesce(prior->'merchantGroupingHistory','[]'); new_history := coalesce(NEW.data->'merchantGroupingHistory','[]');
 old_aliases := coalesce(prior->'merchantAliases','{}'); new_aliases := coalesce(NEW.data->'merchantAliases','{}');
 IF old_history=new_history AND old_aliases=new_aliases THEN RETURN NEW; END IF;
 IF jsonb_typeof(old_history)<>'array' OR jsonb_typeof(new_history)<>'array' OR jsonb_typeof(new_aliases)<>'object' THEN RAISE EXCEPTION 'Invalid merchant history'; END IF;
 old_count := jsonb_array_length(old_history); new_count := jsonb_array_length(new_history);
 IF new_count<>old_count+1 THEN RAISE EXCEPTION 'Merchant history is append-only; review one change at a time'; END IF;
 FOR i IN 0..old_count-1 LOOP
  IF old_history->i IS DISTINCT FROM new_history->i THEN RAISE EXCEPTION 'Saved merchant history cannot be edited'; END IF;
 END LOOP;
 event := new_history->old_count;
 IF event->'before' IS DISTINCT FROM old_aliases OR event->'after' IS DISTINCT FROM new_aliases OR old_aliases=new_aliases
  OR coalesce(event->>'id','')='' OR coalesce(event->>'date','')='' OR coalesce(event->>'title','')=''
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(old_history) x WHERE x->>'id'=event->>'id') THEN RAISE EXCEPTION 'Merchant review does not match current saved groups'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(new_aliases) x WHERE jsonb_typeof(x.value)<>'string') THEN RAISE EXCEPTION 'Invalid merchant alias'; END IF;
 -- Stored originals and new arrivals are read at commit, not trusted from the browser preview.
 SELECT coalesce(jsonb_agg(to_jsonb(e.id::text) ORDER BY e.id::text),'[]'),
  coalesce(jsonb_agg(jsonb_build_object('id',e.id::text,'merchant',e.merchant,'amount',e.amount,
   'date',e.expense_date::text,'currency',e.currency,'originalAmount',coalesce(e.original_amount,e.amount),'title',e.title) ORDER BY e.id::text),'[]')
 INTO affected,records FROM public.expenses e WHERE e.employee_id=NEW.owner_id AND e.merchant IS NOT NULL
  AND public.merchant_group_key(e.merchant,old_aliases) IS DISTINCT FROM public.merchant_group_key(e.merchant,new_aliases);
 IF affected IS DISTINCT FROM (SELECT coalesce(jsonb_agg(x ORDER BY x::text),'[]') FROM jsonb_array_elements(event->'entryIds') x)
  OR records IS DISTINCT FROM event->'entrySnapshot' THEN RAISE EXCEPTION 'Affected merchant records changed; refresh and review again'; END IF;
 IF event ? 'reverses' THEN
  SELECT value,(ordinality-1)::int INTO original,original_index FROM jsonb_array_elements(old_history) WITH ORDINALITY WHERE value->>'id'=event->>'reverses';
  IF original IS NULL OR original ? 'reverses' OR EXISTS(SELECT 1 FROM jsonb_array_elements(old_history) x WHERE x->>'reverses'=event->>'reverses') THEN RAISE EXCEPTION 'Invalid or already reversed merchant change'; END IF;
  SELECT coalesce(array_agg(key),'{}') INTO changed_keys FROM (
   SELECT key FROM jsonb_object_keys(original->'before'||original->'after') key
   WHERE original->'before'->key IS DISTINCT FROM original->'after'->key) keys;
  restored := old_aliases;
  FOREACH k IN ARRAY changed_keys LOOP
   IF old_aliases->k IS DISTINCT FROM original->'after'->k THEN RAISE EXCEPTION 'Merchant group changed later'; END IF;
   FOR later IN SELECT value FROM jsonb_array_elements(old_history) WITH ORDINALITY WHERE ordinality>original_index+1 LOOP
    IF later->'before'->k IS DISTINCT FROM later->'after'->k THEN RAISE EXCEPTION 'Merchant group was edited after this merge'; END IF;
   END LOOP;
   restored := restored-k;
   IF original->'before' ? k THEN restored:=restored||jsonb_build_object(k,original->'before'->k); END IF;
  END LOOP;
  FOR k IN SELECT jsonb_object_keys(old_aliases) LOOP
   IF NOT k=ANY(changed_keys) AND old_aliases->k IS DISTINCT FROM original->'before'->k
    AND public.merchant_group_key(k,old_aliases) IS DISTINCT FROM public.merchant_group_key(k,restored) THEN RAISE EXCEPTION 'A newer merchant group depends on this merge'; END IF;
  END LOOP;
  IF restored IS DISTINCT FROM new_aliases THEN RAISE EXCEPTION 'Reversal must restore the original groups exactly'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_budget_merchant_authority() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_budget_merchant_authority BEFORE INSERT OR UPDATE ON public.finance_preferences
 FOR EACH ROW EXECUTE FUNCTION public.guard_budget_merchant_authority();