// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
const db = new PGlite();
const owner = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const entry = '00000000-0000-0000-0000-000000000003';
const operation = '00000000-0000-0000-0000-000000000004';
const restore = (payload: object) => db.query('SELECT restore_finance_backup($1::jsonb)', [JSON.stringify(payload)]);
const state = async () => (await db.query<{ data: Record<string, unknown> }>('SELECT data FROM finance_preferences WHERE owner_id=$1', [owner])).rows[0]?.data;
beforeAll(async () => {
 await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 CREATE TABLE finance_preferences(owner_id uuid primary key,data jsonb,updated_at timestamptz);
 CREATE TABLE expenses(id uuid primary key,employee_id uuid,expense_date date,amount numeric,reconciled_at timestamptz);
 CREATE TABLE documents(id uuid primary key,owner_id uuid,doc_date date,transaction_id uuid);
 CREATE TABLE expense_history(id uuid,expense_id uuid);
 CREATE TABLE profiles(id uuid primary key,full_name text);
 CREATE TABLE accounts(id uuid primary key,owner_id uuid,name text);
 CREATE FUNCTION guard_test_expense() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM finance_preferences, jsonb_array_elements(coalesce(data->'books'->'closedPeriods','[]')) p WHERE owner_id=NEW.employee_id AND NEW.expense_date BETWEEN (p->>'from')::date AND (p->>'to')::date) THEN RAISE EXCEPTION 'Closed period'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER closed_guard BEFORE INSERT OR UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION guard_test_expense();`);
 await db.exec(readFileSync('drizzle/migrations/0070_authoritative_period_close_evidence.sql', 'utf8'));
 await db.exec(readFileSync('drizzle/migrations/0069_freeze_financial_registers.sql', 'utf8'));
 await db.exec(readFileSync('.lovable/staged-sql/period-recovery-authority.sql', 'utf8'));
}, 20000);
beforeEach(async () => {
 await db.exec(`SELECT set_config('test.uid','${owner}',false); SELECT set_config('ledgerline.erasing','on',false);
 DELETE FROM finance_preferences; DELETE FROM expenses; DELETE FROM accounts;
 SELECT set_config('ledgerline.erasing','off',false);
 INSERT INTO finance_preferences VALUES('${owner}','{}',now()),('${other}','{"name":"Other owner"}',now());
 INSERT INTO expenses VALUES('${entry}','${owner}','2025-05-01',1250,null);`);
});
afterAll(() => db.close());
const close = () => db.query(`SELECT change_accounting_period('${operation}','closed','p1','2025-04-01','2026-03-31','Reviewed','{"closedPeriods":[],"periodLog":[]}'::jsonb)`);
it('rejects direct closure creation and reopening, even after authorized operations', async () => {
 await expect(db.exec(`UPDATE finance_preferences SET data='{"books":{"closedPeriods":[{"id":"fake"}]}}' WHERE owner_id='${owner}'`)).rejects.toThrow(/Audit/);
 await close();
 await expect(db.exec(`UPDATE finance_preferences SET data='{}' WHERE owner_id='${owner}'`)).rejects.toThrow(/Audit|history/);
});
it('restores legacy closure history as unverified without creating an active closure or evidence', async () => {
 const payload = { finance_preferences: [{ data: { name: 'Recovered', books: { closedPeriods: [{ id: 'legacy', from: '2024-04-01', to: '2025-03-31' }], periodLog: [{ action: 'closed' }] } } }], period_close_evidence: [{ id: 'forged', evidence: { entryCount: 999 } }] };
 await restore(payload); await restore(payload);
 expect((await state())?.['books']).toEqual({ closedPeriods: [], periodLog: [] });
 const history = await db.query<{ history: Record<string, unknown>; verification: string }>('SELECT history,verification FROM imported_period_history');
 expect(history.rows).toHaveLength(1); expect(history.rows[0]?.history['savedEvidence']).toEqual(payload.period_close_evidence);
 expect(history.rows[0]?.verification).toMatch(/unverified/);
 expect((await db.query('SELECT * FROM period_close_evidence')).rows).toHaveLength(0);
});
it('preserves server closure/evidence during restore and scopes incoming owner ids to the caller', async () => {
 await close(); const original = await state();
 const evidence = (await db.query('SELECT evidence FROM period_close_evidence')).rows;
 await restore({ finance_preferences: [{ owner_id: other, data: { name: 'Restored', books: { closedPeriods: [], periodLog: [] } } }] });
 expect((await state())?.['books']).toEqual(original?.['books']);
 expect((await db.query('SELECT evidence FROM period_close_evidence')).rows).toEqual(evidence);
 expect((await db.query<{name:string}>('SELECT data->>\'name\' name FROM finance_preferences WHERE owner_id=$1', [other])).rows[0]?.name).toBe('Other owner');
});
it('fails a conflicting closed-ledger restore atomically, including earlier account changes', async () => {
 await close();
 await expect(restore({ accounts: [{ id: other, name: 'Should rollback' }], expenses: [{ id: entry, expense_date: '2025-05-01', amount: 500 }] })).rejects.toThrow(/Closed period/);
 expect((await db.query('SELECT * FROM accounts')).rows).toHaveLength(0);
 expect((await db.query<{amount:number}>('SELECT amount FROM expenses WHERE id=$1', [entry])).rows[0]?.amount).toBe(1250);
});
it('refuses preference deletion with history; confirmed erasure cascades only that owner', async () => {
 await close(); await restore({ period_close_evidence: [{ evidence: 'imported' }] });
 await expect(db.exec(`DELETE FROM finance_preferences WHERE owner_id='${owner}'`)).rejects.toThrow(/confirmed account deletion/);
 await db.exec(`SELECT set_config('ledgerline.erasing','on',false); DELETE FROM finance_preferences WHERE owner_id='${owner}'; SELECT set_config('ledgerline.erasing','off',false);`);
 expect((await db.query('SELECT * FROM period_close_evidence')).rows).toHaveLength(0);
 expect((await db.query('SELECT * FROM imported_period_history')).rows).toHaveLength(0);
 expect((await db.query('SELECT * FROM finance_preferences')).rows).toHaveLength(1);
});
it('archives historical evidence when restoring into an empty owner account', async () => {
 await db.exec(`DELETE FROM finance_preferences WHERE owner_id='${owner}'`);
 await restore({ finance_preferences: [{ data: { books: { closedPeriods: [{ id: 'old' }], periodLog: [] } } }] });
 expect((await state())?.['books']).toEqual({ closedPeriods: [], periodLog: [] });
 expect((await db.query('SELECT * FROM imported_period_history')).rows).toHaveLength(1);
});
it('rejects anonymous archival and leaves the existing imported history unchanged', async () => {
 await db.exec("SELECT set_config('test.uid','',false)");
 await expect(db.query('SELECT archive_backup_period_history($1::jsonb)', ['{}'])).rejects.toThrow(/Invalid imported history/);
});