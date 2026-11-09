-- ============================================================================================
-- P4_step_up_and_assistant_limits.sql (PROPOSED ONLY: NOT APPLIED to Lovable Cloud, Live or any hosted DB)
-- Prepared 2026-11-09 for KK review. Implements docs/plans/PHASE1_SECURITY_CONTRACT_2026-11-09.md
-- (database side). See docs/plans/SECURITY_MIGRATION_PLAN_2026-11-09.md section 13.
-- Requires P1_security_containment.sql and P2_v31_role_model.sql (preflight checks both).
-- Rollback: P4_step_up_and_assistant_limits.rollback.sql (restores the exact P1+P2 objects; archives
-- step_up_grants and revoked_assistant_clients, never drops their rows).
-- Data: changes NO existing row value and adds NO column to an existing table. Changes are
-- functions, policies, grants, one audit trigger and four new tables.
--
--  1. Step-up ("re-confirmation") enforced in the database:
--       step_up_grants (method passkey|password|email_otp, scope all|credential, optional session_id),
--       record_step_up (service_role only), has_recent_step_up, has_recent_step_up_for(_action),
--       require_recent_step_up -> raises 'STEP_UP_REQUIRED: <action>' (SQLSTATE 42501), and always for
--       external-assistant sessions. A grant recorded with a session id only authorises that session
--       (auth.jwt()->>'session_id'). Scope 'credential' (email one-time code) authorises ONLY
--       passkey registration ('register_passkey'), never a guarded function.
--  1b. Shared rate limit for step-up verification (all server instances): step_up_attempts +
--       begin_step_up_attempt / finish_step_up_attempt (service_role only). 5 failed or unfinished
--       attempts per owner in 15 minutes (counted since the owner's last success) refuse further
--       attempts; begin returns NULL instead of raising so the 'step_up_rate_limited' audit row is kept.
--  1c. Audit: security_events (append-only; owner reads own rows; written only by SECURITY DEFINER
--       functions and the passkey registration trigger).
--  2. External assistants (OAuth tokens carrying a client_id claim):
--       is_assistant_session, refuse_assistant_session ('ASSISTANT_READ_ONLY: <action>', 42501),
--       revoked_assistant_clients + revoke_assistant_client, assistant_client_revoked,
--       RESTRICTIVE policies on every RLS table in public (and storage.objects): no INSERT/UPDATE/
--       DELETE for assistant sessions; no SELECT for an assistant whose client the caller or the row's
--       owner revoked.
--  3. Guarded functions keep their names, signatures, return types, SECURITY mode and EXECUTE grants.
--       * SECURITY DEFINER originals: renamed to <name>__unguarded (EXECUTE revoked from PUBLIC, anon
--         and authenticated) and replaced by a SECURITY DEFINER wrapper that runs the check and then
--         delegates to <name>__unguarded with the same arguments.
--       * SECURITY INVOKER originals (restore_finance_backup and the invoker money-movers): a definer
--         wrapper would run the body as the table owner and bypass RLS, and an invoker wrapper cannot
--         call an __unguarded copy that clients may not execute. So the original is still renamed to
--         <name>__unguarded (clients lose EXECUTE; kept unchanged for rollback/audit) and the public
--         name is re-created from the original definition with the check inserted as the first
--         statement of its body. Behaviour, RLS and grants are otherwise identical.
--  4. Audit history (transaction_audit, role_permission_audit, access_grant_audit,
--     period_close_evidence, imported_period_history, preference_approvals, security_events) is
--     append-only for clients (RESTRICTIVE UPDATE/DELETE deny). delete_my_finance_data (SECURITY
--     DEFINER, now step-up guarded) keeps its erasure behaviour (KK decision C13 pending); it does not
--     touch step_up_grants, step_up_attempts or security_events (kept like role_permission_audit).
--  5. Device passkeys (applied table keyed by credential_id; no id column is added):
--       removal only through remove_device_passkey(_credential_id text) (step-up guarded, owner only,
--       exactly one row); registration (INSERT) needs a fresh grant for 'register_passkey' (any scope);
--       clients may UPDATE only the counter column, which can never decrease (trigger, every role); every
--       registration writes 'passkey_registered'.
-- Every object is created in dependency order below; nothing relies on alphabetical order.
-- ============================================================================================
BEGIN;

-- 0. Preflight
DO $pre$
BEGIN
  IF to_regprocedure('public.guard_shared_document_edit()') IS NULL THEN
    RAISE EXCEPTION 'P4 requires P1_security_containment.sql';
  END IF;
  IF to_regprocedure('public.has_permission(uuid,text,text)') IS NULL OR to_regclass('public.access_grants') IS NULL THEN
    RAISE EXCEPTION 'P4 requires P2_v31_role_model.sql';
  END IF;
  IF to_regclass('public.step_up_grants') IS NOT NULL OR to_regnamespace('security_p4') IS NOT NULL THEN
    RAISE EXCEPTION 'P4 is already installed';
  END IF;
END $pre$;

-- Private schema for P4 bookkeeping used by the rollback (guarded-function registry, saved ACLs).
CREATE SCHEMA security_p4;
REVOKE ALL ON SCHEMA security_p4 FROM PUBLIC, anon, authenticated;
CREATE TABLE security_p4.saved_acl (relname text PRIMARY KEY, acl aclitem[]);
REVOKE ALL ON security_p4.saved_acl FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------------------------
-- 1. Session helpers
-- --------------------------------------------------------------------------------------------
-- An external assistant's OAuth access token carries a client_id claim; first-party sessions do not.
CREATE FUNCTION public.is_assistant_session() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT coalesce(auth.jwt()->>'client_id', '') <> ''
$$;

-- The Supabase auth session that issued the caller's access token (claim session_id), or NULL.
CREATE FUNCTION public.jwt_session_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN (auth.jwt()->>'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (auth.jwt()->>'session_id')::uuid END
$$;

-- --------------------------------------------------------------------------------------------
-- 2. Security audit log (append-only). Rows are written only by the SECURITY DEFINER functions below
--    and the passkey registration trigger; clients have SELECT on their own rows and nothing else.
-- --------------------------------------------------------------------------------------------
CREATE TABLE public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial NOT NULL UNIQUE, -- write order (several events can share one timestamp)
  owner_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('step_up_recorded', 'step_up_failed', 'step_up_rate_limited', 'sensitive_action_authorised',
    'passkey_removed', 'passkey_registered', 'assistant_client_revoked')),
  action text,
  method text CHECK (method IN ('passkey', 'password', 'email_otp')),
  session_id uuid,
  client_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX security_events_owner_idx ON public.security_events(owner_id, created_at DESC);
COMMENT ON TABLE public.security_events IS 'P4: append-only security audit (step-up, rate limit, sensitive actions, passkeys, assistant revocation). Owner reads own rows; written only by SECURITY DEFINER functions. Kept by delete_my_finance_data pending KK decision C13.';
REVOKE ALL ON public.security_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.security_events TO authenticated, service_role;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own security events" ON public.security_events FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

-- Internal writer (no client or service_role EXECUTE): client_id is the caller's own claim (NULL for
-- first-party sessions), never a parameter.
CREATE FUNCTION public.log_security_event(_owner uuid, _event text, _action text, _method text, _session uuid, _detail jsonb DEFAULT '{}'::jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.security_events(owner_id, event, action, method, session_id, client_id, detail)
  VALUES (_owner, _event, _action, _method, _session, nullif(auth.jwt()->>'client_id', ''), coalesce(_detail, '{}'::jsonb));
END $$;

-- --------------------------------------------------------------------------------------------
-- 3. Step-up grants
-- --------------------------------------------------------------------------------------------
CREATE TABLE public.step_up_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('passkey', 'password', 'email_otp')),
  scope text NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'credential')),
  session_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '5 minutes'),
  CHECK (method <> 'email_otp' OR scope = 'credential')
);
CREATE INDEX step_up_grants_owner_idx ON public.step_up_grants(owner_id, expires_at DESC);
COMMENT ON TABLE public.step_up_grants IS 'P4: recent re-confirmations recorded by server functions via record_step_up. scope all = passkey/password (every guarded action); scope credential = email code (passkey registration only). session_id binds the grant to one auth session. Clients read their own rows only.';
-- Supabase default privileges grant ALL on new tables to anon/authenticated: remove them explicitly.
REVOKE ALL ON public.step_up_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.step_up_grants TO authenticated;
GRANT ALL ON public.step_up_grants TO service_role;
ALTER TABLE public.step_up_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own step-up grants" ON public.step_up_grants FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

