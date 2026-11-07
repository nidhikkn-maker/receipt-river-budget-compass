CREATE OR REPLACE FUNCTION public.ll_closed_on(_periods jsonb, _date text, _entity text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT _date IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_periods)='array' THEN _periods ELSE '[]'::jsonb END) p
    WHERE left(_date,10) BETWEEN p->>'from' AND p->>'to' AND (p->>'entityId' IS NULL OR p->>'entityId' IS NOT DISTINCT FROM _entity));
$$;

CREATE OR REPLACE FUNCTION public.guard_journals_rules() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  periods jsonb := NEW.data->'books'->'closedPeriods';
  oj jsonb := CASE WHEN jsonb_typeof(OLD.data->'books'->'journals')='array' THEN OLD.data->'books'->'journals' ELSE '[]'::jsonb END;
  nj jsonb := CASE WHEN jsonb_typeof(NEW.data->'books'->'journals')='array' THEN NEW.data->'books'->'journals' ELSE '[]'::jsonb END;
  oe jsonb := CASE WHEN jsonb_typeof(OLD.data->'books'->'assetEvents')='array' THEN OLD.data->'books'->'assetEvents' ELSE '[]'::jsonb END;
  ne jsonb := CASE WHEN jsonb_typeof(NEW.data->'books'->'assetEvents')='array' THEN NEW.data->'books'->'assetEvents' ELSE '[]'::jsonb END;
  orl jsonb := CASE WHEN jsonb_typeof(OLD.data->'books'->'rules')='array' THEN OLD.data->'books'->'rules' ELSE '[]'::jsonb END;
  nrl jsonb := CASE WHEN jsonb_typeof(NEW.data->'books'->'rules')='array' THEN NEW.data->'books'->'rules' ELSE '[]'::jsonb END;
  a jsonb; b jsonb; ent text; fin text[] := ARRAY['capitalised','impairment','revaluation','disposal'];
BEGIN
  IF current_setting('ledgerline.erasing',true)='on' THEN RETURN NEW; END IF;
  FOR a IN SELECT value FROM jsonb_array_elements(oj) LOOP
    SELECT value INTO b FROM jsonb_array_elements(nj) WHERE value->>'id'=a->>'id' LIMIT 1;
    IF b IS NOT DISTINCT FROM a THEN CONTINUE; END IF;
    IF a->>'status'='posted' THEN RAISE EXCEPTION 'Posted journal % cannot be changed or removed', a->>'id' USING ERRCODE='23514'; END IF;
    SELECT x->>'entityId' INTO ent FROM jsonb_array_elements(NEW.data->'assets') x WHERE x->>'id'=a->>'assetId' LIMIT 1;
    IF public.ll_closed_on(periods,(a->>'period')||'-28',ent) THEN RAISE EXCEPTION 'Journal % is in a closed period; reopen it first', a->>'id' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOR b IN SELECT value FROM jsonb_array_elements(nj) LOOP
    SELECT value INTO a FROM jsonb_array_elements(oj) WHERE value->>'id'=b->>'id' LIMIT 1;
    IF a IS NOT DISTINCT FROM b THEN CONTINUE; END IF;
    SELECT x->>'entityId' INTO ent FROM jsonb_array_elements(NEW.data->'assets') x WHERE x->>'id'=b->>'assetId' LIMIT 1;
    IF public.ll_closed_on(periods,(b->>'period')||'-28',ent) THEN RAISE EXCEPTION 'Journal % is in a closed period; reopen it first', b->>'id' USING ERRCODE='23514'; END IF;
    IF b->>'status'='posted' AND (b->>'postedOn') IS NULL THEN RAISE EXCEPTION 'Posted journal % needs a posting date', b->>'id' USING ERRCODE='23514'; END IF;
    IF b->>'status'='posted' AND a IS NOT NULL AND a->>'status'='prepared' AND (a->'amount',a->'period',a->'assetId') IS DISTINCT FROM (b->'amount',b->'period',b->'assetId') THEN
      RAISE EXCEPTION 'Journal % must be posted exactly as prepared', b->>'id' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOR a IN SELECT value FROM jsonb_array_elements(oe) UNION ALL SELECT value FROM jsonb_array_elements(ne) LOOP
    IF NOT (a->>'kind' = ANY(fin)) THEN CONTINUE; END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(oe) x WHERE x=a) = (SELECT count(*) FROM jsonb_array_elements(ne) x WHERE x=a) THEN CONTINUE; END IF;
    SELECT x->>'entityId' INTO ent FROM jsonb_array_elements(NEW.data->'assets') x WHERE x->>'id'=a->>'assetId' LIMIT 1;
    IF public.ll_closed_on(periods,a->>'date',ent) THEN RAISE EXCEPTION 'Asset event % is in a closed period; reopen it first', a->>'id' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOR a IN SELECT value FROM jsonb_array_elements(orl) WHERE value->>'status' IN ('active','superseded') LOOP
    SELECT value INTO b FROM jsonb_array_elements(nrl) WHERE value->>'id'=a->>'id' LIMIT 1;
    IF b IS NULL THEN RAISE EXCEPTION 'Approved rule % cannot be removed', a->>'id' USING ERRCODE='23514'; END IF;
    IF (a->'key',a->'area',a->'value',a->'effectiveFrom',a->'approvedOn',a->'appliesTo') IS DISTINCT FROM (b->'key',b->'area',b->'value',b->'effectiveFrom',b->'approvedOn',b->'appliesTo') THEN
      RAISE EXCEPTION 'Approved rule % cannot be edited; propose a new version', a->>'id' USING ERRCODE='23514'; END IF;
    IF NOT (b->>'status'=a->>'status' OR (a->>'status'='active' AND b->>'status'='superseded')) THEN RAISE EXCEPTION 'Approved rule % cannot change to %', a->>'id', b->>'status' USING ERRCODE='23514'; END IF;
    IF a->>'effectiveTo' IS NOT NULL AND b->'effectiveTo' IS DISTINCT FROM a->'effectiveTo' THEN RAISE EXCEPTION 'Rule % end date is fixed', a->>'id' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOR b IN SELECT value FROM jsonb_array_elements(nrl) WHERE value->>'status'='active' LOOP
    SELECT value INTO a FROM jsonb_array_elements(orl) WHERE value->>'id'=b->>'id' LIMIT 1;
    IF a IS NOT NULL AND a->>'status'='active' THEN CONTINUE; END IF;
    IF a IS NOT NULL AND a->>'status' IS DISTINCT FROM 'proposed' THEN RAISE EXCEPTION 'Only a proposed rule can be activated' USING ERRCODE='23514'; END IF;
    IF (b->>'approvedOn') IS NULL THEN RAISE EXCEPTION 'Rule % needs an approval date to activate', b->>'id' USING ERRCODE='23514'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b->'tests')='array' THEN b->'tests' ELSE '[]'::jsonb END) t WHERE (t->>'passed') IS DISTINCT FROM 'true') THEN
      RAISE EXCEPTION 'Rule % has failing checks and cannot be activated', b->>'id' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_journals_rules ON public.finance_preferences;
CREATE TRIGGER guard_journals_rules BEFORE UPDATE ON public.finance_preferences FOR EACH ROW EXECUTE FUNCTION public.guard_journals_rules();