-- ============================================================================================
-- P15_export_authorisation.sql (PROPOSED ONLY: NOT APPLIED to Lovable Cloud, Live or any hosted DB).
-- Prepared 11 Nov 2026 (P0 closure, Track A) for KK review. Closes P0-006 / RB-P1-02 at the database level.
-- Tested only in isolated PGlite: src/lib/p15-export-sql.test.ts and src/lib/failure-injection.test.ts X1-X4.
--
-- KK 9 Nov (RB-P1-02): sensitive exports are authorised server-side, with workspace isolation, step-up where the
-- existing pattern requires it, and an audit log.
--
-- Depends on the applied migrations 0000-0088 only; uses P2 / P4 when they are installed:
--   * another person's data (a shared company or a team view) needs the P2 'export' permission for that workspace
--     and company (has_permission(owner, entity, 'export')); without P2 the applied rule applies: an active
--     entity_members grant for exactly that company (today's legacy "export == read" right, see P2 header), and for
--     the Finance company-tax list the applied 'view_company_tax' switch;
--   * sensitive kinds (backup, company pack, tax filing working, audit evidence) need a recent step-up where P4 is
--     installed (has_recent_step_up).
-- Rollback: P15_export_authorisation.rollback.sql (exact pre-P15 catalog; refuses while audit rows exist unless
-- approved). No existing row or value is changed.
--
-- export_audit: one append-only row per authorised export: who exported, whose data (owner) and which company
-- (entity), the kind, file name, row count, byte count, SHA-256 of the file, whether a step-up was in force, when.
-- authorise_export(kind, owner, entity, file, rows, bytes, sha256) is the only writer and returns the audit id the app
-- needs before it hands the file to the person. Refusals: unknown kind, other person's data without permission,
-- a company the caller is not granted (cross-entity), sensitive kind without step-up.
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regnamespace('phase3_p15') IS NOT NULL THEN RAISE EXCEPTION 'P15 is already installed'; END IF;
END $pre$;

CREATE SCHEMA phase3_p15;
REVOKE ALL ON SCHEMA phase3_p15 FROM PUBLIC, anon, authenticated;
CREATE TABLE phase3_p15.export_kinds (kind text PRIMARY KEY, sensitive boolean NOT NULL, scope text NOT NULL CHECK (scope IN ('own', 'shared_company', 'team')), label text NOT NULL);
INSERT INTO phase3_p15.export_kinds VALUES
  ('backup',          true,  'own',            'Full backup (all records and files)'),
  ('report',          false, 'own',            'Report (PDF / CSV / Excel)'),
  ('ledger_csv',      false, 'own',            'Ledger, statement or reconciliation list'),
  ('evidence',        true,  'own',            'Audit and figure evidence'),
  ('company_pack',    true,  'own',            'Company accounts pack / accounting evidence'),
  ('tax_filing',      true,  'own',            'Tax filing working (GST / ITR JSON)'),
  ('personal',        false, 'own',            'Personal summary (trip, loan, brief, review)'),
  ('shared_company',  false, 'shared_company', 'Shared company records (CSV / PDF / Excel)'),
  ('team_company_tax', true, 'team',           'Company tax list for Finance');

CREATE TABLE public.export_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  owner_id uuid,
  entity_id text,
  kind text NOT NULL,
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 200),
  row_count integer NOT NULL CHECK (row_count >= 0),
  byte_count bigint NOT NULL CHECK (byte_count >= 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  step_up boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX export_audit_actor_idx ON public.export_audit (actor_id, created_at);
CREATE INDEX export_audit_owner_idx ON public.export_audit (owner_id, created_at);
ALTER TABLE public.export_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.export_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.export_audit TO authenticated;
GRANT ALL ON public.export_audit TO service_role;
-- The person who exported and the owner whose data it was both see the row.
CREATE POLICY "Export audit: actor and data owner read" ON public.export_audit FOR SELECT TO authenticated
  USING (actor_id = auth.uid() OR owner_id = auth.uid());

CREATE FUNCTION phase3_p15.guard_audit() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('ledgerline.erasing', true) = 'on' THEN RETURN OLD; END IF;
  IF auth.uid() IS NULL AND current_user NOT IN ('authenticated', 'anon') THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  RAISE EXCEPTION 'P15_AUDIT_KEPT: the export audit is never changed or deleted' USING ERRCODE = '42501';
END $$;
CREATE FUNCTION phase3_p15.guard_audit_truncate() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') OR auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'P15_AUDIT_KEPT: the export audit cannot be truncated' USING ERRCODE = '42501'; END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER p15_audit_kept BEFORE UPDATE OR DELETE ON public.export_audit FOR EACH ROW EXECUTE FUNCTION phase3_p15.guard_audit();
CREATE TRIGGER p15_audit_no_truncate BEFORE TRUNCATE ON public.export_audit FOR EACH STATEMENT EXECUTE FUNCTION phase3_p15.guard_audit_truncate();

-- May the caller export this owner's data for this company?
CREATE FUNCTION phase3_p15.may_export(_owner uuid, _entity text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ok boolean;
BEGIN
  IF auth.uid() IS NULL OR _owner IS NULL OR _entity IS NULL THEN RETURN false; END IF;
  IF coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RETURN false; END IF;
  IF to_regprocedure('public.has_permission(uuid,text,text)') IS NOT NULL THEN
    EXECUTE 'SELECT public.has_permission($1, $2, ''export'')' INTO ok USING _owner, _entity;
    RETURN coalesce(ok, false);
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.entity_members m WHERE m.owner_id = _owner AND m.entity_id = _entity AND m.member_id = auth.uid() AND m.revoked_at IS NULL);
END $$;

CREATE FUNCTION public.authorise_export(p_kind text, p_owner uuid, p_entity text, p_file text, p_rows integer, p_bytes bigint, p_sha256 text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); k phase3_p15.export_kinds; owner uuid := coalesce(p_owner, auth.uid()); stepped boolean := false; ok boolean; rid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  SELECT * INTO k FROM phase3_p15.export_kinds WHERE kind = p_kind;
  IF NOT FOUND THEN RAISE EXCEPTION 'P15_INVALID: unknown export kind' USING ERRCODE = '22023'; END IF;
  IF coalesce(btrim(p_file), '') = '' OR length(p_file) > 200 OR p_rows IS NULL OR p_rows < 0 OR p_bytes IS NULL OR p_bytes < 0 OR coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'P15_INVALID: file name, row count, size and SHA-256 are required' USING ERRCODE = '22023';
  END IF;
  IF k.scope = 'own' THEN
    IF owner <> uid THEN RAISE EXCEPTION 'P15_NOT_PERMITTED: this export covers your own records only' USING ERRCODE = '42501'; END IF;
  ELSIF k.scope = 'shared_company' THEN
    IF owner = uid THEN RAISE EXCEPTION 'P15_INVALID: use your own export for your own records' USING ERRCODE = '22023'; END IF;
    IF NOT phase3_p15.may_export(owner, p_entity) THEN
      RAISE EXCEPTION 'P15_NOT_PERMITTED: you are not granted export of that company''s records' USING ERRCODE = '42501';
    END IF;
  ELSE -- team: the Finance company-tax list across people (no single owner)
    owner := NULL;
    IF NOT (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = uid AND r.role = 'finance'::public.app_role) AND public.can_do('view_company_tax')) THEN
      RAISE EXCEPTION 'P15_NOT_PERMITTED: the company tax list is exported by Finance with the company-tax switch' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF k.sensitive AND to_regprocedure('public.has_recent_step_up()') IS NOT NULL THEN
    EXECUTE 'SELECT public.has_recent_step_up()' INTO ok;
    IF NOT coalesce(ok, false) THEN RAISE EXCEPTION 'STEP_UP_REQUIRED: authorise_export' USING ERRCODE = '42501'; END IF;
    stepped := true;
  END IF;
  INSERT INTO public.export_audit(actor_id, owner_id, entity_id, kind, file_name, row_count, byte_count, sha256, step_up)
  VALUES (uid, owner, nullif(btrim(coalesce(p_entity, '')), ''), p_kind, btrim(p_file), p_rows, p_bytes, p_sha256, stepped)
  RETURNING id INTO rid;
  RETURN rid;
END $$;

REVOKE ALL ON FUNCTION public.authorise_export(text, uuid, text, text, integer, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorise_export(text, uuid, text, text, integer, bigint, text) TO authenticated;
REVOKE ALL ON FUNCTION phase3_p15.may_export(uuid, text), phase3_p15.guard_audit(), phase3_p15.guard_audit_truncate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON phase3_p15.export_kinds FROM PUBLIC, anon, authenticated;
COMMIT;
