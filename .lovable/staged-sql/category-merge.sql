-- STAGED ONLY. Do not install until compatible client and access-change approval.
-- Uses owner preference lock + exact full-record preview; no monetary columns are changed.
CREATE TABLE public.category_merge_operations(id uuid PRIMARY KEY, owner_id uuid NOT NULL, request jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.category_merge_operations TO authenticated;
GRANT ALL ON public.category_merge_operations TO service_role;
ALTER TABLE public.category_merge_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.category_merge_operations FOR SELECT TO authenticated USING(owner_id=auth.uid());

CREATE FUNCTION public.preview_category_merge(_source text,_target text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); p public.finance_preferences; result jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF _source IS NULL OR _target IS NULL OR _source=_target OR length(_target)>60 OR trim(_target)='' THEN RAISE EXCEPTION 'Choose distinct categories'; END IF;
 SELECT * INTO p FROM public.finance_preferences WHERE owner_id=uid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Refresh preferences'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(p.data->'categories') c WHERE c->>'name'=_source)<>1 OR
    (SELECT count(*) FROM jsonb_array_elements(p.data->'categories') c WHERE c->>'name'=_target AND coalesce((c->>'archived')::boolean,false)=false)<>1 THEN RAISE EXCEPTION 'Choose existing active target'; END IF;
 -- Include all owner rows, so newly introduced references also invalidate the preview.
 SELECT jsonb_build_object('source',_source,'target',_target,'revision',p.revision,'preferences',p.data,
  'entries',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.expenses e WHERE e.employee_id=uid),'[]'::jsonb),
  'commitments',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.commitments c WHERE c.owner_id=uid),'[]'::jsonb),
  'monthlyBudgets',coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.category) FROM public.category_budgets b WHERE b.owner_id=uid),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.preview_category_merge(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_category_merge(text,text) TO authenticated;

CREATE FUNCTION public.commit_category_merge(_id uuid,_preview jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); old public.category_merge_operations; src_category text:=_preview->>'source'; dst_category text:=_preview->>'target'; current_plan jsonb; p jsonb; result jsonb; count_entries integer;
BEGIN
 IF uid IS NULL OR _id IS NULL OR jsonb_typeof(_preview) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid category review'; END IF;
 PERFORM owner_id FROM public.finance_preferences WHERE owner_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Refresh preferences'; END IF;
 SELECT * INTO old FROM public.category_merge_operations WHERE id=_id;
 IF FOUND THEN
  IF old.owner_id<>uid OR old.request<>_preview THEN RAISE EXCEPTION 'Operation ID already used'; END IF;
  RETURN old.result;
 END IF;
 -- Locks preserve a stable snapshot until every category reference has been moved.
 PERFORM id FROM public.expenses WHERE employee_id=uid ORDER BY id FOR UPDATE;
 PERFORM id FROM public.commitments WHERE owner_id=uid ORDER BY id FOR UPDATE;
 PERFORM category FROM public.category_budgets WHERE owner_id=uid ORDER BY category FOR UPDATE;
 current_plan:=public.preview_category_merge(src_category,dst_category);
 IF current_plan<>_preview THEN RAISE EXCEPTION 'Records changed; refresh and review again'; END IF;
 UPDATE public.expenses e SET category=CASE WHEN category=src_category THEN dst_category ELSE category END,
  allocations=(SELECT coalesce(jsonb_agg(CASE WHEN a->>'category'=src_category THEN jsonb_set(a,'{category}',to_jsonb(dst_category)) ELSE a END ORDER BY ord),'[]'::jsonb)
   FROM jsonb_array_elements(e.allocations) WITH ORDINALITY x(a,ord))
 WHERE employee_id=uid AND (category=src_category OR EXISTS(SELECT 1 FROM jsonb_array_elements(e.allocations) a WHERE a->>'category'=src_category));
 GET DIAGNOSTICS count_entries=ROW_COUNT;
 UPDATE public.commitments SET category=dst_category WHERE owner_id=uid AND category=src_category;
 INSERT INTO public.category_budgets(owner_id,category,monthly_amount)
 SELECT uid,dst_category,monthly_amount FROM public.category_budgets WHERE owner_id=uid AND category=src_category
 ON CONFLICT(owner_id,category) DO UPDATE SET monthly_amount=public.category_budgets.monthly_amount+excluded.monthly_amount;
 DELETE FROM public.category_budgets WHERE owner_id=uid AND category=src_category;
 p:=_preview->'preferences';
 p:=jsonb_set(p,'{categories}',(SELECT coalesce(jsonb_agg(c ORDER BY ord),'[]'::jsonb) FROM jsonb_array_elements(p->'categories') WITH ORDINALITY x(c,ord) WHERE c->>'name'<>src_category));
 -- Scoped budgets retain independent IDs/periods/amounts, never sum unlike plans.
 p:=jsonb_set(p,'{budgets}',(SELECT coalesce(jsonb_agg(CASE WHEN b->>'kind'='category' AND b->>'value'=src_category THEN jsonb_set(b,'{value}',to_jsonb(dst_category)) ELSE b END ORDER BY ord),'[]'::jsonb) FROM jsonb_array_elements(coalesce(p->'budgets','[]')) WITH ORDINALITY x(b,ord)));
 -- Preserve trip category plan amounts and unrelated trip fields.
 p:=jsonb_set(p,'{trips}',(SELECT coalesce(jsonb_agg(CASE WHEN t ? 'budgetLines' THEN jsonb_set(t,'{budgetLines}',(SELECT coalesce(jsonb_agg(CASE WHEN b->>'category'=src_category THEN jsonb_set(b,'{category}',to_jsonb(dst_category)) ELSE b END ORDER BY n),'[]'::jsonb) FROM jsonb_array_elements(t->'budgetLines') WITH ORDINALITY y(b,n))) ELSE t END ORDER BY ord),'[]'::jsonb) FROM jsonb_array_elements(coalesce(p->'trips','[]')) WITH ORDINALITY x(t,ord)));
 UPDATE public.finance_preferences SET data=p WHERE owner_id=uid;
 result:=jsonb_build_object('entries',count_entries,'revision',(SELECT revision FROM public.finance_preferences WHERE owner_id=uid));
 INSERT INTO public.category_merge_operations(id,owner_id,request,result) VALUES(_id,uid,_preview,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.commit_category_merge(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commit_category_merge(uuid,jsonb) TO authenticated;