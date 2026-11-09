-- ============================================================================================
-- P2_v31_role_model.sql (PROPOSED ONLY: NOT APPLIED to Lovable Cloud, Live or any hosted DB)
-- Prepared 2026-11-09 for KK review. See docs/plans/SECURITY_MIGRATION_PLAN_2026-11-09.md.
-- ADDITIVE V3.1 role model (contract section 12). Requires P1 first.
--   * No existing policy is switched to has_permission() yet; live access still comes from
--     entity_members (P1) until a later, separately approved step.
--   * Legacy user_roles are NOT mapped (needs owner confirmation; H-2).
--   * entity_members are copied (not moved) into access_grants with source='entity_members':
--     can_write -> legacy_company_editor, read-only -> legacy_company_viewer (V4 FND-04, decision
--     V4-P2MAP). entity_members is left untouched.
--   * The two legacy roles carry EXACTLY the rights an entity_members grant has at 0088+P1, never more
--     (derived from the applied policies 0075/0076/0078 and P1, proved action by action in
--     src/lib/security-phase1-sql.test.ts):
--       legacy_company_viewer = view, export
--         view:   "Entity members read documents" + "Entity members read document files" (company docs
--                 and their originals; company transactions are additionally gated by the 0066/P1
--                 RESTRICTIVE expenses policy, so a grant alone never exposes ledger rows).
--         export: the SharedWithMe CSV/PDF/Excel downloads are built in the browser from exactly the
--                 rows the grant can view; there is no server export path, so export == read.
--       legacy_company_editor = view, export, upload, draft_edit
--         upload:     "Entity editors upload document files" (P1: <owner>/companies/<hex>/<file> only),
--                     "Entity editors add company documents", cleanup of the editor's OWN unlinked
--                     uploads (part of uploading, not delete_unposted).
--         draft_edit: "Entity editors update company documents" (title/notes/metadata; P1 forbids
--                     changing owner, company, file, links and evidence lock).
--       Never granted: propose (no proposal mechanism), post (no INSERT on the owner's ledger and no
--       owner-scoped RPC accepts a member), approve, share, manage_access (grant/revoke are owner-only),
--       delete_unposted (no DELETE policy for members), reopen (period operations are owner-only).
--     Legacy roles cannot be invited (invite_access refuses them) and exist only on backfilled or
--     synced rows (CHECK: role LIKE 'legacy_%' requires source='entity_members').
-- Rollback: P2_v31_role_model.rollback.sql (archives the new tables, never drops their rows).
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regprocedure('public.can_access_expense(uuid,text,text)') IS NULL
     OR to_regprocedure('public.guard_shared_document_edit()') IS NULL THEN
    RAISE EXCEPTION 'P2 requires P1_security_containment.sql';
  END IF;
END $pre$;

