-- ============================================================================================
-- P19_finance_operation_authority.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores the exact pre-P19 catalog: finance_operation, receive_claim_receipt (and P4's __unguarded copies when they
-- exist) get back their saved definitions (SECURITY INVOKER, search_path = public) and EXECUTE grants; the 0012 policy
-- "Operations only recorded by finance workflow" and the previous finance_operations table privileges come back; the
-- request hash column, the P19 policies and the phase3_p19 schema are dropped. Roll back P19 FIRST (before any earlier
-- proposed file). This RE-OPENS P0-038 row 13 (app.finance_owner is trusted again). Idempotency records written while
-- P19 was installed stay (only their request hash is dropped).
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase3_p19') IS NULL THEN RAISE EXCEPTION 'P19 is not installed'; END IF;
  IF EXISTS (SELECT 1 FROM phase3_p19.authority) THEN RAISE EXCEPTION 'P19 rollback: a finance operation is in progress'; END IF;
END $pre$;

DO $r$
DECLARE f record; a record; m text;
BEGIN
  FOR f IN SELECT * FROM phase3_p19.saved_functions ORDER BY signature LOOP
    EXECUTE f.definition;
    SELECT md5(prosrc) INTO m FROM pg_proc WHERE oid = to_regprocedure(f.signature);
    IF m IS DISTINCT FROM f.prosrc_md5 THEN RAISE EXCEPTION 'P19 rollback: % was not restored exactly', f.signature; END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f.signature);
    FOR a IN SELECT x.* FROM pg_proc p, aclexplode(coalesce(f.acl, acldefault('f', p.proowner))) x
              WHERE p.oid = to_regprocedure(f.signature) AND x.grantee <> p.proowner AND x.privilege_type = 'EXECUTE' LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', f.signature, CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END);
    END LOOP;
  END LOOP;
END $r$;

DROP POLICY "P19 operations recorded only by the finance workflow" ON public.finance_operations;
DROP POLICY "P19 operation records cannot be changed" ON public.finance_operations;
DROP POLICY "P19 operation records cannot be deleted" ON public.finance_operations;
CREATE POLICY "Operations only recorded by finance workflow" ON public.finance_operations AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(current_setting('app.finance_owner',true)=auth.uid()::text);
ALTER TABLE public.finance_operations DROP COLUMN request_sha256;

-- Table privileges exactly as saved (rebuilt in the saved order, so the ACL compares equal).
DO $t$
DECLARE a record; r record; saved aclitem[];
BEGIN
  SELECT acl INTO saved FROM phase3_p19.saved_table_acl WHERE relation = 'public.finance_operations';
  FOR r IN SELECT DISTINCT x.grantee FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
            WHERE c.oid = 'public.finance_operations'::regclass AND x.grantee <> c.relowner
           UNION SELECT x.grantee FROM pg_class c, aclexplode(coalesce(saved, acldefault('r', c.relowner))) x
            WHERE c.oid = 'public.finance_operations'::regclass AND x.grantee <> c.relowner LOOP
    EXECUTE format('REVOKE ALL ON public.finance_operations FROM %s', CASE WHEN r.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END);
  END LOOP;
  FOR a IN SELECT x.grantee, string_agg(x.privilege_type, ', ' ORDER BY x.privilege_type) privs, bool_or(x.is_grantable) g, min(x.n) n
             FROM pg_class c, aclexplode(coalesce(saved, acldefault('r', c.relowner))) WITH ORDINALITY x(grantor, grantee, privilege_type, is_grantable, n)
            WHERE c.oid = 'public.finance_operations'::regclass AND x.grantee <> c.relowner GROUP BY x.grantee ORDER BY min(x.n) LOOP
    EXECUTE format('GRANT %s ON public.finance_operations TO %s', a.privs, CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END);
  END LOOP;
  IF (SELECT relacl FROM pg_class WHERE oid = 'public.finance_operations'::regclass) IS DISTINCT FROM saved THEN
    RAISE EXCEPTION 'P19 rollback: finance_operations privileges were not restored exactly';
  END IF;
END $t$;

DROP SCHEMA phase3_p19 CASCADE;
COMMIT;
