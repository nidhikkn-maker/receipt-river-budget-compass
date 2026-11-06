// @vitest-environment node
// Disposable PostgreSQL only: no Cloud connections or production writes.
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const db = new PGlite();
const period = { id: 'p1', from: '2025-04-01', to: '2026-03-31', closedOn: '2026-05-01', note: '' };
const lease = { id: 'l1', start: '2025-01-01', end: '2027-01-01', rent: 10000 };
const profile = { id: 't1', entityId: 'c1', fy: '2025-26', ownershipPct: 60 };
const asset = { id: 'a1', inUse: '2025-05-01', cost: 100000, condition: 'ok' };
const base = () => ({ assets: [asset], books: { closedPeriods: [period], periodLog: [], leases: [lease], entityTaxProfiles: [profile] } });
const write = (data: object) => db.query('UPDATE finance_preferences SET data=$1::jsonb',[JSON.stringify(data)]);
beforeAll(async () => {
  await db.exec('CREATE TABLE finance_preferences(data jsonb); INSERT INTO finance_preferences VALUES (\'{}\');');
  await db.exec(readFileSync('drizzle/migrations/0069_freeze_financial_registers.sql','utf8'));
},20000);
beforeEach(async () => { await db.exec("SELECT set_config('ledgerline.erasing','on',false)"); await write(base()); await db.exec("SELECT set_config('ledgerline.erasing','off',false)"); });
afterAll(() => db.close());
describe('closed register data', () => {
  it('refuses changing rent across a closed year',async () => { const b=base(); b.books.leases=[{...lease,rent:12000}]; await expect(write(b)).rejects.toThrow(/closed period/); });
  it('refuses deletion of a lease crossing the closed year',async () => { const b=base(); b.books.leases=[]; await expect(write(b)).rejects.toThrow(/closed period/); });
  it('refuses moving a closed lease into the future',async () => { const b=base(); b.books.leases=[{...lease,start:'2027-01-01',end:'2028-01-01'}]; await expect(write(b)).rejects.toThrow(/closed period/); });
  it('refuses a new lease inserted into a closed period',async () => { const b=base(); b.books.leases.push({...lease,id:'l2'}); await expect(write(b)).rejects.toThrow(/closed period/); });
  it('allows editing a wholly future lease',async () => { const b=base(); b.books.leases.push({...lease,id:'l2',start:'2027-01-01',end:'2028-01-01'}); await write(b); b.books.leases[1]={...lease,id:'l2',start:'2027-01-01',end:'2028-01-01',rent:20000}; await write(b); const r=await db.query<{rent:number}>("SELECT (data->'books'->'leases'->1->>'rent')::int rent FROM finance_preferences"); expect(r.rows[0]?.rent).toBe(20000); });
  it('refuses changing ownership for a closed tax year',async () => { const b=base(); b.books.entityTaxProfiles=[{...profile,ownershipPct:75}]; await expect(write(b)).rejects.toThrow(/closed period/); });
  it('refuses changing profile identity to evade a closed year',async () => { const b=base(); b.books.entityTaxProfiles=[{...profile,id:'replacement'}]; await expect(write(b)).rejects.toThrow(/closed period/); });
  it('refuses changing asset financial cost used in the frozen year',async () => { const b=base(); b.assets=[{...asset,cost:200000}]; await expect(write(b)).rejects.toThrow(/closed period/); });
  it('allows physical condition checks without altering financial facts',async () => { const b=base(); b.assets=[{...asset,condition:'damaged'}]; await write(b); const r=await db.query<{condition:string}>("SELECT data->'assets'->0->>'condition' condition FROM finance_preferences"); expect(r.rows[0]?.condition).toBe('damaged'); });
  it('refuses changing closed-period dates under the same ID',async () => { const b=base(); b.books.closedPeriods=[{...period,to:'2025-05-01'}]; await expect(write(b)).rejects.toThrow(/definition/); });
});