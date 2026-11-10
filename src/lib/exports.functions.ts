import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BACKUP_TABLES, type Backup } from "./backup";
import { EXPORT_KINDS, authoriseExportFor, sha256Hex, type ExportDb, type ExportKind } from "./exports";

const kinds = Object.keys(EXPORT_KINDS) as [ExportKind, ...ExportKind[]];
const Input = z.object({
  kind: z.enum(kinds), ownerId: z.string().uuid().nullable().optional(), entityId: z.string().min(1).max(64).nullable().optional(),
  fileName: z.string().trim().min(1).max(200), rows: z.number().int().min(0), bytes: z.number().int().min(0), sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

/** P0-006: authorise (and, with P15, audit) one export before the file is handed to the person. Errors are returned raw so the
 * browser's step-up wrapper can recognise STEP_UP_REQUIRED; export-gate.ts words them for people. */
export const authoriseExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    try { return { ok: true as const, ...(await authoriseExportFor(context.supabase as unknown as ExportDb, context.userId, data)) }; }
    catch (e) { return { ok: false as const, error: (e as Error).message }; }
  });

interface Page { data: unknown; error: { message: string } | null }
interface RangeQ { eq(k: string, v: unknown): RangeQ; order(c: string): RangeQ; range(a: number, b: number): PromiseLike<Page> }
interface BackupDb extends ExportDb { from: ExportDb["from"] & ((table: string) => { select(c: string): RangeQ }) }

/** The records of a backup (Backup["data"] as JSON text), read on the server with the caller's own token (owner rows only), authorised and audited as one
 * 'backup' export (rows, bytes and SHA-256 of the records JSON). The browser adds the owner's files and builds the ZIP. */
export async function backupDataFor(db: BackupDb, userId: string, fileName: string): Promise<{ json: string; exportId: string | null; audited: boolean; sha256: string }> {
  const out: Backup["data"] = {};
  for (const t of BACKUP_TABLES) {
    out[t] = [];
    for (let start = 0; ; start += 500) {
      const order = t === "finance_preferences" ? "owner_id" : t === "category_budgets" ? "category" : "id";
      const r = await (db.from(t) as unknown as { select(c: string): RangeQ }).select("*").eq(t === "expenses" ? "employee_id" : "owner_id", userId).order(order).range(start, start + 499);
      if (r.error) throw Error(r.error.message);
      const rows = Array.isArray(r.data) ? (r.data as Record<string, unknown>[]) : [];
      out[t]!.push(...rows);
      if (rows.length < 500) break;
    }
  }
  const json = JSON.stringify(out); // exactly the bytes that are hashed and audited; the browser parses them
  const bytes = new TextEncoder().encode(json);
  const sha256 = await sha256Hex(bytes);
  const rows = Object.values(out).reduce((s, x) => s + (x?.length ?? 0), 0);
  const grant = await authoriseExportFor(db, userId, { kind: "backup", fileName, rows, bytes: bytes.length, sha256 });
  return { json, ...grant, sha256 };
}

export const exportBackupData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fileName: z.string().trim().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    try { return { ok: true as const, ...(await backupDataFor(context.supabase as unknown as BackupDb, context.userId, data.fileName)) }; }
    catch (e) { return { ok: false as const, error: (e as Error).message }; }
  });
