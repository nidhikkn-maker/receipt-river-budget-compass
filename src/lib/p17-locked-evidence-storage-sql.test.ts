// @vitest-environment node
// D8 / P0-035: a file behind an evidence_locked documents row cannot be deleted, overwritten (upsert / UPDATE of any
// column / move), replaced (delete + insert in one transaction) or re-planted through storage.objects once proposed P17
// is installed, whoever asks (owner, company reader, company editor, other owner, anon) and whatever session setting
// they set. Explicit authorised paths: owner unlock, account erasure (rows first, then files), service role.
// The rollback restores the exact catalog. Isolated PGlite only (storage.objects stub), never Cloud.
// The last describe REPRODUCES open finding P0-036 (applied 0059 trusts a client-settable setting); it is not an
// acceptance of any control.
import { describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { actAs, addUsers, fullSchemaDb, readSql } from "@/test/full-schema-pglite";

const A = "00000000-0000-4000-8000-0000000000a1"; // owner
const B = "00000000-0000-4000-8000-0000000000b2"; // another owner, no grant
const R = "00000000-0000-4000-8000-0000000000c3"; // company member, read access
const W = "00000000-0000-4000-8000-0000000000d4"; // company member, write access
const ENTITY = "co-1";
const D = ".lovable/staged-sql/proposed/";
const P17 = `${D}P17_locked_evidence_storage.sql`, P17_RB = `${D}P17_locked_evidence_storage.rollback.sql`;
// Same stack as the P15 test (P3 is left out there too) plus P15 and P16.
const STACK = ["P1_security_containment", "P2_v31_role_model", "P4_step_up_and_assistant_limits", "P5_legal_entities_foundation", "P5b_restore_investments", "P6_registers", "P7_balanced_posting", "P8_asset_depreciation_posting", "P9_statement_import_idempotency_and_archive_guards", "P10_unposted_entry_withdrawal", "P11_backup_restore_receipts", "P13_team_change_requests", "P14_asset_disposal_approval", "P15_export_authorisation", "P16_statement_undo_withdraw"].map((f) => `${D}${f}.sql`);
const CATALOG = `
  SELECT 'f' k, p.oid::regprocedure::text n, md5(p.prosrc) || coalesce(p.proacl::text, '') || p.prosecdef::text || coalesce(p.proconfig::text, '') v FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
  UNION ALL SELECT 'p', schemaname || '.' || tablename || '.' || policyname, permissive || cmd || roles::text || coalesce(qual, '') || coalesce(with_check, '') FROM pg_policies WHERE schemaname IN ('public', 'storage')
  ORDER BY 1, 2`;
const catalog = async (db: PGlite) => { await actAs(db, null); return (await db.query<{ k: string; n: string; v: string }>(CATALOG)).rows.map((r) => `${r.k}|${r.n}|${r.v}`); };

const put = async (db: PGlite, bucket: string, name: string, owner: string) => {
  await actAs(db, null);
  await db.query("INSERT INTO storage.objects(bucket_id, name, owner_id, metadata) VALUES ($1,$2,$3,'{\"size\":10}')", [bucket, name, owner]);
};
const doc = async (db: PGlite, owner: string, path: string, locked: boolean, entity: string | null = null) => {
  await actAs(db, null);
  const id = crypto.randomUUID();
  await db.query("INSERT INTO public.documents(id, owner_id, title, file_path, file_name, size_bytes, notes, evidence_locked, entity_id) VALUES ($1,$2,'Invoice',$3,'inv.pdf',10,'',$4,$5)", [id, owner, path, locked, entity]);
  return id;
};
const exists = async (db: PGlite, bucket: string, name: string) => {
  await actAs(db, null);
  return (await db.query("SELECT 1 FROM storage.objects WHERE bucket_id = $1 AND name = $2", [bucket, name])).rows.length === 1;
};
/** What the Storage API does for remove(): a DELETE under the caller's RLS; refused rows are simply not deleted. */
const remove = async (db: PGlite, uid: string, bucket: string, name: string) => {
  await actAs(db, uid);
  const r = await db.query("DELETE FROM storage.objects WHERE bucket_id = $1 AND name = $2 RETURNING name", [bucket, name]);
  await actAs(db, null);
  return r.rows.length;
};
const lockSignal = async (db: PGlite, uid: string, name: string) => {
  await actAs(db, uid);
  const v = (await db.query<{ v: boolean }>("SELECT public.storage_object_is_locked_evidence('receipts', $1) v", [name])).rows[0]!.v;
  await actAs(db, null);
  return v;
};
const asAnon = async (db: PGlite) => { await actAs(db, null); await db.exec("SET ROLE anon"); };
const UPSERT = "INSERT INTO storage.objects(bucket_id, name, owner_id) VALUES ('receipts',$1,$2) ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = '{\"size\":1}', owner_id = excluded.owner_id";
const RLS = /row-level security/;

async function setup(extra: readonly string[]) {
  const db = await fullSchemaDb([...extra]);
  await addUsers(db, { [A]: "a@x.in", [B]: "b@x.in", [R]: "r@x.in", [W]: "w@x.in" });
  await actAs(db, null);
  await db.exec("CREATE UNIQUE INDEX objects_bucket_name ON storage.objects(bucket_id, name)"); // as in Supabase Storage
  await db.query("INSERT INTO public.entity_members(owner_id, entity_id, member_id, member_email, can_write) VALUES ($1,$2,$3,'r@x.in',false),($1,$2,$4,'w@x.in',true)", [A, ENTITY, R, W]);
  return db;
}

describe("P17 locked evidence storage (SQL, isolated PGlite)", () => {
  for (const [label, extra] of [["applied schema", [] as string[]], ["proposed stack P1..P16 (as P15's test, without P3)", STACK]] as const) {
    it(`${label}: no client path deletes, overwrites, moves, replaces or re-plants a locked file; exact rollback`, async () => {
      const db = await setup(extra);
      const before = await catalog(db);

      // Before P17 (D8 reproduction): the owner deletes the file behind a locked row.
      const d8 = `${A}/docs/d8-before.pdf`;
      await put(db, "receipts", d8, A); await doc(db, A, d8, true);
      expect(await remove(db, A, "receipts", d8)).toBe(1);

      await db.exec(readSql(P17));

      const locked = `${A}/docs/locked.pdf`, open = `${A}/docs/open.pdf`, upload = `${A}/2026/statement.pdf`;
      const company = `${A}/companies/${Buffer.from(ENTITY).toString("hex")}/locked.pdf`;
      const lockedId = await doc(db, A, locked, true); await put(db, "receipts", locked, A);
      await doc(db, A, open, false); await put(db, "receipts", open, A);
      await doc(db, A, upload, true); await put(db, "statement-uploads", upload, A);
      await doc(db, A, company, true, ENTITY); await put(db, "receipts", company, A);
      const bLocked = `${B}/docs/b-locked.pdf`, bOpen = `${B}/docs/b-open.pdf`;
      await doc(db, B, bLocked, true); await put(db, "receipts", bLocked, B);
      await doc(db, B, bOpen, false); await put(db, "receipts", bOpen, B);

      // (1) Direct delete by the owner: refused in both evidence buckets; an unlocked file deletes as before.
      expect(await remove(db, A, "receipts", locked)).toBe(0);
      expect(await remove(db, A, "statement-uploads", upload)).toBe(0);
      expect(await remove(db, A, "receipts", company)).toBe(0);
      expect(await exists(db, "receipts", locked)).toBe(true);
      expect(await exists(db, "statement-uploads", upload)).toBe(true);
      expect(await remove(db, A, "receipts", open)).toBe(1);

      // (a) Attack: a session setting cannot open the lock (SET and set_config, session and transaction scope).
      await actAs(db, A);
      await db.query("SELECT set_config('ledgerline.erasing', 'on', false)");
      expect((await db.query("DELETE FROM storage.objects WHERE name = $1 RETURNING 1", [locked])).rows).toHaveLength(0);
      await db.exec("SET ledgerline.erasing = 'on'");
      expect((await db.query("DELETE FROM storage.objects WHERE name = $1 RETURNING 1", [locked])).rows).toHaveLength(0);
      await db.exec("BEGIN; SELECT set_config('ledgerline.erasing', 'on', true)");
      expect((await db.query("DELETE FROM storage.objects WHERE name = $1 RETURNING 1", [locked])).rows).toHaveLength(0);
      await db.exec("COMMIT; RESET ledgerline.erasing");
      // ...whereas a helper that trusted the setting (the WS-E draft / 0059 pattern) would have let it through:
      await actAs(db, null);
      const p17Helper = (await db.query<{ d: string }>("SELECT pg_get_functiondef('public.storage_object_is_locked_evidence(text,text)'::regprocedure) d")).rows[0]!.d;
      await db.exec(p17Helper.replace("AND auth.uid() IS NOT NULL", "AND auth.uid() IS NOT NULL AND coalesce(current_setting('ledgerline.erasing', true), '') <> 'on'"));
      await actAs(db, A);
      await db.exec("BEGIN; SELECT set_config('ledgerline.erasing', 'on', true)");
      expect((await db.query("DELETE FROM storage.objects WHERE name = $1 RETURNING 1", [locked])).rows).toHaveLength(1);
      await db.exec("ROLLBACK");
      await actAs(db, null);
      await db.exec(p17Helper);
      expect(await exists(db, "receipts", locked)).toBe(true);

      // (2) Overwrite: upsert by the owner and by a company editor is refused.
      await actAs(db, A);
      await expect(db.query(UPSERT, [locked, A])).rejects.toThrow(RLS);
      await actAs(db, W);
      await expect(db.query(UPSERT, [company, W])).rejects.toThrow(RLS);
      // Any UPDATE path (a permissive one is added here to stand for a future policy): metadata, owner, owner_id, name
      // (move/rename), bucket_id (move to another bucket) are all refused; nothing can be moved ONTO a locked path.
      await actAs(db, null);
      await db.exec(`CREATE POLICY "test updates receipts" ON storage.objects FOR UPDATE TO authenticated USING (true) WITH CHECK (true)`);
      for (const uid of [A, W, R, B]) {
        const target = uid === A ? locked : company;
        for (const [set, v] of [["metadata = '{\"size\":1}'::jsonb", null], ["owner = $2::uuid", uid], ["owner_id = $2", uid], ["name = $2", `${A}/docs/moved.pdf`], ["bucket_id = $2", "statement-uploads"]] as const) {
          await actAs(db, uid);
          const params = v === null ? [target] : [target, v];
          expect((await db.query(`UPDATE storage.objects SET ${set} WHERE name = $1 RETURNING 1`, params)).rows).toHaveLength(0);
        }
      }
      await put(db, "receipts", `${A}/docs/other.pdf`, A);
      await actAs(db, A);
      await expect(db.query("UPDATE storage.objects SET name = $2 WHERE name = $1", [`${A}/docs/other.pdf`, locked])).rejects.toThrow(/row-level security|duplicate key/);
      await actAs(db, null);
      await db.exec(`DROP POLICY "test updates receipts" ON storage.objects`);
      expect(await exists(db, "receipts", locked)).toBe(true);
      expect(await exists(db, "receipts", company)).toBe(true);

      // Replacement: delete + insert at the same path in one transaction is refused (the delete removes nothing and the
      // insert is refused); re-planting bytes at a locked path whose file is already gone (pre-fix damage) is refused.
      await actAs(db, A);
      await db.exec("BEGIN");
      expect((await db.query("DELETE FROM storage.objects WHERE bucket_id = 'receipts' AND name = $1 RETURNING 1", [locked])).rows).toHaveLength(0);
      await expect(db.query("INSERT INTO storage.objects(bucket_id, name, owner_id) VALUES ('receipts',$1,$2)", [locked, A])).rejects.toThrow(/row-level security|duplicate key/);
      await db.exec("ROLLBACK");
      await expect(db.query("INSERT INTO storage.objects(bucket_id, name, owner_id) VALUES ('receipts',$1,$2)", [d8, A])).rejects.toThrow(RLS);
      await db.query("INSERT INTO storage.objects(bucket_id, name, owner_id) VALUES ('receipts',$1,$2)", [`${A}/docs/new.pdf`, A]); // new paths still upload

      // (3) Access: another owner cannot see, delete or learn about A's files; company members cannot delete or
      // overwrite a locked company file (they already read its lock flag on the document); anon gets nothing.
      await actAs(db, B);
      expect((await db.query("SELECT 1 FROM storage.objects WHERE name = ANY($1)", [[locked, company, upload]])).rows).toHaveLength(0);
      expect(await remove(db, B, "receipts", locked)).toBe(0);
      expect(await remove(db, B, "receipts", company)).toBe(0);
      expect(await lockSignal(db, B, locked)).toBe(false);
      expect(await lockSignal(db, B, company)).toBe(false);
      expect(await lockSignal(db, B, `${A}/docs/never.pdf`)).toBe(false);
      expect(await remove(db, R, "receipts", company)).toBe(0);
      expect(await remove(db, W, "receipts", company)).toBe(0);
      expect(await remove(db, R, "receipts", locked)).toBe(0);
      expect(await lockSignal(db, R, company)).toBe(true); // same as documents.evidence_locked, which R can read
      expect(await lockSignal(db, R, locked)).toBe(false); // A's personal file: no signal to a company member
      await asAnon(db);
      expect((await db.query("SELECT 1 FROM storage.objects")).rows).toHaveLength(0);
      expect((await db.query("DELETE FROM storage.objects WHERE name = $1 RETURNING 1", [locked])).rows).toHaveLength(0);
      await expect(db.query("INSERT INTO storage.objects(bucket_id, name) VALUES ('receipts',$1)", [locked])).rejects.toThrow(RLS);
      expect((await db.query<{ v: boolean }>("SELECT public.storage_object_is_locked_evidence('receipts', $1) v", [locked])).rows[0]!.v).toBe(false);
      await actAs(db, null);
      expect(await remove(db, B, "receipts", bLocked)).toBe(0); // B's own lock holds for B
      expect(await remove(db, B, "receipts", bOpen)).toBe(1);
      expect(await exists(db, "receipts", company)).toBe(true);

      // (5) The owner's authorised unlock re-allows the delete.
      await actAs(db, A);
      await db.query("UPDATE public.documents SET evidence_locked = false WHERE id = $1", [lockedId]);
      expect(await remove(db, A, "receipts", locked)).toBe(1);

      // (4) Service role (server-only; BYPASSRLS in Supabase) can still clean up, e.g. the upload route's failed upload.
      await actAs(db, null);
      await db.exec("ALTER ROLE service_role BYPASSRLS; SET ROLE service_role");
      expect((await db.query("DELETE FROM storage.objects WHERE bucket_id = 'receipts' AND name = $1 RETURNING 1", [bLocked])).rows).toHaveLength(1);
      await db.exec("RESET ROLE");

      // (4) Account erasure: delete_my_finance_data removes the rows in its own transaction, then the files delete.
      if (!extra.length) {
        await actAs(db, A);
        await db.query("SELECT public.delete_my_finance_data()");
        expect(await remove(db, A, "statement-uploads", upload)).toBe(1);
        expect(await remove(db, A, "receipts", company)).toBe(1);
      }

      // (6) Rollback restores the exact pre-P17 catalog (functions incl. settings/grants and every public/storage policy).
      await actAs(db, null);
      await db.exec(readSql(P17_RB));
      expect(await catalog(db)).toEqual(before);
      await db.close();
    }, 600_000);
  }
});

describe("open finding P0-036 (applied 0059, also proposed P9): reproduction only, not an acceptance", () => {
  for (const [label, extra] of [["applied schema", [] as string[]], ["proposed stack (P9 guard trusts the same setting)", STACK]] as const) it(`${label}: in plain SQL an owner can set ledgerline.erasing and delete a locked documents row, after which P17 no longer protects the file`, async () => {
    const db = await setup(extra);
    await db.exec(readSql(P17));
    const path = `${A}/docs/finding.pdf`;
    const id = await doc(db, A, path, true); await put(db, "receipts", path, A);
    await actAs(db, A);
    await expect(db.query("DELETE FROM public.documents WHERE id = $1", [id])).rejects.toThrow(/audit evidence|P9_ARCHIVE_ONLY/);
    await db.exec("BEGIN; SELECT set_config('ledgerline.erasing', 'on', true)");
    expect((await db.query("DELETE FROM public.documents WHERE id = $1 RETURNING 1", [id])).rows).toHaveLength(1);
    await db.exec("COMMIT");
    expect(await remove(db, A, "receipts", path)).toBe(1);
    await db.close();
  }, 600_000);
});
