// @vitest-environment node
// Disposable PostgreSQL only: no Cloud connections or production writes.
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
const db = new PGlite();
const period = { id: 'p1', from: '2025-04-01', to: '2026-03-31', closedOn: '2026-05-01', note: '' };
const jClosed = { id: 'j1', assetId: 'a1', period: '2026-01', amount: 500, kind: 'book', status: 'prepared' };
const jOpen = { id: 'j2', assetId: 'a1', period: '2026-06', amount: 500, kind: 'book', status: 'prepared' };
const active = { id: 'r1', area: 'gst', key: 'due.GSTR-3B', title: 't', value: '20', sourceUrl: 'u', publishedOn: '2025-01-01', effectiveFrom: '2025-04-01', appliesTo: [], status: 'active', approvedOn: '2025-03-01', tests: [{ name: 'x', passed: true }] };
const proposed = { ...active, id: 'r2', value: '22', effectiveFrom: '2026-04-01', status: 'proposed', approvedOn: undefined };
const base = (): any => ({ assets: [{ id: 'a1' }], books: { closedPeriods: [period], journals: [jClosed, jOpen], assetEvents: [{ id: 'e1', assetId: 'a1', date: '2025-06-01', kind: 'impairment', note: '', value: 10 }], rules: [active, proposed] } });
const write = (d: object) => db.query('UPDATE finance_preferences SET data=$1::jsonb', [JSON.stringify(d)]);
beforeAll(async () => {
  await db.exec("CREATE TABLE finance_preferences(data jsonb); INSERT INTO finance_preferences VALUES ('{}');");
  const f = readdirSync('drizzle/migrations').find((n) => n.startsWith('0083_'))!;
  await db.exec(readFileSync(`drizzle/migrations/${f}`, 'utf8'));
}, 20000);
beforeEach(async () => { await db.exec("SELECT set_config('ledgerline.erasing','on',false)"); await write(base()); await db.exec("SELECT set_config('ledgerline.erasing','off',false)"); });
afterAll(() => db.close());
describe('server journal and rule safeguards', () => {
  it('refuses posting a journal in a closed month', async () => { const b = base(); b.books.journals[0] = { ...jClosed, status: 'posted', postedOn: '2026-07-01' }; await expect(write(b)).rejects.toThrow(/closed period/); });
  it('posts an open-month journal exactly as prepared', async () => { const b = base(); b.books.journals[1] = { ...jOpen, status: 'posted', postedOn: '2026-07-01' }; await write(b); });
  it('refuses changing the amount while posting', async () => { const b = base(); b.books.journals[1] = { ...jOpen, amount: 900, status: 'posted', postedOn: '2026-07-01' }; await expect(write(b)).rejects.toThrow(/exactly as prepared/); });
  it('refuses editing or removing a posted journal', async () => { const b = base(); b.books.journals[1] = { ...jOpen, status: 'posted', postedOn: '2026-07-01' }; await write(b); const c = base(); c.books.journals = [jClosed]; await expect(write(c)).rejects.toThrow(/Posted journal/); });
  it('refuses removing a financial asset event in a closed year but allows physical checks', async () => {
    const b = base(); b.books.assetEvents = []; await expect(write(b)).rejects.toThrow(/closed period/);
    const c = base(); c.books.assetEvents.push({ id: 'e2', assetId: 'a1', date: '2025-07-01', kind: 'verified', note: '' }); await write(c);
  });
  it('refuses activating a rule without approval or with failing checks', async () => {
    const b = base(); b.books.rules[1] = { ...proposed, status: 'active' }; await expect(write(b)).rejects.toThrow(/approval date/);
    const c = base(); c.books.rules[1] = { ...proposed, status: 'active', approvedOn: '2026-03-01', tests: [{ name: 'x', passed: false }] }; await expect(write(c)).rejects.toThrow(/failing checks/);
  });
  it('activates an approved proposal and supersedes the old version', async () => { const b = base(); b.books.rules = [{ ...active, status: 'superseded', effectiveTo: '2026-03-31' }, { ...proposed, status: 'active', approvedOn: '2026-03-01' }]; await write(b); });
  it('refuses editing or deleting an approved rule', async () => {
    const b = base(); b.books.rules[0] = { ...active, value: '25' }; await expect(write(b)).rejects.toThrow(/cannot be edited/);
    const c = base(); c.books.rules = [proposed]; await expect(write(c)).rejects.toThrow(/cannot be removed/);
    const d = base(); d.books.rules[0] = { ...active, status: 'proposed' }; await expect(write(d)).rejects.toThrow(/cannot change/);
  });
});
