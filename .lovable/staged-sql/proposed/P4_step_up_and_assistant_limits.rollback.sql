-- ============================================================================================
-- P4_step_up_and_assistant_limits.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores the exact P1+P2 objects: every guarded function gets its original oid, name, body and
-- EXECUTE grants back (the __unguarded copy IS the original, renamed), all P4 policies and helper
-- functions are dropped, device_passkeys.id is dropped, and step_up_grants /
-- revoked_assistant_clients are MOVED (never dropped) to security_rollback_archive with a UTC
-- timestamp suffix. Run BEFORE the P2 rollback (which refuses while P4 is installed).
-- Effect: step-up and assistant limits stop being enforced by the database (contract M-4 re-opens).
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regclass('security_p4.guarded_functions') IS NULL OR to_regclass('public.step_up_grants') IS NULL THEN
    RAISE EXCEPTION 'P4 is not installed';
  END IF;
END $pre$;

-- 1. Policies (exact names created by P4)
DO $pol$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies
           WHERE (schemaname = 'public' AND policyname IN ('P4 assistants cannot insert', 'P4 assistants cannot update', 'P4 assistants cannot delete',
                    'P4 revoked assistants cannot read', 'P4 audit history cannot be changed', 'P4 audit history cannot be deleted',
                    'P4 passkeys are removed through remove_device_passkey'))
              OR (schemaname = 'storage' AND tablename = 'objects' AND policyname IN ('P4 assistants cannot write files', 'P4 assistants cannot change files',
                    'P4 assistants cannot delete files', 'P4 revoked assistants cannot read files'))
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $pol$;

-- 2. Guarded functions: drop the wrapper, rename the original back, restore its grants.
DO $unguard$
DECLARE g record; sig regprocedure; a record; owner_oid oid;
BEGIN
  FOR g IN SELECT * FROM security_p4.guarded_functions ORDER BY seq DESC LOOP
    EXECUTE format('DROP FUNCTION public.%I(%s)', g.proname, g.identity_args);
    EXECUTE format('ALTER FUNCTION public.%I(%s) RENAME TO %I', g.proname || '__unguarded', g.identity_args, g.proname);
    sig := to_regprocedure(format('public.%I(%s)', g.proname, g.identity_args));
    SELECT proowner INTO owner_oid FROM pg_proc WHERE oid = sig;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', sig);
    FOR a IN SELECT * FROM aclexplode(coalesce(g.original_acl, acldefault('f', owner_oid))) x WHERE x.grantee <> owner_oid AND x.privilege_type = 'EXECUTE' LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s%s', sig,
        CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
        CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
    END LOOP;
  END LOOP;
END $unguard$;
DROP SCHEMA security_p4 CASCADE;

-- 3. P4 functions
DROP FUNCTION public.remove_device_passkey(uuid);
DROP FUNCTION public.revoke_assistant_client(text);
DROP FUNCTION public.refuse_revoked_assistant(text);
DROP FUNCTION public.refuse_assistant_session(text);
DROP FUNCTION public.assistant_client_revoked(uuid);
DROP FUNCTION public.require_recent_step_up(text);
DROP FUNCTION public.has_recent_step_up();
DROP FUNCTION public.record_step_up(uuid, text, int);
DROP FUNCTION public.is_assistant_session();

-- 4. device_passkeys.id (a random identifier added by P4; credential_id stays the key)
DROP INDEX public.device_passkeys_id_idx;
ALTER TABLE public.device_passkeys DROP COLUMN id;

-- 5. Archive (never drop) the P4 tables
CREATE SCHEMA IF NOT EXISTS security_rollback_archive;
REVOKE ALL ON SCHEMA security_rollback_archive FROM PUBLIC, anon, authenticated;
DO $archive$
DECLARE t text; suffix text := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS');
BEGIN
  FOREACH t IN ARRAY ARRAY['step_up_grants', 'revoked_assistant_clients'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', CASE t WHEN 'step_up_grants' THEN 'Owner reads own step-up grants' ELSE 'Owner reads own revoked assistants' END, t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('ALTER TABLE public.%I SET SCHEMA security_rollback_archive', t);
    EXECUTE format('ALTER TABLE security_rollback_archive.%I RENAME TO %I', t, t || '_' || suffix);
  END LOOP;
END $archive$;
COMMIT;
