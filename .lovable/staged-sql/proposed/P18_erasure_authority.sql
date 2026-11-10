-- ============================================================================================
-- P18_erasure_authority.sql (PROPOSED ONLY: NOT APPLIED to Lovable Cloud, Live or any hosted DB).
-- Prepared 10 Nov 2026 (P0-036, Track A, owner decision) for KK review. Tested only in isolated PGlite:
-- src/lib/p18-erasure-authority-sql.test.ts (applied schema and the whole proposed stack P1..P17; catalog-exact rollback).
--
-- Finding P0-036: the applied evidence row guard (0059 guard_evidence_delete) and many other guards (0062, 0069, 0072,
-- 0073, 0081, 0083 and the proposed P5/P6/P9/P10/P13/P14/P15 guards) exempt a write when the session setting
-- ledgerline.erasing = 'on', and proposed P9 exempts a documents delete when phase3_p9.discarding = <document id>.
-- Any role can set a custom setting (SET / set_config), so an owner in plain SQL could delete an evidence-locked
-- original (and then its file, P17) or bypass the other guards. delete_my_finance_data recorded no audit.
--
-- Fix (forward only; applied migration files are not edited):
--  A. phase3_p18.erasure_authority (owner_id, transaction_id): written ONLY by the new SECURITY DEFINER
--     public.delete_my_finance_data wrapper, inside the erasure transaction, and removed before it returns. No client
--     grant (schema and table revoked from PUBLIC, anon, authenticated). phase3_p18.erasure_authorised() is true only
--     when a row exists for owner_id = auth.uid() AND transaction_id = txid_current(), so an exemption never survives
--     its transaction (64-bit txids are never reused) and cannot be created by a client.
--  B. Every guard function in the database that reads ledgerline.erasing (public, phase3_*, security_* schemas, the
--     applied ones and whichever proposed ones are installed) is re-created with that read replaced by
--     phase3_p18.erasure_authorised(); the original definition is saved for the rollback. The install refuses if any
--     read of the setting remains afterwards (fail closed on an unknown spelling). Writers that still SET the setting
--     (the original erasure body) are harmless: nothing reads it any more.
--  C. P9 (when installed): guard_archive_delete's phase3_p9.discarding check becomes phase3_p18.discard_authorised(id)
--     and discard_used_pending_document writes/removes a transaction-bound phase3_p18.discard_authority row instead of
--     the setting.
--  D. public.erasure_audit: append-only (no client write grant; a trigger refuses UPDATE/DELETE for every role),
--     owner-readable; one row per erasure written by the wrapper in the same transaction: request id, owner, who,
--     when, per-table counts of the owner's rows before and after (and erased = before - after). It is not an owner
--     table the erasure deletes, so the record survives the erasure.
--  E. public.delete_my_finance_data() keeps its name, signature, SECURITY DEFINER and EXECUTE grants; the previous
--     public function (the applied/P1 body, or P4's step-up wrapper) moves unchanged to phase3_p18_private.erase_inner
--     (a schema clients cannot use) and is called by the wrapper, so P4's step-up still applies. Files are still removed afterwards by the
--     app (delete-data.ts) once the rows are gone.
-- Order: install P18 LAST (after any proposed file that defines a guard reading the setting) and roll it back FIRST.
-- A later file that re-creates such a guard re-opens the bypass; re-run the check in the preflight block below.
-- Rollback: P18_erasure_authority.rollback.sql (exact previous functions and grants; refuses while audit rows exist
-- unless the operator, with KK approval after exporting them, sets phase3_p18.drop_audit = 'on').
-- P0-038 (Track A): the other client-settable exemptions (phase3_p11.checked, phase3_p10.writing, phase3_p13.applying /
-- deciding, phase3_p7.writer / reversal_insert / reason / request / meta, phase3_p9.claiming, ledgerline.posting_writer /
-- accounting_request / restoring) were replaced in the files that own them (P3/P7/P9/P10/P11/P13/P14) by the same
-- transaction-bound pattern; the post-install check below also refuses if any installed function still reads one of
-- them (docs/security/p0-038/GUC_INVENTORY.md). The applied app.finance_owner (0012/0015) is listed there as open.
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase3_p18') IS NOT NULL THEN RAISE EXCEPTION 'P18 is already installed'; END IF;
  IF to_regprocedure('public.delete_my_finance_data()') IS NULL THEN RAISE EXCEPTION 'P18 requires public.delete_my_finance_data() (0027+)'; END IF;
END $pre$;

CREATE SCHEMA phase3_p18;
REVOKE ALL ON SCHEMA phase3_p18 FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA phase3_p18 TO anon, authenticated, service_role; -- guards (invoker triggers) call the checks below
CREATE TABLE phase3_p18.saved_functions (signature text PRIMARY KEY, definition text NOT NULL, acl aclitem[]);
CREATE TABLE phase3_p18.erasure_authority (owner_id uuid NOT NULL, transaction_id bigint NOT NULL, request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY (owner_id, transaction_id));
CREATE TABLE phase3_p18.discard_authority (document_id uuid NOT NULL, owner_id uuid NOT NULL, transaction_id bigint NOT NULL,
  PRIMARY KEY (document_id, transaction_id));
REVOKE ALL ON phase3_p18.saved_functions, phase3_p18.erasure_authority, phase3_p18.discard_authority FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION phase3_p18.erasure_authorised() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM phase3_p18.erasure_authority a WHERE a.owner_id = auth.uid() AND a.transaction_id = txid_current())
$$;
CREATE FUNCTION phase3_p18.discard_authorised(_document uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM phase3_p18.discard_authority a
    WHERE a.document_id = _document AND a.owner_id = auth.uid() AND a.transaction_id = txid_current())
