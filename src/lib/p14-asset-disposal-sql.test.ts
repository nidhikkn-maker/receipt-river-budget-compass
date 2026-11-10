// @vitest-environment node
// Proposed P14 (P0-015 asset disposal approval) install / rollback at the SQL level, isolated PGlite only (never Cloud).
// The approval flow itself (server functions, PostgREST-shaped requests, posting on active books): failure-injection.test.ts D1-D4.
import { describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { actAs, addUsers, fullSchemaDb, readSql } from "@/test/full-schema-pglite";

const O = "00000000-0000-4000-8000-000000000001";
const D = ".lovable/staged-sql/proposed/";
const P14 = `${D}P14_asset_disposal_approval.sql`, P14_RB = `${D}P14_asset_disposal_approval.rollback.sql`;
const STACK = ["P1_security_containment", "P2_v31_role_model", "P4_step_up_and_assistant_limits", "P5_legal_entities_foundation", "P5b_restore_investments", "P6_registers", "P7_balanced_posting", "P8_asset_depreciation_posting", "P9_statement_import_idempotency_and_archive_guards", "P10_unposted_entry_withdrawal", "P11_backup_restore_receipts", "P13_team_change_requests"].map((f) => `${D}${f}.sql`);
const CATALOG = `
  SELECT 'f' k, p.oid::regprocedure::text n, md5(p.prosrc) || coalesce(p.proacl::text, '') || p.prosecdef::text v FROM pg_proc p WHERE p.pronamespace IN ('public'::regnamespace) OR p.pronamespace::regnamespace::text = 'phase3_p7'
  UNION ALL SELECT 't', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace
  UNION ALL SELECT 'c', table_name || '.' || column_name, data_type FROM information_schema.columns WHERE table_schema = 'public'
  UNION ALL SELECT 'p', tablename || '.' || policyname, cmd || coalesce(qual, '') FROM pg_policies WHERE schemaname = 'public'
  UNION ALL SELECT 'n', nspname, '' FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1, 2`;
const catalog = async (db: PGlite) => { await actAs(db, null); return (await db.query<{ k: string; n: string; v: string }>(CATALOG)).rows.map((r) => `${r.k}|${r.n}|${r.v}`); };

describe("P14 asset disposal approval (SQL, isolated PGlite)", () => {
  for (const [name, extra] of [["applied schema", [] as string[]], ["whole proposed stack P1..P13 (P8 hook wrapped and restored)", STACK]] as const) {
    it(`${name}: installs; rollback refuses while requests exist, then restores the exact catalog`, async () => {
      const db = await fullSchemaDb([...extra]);
      await addUsers(db, { [O]: "o@x.in" });
      await db.query("INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1, '{}') ON CONFLICT (owner_id) DO NOTHING", [O]);
      const before = await catalog(db);
      await db.exec(readSql(P14));
      await expect(db.exec(readSql(P14))).rejects.toThrow(/already installed/);
      await db.exec("ROLLBACK");
      await db.query("INSERT INTO public.asset_disposal_requests(owner_id, asset_id, asset_name, method, disposal_date, proceeds, evidence_document_ids, reason, book_value, gain, entry_id, requested_by) VALUES ($1,'a1','Laptop','scrap','2026-10-31',0,ARRAY[gen_random_uuid()],'Broken beyond repair',1000,-1000,gen_random_uuid(),$1)", [O]);
      await expect(db.exec(readSql(P14_RB))).rejects.toThrow(/disposal requests exist/);
      await db.exec("ROLLBACK");
      await db.exec(readSql(P14_RB).replace("BEGIN;", "BEGIN; SET LOCAL phase3_p14.drop_requests = 'on';"));
      expect(await catalog(db)).toEqual(before);
      await db.close();
    }, 600_000);
  }
});
