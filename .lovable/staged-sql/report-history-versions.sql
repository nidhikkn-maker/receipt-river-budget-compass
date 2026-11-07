-- STAGED ONLY. Explicit production activation approval required.
-- The server owns version assignment, including clients supplying obsolete count+1 values.
CREATE OR REPLACE FUNCTION public.assign_report_history_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous public.report_history;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('report-version:'||NEW.owner_id::text||':'||NEW.kind||':'||coalesce(NEW.period_from::text,'')||':'||coalesce(NEW.period_to::text,''),0));
 SELECT * INTO previous FROM public.report_history WHERE id=NEW.id;
 IF FOUND THEN
  IF previous.owner_id IS DISTINCT FROM NEW.owner_id OR previous.kind IS DISTINCT FROM NEW.kind
   OR previous.period_from IS DISTINCT FROM NEW.period_from OR previous.period_to IS DISTINCT FROM NEW.period_to
   OR previous.filters IS DISTINCT FROM NEW.filters OR previous.file_path IS DISTINCT FROM NEW.file_path
   OR previous.file_size IS DISTINCT FROM NEW.file_size THEN RAISE EXCEPTION 'Report identifier already belongs to different evidence'; END IF;
  -- Let the existing PK deny the duplicate; caller reads back the accepted evidence.
  NEW.version:=previous.version; RETURN NEW;
 END IF;
 SELECT coalesce(max(version),0)+1 INTO NEW.version FROM public.report_history
  WHERE owner_id=NEW.owner_id AND kind=NEW.kind
   AND period_from IS NOT DISTINCT FROM NEW.period_from AND period_to IS NOT DISTINCT FROM NEW.period_to;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.assign_report_history_version() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER assign_report_history_version BEFORE INSERT ON public.report_history
 FOR EACH ROW EXECUTE FUNCTION public.assign_report_history_version();