-- STAGED ONLY: isolated acceptance. Do not install on production without access/deployment approval.
CREATE TABLE public.accounting_review_grants (
 owner_id uuid NOT NULL, accountant_id uuid NOT NULL, entity_id text NOT NULL,
 revoked_at timestamptz, PRIMARY KEY(owner_id,accountant_id,entity_id)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.accounting_review_grants TO authenticated;
GRANT ALL ON public.accounting_review_grants TO service_role;
ALTER TABLE public.accounting_review_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_grants ON public.accounting_review_grants TO authenticated USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
CREATE POLICY accountant_own_grant ON public.accounting_review_grants FOR SELECT TO authenticated USING(accountant_id=auth.uid());
CREATE TABLE public.accounting_journal_evidence (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, entity_id text NOT NULL, request_id uuid UNIQUE NOT NULL,
 journal jsonb NOT NULL, entry_ids uuid[] NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), actor_id uuid NOT NULL
);
GRANT SELECT ON public.accounting_journal_evidence TO authenticated;
GRANT ALL ON public.accounting_journal_evidence TO service_role;
ALTER TABLE public.accounting_journal_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_evidence ON public.accounting_journal_evidence FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE POLICY accountant_evidence ON public.accounting_journal_evidence FOR SELECT TO authenticated USING(EXISTS(
 SELECT 1 FROM public.accounting_review_grants g WHERE g.owner_id=accounting_journal_evidence.owner_id AND g.entity_id=accounting_journal_evidence.entity_id AND g.accountant_id=auth.uid() AND g.revoked_at IS NULL));