-- Called by server functions (service role) after verifying a passkey, the account password or an
-- email one-time code. The 4-digit device PIN never calls this (Decision 30); 'pin' is refused.
-- _scope NULL derives it: passkey/password -> 'all', email_otp -> 'credential' (email_otp can never be 'all').
-- _session: the auth session id of the token that confirmed (claim session_id); NULL = any session of
-- the owner (backward compatible with callers that pass three arguments).
CREATE FUNCTION public.record_step_up(_owner uuid, _method text, _seconds int DEFAULT 300, _session uuid DEFAULT NULL, _scope text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE sc text := coalesce(_scope, CASE WHEN _method = 'email_otp' THEN 'credential' ELSE 'all' END); ts timestamptz;
BEGIN
  IF _owner IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _owner) THEN
    RAISE EXCEPTION 'Unknown account for step-up';
  END IF;
  IF _method IS NULL OR _method NOT IN ('passkey', 'password', 'email_otp') THEN
    RAISE EXCEPTION 'Step-up method must be passkey, password or email_otp';
  END IF;
  IF sc NOT IN ('all', 'credential') THEN RAISE EXCEPTION 'Step-up scope must be all or credential'; END IF;
  IF _method = 'email_otp' AND sc <> 'credential' THEN
    RAISE EXCEPTION 'An email code can only confirm passkey registration (scope credential)';
  END IF;
  IF _seconds IS NULL OR _seconds < 1 OR _seconds > 300 THEN
    RAISE EXCEPTION 'Step-up lifetime must be between 1 and 300 seconds';
  END IF;
  -- One timestamp for both columns: two clock_timestamp() calls differ by microseconds, which would make a
  -- 300-second grant exceed the "expires within 5 minutes of creation" CHECK.
  ts := clock_timestamp();
  INSERT INTO public.step_up_grants(owner_id, method, scope, session_id, created_at, expires_at)
  VALUES (_owner, _method, sc, _session, ts, ts + make_interval(secs => _seconds));
  PERFORM public.log_security_event(_owner, 'step_up_recorded', NULL, _method, _session, jsonb_build_object('scope', sc, 'seconds', _seconds));
