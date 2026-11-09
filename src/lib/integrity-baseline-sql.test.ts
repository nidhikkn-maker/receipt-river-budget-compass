// @vitest-environment node
// Phase 0: the read-only historical-integrity baseline (scripts/integrity/historical-baseline.sql) runs against the full
// applied schema in isolated PGlite only. It is NOT run against production (requires KK's separate approval).
import { describe, expect, it } from "vitest";
import { fullSchemaDb, actAs, addUsers, readSql } from "../test/full-schema-pglite";

const SQL = readSql("scripts/integrity/historical-baseline.sql");
const statements = SQL.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
const OWNER = "00000000-0000-4000-8000-0000000000d1";
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

async function seeded() {
  const db = await fullSchemaDb();
  await addUsers(db, { [OWNER]: "baseline@x.in" });
  await actAs(db, null);
  const [acct] = (await db.query<{ id: string }>("INSERT INTO public.accounts(owner_id,name,kind,opening_balance) VALUES ($1,'Bank','savings',1000) RETURNING id", [OWNER])).rows;
  for (const i of range(5)) await db.query("INSERT INTO public.expenses(employee_id,title,amount,category,expense_date,account_id) VALUES ($1,$2,$3,'Food',$4,$5)", [OWNER, `e${i}`, 10 + i, `2026-0${1 + (i % 3)}-15`, acct!.id]);
  const prefs = { books: { journals: range(5000).map((i) => ({ id: `j${i}`, amount: 1 })), leases: range(3).map((i) => ({ id: `l${i}` })) }, assets: [], statementUploads: [{ id: "u1", posted: range(3000).map(String), reconciled: [] }] };
  await db.query("INSERT INTO public.finance_preferences(owner_id,data) VALUES ($1,$2::jsonb)", [OWNER, JSON.stringify(prefs)]);
  return db;
}
async function runBaseline(db: Awaited<ReturnType<typeof fullSchemaDb>>) {
  await db.exec("BEGIN TRANSACTION READ ONLY");
  try {
    const out: Record<string, unknown>[] = [];
    for (const s of statements) out.push(...(await db.query<Record<string, unknown>>(s)).rows);
    return out;
  } finally { await db.exec("ROLLBACK"); }
}

describe("historical-integrity baseline (read-only)", () => {
  it("contains no statement that could change data", () => {
    expect(statements.length).toBeGreaterThan(5);
    for (const s of statements) expect(s).toMatch(/^(WITH|SELECT)\b/i);
    expect(SQL).not.toMatch(/\b(insert|update|delete|alter|drop|create|truncate|grant|revoke|copy)\b\s/i);
  });

  it("runs on the full applied schema inside a read-only transaction and flags lists at a previous cap", async () => {
    const db = await seeded();
    const rows = await runBaseline(db);
    const ledger = rows.filter((r) => r["check"] === "ledger");
    expect(ledger.reduce((n, r) => n + Number(r["rows"]), 0)).toBe(5);
    expect(rows.some((r) => r["check"] === "accounts" && Number(r["rows"]) === 1)).toBe(true);
    const journals = rows.find((r) => r["check"] === "settings_list" && r["path"] === "{books,journals}")!;
    expect(journals).toMatchObject({ items: 5000, previous_cap: 5000, at_previous_cap: true });
    expect(rows.find((r) => r["path"] === "{books,leases}")).toMatchObject({ items: 3, at_previous_cap: false });
    expect(rows.find((r) => r["check"] === "upload_evidence")).toMatchObject({ posted_ids: 3000, at_previous_cap: true });
    expect(JSON.stringify(rows)).not.toContain(OWNER); // owner ids are hashed in the output
    await db.close();
  }, 120000);

  it("identical output before and after a no-op, different after any change", async () => {
    const db = await seeded();
    const a = JSON.stringify(await runBaseline(db));
    expect(JSON.stringify(await runBaseline(db))).toBe(a);
    await db.query("UPDATE public.expenses SET amount = amount + 1 WHERE title = 'e0'");
    expect(JSON.stringify(await runBaseline(db))).not.toBe(a);
    await db.close();
  }, 120000);

  it("the read-only transaction refuses writes", async () => {
    const db = await seeded();
    await db.exec("BEGIN TRANSACTION READ ONLY");
    await expect(db.query("UPDATE public.expenses SET amount = 0")).rejects.toThrow(/read-only/i);
    await db.exec("ROLLBACK");
    await db.close();
  }, 120000);
});