CREATE TABLE public.accounting_exception_reviews (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, entity_id text NOT NULL, journal_id uuid NOT NULL REFERENCES public.accounting_journal_evidence(id),
 finding text NOT NULL, note text NOT NULL, actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.accounting_exception_reviews TO authenticated;
GRANT ALL ON public.accounting_exception_reviews TO service_role;
ALTER TABLE public.accounting_exception_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_reviews ON public.accounting_exception_reviews FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE POLICY accountant_reviews ON public.accounting_exception_reviews FOR SELECT TO authenticated USING(EXISTS(
 SELECT 1 FROM public.accounting_review_grants g WHERE g.owner_id=accounting_exception_reviews.owner_id AND g.entity_id=accounting_exception_reviews.entity_id AND g.accountant_id=auth.uid() AND g.revoked_at IS NULL));

CREATE FUNCTION public.post_accounting_journal(_request uuid,_journal jsonb,_expected bigint) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); prefs jsonb; rev bigint; ent text:=_journal->>'entityId'; dt date;
 jid uuid:=(_journal->>'id')::uuid; previous public.accounting_journal_evidence;
 l jsonb; a public.accounts; deb numeric:=0; cred numeric:=0; n int:=0; ids uuid[]:='{}'; tid uuid;
 primary_entry boolean:=true; linked int:=0; sign int; amount numeric; prior public.accounting_journal_evidence;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 SELECT data,revision INTO prefs,rev FROM public.finance_preferences WHERE owner_id=uid FOR UPDATE;
 IF prefs IS NULL THEN RAISE EXCEPTION 'Owner preferences not found'; END IF;
 SELECT * INTO previous FROM public.accounting_journal_evidence WHERE id=jid OR request_id=_request;
 IF FOUND THEN
  IF previous.owner_id<>uid OR previous.id<>jid OR previous.request_id<>_request OR previous.journal<>_journal THEN RAISE EXCEPTION 'Journal request identity already used'; END IF;
  RETURN previous.entry_ids;
 END IF;
 IF rev IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Accounting records changed; refresh before confirmation'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(prefs->'entities','[]')) e WHERE e->>'id'=ent) THEN RAISE EXCEPTION 'Company unavailable'; END IF;
 IF coalesce(_journal->>'kind','') NOT IN ('opening','accrual','advance','prepayment','depreciation','adjustment','reversal') OR length(trim(coalesce(_journal->>'description','')))<5 THEN RAISE EXCEPTION 'Journal type and explanation required'; END IF;
 dt:=(_journal->>'date')::date;
 IF dt IS NULL OR dt::text<>_journal->>'date' THEN RAISE EXCEPTION 'Invalid journal date'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(prefs->'books'->'closedPeriods','[]')) p WHERE dt BETWEEN (p->>'from')::date AND (p->>'to')::date AND (p->>'entityId' IS NULL OR p->>'entityId'=ent)) THEN RAISE EXCEPTION 'Accounting period is closed'; END IF;
 IF jsonb_typeof(_journal->'documentIds') IS DISTINCT FROM 'array' OR jsonb_array_length(_journal->'documentIds')=0 THEN RAISE EXCEPTION 'Retained originals required'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(_journal->'documentIds') id WHERE NOT EXISTS(SELECT 1 FROM public.documents d WHERE d.id=id::uuid AND d.owner_id=uid AND d.entity_id=ent AND length(coalesce(d.file_path,''))>0)) THEN RAISE EXCEPTION 'Company original unavailable'; END IF;
 IF jsonb_typeof(_journal->'legs') IS DISTINCT FROM 'array' OR jsonb_array_length(_journal->'legs')<2 THEN RAISE EXCEPTION 'Two accounting legs required'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(_journal->'legs') x GROUP BY x->>'code' HAVING count(*)>1) THEN RAISE EXCEPTION 'Repeated account codes'; END IF;
 FOR l IN SELECT * FROM jsonb_array_elements(_journal->'legs') LOOP
  IF l->>'role' IS NULL OR l->>'role' NOT IN ('asset','liability','equity','income','expense') OR length(coalesce(l->>'code',''))=0 OR length(coalesce(l->>'label',''))=0 THEN RAISE EXCEPTION 'Invalid accounting role or code'; END IF;
  IF l->>'debit' IS NULL OR l->>'credit' IS NULL OR (l->>'debit')::numeric<0 OR (l->>'credit')::numeric<0 OR ((l->>'debit')::numeric>0)=((l->>'credit')::numeric>0) OR round((l->>'debit')::numeric,2)<>(l->>'debit')::numeric OR round((l->>'credit')::numeric,2)<>(l->>'credit')::numeric OR (l->>'debit')::numeric::text IN ('NaN','Infinity') OR (l->>'credit')::numeric::text IN ('NaN','Infinity') THEN RAISE EXCEPTION 'Invalid debit or credit'; END IF;
  IF _journal->>'kind'='opening' AND l->>'role' IN ('income','expense') THEN RAISE EXCEPTION 'Opening cannot create profit'; END IF;
  IF l->>'accountId' IS NOT NULL THEN
   SELECT * INTO a FROM public.accounts WHERE id=(l->>'accountId')::uuid AND owner_id=uid AND NOT archived;
   IF NOT FOUND OR NOT coalesce(prefs->'books'->'entityAccounts'->ent,'[]') ? (l->>'accountId') OR l->>'code'<>'account:'||(l->>'accountId') THEN RAISE EXCEPTION 'Linked company account unavailable'; END IF;
   IF l->>'role'<>(CASE WHEN a.kind IN ('loan','other_liability','credit_card') THEN 'liability' ELSE 'asset' END) THEN RAISE EXCEPTION 'Account role differs'; END IF;
  ELSIF l->>'code' LIKE 'account:%' THEN RAISE EXCEPTION 'Account code requires a link'; END IF;
  IF EXISTS(SELECT 1 FROM public.accounting_journal_evidence e, jsonb_array_elements(e.journal->'legs') old WHERE e.owner_id=uid AND e.entity_id=ent AND old->>'code'=l->>'code' AND old->>'role'<>l->>'role') THEN RAISE EXCEPTION 'Account role changed; use a distinct account code'; END IF;
  deb:=deb+(l->>'debit')::numeric;cred:=cred+(l->>'credit')::numeric;
 END LOOP;
 IF deb<>cred THEN RAISE EXCEPTION 'Unbalanced journal; differences cannot be accepted'; END IF;
 IF _journal->>'invoiceId' IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(prefs->'books'->'gstInvoices','[]')) i WHERE i->>'id'=_journal->>'invoiceId' AND (i->>'transactionId' IS NULL) AND _journal->'documentIds' ? (i->>'docId') AND coalesce((SELECT e->'gstins' FROM jsonb_array_elements(prefs->'entities') e WHERE e->>'id'=ent),'[]') ? (i->>'gstin')) THEN RAISE EXCEPTION 'Invoice source or company differs, or already linked'; END IF;
  IF EXISTS(SELECT 1 FROM public.accounting_journal_evidence WHERE owner_id=uid AND journal->>'invoiceId'=_journal->>'invoiceId' AND journal->>'kind'<>'reversal') THEN RAISE EXCEPTION 'Invoice already posted; correct with source-preserving reversal'; END IF;
 END IF;
 IF _journal->>'kind'='opening' AND EXISTS(SELECT 1 FROM public.accounting_journal_evidence WHERE owner_id=uid AND entity_id=ent AND journal->>'kind'='opening' AND (journal->>'date')::date=dt) THEN RAISE EXCEPTION 'Opening already posted for this date'; END IF;
 IF _journal->>'reversesId' IS NOT NULL THEN
  SELECT * INTO prior FROM public.accounting_journal_evidence WHERE id=(_journal->>'reversesId')::uuid AND owner_id=uid AND entity_id=ent;
  IF NOT FOUND OR _journal->>'kind'<>'reversal' OR dt<(prior.journal->>'date')::date THEN RAISE EXCEPTION 'Invalid reversal'; END IF;
  IF EXISTS(SELECT 1 FROM public.accounting_journal_evidence WHERE owner_id=uid AND journal->>'reversesId'=_journal->>'reversesId') THEN RAISE EXCEPTION 'Journal already reversed'; END IF;
  IF (SELECT jsonb_agg(jsonb_set(jsonb_set(x,'{debit}',x->'credit'),'{credit}',x->'debit') ORDER BY x->>'code') FROM jsonb_array_elements(prior.journal->'legs') x) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'code') FROM jsonb_array_elements(_journal->'legs') x) THEN RAISE EXCEPTION 'Reversal must exactly swap original legs'; END IF;
 END IF;
 -- Only linked money legs affect accountBalance. Noncash journals retain one zero-delta canonical anchor.
 PERFORM set_config('ledgerline.accounting_request',_request::text,true);
 FOR l IN SELECT * FROM jsonb_array_elements(_journal->'legs') LOOP
  n:=n+1;IF l->>'accountId' IS NULL THEN CONTINUE; END IF;linked:=linked+1;
  amount:=(l->>'debit')::numeric-(l->>'credit')::numeric;
  IF l->>'role'='liability' THEN amount:=-amount; END IF;
  sign:=CASE WHEN amount>0 THEN 1 ELSE -1 END;
  tid:=md5(jid::text||':'||n)::uuid;
  INSERT INTO public.expenses(id,employee_id,title,category,amount,original_amount,currency,expense_date,description,payment_method,scope,txn_type,account_id,adjustment_sign,entity_id,entity_source,receipt_details)
  VALUES(tid,uid,left(_journal->>'description',200),'Accounting',abs(amount),abs(amount),'INR',dt,_journal->>'description','other','business','adjustment',(l->>'accountId')::uuid,sign,ent,'manual',jsonb_build_object('accounting',jsonb_build_object('journal',_journal,'primary',primary_entry,'requestId',_request)));
  ids:=ids||tid;primary_entry:=false;
 END LOOP;
 IF linked=0 THEN
  tid:=md5(jid::text||':anchor')::uuid;
  INSERT INTO public.expenses(id,employee_id,title,category,amount,original_amount,currency,expense_date,description,payment_method,scope,txn_type,adjustment_sign,entity_id,entity_source,receipt_details)
  VALUES(tid,uid,left(_journal->>'description',200),'Accounting',deb,deb,'INR',dt,_journal->>'description','other','business','adjustment',1,ent,'manual',jsonb_build_object('accounting',jsonb_build_object('journal',_journal,'primary',true,'requestId',_request)));
  ids:=ids||tid;
 END IF;
 UPDATE public.documents SET evidence_locked=true WHERE owner_id=uid AND id IN(SELECT value::uuid FROM jsonb_array_elements_text(_journal->'documentIds'));
 INSERT INTO public.accounting_journal_evidence(id,owner_id,entity_id,request_id,journal,entry_ids,actor_id) VALUES(jid,uid,ent,_request,_journal,ids,uid);
 UPDATE public.finance_preferences SET revision=revision+1,updated_at=now() WHERE owner_id=uid;
 PERFORM set_config('ledgerline.accounting_request','',true);
 RETURN ids;
