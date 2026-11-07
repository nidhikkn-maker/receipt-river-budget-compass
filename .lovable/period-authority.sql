CREATE FUNCTION public.require_period_operation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_books jsonb; new_books jsonb;
BEGIN
 IF current_setting('ledgerline.erasing',true)='on' THEN RETURN coalesce(NEW,OLD); END IF;
 IF TG_OP='DELETE' THEN
  IF jsonb_array_length(coalesce(OLD.data->'books'->'closedPeriods','[]'))>0 OR EXISTS(SELECT 1 FROM public.period_close_evidence WHERE owner_id=OLD.owner_id) THEN
   RAISE EXCEPTION 'Use confirmed account deletion to remove closing history';
  END IF;
  RETURN OLD;
 END IF;
 IF current_setting('ledgerline.period_operation',true)='on' THEN RETURN NEW; END IF;
 old_books:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE coalesce(OLD.data->'books','{}') END;
 new_books:=coalesce(NEW.data->'books','{}');
 IF coalesce(old_books->'closedPeriods','[]') IS DISTINCT FROM coalesce(new_books->'closedPeriods','[]') OR
    coalesce(old_books->'periodLog','[]') IS DISTINCT FROM coalesce(new_books->'periodLog','[]') THEN
  RAISE EXCEPTION 'Close or reopen on Audit so evidence is retained';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER require_period_operation BEFORE INSERT OR UPDATE OR DELETE ON public.finance_preferences FOR EACH ROW EXECUTE FUNCTION public.require_period_operation();
-- Only the authenticated, validated operation can set the transaction-local authority marker.
ALTER FUNCTION public.change_accounting_period(uuid,text,text,date,date,text,jsonb) SET ledgerline.period_operation='on';