END $$;

-- True when the caller (never an assistant session) holds an unexpired grant for _action from this
-- session (or an unbound grant). Scope 'credential' counts only for _action = 'register_passkey'.
CREATE FUNCTION public.has_recent_step_up_for(_action text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND NOT public.is_assistant_session()
    AND EXISTS (SELECT 1 FROM public.step_up_grants g
      WHERE g.owner_id = auth.uid() AND g.expires_at > clock_timestamp()
        AND (g.session_id IS NULL OR g.session_id = public.jwt_session_id())
        AND (g.scope = 'all' OR (g.scope = 'credential' AND coalesce(_action, '') = 'register_passkey')))
$$;

-- True when the caller holds a grant that satisfies every guarded action (scope 'all').
CREATE FUNCTION public.has_recent_step_up() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.has_recent_step_up_for(NULL)
$$;

-- Guard for sensitive actions. VOLATILE because a successful check writes a
-- 'sensitive_action_authorised' audit row; that row rolls back with the action if the action fails.
-- Only registered sensitive actions are accepted, so the audit log cannot carry made-up action names.
CREATE FUNCTION public.require_recent_step_up(_action text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE act text := coalesce(_action, 'action'); g record;
BEGIN
  IF public.is_assistant_session() OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'STEP_UP_REQUIRED: %', act USING ERRCODE = '42501';
  END IF;
  IF act NOT IN ('remove_device_passkey', 'revoke_assistant_client')
     AND NOT EXISTS (SELECT 1 FROM security_p4.guarded_functions f WHERE f.proname = act AND f.mode IN ('step_up', 'step_up_if_approved')) THEN
    RAISE EXCEPTION 'Unknown sensitive action %', act USING ERRCODE = '22023';
  END IF;
  SELECT x.id, x.method INTO g FROM public.step_up_grants x
  WHERE x.owner_id = auth.uid() AND x.expires_at > clock_timestamp() AND x.scope = 'all'
    AND (x.session_id IS NULL OR x.session_id = public.jwt_session_id())
  ORDER BY x.created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STEP_UP_REQUIRED: %', act USING ERRCODE = '42501';
  END IF;
  PERFORM public.log_security_event(auth.uid(), 'sensitive_action_authorised', act, g.method, public.jwt_session_id(), jsonb_build_object('grant_id', g.id));
END $$;

-- --------------------------------------------------------------------------------------------
-- 3b. Shared step-up rate limit (replaces the per-server-instance in-memory counter)
--     Rule: per owner, across methods, attempts in the last 15 minutes that failed OR never finished
--     (fail closed) and started after the owner's latest success. At 5, begin_step_up_attempt logs
--     'step_up_rate_limited' and returns NULL (no attempt row). A success keeps all rows as evidence.
--     pg_advisory_xact_lock serialises concurrent begins per owner across connections and instances.
-- --------------------------------------------------------------------------------------------
CREATE TABLE public.step_up_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('passkey', 'password', 'email_otp')),
  session_id uuid,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  outcome text CHECK (outcome IN ('ok', 'fail')),
  CHECK ((outcome IS NULL) = (finished_at IS NULL)),
  CHECK (finished_at IS NULL OR finished_at >= started_at)
);
CREATE INDEX step_up_attempts_owner_idx ON public.step_up_attempts(owner_id, started_at DESC);
COMMENT ON TABLE public.step_up_attempts IS 'P4: step-up verification attempts for the shared rate limit. No client access; used only through begin_step_up_attempt / finish_step_up_attempt (service_role).';
REVOKE ALL ON public.step_up_attempts FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.step_up_attempts ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.begin_step_up_attempt(_owner uuid, _method text, _session uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE last_ok timestamptz; n int; new_id uuid; now_ts timestamptz;
BEGIN
  IF _owner IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _owner) THEN
    RAISE EXCEPTION 'Unknown account for step-up';
  END IF;
  IF _method IS NULL OR _method NOT IN ('passkey', 'password', 'email_otp') THEN
    RAISE EXCEPTION 'Step-up method must be passkey, password or email_otp';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('public.step_up_attempts:' || _owner::text, 0));
  now_ts := clock_timestamp();
  SELECT max(a.finished_at) INTO last_ok FROM public.step_up_attempts a WHERE a.owner_id = _owner AND a.outcome = 'ok';
  SELECT count(*) INTO n FROM public.step_up_attempts a
  WHERE a.owner_id = _owner AND a.outcome IS DISTINCT FROM 'ok'
    AND a.started_at > now_ts - interval '15 minutes'
    AND (last_ok IS NULL OR a.started_at > last_ok);
  IF n >= 5 THEN
    PERFORM public.log_security_event(_owner, 'step_up_rate_limited', NULL, _method, _session,
      jsonb_build_object('recent_failures', n, 'limit', 5, 'window_minutes', 15));
    RETURN NULL;
  END IF;
  INSERT INTO public.step_up_attempts(owner_id, method, session_id, started_at) VALUES (_owner, _method, _session, now_ts)
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

