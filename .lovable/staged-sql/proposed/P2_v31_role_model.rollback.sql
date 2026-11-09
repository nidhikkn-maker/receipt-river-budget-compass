-- ============================================================================================
-- P2_v31_role_model.rollback.sql (PROPOSED ONLY: NOT APPLIED anywhere)
-- Removes the V3.1 functions and moves (never drops) the three P2 tables into the
-- security_rollback_archive schema with a timestamp suffix, so grants and their audit history
-- are preserved for KK. No pre-existing table is touched; entity_members was never modified.
-- Clients lose all access to the archived tables. Run BEFORE P1 rollback.
-- ============================================================================================
BEGIN;
DO $pre$
BEGIN
  IF to_regclass('public.step_up_grants') IS NOT NULL THEN
    RAISE EXCEPTION 'Roll back P4 (P4_step_up_and_assistant_limits.rollback.sql) before P2';
  END IF;
END $pre$;
CREATE SCHEMA IF NOT EXISTS security_rollback_archive;
REVOKE ALL ON SCHEMA security_rollback_archive FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_entity_member_grant ON public.entity_members;
DROP FUNCTION IF EXISTS public.sync_entity_member_grant();
DROP TRIGGER IF EXISTS access_grant_audit_append_only ON public.access_grant_audit;
DROP FUNCTION IF EXISTS public.my_access_invites();
DROP FUNCTION IF EXISTS public.revoke_access(uuid);
DROP FUNCTION IF EXISTS public.accept_access(uuid);
DROP FUNCTION IF EXISTS public.invite_access(uuid, text, text, text, timestamptz);
DROP FUNCTION IF EXISTS public.has_permission(uuid, text, text);
DROP FUNCTION IF EXISTS public.guard_access_audit_append_only();

DO $archive$
DECLARE t text; suffix text := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS');
BEGIN
  FOREACH t IN ARRAY ARRAY['access_grant_audit', 'access_grants', 'access_role_permissions'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA security_rollback_archive', t);
      EXECUTE format('ALTER TABLE security_rollback_archive.%I RENAME TO %I', t, t || '_' || suffix);
    END IF;
  END LOOP;
END $archive$;
COMMIT;
