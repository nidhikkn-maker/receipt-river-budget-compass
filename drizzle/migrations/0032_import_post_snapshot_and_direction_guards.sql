DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.post_import_rows_secure(uuid,uuid,jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'p:=r.proposal; tid:=r.id;', $guard$p:=r.proposal; tid:=r.id;
  IF p IS DISTINCT FROM x->'proposal' OR b.currency IS DISTINCT FROM x->>'currency' THEN RAISE EXCEPTION 'Review changed while preparing import; retry'; END IF;
  IF (p->>'amount')::numeric IS DISTINCT FROM (r.line->>'amount')::numeric OR p->>'date' IS DISTINCT FROM r.line->>'date' THEN RAISE EXCEPTION 'Source financial data cannot be changed'; END IF;
  IF (p->>'accountId')::uuid<>b.account_id AND NULLIF(p->>'toAccountId','')::uuid IS DISTINCT FROM b.account_id THEN RAISE EXCEPTION 'Entry must involve the statement account'; END IF;
  IF p->>'txnType' IN ('transfer','card_payment','loan_repayment','investment') AND ((r.line->>'direction'='credit' AND NULLIF(p->>'toAccountId','')::uuid IS DISTINCT FROM b.account_id) OR (COALESCE(r.line->>'direction','debit')='debit' AND (p->>'accountId')::uuid<>b.account_id)) THEN RAISE EXCEPTION 'Transfer direction must match statement'; END IF;
$guard$);
 EXECUTE definition;
END;
$migration$;
COMMENT ON FUNCTION public.post_import_rows(uuid,jsonb) IS 'DEPRECATED: use authenticated server posting with post_import_rows_secure and server-derived FX';