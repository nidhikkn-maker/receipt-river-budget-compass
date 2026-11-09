// @vitest-environment node
// Isolated check that proposed security P1 (+P2) leaves owner backup restore working: same-account
// restore (upserts existing rows) and cross-account restore (remapped ids). Uses the app's own
// export shape and prepareRestore. In-memory PGlite only; never touches Cloud.
import { describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { fullSchemaDb, actAs, addUsers } from "../test/full-schema-pglite";
import { BACKUP_TABLES, prepareRestore, type Backup } from "./backup";

const A = "00000000-0000-4000-8000-0000000000a1", B = "00000000-0000-4000-8000-0000000000b2";
const P1 = ".lovable/staged-sql/proposed/P1_security_containment.sql", P2 = ".lovable/staged-sql/proposed/P2_v31_role_model.sql";

async function seed(db: PGlite) {
  await addUsers(db, { [A]: "a@x.in", [B]: "b@x.in" });
  await actAs(db, A);
  const [acct] = (await db.query<{ id: string }>("INSERT INTO public.accounts(owner_id,name,kind,opening_balance) VALUES ($1,'Bank','savings',1000) RETURNING id", [A])).rows;
  const [exp] = (await db.query<{ id: string }>(
    "INSERT INTO public.expenses(employee_id,title,merchant,amount,currency,category,expense_date,account_id,receipts) VALUES ($1,'Lunch','Cafe',250.5,'INR','Food','2026-10-10',$2,$3::jsonb) RETURNING id",
    [A, acct!.id, JSON.stringify([{ path: `${A}/receipts/lunch.jpg`, name: "lunch.jpg", type: "image/jpeg" }])])).rows;
  await db.query("INSERT INTO public.documents(owner_id,title,file_path,file_name,transaction_id) VALUES ($1,'Bill',$2,'bill.pdf',$3)", [A, `${A}/docs/bill.pdf`, exp!.id]);
}

async function exportBackup(db: PGlite, owner: string): Promise<Backup> {
  await actAs(db, owner);
  const data: Backup["data"] = {};
  for (const t of BACKUP_TABLES) {
    const col = t === "expenses" ? "employee_id" : "owner_id";
    data[t] = (await db.query<Record<string, unknown>>(`SELECT to_jsonb(x) j FROM public.${t} x WHERE ${col} = $1`, [owner])).rows.map((r) => (r as { j: Record<string, unknown> }).j);
  }
  return { app: "ledgerline", version: 2, owner, exportedAt: "2026-11-09", data } as Backup;
}

const restore = (db: PGlite, payload: unknown) => db.query("SELECT public.restore_finance_backup($1::jsonb)", [JSON.stringify(payload)]);
const counts = async (db: PGlite, owner: string) => {
  const out: Record<string, number> = {};
  for (const t of ["accounts", "expenses", "documents"]) out[t] = (await db.query<{ n: number }>(`SELECT count(*)::int n FROM public.${t} WHERE ${t === "expenses" ? "employee_id" : "owner_id"} = $1`, [owner])).rows[0]!.n;
  return out;
};

describe.each([["P1", [P1]], ["P1+P2", [P1, P2]]])("backup restore after proposed %s", (_label, files) => {
  it("same-account restore succeeds and keeps one copy of each record", async () => {
    const db = await fullSchemaDb(files as string[]); await seed(db);
    const backup = await exportBackup(db, A);
    await actAs(db, A);
    await restore(db, prepareRestore(backup, A).data);
    expect(await counts(db, A)).toEqual({ accounts: 1, expenses: 1, documents: 1 });
    await db.close();
  }, 120000);

  it("cross-account restore succeeds with remapped ids and leaves the source account untouched", async () => {
    const db = await fullSchemaDb(files as string[]); await seed(db);
    const backup = await exportBackup(db, A);
    await actAs(db, B);
    await restore(db, prepareRestore(backup, B, undefined, true).data);
    expect(await counts(db, B)).toEqual({ accounts: 1, expenses: 1, documents: 1 });
    await actAs(db, A);
    expect(await counts(db, A)).toEqual({ accounts: 1, expenses: 1, documents: 1 });
    await actAs(db, B);
    const [link] = (await db.query<{ ok: boolean }>("SELECT d.transaction_id = e.id AS ok FROM public.documents d JOIN public.expenses e ON e.employee_id = d.owner_id WHERE d.owner_id = $1", [B])).rows;
    expect(link?.ok).toBe(true);
    await db.close();
  }, 120000);
});
