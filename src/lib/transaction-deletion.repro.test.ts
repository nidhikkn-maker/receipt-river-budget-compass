// @vitest-environment node
// P0-005a reproduction (evidence only; deletion behaviour is NOT changed here — Phase 3 track).
// Replays every applied migration (drizzle/migrations 0000-0088) into an isolated in-memory PGlite and
// runs the exact statement the app sends when a person deletes a ledger entry
// (src/lib/store.tsx:591 → supabase.from("expenses").delete().eq("id", e.id)) as the signed-in owner under RLS.
// Each assertion records the CURRENT behaviour so KK can see what is lost, what is orphaned and what survives.
// Never connects to Cloud.
import { describe, expect, it } from "vitest";
import { actAs, addUsers, fullSchemaDb } from "@/test/full-schema-pglite";
import { accountBalance, type Account } from "./ledger";

const A = "0000000a-0000-4000-8000-0000000000a1"; // owner
const F = "0000000f-0000-4000-8000-0000000000f1"; // team member with the Finance role
const BANK = "00000000-0000-4000-8000-00000000b001", WALLET = "00000000-0000-4000-8000-00000000b002";
const E1 = "00000000-0000-4000-8000-0000000000e1", E2 = "00000000-0000-4000-8000-0000000000e2";
const T1 = "00000000-0000-4000-8000-0000000000d1", C1 = "00000000-0000-4000-8000-0000000000c1";
const L1 = "00000000-0000-4000-8000-0000000000f0", DOC = "00000000-0000-4000-8000-0000000000d0";
const DRAFT = "00000000-0000-4000-8000-0000000000dd", LINK = "00000000-0000-4000-8000-00000000011c";
const CLOSED = "00000000-0000-4000-8000-0000000000c0";
const T = 240_000;
type Db = Awaited<ReturnType<typeof fullSchemaDb>>;
type Row = Record<string, unknown>;

const rows = async (db: Db, sql: string, p: unknown[] = []) => (await db.query<Row>(sql, p)).rows;
async function fails(db: Db, sql: string, p: unknown[] = []) { try { await db.query(sql, p); return ""; } catch (e) { return (e as Error).message; } }
/** The ledger engine's balance for one account from the rows the owner can see (same rule the app uses). */
async function balance(db: Db, id: string, kind: Account["kind"], opening: number) {
  const txns = (await rows(db, "SELECT id,amount,txn_type,account_id,to_account_id,transfer_counterpart_of FROM public.expenses WHERE employee_id=$1", [A]))
    .map((r) => ({ id: String(r["id"]), amount: Number(r["amount"]), txnType: r["txn_type"] as never, accountId: r["account_id"] as string | null, toAccountId: r["to_account_id"] as string | null, transferCounterpartOf: r["transfer_counterpart_of"] as string | null, date: "2026-10-01" }));
  return accountBalance({ id, name: id, kind, openingBalance: opening, archived: false } as Account, txns as never);
}