-- 1. Role catalogue and permission matrix (fixed; changed only by a reviewed migration)
CREATE TABLE IF NOT EXISTS public.access_role_permissions (
  role text NOT NULL CHECK (role IN ('owner','adult_family_member','delegate','bookkeeper','accountant','auditor','company_secretary','authorised_reviewer','administrator','legacy_company_editor','legacy_company_viewer')),
  action text NOT NULL CHECK (action IN ('view','upload','draft_edit','propose','post','approve','export','share','delete_unposted','manage_access','reopen')),
  allowed boolean NOT NULL,
  PRIMARY KEY (role, action)
);
COMMENT ON TABLE public.access_role_permissions IS 'V3.1 role x action matrix (P2) plus the two legacy entity_members roles. Read-only to clients; not yet used by row policies.';
INSERT INTO public.access_role_permissions(role, action, allowed)
SELECT r.role, a.action, a.action = ANY (r.actions)
FROM (VALUES
  ('owner',               ARRAY['view','upload','draft_edit','propose','post','approve','export','share','delete_unposted','manage_access','reopen']),
  ('adult_family_member', ARRAY['view','upload','draft_edit','propose']),
  ('delegate',            ARRAY['view','upload','draft_edit','propose','post','export','delete_unposted']),
  ('bookkeeper',          ARRAY['view','upload','draft_edit','propose','post','export','delete_unposted']),
  ('accountant',          ARRAY['view','upload','draft_edit','propose','post','approve','export','delete_unposted']),
  ('auditor',             ARRAY['view','export']),
  ('company_secretary',   ARRAY['view','upload','draft_edit','propose','export']),
  ('authorised_reviewer', ARRAY['view','approve','export']),
  ('administrator',       ARRAY['manage_access']),
  -- Legacy entity_members grants: exactly today's effective rights (see header), never more.
  ('legacy_company_editor', ARRAY['view','upload','draft_edit','export']),
  ('legacy_company_viewer', ARRAY['view','export'])
) AS r(role, actions)
CROSS JOIN (VALUES ('view'),('upload'),('draft_edit'),('propose'),('post'),('approve'),('export'),('share'),('delete_unposted'),('manage_access'),('reopen')) AS a(action)
ON CONFLICT (role, action) DO NOTHING;
-- Supabase default privileges grant ALL on new tables to anon/authenticated: remove them explicitly.
REVOKE ALL ON public.access_role_permissions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.access_role_permissions TO authenticated;
GRANT ALL ON public.access_role_permissions TO service_role;
ALTER TABLE public.access_role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in users read the role matrix" ON public.access_role_permissions;
CREATE POLICY "Signed-in users read the role matrix" ON public.access_role_permissions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

-- 2. Scoped grants: workspace owner + optional company (entity). The owner role is never granted;
--    it is the workspace owner's own identity.
CREATE TABLE IF NOT EXISTS public.access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_id uuid NOT NULL,
  entity_id text,
  role text NOT NULL CHECK (role IN ('adult_family_member','delegate','bookkeeper','accountant','auditor','company_secretary','authorised_reviewer','administrator','legacy_company_editor','legacy_company_viewer')),
  grantee_email text NOT NULL CHECK (grantee_email = lower(btrim(grantee_email)) AND grantee_email <> ''),
  grantee_id uuid,
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  accepted_at timestamptz,
  identity_check text CHECK (identity_check IN ('confirmed_email_match','entity_members_verified_email')),
  revoked_at timestamptz,
  revoked_by uuid,
  source text NOT NULL DEFAULT 'invite' CHECK (source IN ('invite','entity_members')),
  source_ref uuid,
  CHECK (grantee_id IS DISTINCT FROM workspace_owner_id),
  CHECK ((accepted_at IS NULL) = (grantee_id IS NULL)),
  CHECK (accepted_at IS NULL OR identity_check IS NOT NULL),
  CHECK (expires_at IS NULL OR expires_at > created_at),
  CHECK ((source = 'entity_members') = (source_ref IS NOT NULL)),
  CHECK (role NOT IN ('legacy_company_editor','legacy_company_viewer') OR source = 'entity_members')
);
CREATE UNIQUE INDEX IF NOT EXISTS access_grants_source_ref_idx ON public.access_grants(source, source_ref) WHERE source_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS access_grants_active_scope_idx ON public.access_grants(workspace_owner_id, coalesce(entity_id, ''), grantee_email) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS access_grants_grantee_idx ON public.access_grants(grantee_id, workspace_owner_id) WHERE revoked_at IS NULL;
-- Supabase default privileges grant ALL on new tables to anon/authenticated: remove them explicitly.
REVOKE ALL ON public.access_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.access_grants TO authenticated;
GRANT ALL ON public.access_grants TO service_role;
ALTER TABLE public.access_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner or grantee reads access grants" ON public.access_grants;
CREATE POLICY "Owner or grantee reads access grants" ON public.access_grants FOR SELECT TO authenticated
  USING (workspace_owner_id = auth.uid() OR grantee_id = auth.uid());

