CREATE OR REPLACE FUNCTION public.guard_closed_gst_amendments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE periods jsonb; invoices jsonb; old_invoices jsonb; item jsonb; original jsonb;
BEGIN
 IF current_setting('ledgerline.erasing',true)='on' THEN RETURN NEW; END IF;
 periods:=coalesce(OLD.data->'books'->'closedPeriods','[]'::jsonb);
 IF jsonb_typeof(periods)<>'array' THEN RETURN NEW; END IF;
 invoices:=coalesce(NEW.data->'books'->'gstInvoices','[]'::jsonb);
 old_invoices:=coalesce(OLD.data->'books'->'gstInvoices','[]'::jsonb);
 IF jsonb_typeof(invoices)<>'array' OR jsonb_typeof(old_invoices)<>'array' THEN RAISE EXCEPTION 'GST invoice register must be an array' USING ERRCODE='23514'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(invoices) WHERE value->>'amendsId' IS NOT NULL LOOP
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(old_invoices) x WHERE x=item) THEN CONTINUE; END IF;
 SELECT value INTO original FROM jsonb_array_elements(old_invoices) WHERE value->>'id'=item->>'amendsId';
 IF original IS NULL THEN SELECT value INTO original FROM jsonb_array_elements(invoices) WHERE value->>'id'=item->>'amendsId'; END IF;
 IF original IS NULL OR item->>'amendsId'=item->>'id' OR original->>'gstin' IS DISTINCT FROM item->>'gstin' OR original->>'kind' IS DISTINCT FROM item->>'kind' THEN RAISE EXCEPTION 'Amendment must name an existing invoice of the same GSTIN and direction' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(periods) p WHERE original->>'date' BETWEEN p->>'from' AND p->>'to') THEN RAISE EXCEPTION 'Cannot amend a closed-period invoice; issue a credit or debit note in an open period' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(old_invoices) WHERE value->>'amendsId' IS NOT NULL LOOP
 SELECT value INTO original FROM jsonb_array_elements(old_invoices) WHERE value->>'id'=item->>'amendsId';
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(periods) p WHERE original->>'date' BETWEEN p->>'from' AND p->>'to') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(invoices) x WHERE x=item) THEN RAISE EXCEPTION 'A replacement affecting a closed period cannot be changed or removed' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_closed_gst_amendments BEFORE UPDATE ON public.finance_preferences FOR EACH ROW EXECUTE FUNCTION public.guard_closed_gst_amendments();