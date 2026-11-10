-- ============================================================================================
-- P11_backup_restore_receipts.sql (PROPOSED ONLY: NOT APPLIED to Lovable Cloud, Live or any hosted DB).
-- Prepared 11 Nov 2026 (P0 closure, Track A) for KK review. Tested only in isolated PGlite:
-- src/lib/p11-restore-receipts-sql.test.ts and src/lib/failure-injection.test.ts (R1-R3, API level).
--
-- KK (binding, P0-023): "Repeated backup restoration must be detected and never execute silently. Default to no
-- change, show previous restore evidence and require explicit authorised action."
-- P0-033: an older backup must not resurrect a withdrawn entry: the stored withdrawal history is authoritative.
--
-- Depends on the applied migrations 0000-0088 only (restore_finance_backup, 0072). Independent of P1-P10:
--   * with P4 installed, restore_finance_backup is P4's inline step-up copy; P11 inserts its check into whatever
--     public.restore_finance_backup is at install time, so the step-up check stays (P11 after P4 or before P4 both
--     work; roll back in reverse order of applying);
--   * with P10 installed, the withdrawal merge below keeps P10's frozen-row rule satisfied (the restore no longer
--     fails on a withdrawn entry; it leaves it as stored).
-- Re-running is refused (the check is installed once); rollback: P11_backup_restore_receipts.rollback.sql restores
-- the exact saved definition. No existing row or value is changed.
--
-- A. backup_restore_receipts: one append-only row per completed restore (owner, payload fingerprint, counts,
--    first/again, reason, who, when). Owner reads its own rows; no client UPDATE/DELETE. INSERT only for the
--    caller's own owner_id (a forged extra receipt can only cause an extra "already restored" prompt for oneself).
-- B. restore_finance_backup_checked(payload, display_name, rerestore_reason):
--    fingerprint = SHA-256 of the payload with staged file paths and the app's restore history removed (the same
--    backup planned twice for the same owner gives the same fingerprint: cross-account ids are deterministic).
--      * fingerprint restored before and no rerestore_reason -> returns {status:'previously_restored', changed:false,
--        previous:[{at, by, records, mode, reason}]} and changes NOTHING;
--      * rerestore_reason (>= 5 characters) -> restores again (step-up still required where P4 is installed) and
--        records mode 'again' with the reason;
--      * stored withdrawals win over the payload (P0-033): a currently withdrawn entry is kept exactly as stored;
--        a restored entry keeps its stored withdrawal history.
-- C. public.restore_finance_backup refuses direct calls (P11_RESTORE_CHECK_REQUIRED): every restore goes through B.
-- P0-038: the authority is a transaction-bound ticket (phase3_p11.restore_authority), not a session setting.
-- ============================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regprocedure('public.restore_finance_backup(jsonb,text)') IS NULL THEN RAISE EXCEPTION 'P11 requires restore_finance_backup (0072)'; END IF;
  IF to_regnamespace('phase3_p11') IS NOT NULL THEN RAISE EXCEPTION 'P11 is already installed'; END IF;
END $pre$;

CREATE SCHEMA phase3_p11;
REVOKE ALL ON SCHEMA phase3_p11 FROM PUBLIC, anon, authenticated;
CREATE TABLE phase3_p11.saved_functions (signature text PRIMARY KEY, definition text NOT NULL, saved_at timestamptz NOT NULL DEFAULT clock_timestamp());

-- --------------------------------------------------------------------------------------------
-- A. Receipts
-- --------------------------------------------------------------------------------------------
CREATE TABLE public.backup_restore_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  mode text NOT NULL CHECK (mode IN ('first', 'again')),
  reason text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 5 AND 500),
  records integer NOT NULL CHECK (records >= 0),
  counts jsonb NOT NULL DEFAULT '{}',
  restored_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  restored_by uuid NOT NULL DEFAULT auth.uid(),
  CHECK ((mode = 'again') = (reason IS NOT NULL))
);
CREATE INDEX backup_restore_receipts_owner_fp_idx ON public.backup_restore_receipts (owner_id, fingerprint, restored_at);
ALTER TABLE public.backup_restore_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backup_restore_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.backup_restore_receipts TO authenticated;
GRANT ALL ON public.backup_restore_receipts TO service_role;
CREATE POLICY "Owner reads restore receipts" ON public.backup_restore_receipts FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner records own restore receipts" ON public.backup_restore_receipts FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND restored_by = auth.uid());