-- 3. Append-only audit log
CREATE TABLE IF NOT EXISTS public.access_grant_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_id uuid NOT NULL,
  grant_id uuid,
  actor_id uuid,
  event text NOT NULL CHECK (event IN ('invited','accepted','revoked','backfilled','role_changed')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS access_grant_audit_owner_idx ON public.access_grant_audit(workspace_owner_id, created_at DESC);
-- Supabase default privileges grant ALL on new tables to anon/authenticated: remove them explicitly.
REVOKE ALL ON public.access_grant_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.access_grant_audit TO authenticated;
GRANT ALL ON public.access_grant_audit TO service_role;
ALTER TABLE public.access_grant_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner or actor reads access history" ON public.access_grant_audit;
CREATE POLICY "Owner or actor reads access history" ON public.access_grant_audit FOR SELECT TO authenticated
  USING (workspace_owner_id = auth.uid() OR actor_id = auth.uid());
CREATE OR REPLACE FUNCTION public.guard_access_audit_append_only() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('ledgerline.erasing', true) = 'on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Access history is append-only' USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS access_grant_audit_append_only ON public.access_grant_audit;
CREATE TRIGGER access_grant_audit_append_only BEFORE UPDATE OR DELETE ON public.access_grant_audit
  FOR EACH ROW EXECUTE FUNCTION public.guard_access_audit_append_only();

-- 4. Permission helper. Revocation and expiry apply on the next statement (no caching).
CREATE OR REPLACE FUNCTION public.has_permission(_owner uuid, _entity text, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND _owner IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.access_role_permissions o WHERE o.role = 'owner' AND o.action = _action)
    AND (auth.uid() = _owner OR (
      coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
      AND EXISTS (SELECT 1 FROM public.access_grants g
                  JOIN public.access_role_permissions p ON p.role = g.role AND p.action = _action AND p.allowed
                  WHERE g.workspace_owner_id = _owner AND g.grantee_id = auth.uid()
                    AND g.accepted_at IS NOT NULL AND g.revoked_at IS NULL
                    AND (g.expires_at IS NULL OR g.expires_at > now())
                    AND (g.entity_id IS NULL OR g.entity_id = _entity))))
$$;

-- 5. Invite / accept / revoke (all writes go through these; clients have SELECT only)
CREATE OR REPLACE FUNCTION public.invite_access(_owner uuid, _entity text, _email text, _role text, _expires_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); em text := lower(btrim(coalesce(_email, ''))); gid uuid;
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Sign in with your account to share access'; END IF;
  IF _role IS NULL OR _role NOT IN ('adult_family_member','delegate','bookkeeper','accountant','auditor','company_secretary','authorised_reviewer','administrator') THEN
    RAISE EXCEPTION 'Unknown role';
  END IF;
  IF NOT (uid = _owner OR (public.has_permission(_owner, _entity, 'manage_access') AND _role <> 'administrator')) THEN
    RAISE EXCEPTION 'You cannot manage access for this workspace' USING ERRCODE = '42501';
  END IF;
  IF _entity IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.finance_preferences p, jsonb_array_elements(coalesce(p.data->'entities', '[]'::jsonb)) e
                                         WHERE p.owner_id = _owner AND e->>'id' = _entity) THEN
    RAISE EXCEPTION 'Company not found';
  END IF;
  IF em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(em) > 254 THEN RAISE EXCEPTION 'Enter a valid email address'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _owner AND lower(u.email) = em) THEN RAISE EXCEPTION 'The owner already has full access'; END IF;
  IF _expires_at IS NOT NULL AND _expires_at <= now() THEN RAISE EXCEPTION 'Expiry must be in the future'; END IF;
  IF EXISTS (SELECT 1 FROM public.access_grants g WHERE g.workspace_owner_id = _owner AND g.entity_id IS NOT DISTINCT FROM _entity
             AND g.grantee_email = em AND g.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'This person already has access here; revoke it before changing the role';
  END IF;
  INSERT INTO public.access_grants(workspace_owner_id, entity_id, role, grantee_email, granted_by, expires_at)
  VALUES (_owner, _entity, _role, em, uid, _expires_at) RETURNING id INTO gid;
  INSERT INTO public.access_grant_audit(workspace_owner_id, grant_id, actor_id, event, details)
  VALUES (_owner, gid, uid, 'invited', jsonb_build_object('role', _role, 'entity', _entity, 'email', em, 'expires_at', _expires_at));
  RETURN gid;
END $$;

-- Identity requirement: the signed-in, non-anonymous account's CONFIRMED email must equal the invite.
CREATE OR REPLACE FUNCTION public.accept_access(_grant uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); my_email text; g public.access_grants;
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Sign in with your account to accept access'; END IF;
  SELECT lower(u.email) INTO my_email FROM auth.users u WHERE u.id = uid AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous, false);
  IF my_email IS NULL THEN RAISE EXCEPTION 'Confirm your email address first'; END IF;
  SELECT * INTO g FROM public.access_grants WHERE id = _grant FOR UPDATE;
  IF NOT FOUND OR g.grantee_email <> my_email OR g.revoked_at IS NOT NULL OR (g.expires_at IS NOT NULL AND g.expires_at <= now())
     OR g.workspace_owner_id = uid OR (g.accepted_at IS NOT NULL AND g.grantee_id <> uid) THEN
    RAISE EXCEPTION 'This invitation is not available';
  END IF;
  IF g.accepted_at IS NOT NULL THEN RETURN; END IF;
  UPDATE public.access_grants SET grantee_id = uid, accepted_at = now(), identity_check = 'confirmed_email_match' WHERE id = _grant;
  INSERT INTO public.access_grant_audit(workspace_owner_id, grant_id, actor_id, event, details)
  VALUES (g.workspace_owner_id, _grant, uid, 'accepted', jsonb_build_object('identity_check', 'confirmed_email_match'));
