-- ============================================================================================
-- P4b_api_pre_request.sql (PROPOSED ONLY: NOT APPLIED; NOT part of the automatic P1->P2->P4 order)
-- Optional PostgREST pre-request hook for the contract's "blocks non-GET calls from assistant
-- sessions". Requires P4 (is_assistant_session, assistant_client_revoked).
--
-- NEEDS HOSTED VERIFICATION BEFORE ACTIVATION (KK approval):
--   * Lovable Cloud / Supabase must allow setting the authenticator role's pgrst.db_pre_request and
--     reloading PostgREST config; this cannot be checked in PGlite.
--   * PostgREST sends RPC calls as POST by default. With the hook active, an external assistant can
--     still call read-only RPCs only with GET (supabase-js rpc(..., { get: true })). Check the MCP
--     server's read tools (src/lib/mcp/) before activating.
--   * Storage and Auth requests do not pass through PostgREST and are not covered (storage writes
--     are covered by P4's RESTRICTIVE storage.objects policies).
-- Activation (separate, approved step; NOT executed by this file):
--   ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.api_pre_request';
--   NOTIFY pgrst, 'reload config';
-- Deactivation:
--   ALTER ROLE authenticator RESET pgrst.db_pre_request; NOTIFY pgrst, 'reload config';
-- Rollback of the function: P4b_api_pre_request.rollback.sql (deactivate first).
-- ============================================================================================
BEGIN;
DO $pre$
BEGIN
  IF to_regprocedure('public.is_assistant_session()') IS NULL OR to_regprocedure('public.assistant_client_revoked(uuid)') IS NULL THEN
    RAISE EXCEPTION 'P4b requires P4_step_up_and_assistant_limits.sql';
  END IF;
END $pre$;

CREATE OR REPLACE FUNCTION public.api_pre_request() RETURNS void
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE m text := upper(coalesce(current_setting('request.method', true), ''));
BEGIN
  IF NOT public.is_assistant_session() THEN RETURN; END IF;
  IF public.assistant_client_revoked(NULL) THEN
    RAISE EXCEPTION 'ASSISTANT_REVOKED: this assistant was disconnected' USING ERRCODE = '42501';
  END IF;
  IF m NOT IN ('GET', 'HEAD', 'OPTIONS') THEN
    RAISE EXCEPTION 'ASSISTANT_READ_ONLY: % requests are not allowed for connected assistants', coalesce(nullif(m, ''), 'unknown') USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.api_pre_request() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_pre_request() TO anon, authenticated, service_role;
COMMIT;