async function seed(db: Db) {
  await addUsers(db, { [A]: "owner@x.in", [F]: "finance@x.in" });
  await actAs(db, null);
  await db.query(`INSERT INTO public.finance_preferences(owner_id,data) VALUES ($1, jsonb_build_object('statementUploads', jsonb_build_array(jsonb_build_object('id','u1','posted',jsonb_build_array($2::text),'reconciled','[]'::jsonb))))`, [A, E1]);
  await db.query(`INSERT INTO public.accounts(id,owner_id,name,kind,opening_balance) VALUES ($1,$3,'HDFC savings','savings',10000),($2,$3,'Paytm wallet','wallet',0)`, [BANK, WALLET, A]);
  // E1: a fully documented expense (receipt, category split, tags, statement match).
  await db.query(`INSERT INTO public.expenses(id,employee_id,title,merchant,category,amount,original_amount,currency,fx_rate,expense_date,txn_type,account_id,payment_method,receipts,allocations,tags,statement_ref,reconciled_at,description)
    VALUES ($1,$2,'Big Bazaar groceries','Big Bazaar','Groceries',1200,1200,'INR',1,'2026-10-05','expense',$3,'upi',
    '[{"name":"bill.jpg","type":"image/jpeg","path":"${A}/r1-bill.jpg"}]'::jsonb,
    '[{"category":"Groceries","amount":900},{"category":"Household","amount":300}]'::jsonb,
    ARRAY['Trip: Goa'],'HDFC:2026-10-05:1200',now(),'Monthly shopping')`, [E1, A, BANK]);
  await db.query(`INSERT INTO public.documents(id,owner_id,title,file_path,file_name,transaction_id) VALUES ($1,$2,'Big Bazaar bill',$3,'bill.jpg',$4)`, [DOC, A, `${A}/r1-bill.jpg`, E1]);
  await db.query(`INSERT INTO public.expense_history(expense_id,actor_id,action,note) VALUES ($1,$2,'approved','Checked against bill')`, [E1, A]);
  await db.query(`INSERT INTO public.import_posts(owner_id,account_id,fingerprint,transaction_id,original_line) VALUES ($1,$2,'fp-e1',$3,'{"amount":1200}'::jsonb)`, [A, BANK, E1]);
  await db.query(`INSERT INTO public.expense_drafts(id,owner_id,status,transaction_id) VALUES ($1,$2,'saved',$3)`, [DRAFT, A, E1]);
  await db.query(`INSERT INTO public.category_batches(owner_id,category,entries) VALUES ($1,'Groceries',jsonb_build_array(jsonb_build_object('id',$2::text,'title','Big Bazaar groceries','from','Food','allocations','[]'::jsonb,'revision',0)))`, [A, E1]);
  // T1/C1: a confirmed transfer bank → wallet, with the wallet statement line kept as counterpart evidence.
  await db.query(`INSERT INTO public.expenses(id,employee_id,title,category,amount,original_amount,currency,fx_rate,expense_date,txn_type,account_id,to_account_id,payment_method)
    VALUES ($1,$2,'To wallet','Transfer',2000,2000,'INR',1,'2026-10-06','transfer',$3,$4,'upi')`, [T1, A, BANK, WALLET]);
  await db.query(`INSERT INTO public.expenses(id,employee_id,title,category,amount,original_amount,currency,fx_rate,expense_date,txn_type,account_id,payment_method,transfer_counterpart_of)
    VALUES ($1,$2,'Wallet top-up','Transfer',2000,2000,'INR',1,'2026-10-06','income',$3,'upi',$4)`, [C1, A, WALLET, T1]);
  await db.query(`INSERT INTO public.transfer_links(id,owner_id,debit_id,credit_id,source_account,dest_account,source_amount,source_currency,status) VALUES ($1,$2,$3,$4,$5,$6,2000,'INR','linked')`, [LINK, A, T1, C1, BANK, WALLET]);
  // E2 funded loan L1 (loan created from a ledger entry).
  await db.query(`INSERT INTO public.expenses(id,employee_id,title,category,amount,original_amount,currency,fx_rate,expense_date,txn_type,account_id,payment_method)
    VALUES ($1,$2,'Loan disbursal','Loan',50000,50000,'INR',1,'2026-10-07','income',$3,'bank_transfer')`, [E2, A, BANK]);
  await db.query(`INSERT INTO public.loans(id,owner_id,name,principal_outstanding,annual_rate,emi,next_due,source_transaction_id) VALUES ($1,$2,'Personal loan',50000,12,2000,'2026-11-07',$3)`, [L1, A, E2]);
  // CLOSED: an entry inside a closed period.
  await db.query(`INSERT INTO public.expenses(id,employee_id,title,category,amount,original_amount,currency,fx_rate,expense_date,txn_type,account_id,payment_method)
    VALUES ($1,$2,'April rent','Rent',15000,15000,'INR',1,'2026-04-10','expense',$3,'bank_transfer')`, [CLOSED, A, BANK]);
}
/** The exact delete the app sends (store.tsx:591), as the signed-in owner under RLS. */
const appDelete = async (db: Db, id: string, who = A) => { await actAs(db, who); const r = await db.query("DELETE FROM public.expenses WHERE id=$1", [id]); await actAs(db, null); return r.affectedRows ?? 0; };

