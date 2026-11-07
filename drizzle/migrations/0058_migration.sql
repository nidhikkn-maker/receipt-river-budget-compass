-- v6 §34/§57: entries dated inside an owner's closed period cannot be created, changed financially or deleted.
CREATE OR REPLACE FUNCTION public.guard_closed_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  owner uuid := COALESCE(NEW.employee_id, OLD.employee_id);
  periods jsonb;
  d date;
BEGIN
  IF auth.uid() IS NULL OR current_setting('ledgerline.erasing', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.amount IS NOT DISTINCT FROM OLD.amount AND NEW.expense_date IS NOT DISTINCT FROM OLD.expense_date
     AND NEW.category IS NOT DISTINCT FROM OLD.category AND NEW.txn_type IS NOT DISTINCT FROM OLD.txn_type
     AND NEW.account_id IS NOT DISTINCT FROM OLD.account_id AND NEW.to_account_id IS NOT DISTINCT FROM OLD.to_account_id
     AND NEW.original_amount IS NOT DISTINCT FROM OLD.original_amount AND NEW.currency IS NOT DISTINCT FROM OLD.currency
     AND NEW.scope IS NOT DISTINCT FROM OLD.scope AND NEW.allocations IS NOT DISTINCT FROM OLD.allocations THEN
    RETURN NEW;
  END IF;
  SELECT data->'books'->'closedPeriods' INTO periods FROM public.finance_preferences WHERE owner_id = owner;
  IF periods IS NULL OR jsonb_typeof(periods) <> 'array' OR jsonb_array_length(periods) = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  FOREACH d IN ARRAY ARRAY[CASE WHEN TG_OP <> 'INSERT' THEN OLD.expense_date END, CASE WHEN TG_OP <> 'DELETE' THEN NEW.expense_date END] LOOP
    IF d IS NOT NULL AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(periods) p
      WHERE (p->>'from') ~ '^\d{4}-\d{2}-\d{2}$' AND (p->>'to') ~ '^\d{4}-\d{2}-\d{2}$'
        AND d BETWEEN (p->>'from')::date AND (p->>'to')::date
    ) THEN
      RAISE EXCEPTION 'Entries dated % are in a closed period. Reopen it on the Audit page first.', d USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS guard_closed_period ON public.expenses;
CREATE TRIGGER guard_closed_period BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.guard_closed_period();

CREATE OR REPLACE FUNCTION public.delete_my_finance_data()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 PERFORM set_config('ledgerline.erasing', 'on', true);
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
 DELETE FROM public.expense_drafts WHERE owner_id=uid;
 DELETE FROM public.report_history WHERE owner_id=uid;
END $function$;
