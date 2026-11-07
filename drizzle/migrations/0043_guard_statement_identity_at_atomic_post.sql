CREATE FUNCTION public.guard_statement_identity_post() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.import_batches;
BEGIN
 IF NEW.batch_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO b FROM public.import_batches WHERE id=NEW.batch_id AND owner_id=NEW.owner_id FOR UPDATE;
 IF NOT FOUND OR b.statement_review->'identity'->>'confirmed' IS DISTINCT FROM 'true' OR b.statement_review->'identity'->>'accountId' IS DISTINCT FROM b.account_id::text OR nullif(trim(b.statement_review->'identity'->>'reference'),'') IS NULL THEN RAISE EXCEPTION 'Confirm statement account identity before posting'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER statement_identity_before_post BEFORE INSERT ON public.import_posts FOR EACH ROW EXECUTE FUNCTION public.guard_statement_identity_post();
REVOKE ALL ON FUNCTION public.guard_statement_identity_post() FROM PUBLIC,anon,authenticated;