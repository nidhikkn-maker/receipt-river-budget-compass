// @vitest-environment node
// P0-036 (owner decision): proposed P18 replaces the client-settable ledgerline.erasing / phase3_p9.discarding exemptions
// with transaction-bound authority rows written only by SECURITY DEFINER functions, and audits every erasure.
// Isolated PGlite only (never Cloud): applied schema, and the whole proposed stack P1..P17 (as the P17 test, without P3).
import { describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { actAs, addUsers, fullSchemaDb, readSql } from "@/test/full-schema-pglite";

const O = "00000000-0000-4000-8000-0000000000a1", V = "00000000-0000-4000-8000-0000000000b2";
const D = ".lovable/staged-sql/proposed/";
const P18 = `${D}P18_erasure_authority.sql`, P18_RB = `${D}P18_erasure_authority.rollback.sql`;
const STACK = ["P1_security_containment", "P2_v31_role_model", "P4_step_up_and_assistant_limits", "P5_legal_entities_foundation", "P5b_restore_investments", "P6_registers", "P7_balanced_posting", "P8_asset_depreciation_posting", "P9_statement_import_idempotency_and_archive_guards", "P10_unposted_entry_withdrawal", "P11_backup_restore_receipts", "P13_team_change_requests", "P14_asset_disposal_approval", "P15_export_authorisation", "P16_statement_undo_withdraw", "P17_locked_evidence_storage"].map((f) => `${D}${f}.sql`);
const CATALOG = `
  SELECT 'f' k, n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' n, md5(p.prosrc) || coalesce(p.proacl::text, '') || p.prosecdef::text || coalesce(p.proconfig::text, '') || p.provolatile::text v
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_%'
  UNION ALL SELECT 't', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal
  UNION ALL SELECT 'r', c.oid::regclass::text, coalesce(c.relacl::text, '') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ('public', 'storage') AND c.relkind = 'r'
  UNION ALL SELECT 'p', schemaname || '.' || tablename || '.' || policyname, cmd || coalesce(qual, '') || coalesce(with_check, '') FROM pg_policies
  UNION ALL SELECT 'n', nspname, coalesce(nspacl::text, '') FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1, 2`;
type Row = Record<string, unknown>;
const catalog = async (db: PGlite) => { await actAs(db, null); return (await db.query<{ k: string; n: string; v: string }>(CATALOG)).rows.map((r) => `${r.k}|${r.n}|${r.v}`); };
const sql = async <T = Row>(db: PGlite, q: string, p: unknown[] = []) => { await actAs(db, null); return (await db.query<T>(q, p)).rows; };
/** As uid inside one transaction (committed when it succeeds); returns "" or the error message. */
const tx = async (db: PGlite, uid: string, run: () => Promise<unknown>) => {
  await actAs(db, uid);
  await db.exec("BEGIN");
  try { await run(); await db.exec("COMMIT"); return ""; } catch (e) { await db.exec("ROLLBACK"); return (e as Error).message; } finally { await actAs(db, null); }
};
const lockedDoc = async (db: PGlite, owner: string, notes = "") => {
  const id = crypto.randomUUID(), path = `${owner}/docs/${id}.pdf`;
  await sql(db, "INSERT INTO public.documents(id, owner_id, title, file_path, file_name, size_bytes, notes, evidence_locked) VALUES ($1,$2,'Invoice',$3,'inv.pdf',10,$4,$5)", [id, owner, path, notes, notes === ""]);
  await sql(db, "INSERT INTO storage.objects(bucket_id, name, owner_id, metadata) VALUES ('receipts',$1,$2,'{\"size\":10}')", [path, owner]);
  return { id, path };
};
const docCount = async (db: PGlite, id: string) => (await sql<{ n: number }>(db, "SELECT count(*)::int n FROM public.documents WHERE id = $1", [id]))[0]!.n;
const stepUp = async (db: PGlite, uid: string) => { await actAs(db, null); await db.exec("SET ROLE service_role"); await db.query("SELECT public.record_step_up($1,'password',300)", [uid]); await actAs(db, null); };

async function setup(extra: readonly string[]) {
  const db = await fullSchemaDb([...extra]);
  await addUsers(db, { [O]: "o@x.in", [V]: "v@x.in" });
  await sql(db, "INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1,'{}'),($2,'{}') ON CONFLICT (owner_id) DO NOTHING", [O, V]);
  return db;
}

for (const [label, extra, stack] of [["applied schema", [] as string[], false], ["proposed stack P1..P17", STACK, true]] as const) {
  describe(`P18 erasure authority — ${label} (SQL, isolated PGlite)`, () => {
    it("attack: SET / set_config of the old settings no longer bypasses any guard; no function reads them", async () => {
      const db = await setup(extra);
      const d = await lockedDoc(db, O);
      // before P18: the reproduction of P0-036 (the setting opens the guard)
      expect(await tx(db, O, () => db.query("SELECT set_config('ledgerline.erasing','on',true)").then(() => db.query("DELETE FROM public.documents WHERE id = $1", [d.id])))).toBe("");
      expect(await docCount(db, d.id)).toBe(0);
      await db.exec(readSql(P18));
      const d2 = await lockedDoc(db, O);
      for (const set of ["SELECT set_config('ledgerline.erasing','on',true)", "SET LOCAL ledgerline.erasing = 'on'", "SET ledgerline.erasing = 'on'"]) {
        expect(await tx(db, O, async () => { await db.exec(set); await db.query("DELETE FROM public.documents WHERE id = $1", [d2.id]); })).toMatch(/audit evidence|P9_ARCHIVE_ONLY/);
      }
      await sql(db, "RESET ledgerline.erasing");
      expect(await docCount(db, d2.id)).toBe(1);
      // P17 (stack): the file of the locked document stays too
      if (stack) { await actAs(db, O); expect((await db.query("DELETE FROM storage.objects WHERE name = $1 RETURNING 1", [d2.path])).rows).toHaveLength(0); }
      if (stack) {
        // P9's discard setting no longer opens the archive guard either
        const p = await lockedDoc(db, O, "pending-receipt");
        expect(await tx(db, O, async () => { await db.query("SELECT set_config('phase3_p9.discarding',$1,true)", [p.id]); await db.query("DELETE FROM public.documents WHERE id = $1", [p.id]); })).toMatch(/P9_ARCHIVE_ONLY/);
        expect(await docCount(db, p.id)).toBe(1);
      }
      expect(await sql(db, "SELECT p.oid::regprocedure::text f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema','phase3_p18_private') AND (p.prosrc LIKE '%current_setting(''ledgerline.erasing''%' OR p.prosrc LIKE '%phase3_p9.discarding%')")).toEqual([]);
      await db.close();
    }, 600_000);

    it("authorised erasure works end to end (rows, then files) and writes one append-only audit record", async () => {
      const db = await setup(extra);
      await db.exec(readSql(P18));
      const d = await lockedDoc(db, O);
      const acc = crypto.randomUUID();
      await sql(db, "INSERT INTO public.accounts(id, owner_id, name, kind, opening_balance) VALUES ($1,$2,'HDFC','current',0)", [acc, O]);
      await sql(db, "INSERT INTO public.expenses(id,employee_id,title,category,amount,original_amount,currency,expense_date,account_id,description) VALUES (gen_random_uuid(),$1,'Tea','Food',50,50,'INR','2026-11-01',$2,''),(gen_random_uuid(),$1,'Taxi','Travel',300,300,'INR','2026-11-02',$2,'')", [O, acc]);
      const other = await lockedDoc(db, V);
      if (stack) {
        expect(await tx(db, O, () => db.query("SELECT public.delete_my_finance_data()"))).toMatch(/STEP_UP_REQUIRED/); // P4 still applies
        await stepUp(db, O);
      }
      expect(await tx(db, O, () => db.query("SELECT public.delete_my_finance_data()"))).toBe("");
      expect(await docCount(db, d.id)).toBe(0);
      expect(await docCount(db, other.id)).toBe(1);
      expect((await sql<{ n: number }>(db, "SELECT count(*)::int n FROM public.expenses WHERE employee_id = $1", [O]))[0]!.n).toBe(0);
      expect((await sql<{ n: number }>(db, "SELECT count(*)::int n FROM phase3_p18.erasure_authority"))[0]!.n).toBe(0);
      // files afterwards, as delete-data.ts: with the rows gone nothing is locked
      await actAs(db, O);
      expect((await db.query("DELETE FROM storage.objects WHERE name = $1 RETURNING 1", [d.path])).rows).toHaveLength(1);
      const audit = await sql<Row>(db, "SELECT owner_id, erased_by, counts FROM public.erasure_audit");
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ owner_id: O, erased_by: O, counts: { documents: { before: 1, after: 0, erased: 1 }, expenses: { before: 2, after: 0, erased: 2 }, accounts: { before: 1, after: 0, erased: 1 } } });
      // the owner reads it; nobody else does; nobody changes it
      await actAs(db, O); expect((await db.query("SELECT id FROM public.erasure_audit")).rows).toHaveLength(1);
      await actAs(db, V); expect((await db.query("SELECT id FROM public.erasure_audit")).rows).toHaveLength(0);
      expect(await tx(db, O, () => db.query("UPDATE public.erasure_audit SET counts = '{}'"))).toMatch(/permission denied/);
      expect(await tx(db, O, () => db.query("DELETE FROM public.erasure_audit"))).toMatch(/permission denied/);
      await actAs(db, null);
      await expect(db.query("DELETE FROM public.erasure_audit")).rejects.toThrow(/P18_AUDIT_KEPT/);
      await expect(db.query("UPDATE public.erasure_audit SET counts = '{}'")).rejects.toThrow(/P18_AUDIT_KEPT/);
      await db.close();
    }, 600_000);

    it("a client can't write the authority or audit rows or call the helpers; an exemption never survives its transaction", async () => {
      const db = await setup(extra);
      await db.exec(readSql(P18));
      const d = await lockedDoc(db, O);
      const writes = [
        ["INSERT INTO phase3_p18.erasure_authority(owner_id, transaction_id, request_id) VALUES ($1, txid_current(), gen_random_uuid())", [O]],
        ["INSERT INTO phase3_p18.discard_authority(document_id, owner_id, transaction_id) VALUES ($1, $2, txid_current())", [d.id, O]],
        ["INSERT INTO public.erasure_audit(request_id, owner_id, erased_by, counts) VALUES (gen_random_uuid(), $1, $1, '{}')", [O]],
        ["SELECT phase3_p18.authorise_discard($1)", [d.id]],
        ["SELECT phase3_p18.owner_counts($1)", [O]],
        ["SELECT phase3_p18_private.erase_inner()", []],
      ] as const;
      for (const [q, p] of writes) expect(await tx(db, O, () => db.query(q, [...p]))).toMatch(/permission denied/);
      // an authority row from an earlier transaction (even for the right owner) does not exempt a later one
      await sql(db, "INSERT INTO phase3_p18.erasure_authority(owner_id, transaction_id, request_id) VALUES ($1, txid_current(), gen_random_uuid())", [O]);
      expect(await tx(db, O, () => db.query("DELETE FROM public.documents WHERE id = $1", [d.id]))).toMatch(/audit evidence|P9_ARCHIVE_ONLY/);
      // in its own transaction it does (the mechanism the erasure wrapper uses), and only for that owner
      await actAs(db, null); await db.exec("BEGIN");
      await db.query("INSERT INTO phase3_p18.erasure_authority(owner_id, transaction_id, request_id) VALUES ($1, txid_current(), gen_random_uuid())", [O]);
      await db.query("SELECT set_config('test.uid', $1, true)", [V]); await db.exec("SET LOCAL ROLE authenticated");
      expect((await db.query<{ ok: boolean }>("SELECT phase3_p18.erasure_authorised() ok")).rows[0]!.ok).toBe(false);
      await db.query("SELECT set_config('test.uid', $1, true)", [O]);
      expect((await db.query<{ ok: boolean }>("SELECT phase3_p18.erasure_authorised() ok")).rows[0]!.ok).toBe(true);
      await db.exec("ROLLBACK"); await actAs(db, null);
      expect(await docCount(db, d.id)).toBe(1);
      await db.close();
    }, 600_000);

    if (stack) it("P9: the verified 'saved to add later' cleanup still works through discard_used_pending_document", async () => {
      const db = await setup(extra);
      await db.exec(readSql(P18));
      const p = await lockedDoc(db, O, "pending-receipt");
      const acc = crypto.randomUUID();
      await sql(db, "UPDATE public.documents SET file_name = 'bill.jpg', size_bytes = 2048 WHERE id = $1", [p.id]);
      await sql(db, "INSERT INTO public.accounts(id, owner_id, name, kind, opening_balance) VALUES ($1,$2,'HDFC','current',0)", [acc, O]);
      await sql(db, "INSERT INTO public.expenses(id,employee_id,title,category,amount,original_amount,currency,expense_date,account_id,description,receipts) VALUES (gen_random_uuid(),$1,'Bill','Food',450,450,'INR','2026-11-09',$2,'',$3::jsonb)", [O, acc, JSON.stringify([{ name: "bill.jpg", type: "image/jpeg", path: `${O}/abc-bill.jpg` }])]);
      await sql(db, "INSERT INTO storage.objects(bucket_id, name, owner_id, metadata) VALUES ('receipts', $1, $2, '{\"size\":2048}')", [`${O}/abc-bill.jpg`, O]);
      expect(await tx(db, O, () => db.query("DELETE FROM public.documents WHERE id = $1", [p.id]))).toMatch(/P9_ARCHIVE_ONLY/);
      expect(await tx(db, V, () => db.query("SELECT public.discard_used_pending_document($1)", [p.id]))).toMatch(/P9_NOT_FOUND/);
      expect(await tx(db, O, () => db.query("SELECT public.discard_used_pending_document($1)", [p.id]))).toBe("");
      expect(await docCount(db, p.id)).toBe(0);
      expect((await sql<{ n: number }>(db, "SELECT count(*)::int n FROM phase3_p18.discard_authority"))[0]!.n).toBe(0);
      await db.close();
    }, 600_000);

    it("install refuses twice; rollback refuses while audit rows exist, then restores the exact previous catalog", async () => {
      const db = await setup(extra);
      const before = await catalog(db);
      await db.exec(readSql(P18));
      await expect(db.exec(readSql(P18))).rejects.toThrow(/already installed/);
      await db.exec("ROLLBACK");
      if (stack) await stepUp(db, V);
      expect(await tx(db, V, () => db.query("SELECT public.delete_my_finance_data()"))).toBe("");
      await expect(db.exec(readSql(P18_RB))).rejects.toThrow(/erasure audit rows exist/);
      await db.exec("ROLLBACK");
      await db.exec(readSql(P18_RB).replace("BEGIN;", "BEGIN; SET LOCAL phase3_p18.drop_audit = 'on';"));
      expect(await catalog(db)).toEqual(before);
      // the previous erasure works again after the rollback (and the old setting is trusted again: P0-036 re-opened)
      if (stack) await stepUp(db, O);
      expect(await tx(db, O, () => db.query("SELECT public.delete_my_finance_data()"))).toBe("");
      await db.close();
    }, 600_000);
  });
}
