// @vitest-environment node
// D8 / P0-035: a file behind an evidence_locked documents row cannot be deleted, overwritten (upsert/update/move) or
// re-planted through storage.objects once proposed P17 is installed; unlocked files, other owners and account erasure
// behave as before; the rollback restores the exact catalog. Isolated PGlite only (storage.objects stub), never Cloud.
import { describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { actAs, addUsers, fullSchemaDb, readSql } from "@/test/full-schema-pglite";

const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";
const D = ".lovable/staged-sql/proposed/";
const P17 = `${D}P17_locked_evidence_storage.sql`, P17_RB = `${D}P17_locked_evidence_storage.rollback.sql`;
const STACK = ["P1_security_containment", "P2_v31_role_model", "P4_step_up_and_assistant_limits", "P5_legal_entities_foundation", "P5b_restore_investments", "P6_registers", "P7_balanced_posting", "P8_asset_depreciation_posting", "P9_statement_import_idempotency_and_archive_guards", "P10_unposted_entry_withdrawal", "P11_backup_restore_receipts", "P13_team_change_requests", "P14_asset_disposal_approval", "P15_export_authorisation", "P16_statement_undo_withdraw"].map((f) => `${D}${f}.sql`);
const CATALOG = `
  SELECT 'f' k, p.oid::regprocedure::text n, md5(p.prosrc) || coalesce(p.proacl::text, '') || p.prosecdef::text v FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
  UNION ALL SELECT 'p', schemaname || '.' || tablename || '.' || policyname, permissive || cmd || roles::text || coalesce(qual, '') || coalesce(with_check, '') FROM pg_policies WHERE schemaname IN ('public', 'storage')
  ORDER BY 1, 2`;
const catalog = async (db: PGlite) => { await actAs(db, null); return (await db.query<{ k: string; n: string; v: string }>(CATALOG)).rows.map((r) => `${r.k}|${r.n}|${r.v}`); };

const put = async (db: PGlite, bucket: string, name: string, owner: string) => {
  await actAs(db, null);
  await db.query("INSERT INTO storage.objects(bucket_id, name, owner_id, metadata) VALUES ($1,$2,$3,'{\"size\":10}')", [bucket, name, owner]);
};
const doc = async (db: PGlite, owner: string, path: string, locked: boolean) => {
  await actAs(db, null);
  const id = crypto.randomUUID();
  await db.query("INSERT INTO public.documents(id, owner_id, title, file_path, file_name, size_bytes, notes, evidence_locked) VALUES ($1,$2,'Invoice',$3,'inv.pdf',10,'',$4)", [id, owner, path, locked]);
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

describe("P17 locked evidence storage (SQL, isolated PGlite)", () => {
  for (const [label, extra] of [["applied schema", [] as string[]], ["proposed stack P1..P16 (as P15's test, without P3)", STACK]] as const) {
    it(`${label}: locked files cannot be deleted/overwritten/re-planted; unlocked and other owners unaffected; exact rollback`, async () => {
      const db = await fullSchemaDb([...extra]);
      await addUsers(db, { [A]: "a@x.in", [B]: "b@x.in" });
      await actAs(db, null);
      await db.exec("CREATE UNIQUE INDEX objects_bucket_name ON storage.objects(bucket_id, name)"); // as in Supabase Storage
      const before = await catalog(db);

      // Before P17 (D8 reproduction): the owner deletes the file behind a locked row.
      const d8 = `${A}/docs/d8-before.pdf`;
      await put(db, "receipts", d8, A); await doc(db, A, d8, true);
      expect(await remove(db, A, "receipts", d8)).toBe(1);

      await db.exec(readSql(P17));

      const locked = `${A}/docs/locked.pdf`, open = `${A}/docs/open.pdf`, upload = `${A}/2026/statement.pdf`;
      const lockedId = await doc(db, A, locked, true); await put(db, "receipts", locked, A);
      await doc(db, A, open, false); await put(db, "receipts", open, A);
      await doc(db, A, upload, true); await put(db, "statement-uploads", upload, A);
      const bLocked = `${B}/docs/b-locked.pdf`, bOpen = `${B}/docs/b-open.pdf`;
      await doc(db, B, bLocked, true); await put(db, "receipts", bLocked, B);
      await doc(db, B, bOpen, false); await put(db, "receipts", bOpen, B);

      // Owner: locked file refused in both evidence buckets; unlocked file deleted as before.
      expect(await remove(db, A, "receipts", locked)).toBe(0);
      expect(await exists(db, "receipts", locked)).toBe(true);
      expect(await remove(db, A, "statement-uploads", upload)).toBe(0);
      expect(await exists(db, "statement-uploads", upload)).toBe(true);
      expect(await remove(db, A, "receipts", open)).toBe(1);

      // Overwrite: upsert (INSERT .. ON CONFLICT DO UPDATE) and re-planting a locked path are refused.
      await actAs(db, A);
      await expect(db.query("INSERT INTO storage.objects(bucket_id, name, owner_id) VALUES ('receipts',$1,$2) ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = '{\"size\":1}'", [locked, A])).rejects.toThrow(/row-level security/);
      // Even with a permissive UPDATE path (a future policy), the locked file cannot be changed or moved away.
      await actAs(db, null);
      await db.exec(`CREATE POLICY "test owner updates receipts" ON storage.objects FOR UPDATE TO authenticated USING ((storage.foldername(name))[1] = auth.uid()::text) WITH CHECK ((storage.foldername(name))[1] = auth.uid()::text)`);
      await actAs(db, A);
      expect((await db.query("UPDATE storage.objects SET metadata = '{\"size\":1}' WHERE name = $1 RETURNING 1", [locked])).rows).toHaveLength(0);
      expect((await db.query("UPDATE storage.objects SET name = $2 WHERE name = $1 RETURNING 1", [locked, `${A}/docs/moved.pdf`])).rows).toHaveLength(0);
      await actAs(db, null);
      await db.exec(`DROP POLICY "test owner updates receipts" ON storage.objects`);
      // Re-planting bytes at a locked path whose file is missing (pre-fix damage) is refused.
      await actAs(db, A);
      await expect(db.query("INSERT INTO storage.objects(bucket_id, name, owner_id) VALUES ('receipts',$1,$2)", [d8, A])).rejects.toThrow(/row-level security/);
      // A new file at an unused path still uploads.
      await db.query("INSERT INTO storage.objects(bucket_id, name, owner_id) VALUES ('receipts',$1,$2)", [`${A}/docs/new.pdf`, A]);

      // Cross-owner: B cannot delete A's files (locked or not) and learns nothing about A's lock.
      expect(await remove(db, B, "receipts", locked)).toBe(0);
      await actAs(db, B);
      expect((await db.query<{ v: boolean }>("SELECT public.storage_object_is_locked_evidence('receipts', $1) v", [locked])).rows[0]!.v).toBe(false);
      expect((await db.query<{ v: boolean }>("SELECT public.storage_object_is_locked_evidence('receipts', $1) v", [`${A}/docs/never.pdf`])).rows[0]!.v).toBe(false);
      // B's own files follow B's own locks.
      expect(await remove(db, B, "receipts", bLocked)).toBe(0);
      expect(await remove(db, B, "receipts", bOpen)).toBe(1);

      // The owner's authorised unlock (documents UPDATE; P1 allows it for the owner only) re-allows the delete.
      await actAs(db, A);
      await db.query("UPDATE public.documents SET evidence_locked = false WHERE id = $1", [lockedId]);
      expect(await remove(db, A, "receipts", locked)).toBe(1);

      // Account erasure (0059 rule): with ledgerline.erasing on, the lock no longer blocks; the app removes files after
      // delete_my_finance_data has removed the rows, so nothing is locked any more.
      await actAs(db, A);
      await db.exec("BEGIN; SELECT set_config('ledgerline.erasing', 'on', true)");
      expect((await db.query("DELETE FROM storage.objects WHERE bucket_id = 'statement-uploads' AND name = $1 RETURNING 1", [upload])).rows).toHaveLength(1);
      await db.exec("ROLLBACK");
      expect(await exists(db, "statement-uploads", upload)).toBe(true);
      if (!extra.length) {
        await actAs(db, A);
        await db.query("SELECT public.delete_my_finance_data()");
        expect(await remove(db, A, "statement-uploads", upload)).toBe(1);
        expect(await remove(db, B, "receipts", bLocked)).toBe(0); // the other owner's evidence is untouched
      }

      // Rollback restores the exact pre-P17 catalog (functions and every public/storage policy).
      await actAs(db, null);
      await db.exec(readSql(P17_RB));
      expect(await catalog(db)).toEqual(before);
      await db.close();
    }, 600_000);
  }
});