-- --------------------------------------------------------------------------------------------
-- B. The checked restore
-- --------------------------------------------------------------------------------------------
CREATE FUNCTION phase3_p11.payload_fingerprint(_payload jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT encode(sha256(convert_to(coalesce(jsonb_object_agg(t.key, t.rows ORDER BY t.key), '{}'::jsonb)::text, 'UTF8')), 'hex')
  FROM (
    SELECT k.key, (SELECT coalesce(jsonb_agg(x.r ORDER BY x.r::text), '[]'::jsonb) FROM (
             SELECT (CASE WHEN jsonb_typeof(v) = 'object' THEN (v - 'receipts' - 'file_path') #- '{data,restoreHistory}' ELSE v END) AS r
             FROM jsonb_array_elements(CASE WHEN jsonb_typeof(k.value) = 'array' THEN k.value ELSE '[]'::jsonb END) v) x) AS rows
    FROM jsonb_each(CASE WHEN jsonb_typeof(_payload) = 'object' THEN _payload ELSE '{}'::jsonb END) k
  ) t
$$;

-- P0-033: the stored withdrawal of each of the caller's entries wins over the backup copy.
CREATE FUNCTION phase3_p11.keep_withdrawals(_payload jsonb, _owner uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE out jsonb := '[]'::jsonb; e jsonb; s jsonb; w jsonb;
BEGIN
  IF jsonb_typeof(_payload->'expenses') IS DISTINCT FROM 'array' THEN RETURN _payload; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(_payload->'expenses') LOOP
    s := NULL;
    IF jsonb_typeof(e) = 'object' AND coalesce(e->>'id', '') ~* '^[0-9a-f-]{36}$' THEN
      SELECT to_jsonb(x) INTO s FROM public.expenses x WHERE x.id = (e->>'id')::uuid AND x.employee_id = _owner;
    END IF;
    w := CASE WHEN jsonb_typeof(s->'receipt_details') = 'object' THEN s->'receipt_details'->'withdrawal' END;
    IF w IS NULL THEN out := out || jsonb_build_array(e);
    ELSIF w->>'state' = 'withdrawn' THEN out := out || jsonb_build_array(s - 'correction_revision' - 'updated_at' - 'created_at'); -- kept as stored
    ELSE out := out || jsonb_build_array(jsonb_set(e, '{receipt_details}', (CASE WHEN jsonb_typeof(e->'receipt_details') = 'object' THEN e->'receipt_details' ELSE '{}'::jsonb END) || jsonb_build_object('withdrawal', w)));
    END IF;
  END LOOP;
  RETURN jsonb_set(_payload, '{expenses}', out);
END $$;

-- P0-038: the checked restore's authority is a transaction-bound ticket, not the session setting phase3_p11.checked
-- (any role can SET / set_config a custom setting, so a client in plain SQL could call the direct restore and skip the
-- repeat check, or open P14's restore exemption). The ticket is written only by open_restore (SECURITY DEFINER; the
-- table has no client privilege), bound to the caller (auth.uid()), this transaction (txid_current()) and the SHA-256
-- of the exact payload to restore; the direct restore claims it (claim_restore) and close_restore records the receipt
-- and removes it before returning. A deferred constraint trigger refuses COMMIT while a ticket is still open, so a
-- restore can never commit without its receipt. restore_finance_backup_checked runs as the caller (RLS-scoped restore),
-- so the three steps are separately callable: called directly, in order, they do exactly what the checked restore does.
CREATE TABLE phase3_p11.restore_authority (
  transaction_id bigint NOT NULL,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  payload_sha text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('first', 'again')),
  reason text,
  previous jsonb NOT NULL DEFAULT '[]',
  claimed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (transaction_id, actor_id)
);
REVOKE ALL ON phase3_p11.restore_authority FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION phase3_p11.ticket_closed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM phase3_p11.restore_authority a WHERE a.transaction_id = NEW.transaction_id AND a.actor_id = NEW.actor_id) THEN
    RAISE EXCEPTION 'P11_RESTORE_UNRECORDED: a checked restore was opened but its receipt was not recorded; nothing is saved' USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER p11_ticket_closed AFTER INSERT ON phase3_p11.restore_authority DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION phase3_p11.ticket_closed();

CREATE FUNCTION phase3_p11.payload_sha(_payload jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$ SELECT encode(sha256(convert_to(_payload::text, 'UTF8')), 'hex') $$;

CREATE FUNCTION phase3_p11.open_restore(payload jsonb, rerestore_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); fp text; prev jsonb; kp jsonb; why text := nullif(btrim(coalesce(rerestore_reason, '')), '');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to restore a backup' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid or oversized backup records'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  fp := phase3_p11.payload_fingerprint(payload);
  SELECT coalesce(jsonb_agg(jsonb_build_object('at', r.restored_at, 'by', r.restored_by, 'records', r.records, 'mode', r.mode, 'reason', r.reason) ORDER BY r.restored_at), '[]'::jsonb)
    INTO prev FROM public.backup_restore_receipts r WHERE r.owner_id = uid AND r.fingerprint = fp;
  IF jsonb_array_length(prev) > 0 AND why IS NULL THEN
    RETURN jsonb_build_object('status', 'previously_restored', 'changed', false, 'fingerprint', fp, 'previous', prev);
  END IF;
  IF why IS NOT NULL AND length(why) < 5 THEN RAISE EXCEPTION 'P11_REASON: give a reason of at least 5 characters for restoring again' USING ERRCODE = '22023'; END IF;
  IF why IS NOT NULL AND jsonb_array_length(prev) = 0 THEN why := NULL; END IF; -- first restore: no reason needed
  kp := phase3_p11.keep_withdrawals(payload, uid);
  IF EXISTS (SELECT 1 FROM phase3_p11.restore_authority a WHERE a.transaction_id = txid_current() AND a.actor_id = uid) THEN
    RAISE EXCEPTION 'P11_RESTORE_OPEN: a checked restore is already open in this transaction' USING ERRCODE = '55000';
  END IF;
  INSERT INTO phase3_p11.restore_authority(transaction_id, actor_id, fingerprint, payload_sha, mode, reason, previous)
  VALUES (txid_current(), uid, fp, phase3_p11.payload_sha(kp), CASE WHEN why IS NULL THEN 'first' ELSE 'again' END, why, prev);
  RETURN jsonb_build_object('status', 'open', 'fingerprint', fp, 'previous', prev, 'payload', kp);
END $$;

-- Called first by the direct restore: the open ticket of this caller and transaction for exactly this payload, once.
CREATE FUNCTION phase3_p11.claim_restore(payload jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE phase3_p11.restore_authority a SET claimed = true
   WHERE a.transaction_id = txid_current() AND a.actor_id = auth.uid() AND NOT a.claimed AND a.payload_sha = phase3_p11.payload_sha(payload);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'P11_RESTORE_CHECK_REQUIRED: backups are restored through restore_finance_backup_checked, which detects a repeated restore' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE FUNCTION phase3_p11.close_restore(res jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); t phase3_p11.restore_authority; n integer;
BEGIN
  SELECT * INTO t FROM phase3_p11.restore_authority a WHERE a.transaction_id = txid_current() AND a.actor_id = uid AND a.claimed FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'P11_RESTORE_CHECK_REQUIRED: no checked restore ran in this transaction' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(sum(value::text::integer), 0) INTO n FROM jsonb_each(coalesce(res->'counts', '{}'::jsonb));
  INSERT INTO public.backup_restore_receipts(owner_id, fingerprint, mode, reason, records, counts, restored_by)
  VALUES (uid, t.fingerprint, t.mode, t.reason, n, coalesce(res->'counts', '{}'::jsonb), uid);
  DELETE FROM phase3_p11.restore_authority a WHERE a.transaction_id = t.transaction_id AND a.actor_id = uid;
  RETURN coalesce(res, '{}'::jsonb) || jsonb_build_object('status', CASE WHEN t.mode = 'first' THEN 'restored' ELSE 'restored_again' END, 'changed', true,
    'fingerprint', t.fingerprint, 'previous', t.previous);
END $$;

-- P14 (asset disposal) lets the direct restore write the disposals a backup carries: true only inside a claimed ticket.
CREATE FUNCTION phase3_p11.restoring() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM phase3_p11.restore_authority a WHERE a.transaction_id = txid_current() AND a.actor_id = auth.uid() AND a.claimed)
$$;

CREATE FUNCTION public.restore_finance_backup_checked(payload jsonb, display_name text DEFAULT NULL, rerestore_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE o jsonb; res jsonb;
BEGIN
  o := phase3_p11.open_restore(payload, rerestore_reason);
  IF o->>'status' = 'previously_restored' THEN RETURN o; END IF;
  res := public.restore_finance_backup(o->'payload', display_name);
  RETURN phase3_p11.close_restore(res);
END $$;

-- --------------------------------------------------------------------------------------------
-- C. The direct restore refuses calls that did not come through B (same injection technique as P4 for invoker
--    functions: the original definition with one statement inserted after BEGIN; saved for the rollback).
-- --------------------------------------------------------------------------------------------
DO $c$
DECLARE fn regprocedure := 'public.restore_finance_backup(jsonb,text)'::regprocedure; def text; body_at int; inj int;
  chk text := $chk$PERFORM phase3_p11.claim_restore($1);$chk$; -- P0-038: a claimed ticket, not a session setting
BEGIN
  def := pg_get_functiondef(fn);
  INSERT INTO phase3_p11.saved_functions(signature, definition) VALUES (fn::text, def);
  body_at := strpos(def, 'AS $function$');
  IF body_at = 0 THEN RAISE EXCEPTION 'P11: cannot locate the body of restore_finance_backup'; END IF;
  inj := regexp_instr(substr(def, body_at), '\mbegin\M', 1, 1, 1, 'i');
  IF inj = 0 THEN RAISE EXCEPTION 'P11: cannot locate BEGIN in restore_finance_backup'; END IF;
  EXECUTE substr(def, 1, body_at + inj - 2) || ' ' || chk || substr(def, body_at + inj - 1);
END $c$;

REVOKE ALL ON FUNCTION public.restore_finance_backup_checked(jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_finance_backup_checked(jsonb, text, text) TO authenticated;
GRANT USAGE ON SCHEMA phase3_p11 TO authenticated; -- the checked restore runs as the caller and uses the two helpers below
REVOKE ALL ON phase3_p11.saved_functions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION phase3_p11.payload_fingerprint(jsonb), phase3_p11.keep_withdrawals(jsonb, uuid), phase3_p11.payload_sha(jsonb),
  phase3_p11.open_restore(jsonb, text), phase3_p11.claim_restore(jsonb), phase3_p11.close_restore(jsonb), phase3_p11.restoring() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION phase3_p11.ticket_closed() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION phase3_p11.payload_fingerprint(jsonb), phase3_p11.keep_withdrawals(jsonb, uuid), phase3_p11.payload_sha(jsonb),
  phase3_p11.open_restore(jsonb, text), phase3_p11.claim_restore(jsonb), phase3_p11.close_restore(jsonb), phase3_p11.restoring() TO authenticated;
COMMIT;
