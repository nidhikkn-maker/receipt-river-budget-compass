-- ============================================================================================
-- P4_step_up_and_assistant_limits.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Restores the exact P1+P2 objects: every guarded function gets its original oid, name, body and
-- EXECUTE grants back (the __unguarded copy IS the original, renamed), all P4 policies, the passkey
-- audit and counter triggers and helper functions are dropped, device_passkeys gets its saved UPDATE grants back,
-- and step_up_grants, revoked_assistant_clients, step_up_attempts and security_events are MOVED (never
-- dropped) to security_rollback_archive with a UTC timestamp suffix, so audit evidence is kept.
-- Run BEFORE the P2 rollback (which refuses while P4 is installed).
-- Effect: step-up and assistant limits stop being enforced by the database (contract M-4 re-opens).
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regclass('security_p4.guarded_functions') IS NULL OR to_regclass('public.step_up_grants') IS NULL THEN
    RAISE EXCEPTION 'P4 is not installed';
  END IF;
  IF to_regclass('public.legal_entities') IS NOT NULL OR to_regnamespace('phase2_p5') IS NOT NULL THEN
    RAISE EXCEPTION 'Roll back P5 (P5_legal_entities_foundation.rollback.sql) before P4';
  END IF;
  IF to_regnamespace('phase2_p5b') IS NOT NULL THEN
    RAISE EXCEPTION 'Roll back P5b (P5b_restore_investments.rollback.sql) before P4';
  END IF;
END $pre$;

-- 1. Policies (exact names created by P4)
DO $pol$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies
           WHERE (schemaname = 'public' AND policyname IN ('P4 assistants cannot insert', 'P4 assistants cannot update', 'P4 assistants cannot delete',
                    'P4 revoked assistants cannot read', 'P4 audit history cannot be changed', 'P4 audit history cannot be deleted',
                    'P4 passkeys are removed through remove_device_passkey', 'P4 passkey registration needs a fresh step-up'))
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

-- 2b. device_passkeys: audit trigger off, column-only UPDATE replaced by the saved table-level grants.
DROP TRIGGER p4_passkey_registered_audit ON public.device_passkeys;
DROP TRIGGER p4_passkey_counter_monotonic ON public.device_passkeys;
DO $acl$
DECLARE a record; owner_oid oid; saved aclitem[];
BEGIN
  SELECT acl INTO saved FROM security_p4.saved_acl WHERE relname = 'device_passkeys';
  SELECT relowner INTO owner_oid FROM pg_class WHERE oid = 'public.device_passkeys'::regclass;
  REVOKE UPDATE (counter) ON public.device_passkeys FROM authenticated;
  FOR a IN SELECT * FROM aclexplode(coalesce(saved, acldefault('r', owner_oid))) x WHERE x.grantee <> owner_oid AND x.privilege_type = 'UPDATE' LOOP
    EXECUTE format('GRANT UPDATE ON public.device_passkeys TO %s%s',
      CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
      CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;
END $acl$;
DROP SCHEMA security_p4 CASCADE;

-- 3. P4 functions
DROP FUNCTION public.log_passkey_registered();
DROP FUNCTION public.guard_device_passkey_update();
DROP FUNCTION public.remove_device_passkey(text);
DROP FUNCTION public.revoke_assistant_client(text);
DROP FUNCTION public.refuse_revoked_assistant(text);
DROP FUNCTION public.refuse_assistant_session(text);
DROP FUNCTION public.assistant_client_revoked(uuid);
DROP FUNCTION public.finish_step_up_attempt(uuid, boolean);
DROP FUNCTION public.begin_step_up_attempt(uuid, text, uuid);
DROP FUNCTION public.require_recent_step_up(text);
DROP FUNCTION public.has_recent_step_up();
DROP FUNCTION public.has_recent_step_up_for(text);
DROP FUNCTION public.record_step_up(uuid, text, int, uuid, text);
DROP FUNCTION public.log_security_event(uuid, text, text, text, uuid, jsonb);
DROP FUNCTION public.jwt_session_id();
DROP FUNCTION public.is_assistant_session();

-- 4. Archive (never drop) the P4 tables
CREATE SCHEMA IF NOT EXISTS security_rollback_archive;
REVOKE ALL ON SCHEMA security_rollback_archive FROM PUBLIC, anon, authenticated;
DO $archive$
DECLARE t text; suffix text := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS');
BEGIN
  FOREACH t IN ARRAY ARRAY['step_up_grants', 'revoked_assistant_clients', 'step_up_attempts', 'security_events'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', CASE t WHEN 'step_up_grants' THEN 'Owner reads own step-up grants'
      WHEN 'revoked_assistant_clients' THEN 'Owner reads own revoked assistants' WHEN 'security_events' THEN 'Owner reads own security events'
      ELSE 'no owner policy' END, t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('ALTER TABLE public.%I SET SCHEMA security_rollback_archive', t);
    EXECUTE format('ALTER TABLE security_rollback_archive.%I RENAME TO %I', t, t || '_' || suffix);
  END LOOP;
END $archive$;
COMMIT;
