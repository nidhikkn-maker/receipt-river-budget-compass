-- Protect old and new financial register facts; physical checks remain editable.
CREATE OR REPLACE FUNCTION public.guard_books_registers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p jsonb; previous jsonb; proposed jsonb; field text; a jsonb; b jsonb;
  active jsonb := CASE WHEN jsonb_typeof(NEW.data->'books'->'closedPeriods')='array' THEN NEW.data->'books'->'closedPeriods' ELSE '[]'::jsonb END;
  oldperiods jsonb := CASE WHEN jsonb_typeof(OLD.data->'books'->'closedPeriods')='array' THEN OLD.data->'books'->'closedPeriods' ELSE '[]'::jsonb END;
  lo text; hi text;
BEGIN
  IF current_setting('ledgerline.erasing',true)='on' THEN RETURN NEW; END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(oldperiods) LOOP
    SELECT value INTO proposed FROM jsonb_array_elements(active) WHERE value->>'id'=p->>'id';
    IF proposed IS NOT NULL AND proposed IS DISTINCT FROM p THEN
      RAISE EXCEPTION 'Closed period definition cannot be changed; reopen it first' USING ERRCODE='23514';
    END IF;
  END LOOP;
  -- The old period log is append-only, including reopening reasons.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(OLD.data->'books'->'periodLog')='array' THEN OLD.data->'books'->'periodLog' ELSE '[]'::jsonb END) l
    WHERE NOT (CASE WHEN jsonb_typeof(NEW.data->'books'->'periodLog')='array' THEN NEW.data->'books'->'periodLog' ELSE '[]'::jsonb END @> jsonb_build_array(l))) THEN
    RAISE EXCEPTION 'Period history cannot be removed or changed' USING ERRCODE='23514';
  END IF;
  FOREACH field IN ARRAY ARRAY['leases','entityTaxProfiles','assets'] LOOP
    IF field='assets' THEN a:=OLD.data->field; b:=NEW.data->field;
    ELSE a:=OLD.data->'books'->field; b:=NEW.data->'books'->field; END IF;
    IF jsonb_typeof(a) IS DISTINCT FROM 'array' THEN a:='[]'::jsonb; END IF;
    IF jsonb_typeof(b) IS DISTINCT FROM 'array' THEN b:='[]'::jsonb; END IF;
    FOR previous IN SELECT value FROM jsonb_array_elements(a) UNION SELECT value FROM jsonb_array_elements(b) LOOP
      SELECT value INTO proposed FROM jsonb_array_elements(b) WHERE value->>'id'=previous->>'id';
      IF field='assets' THEN
        previous:=previous-ARRAY['lastVerified','condition','location','custodian','tag','department','docIds','docId','warrantyUntil','insurance'];
        proposed:=proposed-ARRAY['lastVerified','condition','location','custodian','tag','department','docIds','docId','warrantyUntil','insurance'];
      END IF;
      IF previous IS NOT DISTINCT FROM proposed THEN CONTINUE; END IF;
      -- Check the previous record AND new record. A deletion retains its old range.
      FOR p IN SELECT value FROM jsonb_array_elements(jsonb_build_array(previous,proposed)) WHERE value IS NOT NULL AND value<>'null'::jsonb LOOP
        IF field='leases' THEN lo:=p->>'start'; hi:=p->>'end';
        ELSIF field='entityTaxProfiles' THEN
          IF coalesce(p->>'fy','') !~ '^\d{4}-\d{2}$' THEN
            RAISE EXCEPTION 'Tax profile financial year is invalid' USING ERRCODE='23514';
          END IF;
          lo:=left(p->>'fy',4)||'-04-01'; hi:=((left(p->>'fy',4))::integer+1)::text||'-03-31';
        ELSE lo:=coalesce(p->>'purchaseDate',p->>'capitalisedOn',p->>'inUse'); hi:='9999-12-31'; END IF;
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(active) c WHERE lo<=c->>'to' AND hi>=c->>'from') THEN
          RAISE EXCEPTION '% financial facts overlap a closed period; reopen it first',field USING ERRCODE='23514';
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_books_registers BEFORE UPDATE ON public.finance_preferences FOR EACH ROW EXECUTE FUNCTION public.guard_books_registers();