CREATE FUNCTION public.finish_step_up_attempt(_id uuid, _ok boolean) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a record;
BEGIN
  UPDATE public.step_up_attempts SET outcome = CASE WHEN _ok THEN 'ok' ELSE 'fail' END, finished_at = greatest(clock_timestamp(), started_at)
  WHERE id = _id AND outcome IS NULL
  RETURNING owner_id, method, session_id INTO a;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown or already finished step-up attempt'; END IF;
  IF _ok IS NOT TRUE THEN
    PERFORM public.log_security_event(a.owner_id, 'step_up_failed', NULL, a.method, a.session_id, jsonb_build_object('attempt_id', _id));
  END IF;
END $$;

-- --------------------------------------------------------------------------------------------
-- 4. Assistant revocation
-- --------------------------------------------------------------------------------------------
CREATE TABLE public.revoked_assistant_clients (
  owner_id uuid NOT NULL,
  client_id text NOT NULL CHECK (client_id = btrim(client_id) AND client_id <> '' AND length(client_id) <= 255),
  revoked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, client_id)
);
CREATE INDEX revoked_assistant_clients_client_idx ON public.revoked_assistant_clients(client_id, owner_id);
COMMENT ON TABLE public.revoked_assistant_clients IS 'P4: external assistant clients an owner revoked. Effective on the next statement; written only by revoke_assistant_client.';
REVOKE ALL ON public.revoked_assistant_clients FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.revoked_assistant_clients TO authenticated;
GRANT ALL ON public.revoked_assistant_clients TO service_role;
ALTER TABLE public.revoked_assistant_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own revoked assistants" ON public.revoked_assistant_clients FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