END $$;
REVOKE ALL ON FUNCTION public.post_accounting_journal(uuid,jsonb,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_accounting_journal(uuid,jsonb,bigint) TO authenticated;

CREATE FUNCTION public.guard_accounting_entry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.receipt_details->'accounting' IS NOT NULL AND coalesce(current_setting('ledgerline.accounting_request',true),'') IS DISTINCT FROM NEW.receipt_details->'accounting'->>'requestId' THEN RAISE EXCEPTION 'Accounting evidence requires atomic journal posting'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.receipt_details->'accounting' IS NOT NULL OR NEW.receipt_details->'accounting' IS NOT NULL THEN RAISE EXCEPTION 'Posted accounting evidence is immutable; use an exact reversal and replacement'; END IF;
 RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER accounting_entry_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_entry();
CREATE FUNCTION public.guard_accounting_original() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.accounting_journal_evidence WHERE owner_id=OLD.owner_id AND journal->'documentIds' ? OLD.id::text) AND (TG_OP='DELETE' OR NEW.file_path IS DISTINCT FROM OLD.file_path OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.entity_id IS DISTINCT FROM OLD.entity_id OR NOT NEW.evidence_locked) THEN RAISE EXCEPTION 'Accounting original is retained; save corrections as new evidence'; END IF;
 RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER accounting_original_immutable BEFORE UPDATE OR DELETE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_original();
