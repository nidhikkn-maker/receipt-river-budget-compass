-- STAGED ONLY. Install only in disposable acceptance databases; no production migration.
-- Independent saved-record checks supplement the existing owner-serialized close operation.
CREATE FUNCTION public.guard_corporate_close_acceptance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w jsonb; ent text;
BEGIN
 IF NEW.action<>'closed' THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.accounting_journal_evidence WHERE owner_id=NEW.owner_id) THEN RETURN NEW; END IF;
 IF jsonb_typeof(NEW.evidence->'derivedFigures'->'corporate') IS DISTINCT FROM 'array'
 OR jsonb_array_length(NEW.evidence->'derivedFigures'->'corporate')=0 THEN RAISE EXCEPTION 'Corporate close requires reviewed financial workings';END IF;
 FOR w IN SELECT * FROM jsonb_array_elements(NEW.evidence->'derivedFigures'->'corporate') LOOP
  ent:=w->>'entityId';
  IF ent IS NULL OR jsonb_typeof(w->'issues') IS DISTINCT FROM 'array' OR jsonb_array_length(w->'issues')>0
  OR coalesce((w->>'trialDifference')::numeric,1)<>0 OR coalesce((w->>'balanceDifference')::numeric,1)<>0
  OR coalesce((w->'cash'->>'difference')::numeric,1)<>0 OR coalesce((w->>'unclassified')::numeric,1)<>0
  OR coalesce((w->'cash'->>'unclassified')::numeric,1)<>0 THEN RAISE EXCEPTION 'Unresolved corporate differences prevent closing';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.expenses e JOIN public.accounts a ON a.id=e.account_id AND a.owner_id=e.employee_id
 WHERE e.employee_id=NEW.owner_id AND e.expense_date BETWEEN (NEW.evidence->>'from')::date AND (NEW.evidence->>'to')::date
 AND a.kind IN ('current','savings','cash','wallet') AND coalesce(e.receipt_details->'accounting'->'journal'->>'kind','')<>'opening'
 AND (e.reconciled_at IS NULL OR length(coalesce(to_jsonb(e)->>'statement_ref',''))=0)) THEN RAISE EXCEPTION 'Unreconciled cash movements prevent closing';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_corporate_close_acceptance() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER corporate_close_acceptance BEFORE INSERT ON public.period_close_evidence
FOR EACH ROW EXECUTE FUNCTION public.guard_corporate_close_acceptance();