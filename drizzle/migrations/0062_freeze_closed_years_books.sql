-- v6 §34/§57: closed years are frozen beyond ledger entries. A closed period can only disappear with a
-- logged reopening, and GST invoices dated inside a still-closed period cannot be added, changed or removed.
CREATE OR REPLACE FUNCTION public.guard_books_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  old_p jsonb := COALESCE(OLD.data->'books'->'closedPeriods', '[]'::jsonb);
  new_p jsonb := COALESCE(NEW.data->'books'->'closedPeriods', '[]'::jsonb);
  new_log jsonb := COALESCE(NEW.data->'books'->'periodLog', '[]'::jsonb);
  p jsonb;
  old_inv jsonb; new_inv jsonb;
BEGIN
  IF auth.uid() IS NULL OR current_setting('ledgerline.erasing', true) = 'on' THEN RETURN NEW; END IF;
  IF jsonb_typeof(old_p) <> 'array' THEN old_p := '[]'::jsonb; END IF;
  IF jsonb_typeof(new_p) <> 'array' THEN new_p := '[]'::jsonb; END IF;
  IF jsonb_typeof(new_log) <> 'array' THEN new_log := '[]'::jsonb; END IF;
  FOR p IN SELECT * FROM jsonb_array_elements(old_p) LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(new_p) n WHERE n->>'id' = p->>'id')
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(new_log) l WHERE l->>'action' = 'reopened' AND l->>'periodId' = p->>'id' AND length(coalesce(l->>'reason','')) >= 5) THEN
      RAISE EXCEPTION 'Closed period % to % can only be reopened with a written reason', p->>'from', p->>'to' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  IF jsonb_array_length(new_p) = 0 THEN RETURN NEW; END IF;
  SELECT COALESCE(jsonb_agg(i ORDER BY i->>'id'), '[]'::jsonb) INTO old_inv
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(OLD.data->'books'->'gstInvoices') = 'array' THEN OLD.data->'books'->'gstInvoices' ELSE '[]'::jsonb END) i
    WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(new_p) c WHERE (i->>'date') BETWEEN (c->>'from') AND (c->>'to'));
  SELECT COALESCE(jsonb_agg(i ORDER BY i->>'id'), '[]'::jsonb) INTO new_inv
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.data->'books'->'gstInvoices') = 'array' THEN NEW.data->'books'->'gstInvoices' ELSE '[]'::jsonb END) i
    WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(new_p) c WHERE (i->>'date') BETWEEN (c->>'from') AND (c->>'to'));
  IF old_inv IS DISTINCT FROM new_inv THEN
    RAISE EXCEPTION 'GST invoices inside a closed period cannot be changed. Reopen the period on the Audit page first.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_books_freeze ON public.finance_preferences;
CREATE TRIGGER guard_books_freeze BEFORE UPDATE ON public.finance_preferences
FOR EACH ROW EXECUTE FUNCTION public.guard_books_freeze();