describe("P0-005a REPRO: deleting a ledger entry is a hard delete (current behaviour, applied schema 0000-0088)", () => {
  it("removes the row permanently; the audit row keeps only amount/date/type/title; links are orphaned; balances change with no reversal", async () => {
    const db = await fullSchemaDb();
    try {
      await seed(db);
      const before = (await rows(db, "SELECT * FROM public.expenses WHERE id=$1", [E1]))[0]!;
      const bankBefore = await balance(db, BANK, "savings", 10000);

      expect(await appDelete(db, E1)).toBe(1);

      // 1. The ledger row is gone: no soft-delete flag, no reversal entry, no tombstone.
      expect(await rows(db, "SELECT 1 FROM public.expenses WHERE id=$1", [E1])).toHaveLength(0);
      expect(await rows(db, "SELECT 1 FROM public.expenses WHERE employee_id=$1 AND (title ILIKE '%revers%' OR description ILIKE $2)", [A, `%${E1}%`])).toHaveLength(0);

      // 2. The only trace is one transaction_audit row with 3 fields + title. Account, category, split,
      //    merchant, receipts, tags, statement match and FX details are NOT retained anywhere in the database.
      const audit = await rows(db, "SELECT action, changes, summary FROM public.transaction_audit WHERE transaction_id=$1 ORDER BY created_at", [E1]);
      expect(audit.map((a) => a["action"])).toEqual(["created", "deleted"]);
      const deleted = audit[1]!;
      expect(Object.keys(deleted["changes"] as Row).sort()).toEqual(["amount", "expense_date", "txn_type"]);
      expect(deleted["summary"]).toBe("Big Bazaar groceries");
      const kept = JSON.stringify(await rows(db, "SELECT * FROM public.transaction_audit WHERE transaction_id=$1", [E1]));
      for (const lost of ["Big Bazaar\"", BANK, "Household", "r1-bill.jpg", "HDFC:2026-10-05:1200", "Trip: Goa"]) expect(kept).not.toContain(lost);
      expect(before["account_id"]).toBe(BANK); // proves those values existed before the delete

      // 3. The owner cannot change or remove that audit row (SELECT-only policy) — but it is also not enough to restore the entry.
      await actAs(db, A);
      await db.query("UPDATE public.transaction_audit SET summary='x' WHERE transaction_id=$1", [E1]).catch(() => undefined);
      await db.query("DELETE FROM public.transaction_audit WHERE transaction_id=$1", [E1]).catch(() => undefined);
      await actAs(db, null);
      expect(await rows(db, "SELECT 1 FROM public.transaction_audit WHERE transaction_id=$1 AND summary='Big Bazaar groceries'", [E1])).toHaveLength(2);

      // 4. Cascades and orphans.
      expect(await rows(db, "SELECT 1 FROM public.expense_history WHERE expense_id=$1", [E1])).toHaveLength(0);           // approval notes: CASCADE-deleted
      expect((await rows(db, "SELECT transaction_id FROM public.documents WHERE id=$1", [DOC]))[0]?.["transaction_id"]).toBeNull(); // bill kept, silently unlinked
      expect(await rows(db, "SELECT 1 FROM public.import_posts WHERE transaction_id=$1", [E1])).toHaveLength(1);            // statement line still marked "posted" → never re-imported
      expect((await rows(db, "SELECT status, transaction_id FROM public.expense_drafts WHERE id=$1", [DRAFT]))[0]).toEqual({ status: "saved", transaction_id: E1 }); // draft points at nothing
      expect(JSON.stringify(await rows(db, "SELECT entries FROM public.category_batches WHERE owner_id=$1", [A]))).toContain(E1); // undo history references a missing row
      expect(JSON.stringify(await rows(db, "SELECT data FROM public.finance_preferences WHERE owner_id=$1", [A]))).toContain(E1); // statement upload history still lists it as posted

      // 5. Balance changes silently: +1,200 back on the bank account with no reversal and no explanation.
      const bankAfter = await balance(db, BANK, "savings", 10000);
      expect(bankAfter - bankBefore).toBe(1200);
    } finally { await db.close(); }
  }, T);

  it("deleting one side of a confirmed transfer leaves the other side excluded from balances (money vanishes from the wallet)", async () => {
    const db = await fullSchemaDb();
    try {
      await seed(db);
      expect(await balance(db, WALLET, "wallet", 0)).toBe(2000);
      expect(await appDelete(db, T1)).toBe(1);
      expect((await rows(db, "SELECT transfer_counterpart_of FROM public.expenses WHERE id=$1", [C1]))[0]?.["transfer_counterpart_of"]).toBe(T1); // still flagged as counterpart
      expect((await rows(db, "SELECT status, debit_id FROM public.transfer_links WHERE id=$1", [LINK]))[0]).toEqual({ status: "linked", debit_id: T1 }); // link survives, points at nothing
      expect(await balance(db, WALLET, "wallet", 0)).toBe(0); // the wallet statement credit no longer counts anywhere
    } finally { await db.close(); }
  }, T);

  it("deleting a loan's funding entry keeps the loan but drops the link; closed periods are protected; the last delete wipes category undo history", async () => {
    const db = await fullSchemaDb();
    try {
      await seed(db);
      expect(await appDelete(db, E2)).toBe(1);
      expect((await rows(db, "SELECT principal_outstanding, source_transaction_id FROM public.loans WHERE id=$1", [L1]))[0]).toEqual({ principal_outstanding: "50000", source_transaction_id: null });

      // Closed period guard (0058 guard_closed_period) blocks deletes inside a closed period.
      await db.query(`UPDATE public.finance_preferences SET data = data || '{"books":{"closedPeriods":[{"from":"2026-04-01","to":"2026-04-30"}]}}'::jsonb WHERE owner_id=$1`, [A]).catch(async () => {
        await db.exec("ALTER TABLE public.finance_preferences DISABLE TRIGGER USER");
        await db.query(`UPDATE public.finance_preferences SET data = data || '{"books":{"closedPeriods":[{"from":"2026-04-01","to":"2026-04-30"}]}}'::jsonb WHERE owner_id=$1`, [A]);
        await db.exec("ALTER TABLE public.finance_preferences ENABLE TRIGGER USER");
      });
      await actAs(db, A);
      expect(await fails(db, "DELETE FROM public.expenses WHERE id=$1", [CLOSED])).toMatch(/closed period/);
      await actAs(db, null);

      // clear_category_history_on_delete (0016): when the owner's last entry is deleted, ALL category undo history is erased.
      await db.query(`UPDATE public.finance_preferences SET data = data - 'books' WHERE owner_id=$1`, [A]).catch(async () => {
        await db.exec("ALTER TABLE public.finance_preferences DISABLE TRIGGER USER");
        await db.query(`UPDATE public.finance_preferences SET data = data - 'books' WHERE owner_id=$1`, [A]);
        await db.exec("ALTER TABLE public.finance_preferences ENABLE TRIGGER USER");
      });
      expect(await rows(db, "SELECT 1 FROM public.category_batches WHERE owner_id=$1", [A])).toHaveLength(1);
      for (const r of await rows(db, "SELECT id FROM public.expenses WHERE employee_id=$1", [A])) await appDelete(db, String(r["id"]));
      expect(await rows(db, "SELECT 1 FROM public.category_batches WHERE owner_id=$1", [A])).toHaveLength(0);
    } finally { await db.close(); }
  }, T);

  it("a team member with the Finance role can hard-delete another person's entry once an admin allows delete_expenses (default off)", async () => {
    const db = await fullSchemaDb();
    try {
      await seed(db);
      await db.query("INSERT INTO public.user_roles(user_id,role) VALUES ($1,'finance')", [F]);
      expect(await appDelete(db, E1, F)).toBe(0); // default role_permissions: delete_expenses=false
      await db.query("UPDATE public.role_permissions SET allowed=true WHERE role='finance' AND action='delete_expenses'");
      expect(await appDelete(db, E1, F)).toBe(1); // no step-up, no reason, no reversal
      const audit = await rows(db, "SELECT owner_id, action FROM public.transaction_audit WHERE transaction_id=$1 AND action='deleted'", [E1]);
      expect(audit).toEqual([{ owner_id: A, action: "deleted" }]); // the audit row does not record who deleted it
      expect(Object.keys((await rows(db, "SELECT * FROM public.transaction_audit LIMIT 1"))[0]!)).not.toContain("actor_id");
    } finally { await db.close(); }
  }, T);
});
