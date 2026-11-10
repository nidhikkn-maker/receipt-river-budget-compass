// @vitest-environment node
// P0-006 / RB-P1-02: (1) inventory — no screen hands a file to the person without the server export gate; (2) proposed P15
// installs on the applied schema and on the whole proposed stack and rolls back to the exact catalog (isolated PGlite only).
// The authorisation itself (owner, other user, company member, Finance, missing step-up, audit rows): failure-injection X1-X4.
import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { actAs, addUsers, fullSchemaDb, readSql } from "@/test/full-schema-pglite";

describe("export gate inventory", () => {
  it("every download / share of a file goes through export-gate.ts (server authorisation + audit)", () => {
    const hits = execSync("grep -rnE 'downloadBlob\\(|deliverFile\\(' src --include=*.ts --include=*.tsx", { encoding: "utf8" }).split("\n").filter((l) => l && !/\.test\.tsx?:/.test(l));
    const allowed = [
      "src/lib/reports.ts", // the definitions
      "src/lib/export-gate.ts", // the gate itself
      "src/lib/store.tsx", // downloadFile: a stored original, fetched through a one-minute signed URL that re-checks access (private-files.ts)
      "src/routes/_authenticated/settings.tsx", // backup ZIP: records read, authorised and audited by exportBackupData first
    ];
    expect(hits.filter((l) => !allowed.some((a) => l.startsWith(`${a}:`)))).toEqual([]);
    const settings = readFileSync("src/routes/_authenticated/settings.tsx", "utf8");
    expect(settings.indexOf("exportBackupData")).toBeGreaterThan(-1);
    expect(settings.indexOf("exportBackupData")).toBeLessThan(settings.indexOf("downloadBlob(new Blob([new Uint8Array(zip)"));
    expect(settings).not.toMatch(/for \(const t of BACKUP_TABLES\)/); // the browser no longer reads the backup tables itself
  });
});

const O = "00000000-0000-4000-8000-000000000001";
const D = ".lovable/staged-sql/proposed/";
const P15 = `${D}P15_export_authorisation.sql`, P15_RB = `${D}P15_export_authorisation.rollback.sql`;
const STACK = ["P1_security_containment", "P2_v31_role_model", "P4_step_up_and_assistant_limits", "P5_legal_entities_foundation", "P5b_restore_investments", "P6_registers", "P7_balanced_posting", "P8_asset_depreciation_posting", "P9_statement_import_idempotency_and_archive_guards", "P10_unposted_entry_withdrawal", "P11_backup_restore_receipts", "P13_team_change_requests", "P14_asset_disposal_approval"].map((f) => `${D}${f}.sql`);
const CATALOG = `
  SELECT 'f' k, p.oid::regprocedure::text n, md5(p.prosrc) || coalesce(p.proacl::text, '') || p.prosecdef::text v FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
  UNION ALL SELECT 't', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace
  UNION ALL SELECT 'c', table_name || '.' || column_name, data_type FROM information_schema.columns WHERE table_schema = 'public'
  UNION ALL SELECT 'p', tablename || '.' || policyname, cmd || coalesce(qual, '') FROM pg_policies WHERE schemaname = 'public'
  UNION ALL SELECT 'n', nspname, '' FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1, 2`;
const catalog = async (db: PGlite) => { await actAs(db, null); return (await db.query<{ k: string; n: string; v: string }>(CATALOG)).rows.map((r) => `${r.k}|${r.n}|${r.v}`); };

describe("P15 export authorisation (SQL, isolated PGlite)", () => {
  for (const [name, extra] of [["applied schema", [] as string[]], ["whole proposed stack P1..P14", STACK]] as const) {
    it(`${name}: installs; the audit is append-only; rollback refuses while audit rows exist, then restores the exact catalog`, async () => {
      const db = await fullSchemaDb([...extra]);
      await addUsers(db, { [O]: "o@x.in" });
      const before = await catalog(db);
      await db.exec(readSql(P15));
      await actAs(db, O);
      const id = (await db.query<{ v: string }>("SELECT public.authorise_export('report', NULL, NULL, 'r.csv', 2, 40, $1) v", ["a".repeat(64)])).rows[0]!.v;
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      await expect(db.query("SELECT public.authorise_export('nope', NULL, NULL, 'r.csv', 2, 40, $1)", ["a".repeat(64)])).rejects.toThrow(/unknown export kind/);
      await expect(db.query("TRUNCATE public.export_audit")).rejects.toThrow(/P15_AUDIT_KEPT|permission denied/);
      await actAs(db, null);
      await expect(db.exec(readSql(P15_RB))).rejects.toThrow(/export audit rows exist/);
      await db.exec("ROLLBACK");
      await db.exec(readSql(P15_RB).replace("BEGIN;", "BEGIN; SET LOCAL phase3_p15.drop_audit = 'on';"));
      expect(await catalog(db)).toEqual(before);
      await db.close();
    }, 600_000);
  }
});