CREATE FUNCTION public.review_accounting_exception(_id uuid,_owner uuid,_journal uuid,_finding text,_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); ent text; prev public.accounting_exception_reviews;
BEGIN
 SELECT entity_id INTO ent FROM public.accounting_journal_evidence WHERE id=_journal AND owner_id=_owner;
 IF ent IS NULL OR uid IS NULL OR NOT(uid=_owner OR EXISTS(SELECT 1 FROM public.accounting_review_grants WHERE owner_id=_owner AND accountant_id=uid AND entity_id=ent AND revoked_at IS NULL)) THEN RAISE EXCEPTION 'Accountant review not authorised'; END IF;
 IF length(trim(coalesce(_note,'')))<5 OR length(trim(coalesce(_finding,'')))=0 THEN RAISE EXCEPTION 'Finding and written review required'; END IF;
 SELECT * INTO prev FROM public.accounting_exception_reviews WHERE id=_id;
 IF FOUND THEN IF prev.owner_id<>_owner OR prev.journal_id<>_journal OR prev.actor_id<>uid OR prev.finding<>_finding OR prev.note<>_note THEN RAISE EXCEPTION 'Review request changed'; END IF;RETURN;END IF;
 INSERT INTO public.accounting_exception_reviews(id,owner_id,entity_id,journal_id,finding,note,actor_id) VALUES(_id,_owner,ent,_journal,_finding,_note,uid);
END $$;
REVOKE ALL ON FUNCTION public.review_accounting_exception(uuid,uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_accounting_exception(uuid,uuid,uuid,text,text) TO authenticated;