-- True for an assistant session whose client was revoked by the caller or by _owner (the row's owner).
-- SECURITY DEFINER because another owner's revocation is not visible to the caller under RLS.
CREATE FUNCTION public.assistant_client_revoked(_owner uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.is_assistant_session() AND EXISTS (
    SELECT 1 FROM public.revoked_assistant_clients r
    WHERE r.client_id = auth.jwt()->>'client_id' AND (r.owner_id = auth.uid() OR r.owner_id = _owner))
$$;

CREATE FUNCTION public.refuse_assistant_session(_action text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.is_assistant_session() THEN
    RAISE EXCEPTION 'ASSISTANT_READ_ONLY: %', coalesce(_action, 'action') USING ERRCODE = '42501';
  END IF;
END $$;

CREATE FUNCTION public.refuse_revoked_assistant(_action text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.assistant_client_revoked(NULL) THEN
    RAISE EXCEPTION 'ASSISTANT_REVOKED: %', coalesce(_action, 'action') USING ERRCODE = '42501';
  END IF;
END $$;

CREATE FUNCTION public.revoke_assistant_client(_client_id text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); cid text := btrim(coalesce(_client_id, ''));
BEGIN
  PERFORM public.require_recent_step_up('revoke_assistant_client');
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF cid = '' OR length(cid) > 255 THEN RAISE EXCEPTION 'Unknown assistant'; END IF;
  INSERT INTO public.revoked_assistant_clients(owner_id, client_id) VALUES (uid, cid)
  ON CONFLICT (owner_id, client_id) DO NOTHING;
  PERFORM public.log_security_event(uid, 'assistant_client_revoked', 'revoke_assistant_client', NULL, public.jwt_session_id(),
    jsonb_build_object('revoked_client_id', cid, 'already_revoked', NOT FOUND));
END $$;

-- --------------------------------------------------------------------------------------------
-- 5. Device passkeys (applied table: credential_id text PRIMARY KEY; no column is added)
-- --------------------------------------------------------------------------------------------
-- Removes exactly the caller's row with this credential id; anything else raises and deletes nothing.
CREATE FUNCTION public.remove_device_passkey(_credential_id text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); n int;
BEGIN
  PERFORM public.require_recent_step_up('remove_device_passkey'); -- also refuses assistant sessions
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  DELETE FROM public.device_passkeys WHERE credential_id = _credential_id AND owner_id = uid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Passkey not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.log_security_event(uid, 'passkey_removed', 'remove_device_passkey', NULL, public.jwt_session_id(),
    jsonb_build_object('credential_id', _credential_id));
END $$;

-- Direct client deletes would bypass the step-up.
CREATE POLICY "P4 passkeys are removed through remove_device_passkey" ON public.device_passkeys
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);
-- Registration (INSERT with the user's token by the passkey server function) needs a fresh grant for
-- 'register_passkey' from this session: passkey/password ('all') or an email code ('credential').
CREATE POLICY "P4 passkey registration needs a fresh step-up" ON public.device_passkeys
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (public.has_recent_step_up_for('register_passkey'));
-- Clients may update only the signature counter (unlock / step-up); credential_id, public_key and owner_id
-- can never be replaced in place (replacement = remove + register, both step-up guarded).
INSERT INTO security_p4.saved_acl(relname, acl) SELECT 'device_passkeys', relacl FROM pg_class WHERE oid = 'public.device_passkeys'::regclass;
REVOKE UPDATE ON public.device_passkeys FROM PUBLIC, anon, authenticated;
GRANT UPDATE (counter) ON public.device_passkeys TO authenticated;

-- Audit every registration; runs as the definer so the row cannot be forged or skipped by the client.
CREATE FUNCTION public.log_passkey_registered() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m text;
BEGIN
  SELECT g.method INTO m FROM public.step_up_grants g
  WHERE g.owner_id = NEW.owner_id AND g.expires_at > clock_timestamp()
    AND (g.session_id IS NULL OR g.session_id = public.jwt_session_id())
  ORDER BY g.created_at DESC LIMIT 1;
  PERFORM public.log_security_event(NEW.owner_id, 'passkey_registered', 'register_passkey', m, public.jwt_session_id(),
    jsonb_build_object('credential_id', NEW.credential_id));
  RETURN NULL;
END $$;
CREATE TRIGGER p4_passkey_registered_audit AFTER INSERT ON public.device_passkeys
  FOR EACH ROW EXECUTE FUNCTION public.log_passkey_registered();

-- The signature counter only moves forward (a lowered counter would let a cloned authenticator's
-- assertions pass the counter-regression check), and a stored key is never rewritten in place. Applies to
-- every role, including the service role and definer functions; the column grant above already limits clients.
CREATE FUNCTION public.guard_device_passkey_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.counter < OLD.counter THEN
    RAISE EXCEPTION 'PASSKEY_COUNTER_REGRESSION: the signature counter cannot decrease' USING ERRCODE = '42501';
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.credential_id IS DISTINCT FROM OLD.credential_id OR NEW.public_key IS DISTINCT FROM OLD.public_key THEN
    RAISE EXCEPTION 'PASSKEY_IMMUTABLE: register a new passkey instead of changing a stored one' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER p4_passkey_counter_monotonic BEFORE UPDATE ON public.device_passkeys
  FOR EACH ROW EXECUTE FUNCTION public.guard_device_passkey_update();

-- --------------------------------------------------------------------------------------------
-- 6. Grants on the new functions
-- --------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_assistant_session(), public.jwt_session_id(),
  public.log_security_event(uuid, text, text, text, uuid, jsonb), public.record_step_up(uuid, text, int, uuid, text),
  public.has_recent_step_up_for(text), public.has_recent_step_up(), public.require_recent_step_up(text),
  public.begin_step_up_attempt(uuid, text, uuid), public.finish_step_up_attempt(uuid, boolean),
  public.assistant_client_revoked(uuid), public.refuse_assistant_session(text), public.refuse_revoked_assistant(text),
  public.revoke_assistant_client(text), public.remove_device_passkey(text), public.log_passkey_registered(), public.guard_device_passkey_update()
  FROM PUBLIC, anon, authenticated, service_role;
-- Server-only (service role): grants and the shared rate limit.
GRANT EXECUTE ON FUNCTION public.record_step_up(uuid, text, int, uuid, text), public.begin_step_up_attempt(uuid, text, uuid),
  public.finish_step_up_attempt(uuid, boolean) TO service_role;
-- Policy helpers must be executable by every role that RLS evaluates them for.
GRANT EXECUTE ON FUNCTION public.is_assistant_session(), public.assistant_client_revoked(uuid), public.has_recent_step_up_for(text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_recent_step_up(), public.require_recent_step_up(text), public.refuse_assistant_session(text),
  public.refuse_revoked_assistant(text), public.revoke_assistant_client(text), public.remove_device_passkey(text)
  TO authenticated, service_role;
-- jwt_session_id, log_security_event, log_passkey_registered and guard_device_passkey_update: no EXECUTE for any client or service role.

-- --------------------------------------------------------------------------------------------
-- 7. Function guards (registry + generator in the private schema; dropped by the rollback)
-- --------------------------------------------------------------------------------------------
CREATE TABLE security_p4.guarded_functions (
  seq serial PRIMARY KEY,
  proname text NOT NULL,
  identity_args text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('step_up', 'step_up_if_approved', 'assistant', 'revoked_read')),
  technique text NOT NULL CHECK (technique IN ('delegate', 'inline')),
  original_acl aclitem[],
  UNIQUE (proname, identity_args)
);
REVOKE ALL ON security_p4.guarded_functions FROM PUBLIC, anon, authenticated;

CREATE FUNCTION security_p4.guard(_fn regprocedure, _mode text) RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $g$
DECLARE
  p pg_proc; ident text; fargs text; fres text; vol text; chk text; call_args text; delegate text;
  def text; body_at int; inj int; newsig regprocedure; a record; guarded text;
BEGIN
  SELECT * INTO p FROM pg_proc WHERE oid = _fn;
  IF NOT FOUND OR p.pronamespace <> 'public'::regnamespace OR p.prokind <> 'f' THEN
    RAISE EXCEPTION 'P4 guard: % is not a plain public function', _fn;
  END IF;
  IF p.proname LIKE '%\_\_unguarded' THEN RAISE EXCEPTION 'P4 guard: % is already guarded', _fn; END IF;
  -- Renaming keeps the oid: an object bound to the oid (policy, trigger, default, view) would follow
  -- the rename and silently skip the guard. Refuse instead.
  IF EXISTS (SELECT 1 FROM pg_depend d WHERE d.refclassid = 'pg_proc'::regclass AND d.refobjid = _fn AND d.deptype = 'n') THEN
    RAISE EXCEPTION 'P4 guard: other objects depend on %', _fn;
  END IF;
  ident := oidvectortypes(p.proargtypes); -- argument types only: usable by ALTER/DROP and to_regprocedure
  fargs := pg_get_function_arguments(_fn);
  fres := pg_get_function_result(_fn);
  vol := CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END;
  guarded := p.proname || '__unguarded';
  chk := CASE _mode
    WHEN 'step_up' THEN format('PERFORM public.require_recent_step_up(%L);', p.proname)
    WHEN 'assistant' THEN format('PERFORM public.refuse_assistant_session(%L);', p.proname)
    WHEN 'revoked_read' THEN format('PERFORM public.refuse_revoked_assistant(%L);', p.proname)
    WHEN 'step_up_if_approved' THEN format('IF $4 IS NOT FALSE THEN PERFORM public.require_recent_step_up(%L); ELSE PERFORM public.refuse_assistant_session(%L); END IF;', p.proname, p.proname)
  END;
  IF chk IS NULL THEN RAISE EXCEPTION 'P4 guard: unknown mode %', _mode; END IF;
  IF _mode = 'step_up_if_approved' AND (p.pronargs <> 4 OR p.proargtypes[3] <> 'boolean'::regtype) THEN
    RAISE EXCEPTION 'P4 guard: % has no 4th boolean _approved argument', _fn;
  END IF;
  def := pg_get_functiondef(_fn);
  INSERT INTO security_p4.guarded_functions(proname, identity_args, mode, technique, original_acl)
  VALUES (p.proname, ident, _mode, CASE WHEN p.prosecdef THEN 'delegate' ELSE 'inline' END, p.proacl);

  EXECUTE format('ALTER FUNCTION public.%I(%s) RENAME TO %I', p.proname, ident, guarded);
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', guarded, ident);

  IF p.prosecdef THEN
    SELECT coalesce(string_agg('$' || i, ', ' ORDER BY i), '') INTO call_args FROM generate_series(1, p.pronargs) i;
    delegate := CASE
      WHEN p.proretset THEN format('RETURN QUERY SELECT * FROM public.%I(%s);', guarded, call_args)
      WHEN p.prorettype = 'void'::regtype THEN format('PERFORM public.%I(%s);', guarded, call_args)
      ELSE format('RETURN public.%I(%s);', guarded, call_args) END;
    EXECUTE format('CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql %s SECURITY DEFINER SET search_path = public, pg_temp AS %L',
      p.proname, fargs, fres, vol, E'\nBEGIN\n  ' || chk || E'\n  ' || delegate || E'\nEND\n');
  ELSE
    IF p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') THEN
      RAISE EXCEPTION 'P4 guard: invoker function % is not plpgsql', _fn;
    END IF;
    body_at := strpos(def, 'AS $function$');
    IF body_at = 0 THEN RAISE EXCEPTION 'P4 guard: cannot locate the body of %', _fn; END IF;
    inj := regexp_instr(substr(def, body_at), '\mbegin\M', 1, 1, 1, 'i');
    IF inj = 0 THEN RAISE EXCEPTION 'P4 guard: cannot locate BEGIN in %', _fn; END IF;
    EXECUTE substr(def, 1, body_at + inj - 2) || ' ' || chk || substr(def, body_at + inj - 1);
  END IF;

  -- Same EXECUTE grants as the original (the owner keeps its implicit entry).
  newsig := to_regprocedure(format('public.%I(%s)', p.proname, ident));
  IF newsig IS NULL THEN RAISE EXCEPTION 'P4 guard: wrapper for % was not created', _fn; END IF;
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', newsig);
  FOR a IN SELECT * FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x WHERE x.grantee <> p.proowner AND x.privilege_type = 'EXECUTE' LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s%s', newsig,
      CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
      CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;
END $g$;
REVOKE ALL ON FUNCTION security_p4.guard(regprocedure, text) FROM PUBLIC, anon, authenticated, service_role;

DO $guard$
DECLARE f record; n int;
BEGIN
  -- 7a. Step-up (contract): company/admin access changes, erasure, restore, period close/reopen, V3.1
  --     invite/accept/revoke. change_accounting_period: every overload.
  FOR f IN
    SELECT p.oid::regprocedure sig, CASE WHEN p.proname = 'save_reviewed_preferences' THEN 'step_up_if_approved' ELSE 'step_up' END mode
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND p.proname IN (
      'grant_entity_access', 'revoke_entity_access', 'admin_set_member', 'admin_set_permission',
      'delete_my_finance_data', 'restore_finance_backup', 'change_accounting_period',
      'invite_access', 'accept_access', 'revoke_access', 'save_reviewed_preferences')
    ORDER BY p.proname, p.oid
  LOOP PERFORM security_p4.guard(f.sig, f.mode); END LOOP;
  SELECT count(*) INTO n FROM security_p4.guarded_functions;
  IF n < 11 THEN RAISE EXCEPTION 'P4: expected at least 11 step-up functions, found %', n; END IF;

  -- 7b. Writers callable by authenticated that must refuse assistant sessions (enumerated from the
  --     0088+P1+P2 catalog: SECURITY DEFINER or INVOKER, VOLATILE, not a trigger, EXECUTE for
  --     authenticated). INVOKER ones are also stopped by the RESTRICTIVE table policies (section 8);
  --     the guard gives a clear, early refusal.
  FOR f IN
    SELECT p.oid::regprocedure sig FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND p.proname IN (
      'accept_family_invite', 'apply_review_metadata', 'archive_backup_period_history', 'bulk_category_change',
      'cancel_transfer', 'commit_document_intake_reviewed', 'confirm_transfer', 'correct_financial_entries',
      'decide_family_request', 'finish_my_report_job', 'link_activity_expenses', 'manage_trip_expenses',
      'post_opening_balances', 'retry_my_report_job', 'review_statement_evidence', 'revise_import_rows',
      'save_claim_preparation', 'start_demo_workspace', 'undo_category_change', 'undo_financial_correction',
      'undo_opening_balances', 'undo_review_metadata',
      'finance_operation', 'move_expense_category', 'receive_claim_receipt', 'save_import_balance_review')
    ORDER BY p.proname, p.oid
  LOOP PERFORM security_p4.guard(f.sig, 'assistant'); END LOOP;

  -- 7c. Row-returning SECURITY DEFINER readers bypass RLS, so a revoked assistant is refused here too.
  FOR f IN
    SELECT p.oid::regprocedure sig FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND p.proname IN (
      'admin_team', 'my_access_invites', 'my_family_invites', 'my_shared_companies', 'team_company_tax', 'team_names')
    ORDER BY p.proname, p.oid
  LOOP PERFORM security_p4.guard(f.sig, 'revoked_read'); END LOOP;

  -- 7d. Fail closed on an unexpected catalog (e.g. a hosted-only function): every remaining client-
  --     callable volatile function that is not a trigger and not a P4 helper must be reviewed first.
  SELECT count(*) INTO n FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND p.provolatile = 'v'
    AND p.prorettype <> 'trigger'::regtype AND p.proname NOT LIKE '%\_\_unguarded'
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND p.proname NOT IN ('revoke_assistant_client', 'remove_device_passkey', 'require_recent_step_up')
    AND NOT EXISTS (SELECT 1 FROM security_p4.guarded_functions g WHERE g.proname = p.proname);
  IF n > 0 THEN RAISE EXCEPTION 'P4: % unreviewed client-callable writer function(s) in public; review before applying', n; END IF;
END $guard$;

-- --------------------------------------------------------------------------------------------
-- 8. RESTRICTIVE assistant policies on every RLS table in public (+ storage.objects)
--    Owner column, first match: owner_id, employee_id, user_id, workspace_owner_id. Tables without
--    one (profiles, expense_history, department_budgets, job_state, market_quotes, regulatory_*,
--    role_permissions, role_permission_audit, access_role_permissions) still get the write denial;
--    their read revocation follows the caller's own revocations only.
-- --------------------------------------------------------------------------------------------
DO $pol$
DECLARE t record; oc text; rd text;
BEGIN
  FOR t IN SELECT c.oid, c.relname FROM pg_class c
           WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND c.relrowsecurity
           ORDER BY c.relname LOOP
    SELECT x.col INTO oc FROM unnest(ARRAY['owner_id', 'employee_id', 'user_id', 'workspace_owner_id']) WITH ORDINALITY x(col, n)
    WHERE EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = x.col AND a.atttypid = 'uuid'::regtype AND NOT a.attisdropped AND a.attnum > 0)
    ORDER BY x.n LIMIT 1;
    rd := format('(SELECT NOT public.is_assistant_session()) OR NOT public.assistant_client_revoked(%s)', coalesce(quote_ident(oc), 'NULL'));
    EXECUTE format('CREATE POLICY "P4 assistants cannot insert" ON public.%I AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (NOT (SELECT public.is_assistant_session()))', t.relname);
    EXECUTE format('CREATE POLICY "P4 assistants cannot update" ON public.%I AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (NOT (SELECT public.is_assistant_session())) WITH CHECK (NOT (SELECT public.is_assistant_session()))', t.relname);
    EXECUTE format('CREATE POLICY "P4 assistants cannot delete" ON public.%I AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (NOT (SELECT public.is_assistant_session()))', t.relname);
    EXECUTE format('CREATE POLICY "P4 revoked assistants cannot read" ON public.%I AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (%s)', t.relname, rd);
  END LOOP;
END $pol$;

CREATE POLICY "P4 assistants cannot write files" ON storage.objects AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (NOT (SELECT public.is_assistant_session()));
CREATE POLICY "P4 assistants cannot change files" ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (NOT (SELECT public.is_assistant_session())) WITH CHECK (NOT (SELECT public.is_assistant_session()));
CREATE POLICY "P4 assistants cannot delete files" ON storage.objects AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (NOT (SELECT public.is_assistant_session()));
CREATE POLICY "P4 revoked assistants cannot read files" ON storage.objects AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING ((SELECT NOT public.is_assistant_session()) OR NOT public.assistant_client_revoked(
    CASE WHEN split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN split_part(name, '/', 1)::uuid END));

-- --------------------------------------------------------------------------------------------
-- 9. Audit history is append-only for clients. SECURITY DEFINER writers (triggers, period and
--    access functions, delete_my_finance_data) and referential cascades are not subject to RLS.
-- --------------------------------------------------------------------------------------------
DO $audit$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transaction_audit', 'role_permission_audit', 'access_grant_audit', 'period_close_evidence', 'imported_period_history', 'preference_approvals', 'security_events'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN RAISE EXCEPTION 'P4: audit table % missing', t; END IF;
    EXECUTE format('CREATE POLICY "P4 audit history cannot be changed" ON public.%I AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false)', t);
    EXECUTE format('CREATE POLICY "P4 audit history cannot be deleted" ON public.%I AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false)', t);
  END LOOP;
END $audit$;

COMMIT;