$$;
CREATE FUNCTION phase3_p18.authorise_discard(_document uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO phase3_p18.discard_authority(document_id, owner_id, transaction_id) VALUES (_document, auth.uid(), txid_current()) ON CONFLICT DO NOTHING
$$;
CREATE FUNCTION phase3_p18.end_discard(_document uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM phase3_p18.discard_authority WHERE document_id = _document AND transaction_id = txid_current()
$$;
REVOKE ALL ON FUNCTION phase3_p18.erasure_authorised(), phase3_p18.discard_authorised(uuid), phase3_p18.authorise_discard(uuid), phase3_p18.end_discard(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION phase3_p18.erasure_authorised(), phase3_p18.discard_authorised(uuid) TO anon, authenticated, service_role; -- read-only, answers for the caller's own transaction

-- --------------------------------------------------------------------------------------------
-- D. Erasure audit
-- --------------------------------------------------------------------------------------------
CREATE TABLE public.erasure_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  owner_id uuid NOT NULL,
  erased_by uuid NOT NULL,
  erased_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  session_id text,
  counts jsonb NOT NULL   -- { table: { before, after, erased } } for every public table with an owner_id / employee_id column
);
ALTER TABLE public.erasure_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erasure_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.erasure_audit TO authenticated;
GRANT SELECT ON public.erasure_audit TO service_role;
CREATE POLICY "Erasure audit: owner reads own" ON public.erasure_audit FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE FUNCTION phase3_p18.audit_kept() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'P18_AUDIT_KEPT: erasure audit records are append-only' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER p18_erasure_audit_kept BEFORE UPDATE OR DELETE ON public.erasure_audit FOR EACH ROW EXECUTE FUNCTION phase3_p18.audit_kept();
CREATE TRIGGER p18_erasure_audit_no_truncate BEFORE TRUNCATE ON public.erasure_audit FOR EACH STATEMENT EXECUTE FUNCTION phase3_p18.audit_kept();

CREATE FUNCTION phase3_p18.owner_counts(_owner uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t record; n bigint; out jsonb := '{}';
BEGIN
  FOR t IN SELECT DISTINCT ON (c.table_name) c.table_name, c.column_name FROM information_schema.columns c
            JOIN information_schema.tables x ON x.table_schema = c.table_schema AND x.table_name = c.table_name AND x.table_type = 'BASE TABLE'
           WHERE c.table_schema = 'public' AND c.column_name IN ('owner_id', 'employee_id') AND c.data_type = 'uuid' AND c.table_name <> 'erasure_audit'
           ORDER BY c.table_name, c.column_name DESC LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', t.table_name, t.column_name) INTO n USING _owner;
    out := out || jsonb_build_object(t.table_name, n);
  END LOOP;
  RETURN out;
END $$;
REVOKE ALL ON FUNCTION phase3_p18.owner_counts(uuid), phase3_p18.audit_kept() FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------------------------
-- B + C. Re-create every guard that reads the settings (originals saved for the rollback)
-- --------------------------------------------------------------------------------------------
DO $g$
DECLARE f record; def text; nd text; left_over text;
BEGIN
  FOR f IN SELECT p.oid, p.oid::regprocedure::text sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'phase3_p18', 'phase3_p18_private')
              AND p.prokind = 'f' AND (p.prosrc LIKE '%current_setting(''ledgerline.erasing''%' OR p.prosrc LIKE '%phase3_p9.discarding%') LOOP
    def := pg_get_functiondef(f.oid);
    nd := regexp_replace(def, 'coalesce\(current_setting\(''ledgerline\.erasing'',\s*true\),\s*''''\)\s*<>\s*''on''', 'NOT phase3_p18.erasure_authorised()', 'gi');
    nd := regexp_replace(nd, 'current_setting\(''ledgerline\.erasing'',\s*true\)\s*IS\s+DISTINCT\s+FROM\s*''on''', 'NOT phase3_p18.erasure_authorised()', 'gi');
    nd := regexp_replace(nd, 'coalesce\(current_setting\(''ledgerline\.erasing'',\s*true\),\s*''''\)\s*=\s*''on''', 'phase3_p18.erasure_authorised()', 'gi');
    nd := regexp_replace(nd, 'current_setting\(''ledgerline\.erasing'',\s*true\)\s*=\s*''on''', 'phase3_p18.erasure_authorised()', 'gi');
    nd := regexp_replace(nd, 'coalesce\(current_setting\(''phase3_p9\.discarding'',\s*true\),\s*''''\)\s*=\s*OLD\.id::text', 'phase3_p18.discard_authorised(OLD.id)', 'gi');
    nd := regexp_replace(nd, 'PERFORM\s+set_config\(''phase3_p9\.discarding'',\s*d\.id::text,\s*true\);', 'PERFORM phase3_p18.authorise_discard(d.id);', 'gi');
    nd := regexp_replace(nd, 'PERFORM\s+set_config\(''phase3_p9\.discarding'',\s*'''',\s*true\);', 'PERFORM phase3_p18.end_discard(d.id);', 'gi');
    left_over := substring(nd FROM 'current_setting\(''ledgerline\.erasing''[^)]*\)[^;]{0,40}');
    IF left_over IS NOT NULL OR nd LIKE '%phase3_p9.discarding%' THEN
      RAISE EXCEPTION 'P18: % still trusts a session setting after rewriting (%); extend P18 before installing', f.sig, coalesce(left_over, 'phase3_p9.discarding');
    END IF;
    IF nd IS DISTINCT FROM def THEN
      INSERT INTO phase3_p18.saved_functions(signature, definition) VALUES (f.sig, def);
      EXECUTE nd;
    END IF;
  END LOOP;
END $g$;

-- --------------------------------------------------------------------------------------------
-- A + E. The erasure wrapper: the only writer of the erasure authority and the audit
-- --------------------------------------------------------------------------------------------
-- The previous function moves, unchanged (body, owner, ACL), into a schema no client can use, so it cannot be called
-- around the wrapper; the rollback moves it back exactly.
CREATE SCHEMA phase3_p18_private;
REVOKE ALL ON SCHEMA phase3_p18_private FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO phase3_p18.saved_functions(signature, definition, acl)
  SELECT 'public.delete_my_finance_data()', '', proacl FROM pg_proc WHERE oid = 'public.delete_my_finance_data()'::regprocedure;
ALTER FUNCTION public.delete_my_finance_data() RENAME TO erase_inner;
ALTER FUNCTION public.erase_inner() SET SCHEMA phase3_p18_private;

CREATE FUNCTION public.delete_my_finance_data() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); rid uuid := gen_random_uuid(); before jsonb; after jsonb; counts jsonb := '{}'; k text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  before := phase3_p18.owner_counts(uid);
  INSERT INTO phase3_p18.erasure_authority(owner_id, transaction_id, request_id) VALUES (uid, txid_current(), rid);
  PERFORM phase3_p18_private.erase_inner();
  after := phase3_p18.owner_counts(uid);
  FOR k IN SELECT jsonb_object_keys(before) LOOP
    IF (before->>k)::bigint > 0 OR coalesce((after->>k)::bigint, 0) > 0 THEN
      counts := counts || jsonb_build_object(k, jsonb_build_object('before', (before->>k)::bigint, 'after', coalesce((after->>k)::bigint, 0),
        'erased', (before->>k)::bigint - coalesce((after->>k)::bigint, 0)));
    END IF;
  END LOOP;
  INSERT INTO public.erasure_audit(request_id, owner_id, erased_by, session_id, counts)
    VALUES (rid, uid, uid, nullif(coalesce(auth.jwt()->>'session_id', ''), ''), counts);
  DELETE FROM phase3_p18.erasure_authority WHERE owner_id = uid AND transaction_id = txid_current();
END $$;
REVOKE ALL ON FUNCTION public.delete_my_finance_data() FROM PUBLIC, anon, authenticated, service_role;
DO $acl$
DECLARE a aclitem;
BEGIN
  -- same EXECUTE grants as the function it replaces
  FOR a IN SELECT unnest(acl) FROM phase3_p18.saved_functions WHERE signature = 'public.delete_my_finance_data()' LOOP
    IF split_part(split_part(a::text, '=', 2), '/', 1) LIKE '%X%' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.delete_my_finance_data() TO %s',
        CASE WHEN split_part(a::text, '=', 1) = '' THEN 'PUBLIC' ELSE quote_ident(split_part(a::text, '=', 1)) END);
    END IF;
  END LOOP;
  IF (SELECT acl FROM phase3_p18.saved_functions WHERE signature = 'public.delete_my_finance_data()') IS NULL THEN
    GRANT EXECUTE ON FUNCTION public.delete_my_finance_data() TO PUBLIC; -- default ACL of the original
  END IF;
END $acl$;

DO $post$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'phase3_p18', 'phase3_p18_private') AND p.prosrc LIKE '%current_setting(''ledgerline.erasing''%') THEN
    RAISE EXCEPTION 'P18: a function still reads ledgerline.erasing';
  END IF;
  -- P0-038: no installed function may still trust one of the retired client-settable exemption settings.
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'phase3_p18', 'phase3_p18_private')
                AND p.prosrc ~ 'current_setting\(''(phase3_p11\.checked|phase3_p10\.writing|phase3_p13\.(applying|deciding)|phase3_p7\.(writer|reversal_insert|reason|request|meta)|phase3_p9\.(claiming|discarding)|phase3_p14\.writing|ledgerline\.(posting_writer|accounting_request|restoring))''') THEN
    RAISE EXCEPTION 'P18: a function still trusts a client-settable exemption setting (P0-038); install the fixed proposed files';
  END IF;
END $post$;
COMMIT;