END $$;

CREATE OR REPLACE FUNCTION public.revoke_access(_grant uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); g public.access_grants;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT * INTO g FROM public.access_grants WHERE id = _grant FOR UPDATE;
  IF NOT FOUND OR g.revoked_at IS NOT NULL OR NOT (
       uid = g.workspace_owner_id OR uid = g.grantee_id
       OR (public.has_permission(g.workspace_owner_id, g.entity_id, 'manage_access') AND g.role <> 'administrator')) THEN
    RAISE EXCEPTION 'Access grant not found';
  END IF;
  UPDATE public.access_grants SET revoked_at = now(), revoked_by = uid WHERE id = _grant;
  INSERT INTO public.access_grant_audit(workspace_owner_id, grant_id, actor_id, event, details)
  VALUES (g.workspace_owner_id, _grant, uid, 'revoked', jsonb_build_object('role', g.role, 'entity', g.entity_id));
END $$;

-- Pending invitations addressed to the caller's confirmed email (for an acceptance screen).
CREATE OR REPLACE FUNCTION public.my_access_invites()
RETURNS TABLE(grant_id uuid, workspace_owner_id uuid, entity_id text, role text, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT g.id, g.workspace_owner_id, g.entity_id, g.role, g.expires_at FROM public.access_grants g
  WHERE auth.uid() IS NOT NULL AND g.accepted_at IS NULL AND g.revoked_at IS NULL
    AND (g.expires_at IS NULL OR g.expires_at > now())
    AND g.grantee_email = (SELECT lower(u.email) FROM auth.users u WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL)
$$;

REVOKE ALL ON FUNCTION public.has_permission(uuid, text, text), public.invite_access(uuid, text, text, text, timestamptz),
  public.accept_access(uuid), public.revoke_access(uuid), public.my_access_invites(), public.guard_access_audit_append_only() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, text), public.invite_access(uuid, text, text, text, timestamptz),
  public.accept_access(uuid), public.revoke_access(uuid), public.my_access_invites() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, text), public.guard_access_audit_append_only() TO service_role;

