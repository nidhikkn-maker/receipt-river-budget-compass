// @vitest-environment node
// In-memory PostgreSQL only; this test never contacts Cloud.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
const db = new PGlite();
const uid = "00000000-0000-0000-0000-000000000001", other = "00000000-0000-0000-0000-000000000002";
const bank = "00000000-0000-0000-0000-000000000010", card = "00000000-0000-0000-0000-000000000011", entry = "00000000-0000-0000-0000-000000000020";
const accounts = [{ id: bank, name: "Bank", kind: "savings", archived: false }, { id: card, name: "Card", kind: "credit_card", archived: false }];
const choice = { txnType: "card_payment", toAccountId: card };
let sequence = 100;
const id = () => `00000000-0000-0000-0000-${String(sequence++).padStart(12, "0")}`;
async function asUser(user: string) { await db.exec(`RESET ROLE; SELECT set_config('app.uid','${user}',false); SET ROLE authenticated;`); }
async function reset() { await db.exec(`RESET ROLE; DELETE FROM financial_corrections; DELETE FROM expenses; INSERT INTO expenses(id,employee_id,account_id,title,description,amount,original_amount,currency,expense_date,reconciled_at) VALUES('${entry}','${uid}','${bank}','Settlement','Untouched original',1000,10,'USD','2026-10-20','2026-10-31');`); await asUser(uid); }
const apply = (operation: string, revision = 0, selection = [{ id: entry, revision }], change: object = choice) => db.query("SELECT correct_financial_entries($1,$2::jsonb,$3::jsonb,$4::jsonb) AS id", [operation, JSON.stringify(selection), JSON.stringify(change), JSON.stringify(accounts)]);
beforeAll(async () => {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role; CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('app.uid',true),'')::uuid$$; GRANT USAGE ON SCHEMA auth TO authenticated;
  CREATE TABLE finance_preferences(owner_id uuid PRIMARY KEY); INSERT INTO finance_preferences VALUES('${uid}'),('${other}');
  CREATE TABLE accounts(id uuid PRIMARY KEY,owner_id uuid,name text,kind text,archived boolean DEFAULT false); INSERT INTO accounts VALUES('${bank}','${uid}','Bank','savings',false),('${card}','${uid}','Card','credit_card',false);
  CREATE TABLE loans(owner_id uuid,source_transaction_id uuid);
  CREATE TABLE expenses(id uuid PRIMARY KEY,employee_id uuid,title text,description text,amount numeric,original_amount numeric,currency text,expense_date date,account_id uuid,to_account_id uuid,txn_type text DEFAULT 'expense',principal numeric,interest numeric,reconciled_at timestamptz,reconciled_by uuid,payment_instrument_id text,reimbursement_status text DEFAULT 'none',reimbursement jsonb DEFAULT '{}',allocations jsonb DEFAULT '[]',workspace_allocations jsonb DEFAULT '[]',splits jsonb DEFAULT '[]',trip_id uuid,tags text[] DEFAULT '{}');
  GRANT SELECT ON expenses,accounts TO authenticated;`);
  await db.exec(readFileSync("drizzle/migrations/0041_financial_correction_confirmation_and_undo.sql", "utf8"));
}, 20000);
afterAll(() => db.close());
it("applies atomically, preserves original money/source and resets matching; retry creates no duplicate", async () => {
  await reset(); const operation = id(); await apply(operation); await apply(operation);
  expect((await db.query("SELECT txn_type,amount,original_amount,description,reconciled_at,correction_revision FROM expenses")).rows).toEqual([{ txn_type: "card_payment", amount: "1000", original_amount: "10", description: "Untouched original", reconciled_at: null, correction_revision: 1 }]);
  expect((await db.query("SELECT count(*)::int AS count FROM financial_corrections")).rows).toEqual([{ count: 1 }]);
});
it("undo restores original treatment and can safely replay", async () => {
  await reset(); const operation = id(); await apply(operation); await db.query("SELECT undo_financial_correction($1)", [operation]); await db.query("SELECT undo_financial_correction($1)", [operation]);
  expect((await db.query("SELECT txn_type,to_account_id,reconciled_at IS NOT NULL AS matched FROM expenses")).rows).toEqual([{ txn_type: "expense", to_account_id: null, matched: true }]);
});
it("later edits block restoration", async () => {
  await reset(); const operation = id(); await apply(operation); await db.exec("RESET ROLE; UPDATE expenses SET description='Later edit';"); await asUser(uid);
  await expect(db.query("SELECT undo_financial_correction($1)", [operation])).rejects.toThrow("Later edit");
  expect((await db.query("SELECT txn_type,description FROM expenses")).rows).toEqual([{ txn_type: "card_payment", description: "Later edit" }]);
});
it("one stale row rolls back every selected update", async () => {
  await reset(); await expect(apply(id(), 0, [{ id: entry, revision: 0 }, { id: id(), revision: 0 }])).rejects.toThrow("Transaction changed");
  expect((await db.query("SELECT txn_type,correction_revision FROM expenses")).rows).toEqual([{ txn_type: "expense", correction_revision: 0 }]);
});
it("another owner cannot change, read or undo the correction", async () => {
  await reset(); const operation = id(); await apply(operation); await asUser(other);
  expect((await db.query("SELECT * FROM financial_corrections")).rows).toHaveLength(0);
  await expect(apply(id())).rejects.toThrow(); await expect(db.query("SELECT undo_financial_correction($1)", [operation])).rejects.toThrow("unavailable");
});
it("blocks altered payload reuse and unsupported amount changes", async () => {
  await reset(); const operation = id(); await apply(operation);
  await expect(apply(operation, 0, undefined, { txnType: "income" })).rejects.toThrow("identifier");
  await expect(apply(id(), 1, undefined, { amount: 500 })).rejects.toThrow("Unsupported");
});
it("blocks possible receiving-side duplicates", async () => {
  await reset(); await db.exec(`RESET ROLE; INSERT INTO expenses(id,employee_id,account_id,txn_type,amount,original_amount,currency,expense_date) VALUES('${id()}','${uid}','${card}','refund',1000,10,'USD','2026-10-20');`); await asUser(uid);
  await expect(apply(id())).rejects.toThrow("receiving-side");
});
it("tracks every edit, rejecting a stale preview before any write", async () => {
  await reset(); await db.exec("RESET ROLE; UPDATE expenses SET description='Changed on another device';"); await asUser(uid);
  await expect(apply(id())).rejects.toThrow("Transaction changed");
  expect((await db.query("SELECT txn_type FROM expenses")).rows).toEqual([{ txn_type: "expense" }]);
});
it("rejects tracked claims and incompatible movement targets on the server", async () => {
  await reset(); await db.exec("RESET ROLE; UPDATE expenses SET reimbursement_status='pending';"); await asUser(uid);
  await expect(apply(id(), 1)).rejects.toThrow("Linked claims");
  await reset(); await expect(apply(id(), 0, undefined, { txnType: "card_payment", accountId: card, toAccountId: bank })).rejects.toThrow("does not match");
});
it("anonymous callers cannot execute corrections", async () => {
  await reset(); await db.exec("RESET ROLE; SELECT set_config('app.uid','',false); SET ROLE anon;");
  await expect(apply(id())).rejects.toThrow();
});