-- P4b_api_pre_request.rollback.sql (PROPOSED ONLY). Deactivate the hook first:
--   ALTER ROLE authenticator RESET pgrst.db_pre_request; NOTIFY pgrst, 'reload config';
-- Then run this file, and only then the P4 rollback.
BEGIN;
DROP FUNCTION IF EXISTS public.api_pre_request();
COMMIT;