-- 6. Transition sync: while the app still writes entity_members (grant_entity_access /
--    revoke_entity_access), mirror each change onto its backfilled grant so V3.1 revocation is
--    immediate too. entity_members itself is never changed by this trigger.
CREATE OR REPLACE FUNCTION public.sync_entity_member_grant() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE gid uuid; new_role text := CASE WHEN NEW.can_write THEN 'legacy_company_editor' ELSE 'legacy_company_viewer' END;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.access_grants(workspace_owner_id, entity_id, role, grantee_email, grantee_id, granted_by,
                                     created_at, accepted_at, identity_check, revoked_at, source, source_ref)
    VALUES (NEW.owner_id, NEW.entity_id, new_role, lower(btrim(NEW.member_email)), NEW.member_id, NEW.owner_id,
            NEW.created_at, NEW.created_at, 'entity_members_verified_email', NEW.revoked_at, 'entity_members', NEW.id)
    ON CONFLICT DO NOTHING RETURNING id INTO gid;
    IF gid IS NOT NULL THEN
      INSERT INTO public.access_grant_audit(workspace_owner_id, grant_id, actor_id, event, details)
      VALUES (NEW.owner_id, gid, auth.uid(), 'backfilled', jsonb_build_object('from', 'entity_members', 'entity_members_id', NEW.id, 'role', new_role, 'entity', NEW.entity_id));
    END IF;
  ELSE
    UPDATE public.access_grants g SET role = new_role,
      revoked_at = coalesce(g.revoked_at, NEW.revoked_at), revoked_by = CASE WHEN g.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN NEW.owner_id ELSE g.revoked_by END
    WHERE g.source = 'entity_members' AND g.source_ref = NEW.id
      AND (g.role IS DISTINCT FROM new_role OR (g.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL))
    RETURNING g.id INTO gid;
    IF gid IS NOT NULL THEN
      INSERT INTO public.access_grant_audit(workspace_owner_id, grant_id, actor_id, event, details)
      VALUES (NEW.owner_id, gid, auth.uid(), CASE WHEN NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN 'revoked' ELSE 'role_changed' END,
              jsonb_build_object('from', 'entity_members', 'entity_members_id', NEW.id, 'role', new_role));
    END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.sync_entity_member_grant() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sync_entity_member_grant ON public.entity_members;
CREATE TRIGGER sync_entity_member_grant AFTER INSERT OR UPDATE ON public.entity_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_entity_member_grant();

-- 7. Backfill (idempotent). Every entity_members row, active or revoked, becomes one grant with the
--    same scope, timestamps and revocation. The old grant required a verified matching account
--    (grant_entity_access), recorded as identity_check='entity_members_verified_email'.
WITH ins AS (
  INSERT INTO public.access_grants(workspace_owner_id, entity_id, role, grantee_email, grantee_id, granted_by,
                                   created_at, accepted_at, identity_check, revoked_at, source, source_ref)
  SELECT m.owner_id, m.entity_id, CASE WHEN m.can_write THEN 'legacy_company_editor' ELSE 'legacy_company_viewer' END,
         lower(btrim(m.member_email)), m.member_id, m.owner_id,
         m.created_at, m.created_at, 'entity_members_verified_email', m.revoked_at, 'entity_members', m.id
  FROM public.entity_members m
  WHERE nullif(lower(btrim(m.member_email)), '') IS NOT NULL
  ORDER BY m.created_at, m.id
  ON CONFLICT DO NOTHING
  RETURNING id, workspace_owner_id, role, entity_id, source_ref
)
INSERT INTO public.access_grant_audit(workspace_owner_id, grant_id, actor_id, event, details)
SELECT workspace_owner_id, id, NULL, 'backfilled', jsonb_build_object('from', 'entity_members', 'entity_members_id', source_ref, 'role', role, 'entity', entity_id)
FROM ins;

COMMIT;
