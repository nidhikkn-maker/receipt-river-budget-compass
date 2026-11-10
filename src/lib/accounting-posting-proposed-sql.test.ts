// @vitest-environment node
// Isolated acceptance for the PROPOSED P3 posting layer (.lovable/staged-sql/proposed/P3_accounting_posting_layer.sql).
// Runs only against in-memory PGlite with every applied migration (0000-0088); never touches Cloud.
import { describe, it, expect } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { fullSchemaDb, actAs, addUsers, readSql } from '../test/full-schema-pglite';
import { corporateFixture } from './books/corporate-fixture';
import { corporateStatements } from './books/corporate-statements';
import { postAccountingWithRecovery, type AccountingReceipt } from './books/accounting-post';
import { reverseAccountingJournal, type AccountingJournal } from './books/accounting-journal';
import { settlementProposal } from './books/accounting-settlement';
import type { Expense } from './expenses';
import type { Account } from './ledger';

const P3 = '.lovable/staged-sql/proposed/P3_accounting_posting_layer.sql';
const P3_ROLLBACK = '.lovable/staged-sql/proposed/P3_accounting_posting_layer.rollback.sql';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OWNER = uid(9001), OTHER = uid(9002), ACCOUNTANT = uid(9003), MEMBER = uid(9004);
const DOC = uid(9100), OTHER_DOC = uid(9101);
type Row = Record<string, unknown>;

// Fixture ledger: corporateFixture plus every branch of the corporate-statements.ts counterpart rules.
const fx = corporateFixture();
const idMap = new Map<string, string>();
let next = 100;
const id = (k: string) => { if (!idMap.has(k)) idMap.set(k, uid(next++)); return idMap.get(k)!; };
const accountsFixture: Account[] = [...fx.accounts, { id: 'personal', name: 'Personal savings', kind: 'savings' as const, openingBalance: 0, archived: false }].map(a => ({ ...a, id: id(a.id) }));
const extraEntries: Partial<Expense>[] = [
  { id: 'refund', txnType: 'refund', amount: 50, originalAmount: 50, category: 'Office' },
  { id: 'split', amount: 100, originalAmount: 100, category: 'Office', allocations: [{ category: 'Office', amount: 33.34 }, { category: 'Travel', amount: 33.33 }, { category: 'Meals', amount: 33.33 }] as never },
  { id: 'manual', accountId: 'personal', amount: 300, originalAmount: 300, entityId: 'A', entitySource: 'manual' },
  { id: 'xfer-ab', txnType: 'transfer', toAccountId: 'beta', amount: 400, originalAmount: 400 },
  { id: 'deprec', txnType: 'adjustment', accountId: 'asset', adjustmentSign: -1, amount: 150, originalAmount: 150 },
  { id: 'reimb', txnType: 'reimbursement', amount: 75, originalAmount: 75 },
  { id: 'repay-legacy', txnType: 'loan_repayment', toAccountId: 'loan', amount: 200, originalAmount: 200 },
  { id: 'personal-only', accountId: 'personal', amount: 60, originalAmount: 60, scope: 'personal' },
  { id: 'usd-bill', amount: 830, originalAmount: 10, currency: 'USD', fxRate: 83 },
];
const fixtureEntries = (): Row[] => [...fx.entries, ...extraEntries.map(o => ({ ...fx.entries[1], receipts: [{ path: 'owner/x.pdf', name: 'x.pdf', type: 'application/pdf' }], ...o }))].map(e => {
  const x = e as Expense;
  return {
    id: id(x.id), employee_id: OWNER, title: x.title ?? x.id, merchant: x.merchant, category: x.category, scope: x.scope ?? 'business', amount: x.amount, original_amount: x.originalAmount,
    currency: x.currency, fx_rate: x.fxRate ?? 1, expense_date: x.date, description: '', payment_method: 'bank_transfer', reconciled_at: x.reconciledAt, statement_ref: x.statementRef,
    txn_type: x.txnType ?? 'expense', account_id: x.accountId ? id(x.accountId) : null, to_account_id: x.toAccountId ? id(x.toAccountId) : null,
    principal: x.principal ?? null, interest: x.interest ?? null, allocations: x.allocations ?? [], entity_id: x.entityId ?? null, entity_source: x.entitySource ?? 'account',
    adjustment_sign: x.adjustmentSign ?? 1, receipts: (x.receipts ?? []).map(r => ({ ...r, path: `${OWNER}/${x.id}.pdf` })),
  };
});
const ownerPrefs = () => ({
  entities: fx.entities.map(e => ({ ...e })),
  books: { ...fx.books, entityAccounts: { A: ['bank', 'card', 'loan', 'asset'].map(id), B: ['beta'].map(id) }, journals: [{ id: 'dep-1', status: 'posted', transactionId: id('deprec'), assetId: 'm1', period: '2026-04', amount: 150 }] },
});

async function insertRow(db: PGlite, table: string, row: Row) {
  const keys = Object.keys(row);
  await db.query(`INSERT INTO public.${table}(${keys.join(',')}) SELECT ${keys.join(',')} FROM jsonb_populate_record(NULL::public.${table}, $1::jsonb)`, [JSON.stringify(row)]);
}

/** Seed the owner/other/accountant/member ledger at 0088 (before P3 is installed). */
async function seed(db: PGlite) {
  await addUsers(db, { [OWNER]: 'owner@example.test', [OTHER]: 'other@example.test', [ACCOUNTANT]: 'accountant@example.test', [MEMBER]: 'member@example.test' });
  await actAs(db, OWNER);
  await insertRow(db, 'finance_preferences', { owner_id: OWNER, data: ownerPrefs() });
  for (const a of accountsFixture) await insertRow(db, 'accounts', { id: a.id, owner_id: OWNER, name: a.name, kind: a.kind, opening_balance: a.openingBalance, archived: a.archived });
  await insertRow(db, 'documents', { id: DOC, owner_id: OWNER, entity_id: 'A', title: 'Audited', file_name: 'audited.pdf', file_path: `${OWNER}/audited.pdf` });
  for (const e of fixtureEntries()) await insertRow(db, 'expenses', e);
  await actAs(db, OTHER);
  await insertRow(db, 'finance_preferences', { owner_id: OTHER, data: { entities: [{ id: 'X1', name: 'Other Co', kind: 'company', pan: '', gstins: [], booksFrom: '2026-27' }], books: { entityAccounts: { X1: [uid(9200)] } } } });
  await insertRow(db, 'accounts', { id: uid(9200), owner_id: OTHER, name: 'Other bank', kind: 'current', opening_balance: 0, archived: false });
  await insertRow(db, 'documents', { id: OTHER_DOC, owner_id: OTHER, entity_id: 'X1', title: 'Other', file_name: 'o.pdf', file_path: `${OTHER}/o.pdf` });
  await insertRow(db, 'expenses', { id: uid(9201), employee_id: OTHER, title: 'Other sale', category: 'Sales', amount: 900, original_amount: 900, currency: 'INR', expense_date: '2026-04-11', txn_type: 'income', account_id: uid(9200), receipts: [] });
  await actAs(db, null);
}

async function installed() {
  const db = await fullSchemaDb();
  await seed(db);
  await db.exec(readSql(P3));
  return db;
}
const q = async <T = Row>(db: PGlite, sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const one = async <T = Row>(db: PGlite, sql: string, params: unknown[] = []) => (await q<T>(db, sql, params))[0] as T;
const preview = async (db: PGlite) => (await one<{ r: Row }>(db, "SELECT public.accounting_backfill('preview') r")).r as { fingerprint: string; proposals: Row[]; exceptions: Row[]; trialBalance: Row[]; totals: Record<string, { debit: number; credit: number }>; unchanged: number };
const commit = async (db: PGlite, run: string) => { const p = await preview(db); return (await one<{ r: Row }>(db, "SELECT public.accounting_backfill('commit',$1,$2) r", [run, p.fingerprint])).r; };
const prefsRevision = async (db: PGlite) => Number((await q<{ revision: number }>(db, 'SELECT revision FROM finance_preferences WHERE owner_id=auth.uid()'))[0]?.revision ?? 0);
const journal = (over: Partial<AccountingJournal> = {}): AccountingJournal => ({ id: uid(5000), entityId: 'A', date: '2026-05-10', kind: 'accrual', description: 'May unpaid premises rent', documentIds: [DOC],
  legs: [{ code: 'expense:rent', label: 'Rent', role: 'expense', debit: 1200, credit: 0 }, { code: 'payable', label: 'Creditors', role: 'liability', debit: 0, credit: 1200 }], ...over });
const postJournal = async (db: PGlite, j: AccountingJournal, request: string) => db.query('SELECT public.post_accounting_journal(_request=>$1,_journal=>$2::jsonb,_expected=>$3)', [request, JSON.stringify(j), await prefsRevision(db)]);
const rawPosting = async (db: PGlite, rawKey: string, lines: { entity?: string; currency?: string; debit: number; credit: number }[], extra = '') => { const key = `raw:${rawKey}`; return db.exec(`BEGIN; SELECT accounting_private.grant_authority('posting_writer');
  INSERT INTO accounting_postings(id,owner_id,entity_id,posting_date,kind,idempotency_key,journal_id,request_id,journal${extra ? ',reverses_id' : ''}) VALUES (md5('${key}')::uuid,'${OWNER}','A','2026-06-01','journal','${key}',md5('j${key}')::uuid,md5('r${key}')::uuid,'{}'${extra ? `,'${extra}'` : ''});
  ${lines.map((l, i) => `INSERT INTO accounting_posting_lines(id,posting_id,owner_id,line_no,entity_id,currency,code,label,role,debit,credit) VALUES (md5('${key}:${i}')::uuid,md5('${key}')::uuid,'${OWNER}',${i + 1},'${l.entity ?? 'A'}','${l.currency ?? 'INR'}','c${i}','c${i}','${i === 0 ? 'asset' : 'liability'}',${l.debit},${l.credit});`).join('\n')}
  COMMIT;`).catch(async e => { await db.exec('ROLLBACK').catch(() => undefined); throw e; }); };

/** Same mapping as store.tsx toExpense, so TypeScript derivation sees exactly what the app would load. */
const toExpense = (x: Row): Expense => ({
  id: x['id'], title: x['title'], merchant: x['merchant'], category: x['category'], scope: x['scope'], memberId: x['member_id'], splits: x['splits'] ?? [],
  amount: Number(x['amount']), currency: x['currency'], originalAmount: Number(x['original_amount'] ?? x['amount']), fxRate: Number(x['fx_rate']), paymentMethod: x['payment_method'],
  reconciledAt: x['reconciled_at'], statementRef: x['statement_ref'], date: x['expense_date'] instanceof Date ? (x['expense_date'] as Date).toISOString().slice(0, 10) : String(x['expense_date']).slice(0, 10),
  description: x['description'], receipts: x['receipts'] ?? [], txnType: x['txn_type'], accountId: x['account_id'], toAccountId: x['to_account_id'], entityId: x['entity_id'] ?? null,
  entitySource: x['entity_source'] === 'manual' ? 'manual' : 'account', receiptDetails: x['receipt_details'], adjustmentSign: x['adjustment_sign'] === -1 ? -1 : 1, allocations: x['allocations'] ?? [],
  transferCounterpartOf: x['transfer_counterpart_of'] ?? null, principal: x['principal'] == null ? null : Number(x['principal']), interest: x['interest'] == null ? null : Number(x['interest']),
} as unknown as Expense);
async function tsWorkings(db: PGlite) {
  await actAs(db, null);
  const entries = (await q(db, 'SELECT * FROM expenses WHERE employee_id=$1', [OWNER])).map(toExpense);
  const accounts = (await q(db, 'SELECT * FROM accounts WHERE owner_id=$1', [OWNER])).map(a => ({ id: a['id'], name: a['name'], kind: a['kind'], openingBalance: Number(a['opening_balance']), archived: a['archived'] }) as Account);
  const prefs = (await one<{ data: ReturnType<typeof ownerPrefs> }>(db, 'SELECT data FROM finance_preferences WHERE owner_id=$1', [OWNER])).data;
  await actAs(db, OWNER);
  return ['A', 'B'].map(entityId => ({ entityId, w: corporateStatements({ entityId, entities: prefs.entities as never, books: prefs.books as never, accounts, documents: [], entries, from: fx.from, to: fx.to }) }));
}
const key = (l: Row) => `${l['entity']}|${l['group']}|${l['date']}|${l['code']}|${l['role']}|${Number(l['debit']).toFixed(2)}|${Number(l['credit']).toFixed(2)}`;

describe('P3 proposed accounting posting layer (isolated PGlite, applied 0000-0088 + P3)', () => {
  it('installs on 0088 and backfill preview equals the TypeScript corporate-statements derivation (lines, trial balance, exceptions)', async () => {
    const db = await installed();
    await actAs(db, OWNER);
    const p = await preview(db);
    const ts = await tsWorkings(db);
    const tsLines: Row[] = []; const tsExceptions: string[] = []; const tsOpenings: string[] = [];
    for (const { entityId, w } of ts) {
      const groups = new Map<string, typeof w.lines>();
      for (const l of w.lines) groups.set(l.groupId, [...(groups.get(l.groupId) ?? []), l]);
      for (const [g, ls] of groups) {
        if (g.startsWith('opening:')) { tsOpenings.push(`${entityId}|${g.slice(8)}`); continue; }
        if (ls.some(l => l.role === 'unclassified')) { tsExceptions.push(`${entityId}|${g}`); continue; }
        for (const l of ls) tsLines.push({ entity: entityId, group: g, date: l.date, code: l.code, role: l.role, debit: l.debit, credit: l.credit });
      }
      for (const i of w.issues) if (i.message.startsWith('Manually assigned movement')) tsExceptions.push(`${entityId}|${i.recordId}`);
    }
    const sqlLines = p.proposals.flatMap(x => (x['lines'] as Row[]).map(l => ({ entity: x['entityId'], group: x['entryId'], date: x['date'], code: l['code'], role: l['role'], debit: l['debit'], credit: l['credit'] })));
    expect(p.proposals.every(x => x['action'] === 'post')).toBe(true);
    expect(sqlLines.map(key).sort()).toEqual(tsLines.map(key).sort());
    expect(sqlLines.length).toBeGreaterThan(20);
    // Trial balance per company and code equals the TypeScript balances of the same postable lines.
    const tb = (ls: Row[]) => { const m = new Map<string, number>(); for (const l of ls) m.set(`${l['entity'] ?? l['entityId']}|${l['code']}`, Math.round(((m.get(`${l['entity'] ?? l['entityId']}|${l['code']}`) ?? 0) + Number(l['debit']) - Number(l['credit'])) * 100) / 100); return [...m].filter(([, v]) => v !== 0).sort(); };
    expect(tb(p.trialBalance)).toEqual(tb(tsLines));
    for (const ent of ['A', 'B']) expect(Number(p.totals[ent]!.debit)).toBe(Number(p.totals[ent]!.credit));
    const sqlExceptions = p.exceptions.filter(x => x['entryId']).map(x => `${x['entityId']}|${x['entryId']}`).sort();
    expect(sqlExceptions).toEqual([...new Set(tsExceptions)].sort());
    expect(sqlExceptions).toContain(`A|${id('reimb')}`);
    expect(p.exceptions.filter(x => x['accountId']).map(x => `${x['entityId']}|${x['accountId']}`).sort()).toEqual(tsOpenings.sort());
    // Personal-only entry and transfer counterparts never post; amounts stay INR with original currency retained.
    expect(p.proposals.some(x => x['entryId'] === id('personal-only'))).toBe(false);
    const usd = p.proposals.find(x => x['entryId'] === id('usd-bill'))!;
    expect((usd['lines'] as Row[]).map(l => Number(l['debit']) + Number(l['credit']))).toEqual([830, 830]);
  }, 60000);

  it('commit posts the reviewed preview exactly once; card settlement has no expense line, transfers create no income; replays are idempotent', async () => {
    const db = await installed(); await actAs(db, OWNER);
    const p = await preview(db);
    await expect(db.query("SELECT public.accounting_backfill('commit',$1,$2)", [uid(7001), 'stale-fingerprint'])).rejects.toThrow('changed since the reviewed preview');
    const r = await commit(db, uid(7001)) as Row;
    expect(r['committedEntries']).toBeGreaterThan(10);
    const lines = await q(db, "SELECT p.source_entry_id::text e, p.posting_date::text d, l.* FROM accounting_postings p JOIN accounting_posting_lines l ON l.posting_id=p.id WHERE p.kind='entry'");
    expect(lines.map(l => key({ entity: l['entity_id'], group: l['e'], date: l['d'], code: l['code'], role: l['role'], debit: l['debit'], credit: l['credit'] })).sort())
      .toEqual(p.proposals.flatMap(x => (x['lines'] as Row[]).map(l => key({ entity: x['entityId'], group: x['entryId'], date: x['date'], ...l }))).sort());
    const rolesOf = (k: string) => lines.filter(l => l['e'] === id(k)).map(l => `${l['role']}:${Number(l['debit']) ? 'D' : 'C'}`).sort();
    expect(rolesOf('card-payment')).toEqual(['asset:C', 'liability:D']); // settlement reduces bank and card liability, no expense
    expect(rolesOf('card-bill')).toEqual(['expense:D', 'liability:C']); // the expense is recognised once, at purchase
    expect(rolesOf('asset-buy')).toEqual(['asset:C', 'asset:D']);
    expect(lines.filter(l => l['e'] === id('xfer-ab')).map(l => `${l['entity_id']}:${String(l['code']).split(':').slice(0, 2).join(':')}:${l['role']}`).sort()).toEqual(['A:account:' + id('bank') + ':asset', 'A:due:from:asset', 'B:account:' + id('beta') + ':asset', 'B:due:to:liability'].sort());
    expect(lines.some(l => ['card-payment', 'xfer-ab', 'asset-buy', 'repay-legacy'].map(id).includes(String(l['e'])) && ['income', 'expense'].includes(String(l['role'])))).toBe(false);
    expect(rolesOf('repayment')).toEqual(['asset:C', 'expense:D', 'liability:D']); // interest only is an expense
    const count = async () => Number((await one<{ n: number }>(db, 'SELECT count(*)::int n FROM accounting_postings')).n);
    const before = await count();
    expect((await one<{ r: Row }>(db, "SELECT public.accounting_backfill('commit',$1,$2) r", [uid(7001), r['fingerprint']])).r['replayed']).toBe(true);
    const again = await preview(db);
    expect(again.proposals).toEqual([]);
    expect(again.unchanged).toBe(p.proposals.length);
    expect((await commit(db, uid(7002)))['committedEntries']).toBe(0);
    expect(await count()).toBe(before);
    // Database-level: one idempotency key per owner and one active posting per economic event and company.
    await actAs(db, null);
    const existing = await one<{ idempotency_key: string; source_entry_id: string }>(db, "SELECT idempotency_key, source_entry_id::text FROM accounting_postings WHERE kind='entry' AND entity_id='A' LIMIT 1");
    const dup = (k: string, version: number) => db.exec(`BEGIN; SELECT accounting_private.grant_authority('posting_writer');
      INSERT INTO accounting_postings(id,owner_id,entity_id,posting_date,kind,idempotency_key,source_entry_id,entry_version) VALUES (gen_random_uuid(),'${OWNER}','A','2026-04-10','entry','${k}','${existing.source_entry_id}',${version});
      INSERT INTO accounting_posting_lines(id,posting_id,owner_id,line_no,entity_id,code,label,role,debit,credit) SELECT gen_random_uuid(),id,owner_id,n,'A','x'||n,'x','asset',CASE n WHEN 1 THEN 1 ELSE 0 END,CASE n WHEN 2 THEN 1 ELSE 0 END FROM accounting_postings, generate_series(1,2) n WHERE idempotency_key='${k}';
      COMMIT;`).catch(async e => { await db.exec('ROLLBACK').catch(() => undefined); throw e; });
    await expect(dup(existing.idempotency_key, 9)).rejects.toThrow('accounting_postings_idempotency');
    await expect(dup('entry:duplicate-source', 9)).rejects.toThrow('already has an active posting');
  }, 60000);

  it('database refuses unbalanced, per-entity/per-currency unbalanced, badly signed or inexact lines, direct writes and any edit of posted lines', async () => {
    const db = await installed(); await actAs(db, null);
    await expect(rawPosting(db, 'u1', [{ debit: 100, credit: 0 }, { debit: 0, credit: 99.99 }])).rejects.toThrow('Unbalanced posting: debits must equal credits');
    await expect(rawPosting(db, 'u2', [{ entity: 'A', debit: 100, credit: 0 }, { entity: 'B', debit: 0, credit: 100 }])).rejects.toThrow('each legal entity and currency');
    await expect(rawPosting(db, 'u3', [{ currency: 'INR', debit: 100, credit: 0 }, { currency: 'USD', debit: 0, credit: 100 }])).rejects.toThrow('each legal entity and currency');
    await expect(rawPosting(db, 'u4', [{ debit: 100, credit: 0 }])).rejects.toThrow('at least two lines');
    await expect(rawPosting(db, 'u5', [{ debit: -100, credit: 0 }, { debit: 0, credit: -100 }])).rejects.toThrow('accounting_lines_one_side');
    await expect(rawPosting(db, 'u6', [{ debit: 100, credit: 100 }, { debit: 0, credit: 0 }])).rejects.toThrow('accounting_lines_one_side');
    await expect(rawPosting(db, 'u7', [{ debit: 100.001, credit: 0 }, { debit: 0, credit: 100.001 }])).rejects.toThrow('accounting_lines_exact');
    await expect(db.query(`INSERT INTO accounting_postings(id,owner_id,entity_id,posting_date,kind,idempotency_key,journal_id,request_id,journal) VALUES (gen_random_uuid(),$1,'A','2026-06-01','journal','direct',gen_random_uuid(),gen_random_uuid(),'{}')`, [OWNER])).rejects.toThrow('written only by the accounting posting functions');
    await rawPosting(db, 'ok', [{ debit: 100, credit: 0 }, { debit: 0, credit: 100 }]);
    await expect(db.exec("UPDATE accounting_posting_lines SET debit=200 WHERE debit=100")).rejects.toThrow('immutable');
    await expect(db.exec("DELETE FROM accounting_posting_lines")).rejects.toThrow('immutable');
    await expect(db.exec("UPDATE accounting_postings SET posting_date='2026-06-02'")).rejects.toThrow('immutable');
    await expect(db.exec("DELETE FROM accounting_postings")).rejects.toThrow('immutable');
    await expect(db.exec("TRUNCATE accounting_posting_lines CASCADE")).rejects.toThrow('immutable');
    const okId = (await one<{ id: string }>(db, "SELECT id FROM accounting_postings WHERE idempotency_key='raw:ok'")).id;
    await expect(rawPosting(db, 'rev-bad', [{ debit: 100, credit: 0 }, { debit: 0, credit: 100 }], okId)).rejects.toThrow('exactly mirror');
    await rawPosting(db, 'rev-ok', [{ debit: 0, credit: 100 }, { debit: 100, credit: 0 }], okId);
    await expect(rawPosting(db, 'rev-twice', [{ debit: 0, credit: 100 }, { debit: 100, credit: 0 }], okId)).rejects.toThrow('accounting_postings_one_reversal');
    await actAs(db, OWNER);
    await expect(db.exec("UPDATE accounting_posting_lines SET debit=1")).rejects.toThrow('permission denied');
    await expect(db.exec("DELETE FROM accounting_postings")).rejects.toThrow('permission denied');
    await expect(db.query(`INSERT INTO accounting_journal_evidence(id,owner_id,entity_id,request_id,journal,entry_ids) VALUES (gen_random_uuid(),$1,'A',gen_random_uuid(),'{}','{}')`, [OWNER])).rejects.toThrow('permission denied');
  }, 60000);

  it('store.tsx RPC shapes work on the single posting layer: journal post/replay/recovery, immutable anchors, reversal, accountant grant/review/revoke', async () => {
    const db = await installed(); await actAs(db, OWNER);
    // accountingAvailable(): select('id').limit(0)
    expect(await q(db, 'SELECT id FROM accounting_journal_evidence LIMIT 0')).toEqual([]);
    const bank = id('bank');
    const j = journal({ legs: [{ code: 'expense:rent', label: 'Rent', role: 'expense', debit: 1200, credit: 0 }, { code: `account:${bank}`, label: 'Alpha bank', role: 'asset', debit: 0, credit: 1200, accountId: bank, cashFlow: 'operating' }] });
    const attempt = { owner: OWNER, requestId: uid(5100), expected: await prefsRevision(db), journal: j };
    const io = {
      read: async () => (await q<AccountingReceipt>(db, 'SELECT owner_id,request_id,journal,entry_ids FROM accounting_journal_evidence WHERE id=$1 AND owner_id=$2', [j.id, OWNER]))[0] ?? null,
      post: async () => db.query('SELECT public.post_accounting_journal(_request=>$1,_journal=>$2::jsonb,_expected=>$3)', [attempt.requestId, JSON.stringify(attempt.journal), attempt.expected]),
    };
    const receipt = await postAccountingWithRecovery(attempt, io);
    expect(receipt.entry_ids).toHaveLength(1);
    expect(await postAccountingWithRecovery(attempt, io)).toEqual(receipt); // retry reads back, never posts twice
    const replay = await one<{ ids: string[] }>(db, 'SELECT public.post_accounting_journal(_request=>$1,_journal=>$2::jsonb,_expected=>$3) ids', [attempt.requestId, JSON.stringify(j), 0]);
    expect(replay.ids).toEqual(receipt.entry_ids);
    await expect(postJournal(db, { ...j, description: 'Changed rent description' }, attempt.requestId)).rejects.toThrow('identity already used');
    await expect(postJournal(db, journal({ id: uid(5002), legs: [{ code: 'expense:rent', label: 'Rent', role: 'expense', debit: 1200, credit: 0 }, { code: 'payable', label: 'Creditors', role: 'liability', debit: 0, credit: 1199.99 }] }), uid(5102))).rejects.toThrow('Unbalanced journal');
    const posting = await one<{ id: string; n: number }>(db, "SELECT p.id, count(l.*)::int n FROM accounting_postings p JOIN accounting_posting_lines l ON l.posting_id=p.id WHERE p.journal_id=$1 GROUP BY p.id", [j.id]);
    expect(posting.n).toBe(2);
    expect(Number((await one<{ n: number }>(db, 'SELECT count(*)::int n FROM accounting_postings WHERE journal_id=$1', [j.id])).n)).toBe(1);
    // The canonical anchor entry is immutable except for statement reconciliation metadata.
    const anchor = receipt.entry_ids[0]!;
    await expect(db.query('UPDATE expenses SET amount=1 WHERE id=$1', [anchor])).rejects.toThrow('immutable');
    await expect(db.query('DELETE FROM expenses WHERE id=$1', [anchor])).rejects.toThrow('immutable');
    await db.query("UPDATE expenses SET reconciled_at=now(), statement_ref='stmt:1' WHERE id=$1", [anchor]);
    await expect(db.query('INSERT INTO expenses(id,employee_id,title,category,amount,expense_date,receipt_details) VALUES($1,$2,$3,$4,1,$5,$6)', [uid(5199), OWNER, 'forged', 'Accounting', '2026-05-10', JSON.stringify({ accounting: { journal: j, primary: true, requestId: uid(5198) } })])).rejects.toThrow('atomic journal posting');
    // Correction is an exact reversal posting referencing the original; the original lines remain.
    const reversal = reverseAccountingJournal(j, uid(5003), '2026-05-11', 'Correct rent to 1000');
    await postJournal(db, reversal, uid(5103));
    const rev = await one<{ reverses_id: string }>(db, 'SELECT reverses_id FROM accounting_postings WHERE journal_id=$1', [reversal.id]);
    expect(rev.reverses_id).toBe(posting.id);
    await expect(postJournal(db, reverseAccountingJournal(j, uid(5004), '2026-05-12', 'Second reversal attempt'), uid(5104))).rejects.toThrow('already reversed');
    expect(Number((await one<{ n: number }>(db, 'SELECT count(*)::int n FROM accounting_posting_lines WHERE posting_id=$1', [posting.id])).n)).toBe(2);
    // Accountant review (set_accounting_review_grant / accountantData / review_accounting_exception)
    await db.exec("SELECT set_config('test.anon','true',false)");
    await expect(db.query('SELECT public.set_accounting_review_grant(_entity=>$1,_identity=>$2,_revoke=>$3)', ['A', 'accountant@example.test', false])).rejects.toThrow('real account');
    await db.exec("SELECT set_config('test.anon','false',false)");
    await expect(db.query('SELECT public.set_accounting_review_grant(_entity=>$1,_identity=>$2,_revoke=>$3)', ['A', 'nobody@example.test', false])).rejects.toThrow('verified');
    await db.query('SELECT public.set_accounting_review_grant(_entity=>$1,_identity=>$2,_revoke=>$3)', ['A', 'ACCOUNTANT@example.test', false]);
    await actAs(db, ACCOUNTANT);
    const [g, e] = [await q(db, 'SELECT * FROM accounting_review_grants'), await q(db, 'SELECT id,owner_id,entity_id,journal FROM accounting_journal_evidence')];
    expect(g).toHaveLength(1); expect(e.map(x => x['id']).sort()).toEqual([j.id, reversal.id].sort());
    expect(await q(db, 'SELECT * FROM expenses')).toHaveLength(0);
    await db.query('SELECT public.review_accounting_exception(_id=>$1,_owner=>$2,_journal=>$3,_finding=>$4,_note=>$5)', [uid(5200), OWNER, j.id, 'rent', 'Reviewed the original lease invoice']);
    await db.query('SELECT public.review_accounting_exception(_id=>$1,_owner=>$2,_journal=>$3,_finding=>$4,_note=>$5)', [uid(5200), OWNER, j.id, 'rent', 'Reviewed the original lease invoice']);
    const note = await one(db, 'SELECT * FROM accounting_exception_reviews WHERE id=$1', [uid(5200)]);
    expect(note).toMatchObject({ id: uid(5200), owner_id: OWNER, journal_id: j.id, finding: 'rent', note: 'Reviewed the original lease invoice', actor_id: ACCOUNTANT });
    await expect(postJournal(db, journal({ id: uid(5005) }), uid(5105))).rejects.toThrow('Owner preferences');
    await actAs(db, OWNER);
    await db.query('SELECT public.set_accounting_review_grant(_entity=>$1,_identity=>$2,_revoke=>$3)', ['A', ACCOUNTANT, true]);
    await actAs(db, ACCOUNTANT);
    expect(await q(db, 'SELECT * FROM accounting_journal_evidence')).toHaveLength(0);
    expect(await q(db, 'SELECT * FROM accounting_posting_lines')).toHaveLength(0);
    await expect(db.query('SELECT public.review_accounting_exception($1,$2,$3,$4,$5)', [uid(5201), OWNER, j.id, 'rent', 'No longer authorised'])).rejects.toThrow('not authorised');
  }, 60000);

  it('partial settlement leaves the accrual due; one bank payment cannot settle twice or exceed the balance; the settled source is retained', async () => {
    const db = await installed(); await actAs(db, OWNER);
    const accrual = journal({ id: uid(5600), date: '2026-05-01', description: 'May unpaid premises rent' });
    await postJournal(db, accrual, uid(5601));
    const pay = async (n: number, amount: number) => { const e = { id: uid(n), employee_id: OWNER, title: `Rent paid ${n}`, category: 'rent', amount, original_amount: amount, currency: 'INR', expense_date: '2026-05-20', txn_type: 'expense', account_id: id('bank'), entity_id: 'A', entity_source: 'manual', scope: 'business', receipts: [] }; await insertRow(db, 'expenses', e); return toExpense((await q(db, 'SELECT * FROM expenses WHERE id=$1', [uid(n)]))[0]!); };
    const first = await pay(5610, 500);
    const s1 = settlementProposal({ id: uid(5602), accrual, balanceCode: 'payable', entry: first, journals: [accrual], documentIds: [DOC] });
    await postJournal(db, s1, uid(5603));
    await expect(postJournal(db, { ...s1, id: uid(5604) }, uid(5605))).rejects.toThrow('already settled');
    const big = await pay(5611, 800);
    await expect(postJournal(db, settlementProposal({ id: uid(5606), accrual, balanceCode: 'payable', entry: { ...big, amount: 500 }, journals: [accrual], documentIds: [DOC] }), uid(5607))).rejects.toThrow('snapshot changed');
    const s2 = { ...settlementProposal({ id: uid(5608), accrual, balanceCode: 'payable', entry: { ...big, amount: 700 }, journals: [accrual, s1], documentIds: [DOC] }) };
    s2.settlement = { ...s2.settlement!, amount: 800, snapshot: { ...s2.settlement!.snapshot, amount: 800 } };
    s2.legs = s2.legs.map(l => ({ ...l, debit: l.debit ? 800 : 0, credit: l.credit ? 800 : 0 }));
    await expect(postJournal(db, s2, uid(5609))).rejects.toThrow('exceeds outstanding balance');
    const due = await one<{ s: string }>(db, "SELECT sum(signed_amount)::text s FROM accounting_posting_lines WHERE code='payable'");
    expect(Number(due.s)).toBe(-700); // 1200 accrued − 500 paid: partial payment leaves 700 due
    await expect(db.query('UPDATE expenses SET amount=400, original_amount=400 WHERE id=$1', [first.id])).rejects.toThrow('Settlement source is retained');
    await db.query("UPDATE expenses SET statement_ref='stmt:2', reconciled_at=now() WHERE id=$1", [first.id]);
  }, 60000);

  it('closed periods refuse postings (function and direct paths); correcting entries post in an open period; reopening on Audit restores posting', async () => {
    const db = await installed(); await actAs(db, OWNER);
    const j = journal({ id: uid(5300), date: '2026-05-10' });
    await postJournal(db, j, uid(5301));
    await db.query("SELECT public.change_accounting_period(_id=>$1,_action=>'closed',_period=>'p-2026-05',_from=>'2026-05-01',_to=>'2026-05-31',_reason=>'May close',_expected=>$2::jsonb)", [uid(5302), JSON.stringify({ closedPeriods: [], periodLog: [] })]);
    await expect(postJournal(db, journal({ id: uid(5303), date: '2026-05-20' }), uid(5304))).rejects.toThrow('closed');
    await expect(postJournal(db, reverseAccountingJournal(j, uid(5305), '2026-05-31', 'Reverse inside closed May'), uid(5306))).rejects.toThrow('closed');
    await actAs(db, null);
    await expect(db.exec(`BEGIN; SELECT accounting_private.grant_authority('posting_writer'); INSERT INTO accounting_postings(id,owner_id,entity_id,posting_date,kind,idempotency_key,journal_id,request_id,journal) VALUES (gen_random_uuid(),'${OWNER}','A','2026-05-15','journal','closed-direct',gen_random_uuid(),gen_random_uuid(),'{}'); COMMIT;`).catch(async e => { await db.exec('ROLLBACK'); throw e; })).rejects.toThrow('period is closed');
    await actAs(db, OWNER);
    // Authorised correcting entry: reversal of the closed-period journal dated in the open period, plus replacement.
    await postJournal(db, reverseAccountingJournal(j, uid(5307), '2026-06-01', 'Correct May rent in June'), uid(5308));
    await postJournal(db, journal({ id: uid(5309), date: '2026-06-01', description: 'Corrected May rent', legs: j.legs.map(l => ({ ...l, debit: l.debit ? 1000 : 0, credit: l.credit ? 1000 : 0 })) }), uid(5310));
    const books = (await one<{ b: Row }>(db, "SELECT data->'books' b FROM finance_preferences")).b;
    await db.query("SELECT public.change_accounting_period(_id=>$1,_action=>'reopened',_period=>'p-2026-05',_from=>NULL,_to=>NULL,_reason=>'Reopen for audit adjustment',_expected=>$2::jsonb)", [uid(5311), JSON.stringify({ closedPeriods: books['closedPeriods'], periodLog: books['periodLog'] })]);
    await postJournal(db, journal({ id: uid(5312), date: '2026-05-20', description: 'Late May accrual after reopening' }), uid(5313));
    const tb = await q<{ code: string; bal: string }>(db, "SELECT code, sum(signed_amount)::text bal FROM accounting_posting_lines WHERE entity_id='A' GROUP BY code ORDER BY code");
    expect(tb).toEqual([{ code: 'expense:rent', bal: '2200' }, { code: 'payable', bal: '-2200' }]);
  }, 60000);

  it('after a committed backfill, ledger edits post reversal + replacement (never in place); closed periods block backfill; undo reverses and deactivates', async () => {
    const db = await installed(); await actAs(db, OWNER);
    await commit(db, uid(7101));
    const v1 = await one<{ id: string }>(db, "SELECT id FROM accounting_postings WHERE source_entry_id=$1 AND kind='entry'", [id('bill')]);
    const v1Lines = await q(db, 'SELECT code,debit,credit FROM accounting_posting_lines WHERE posting_id=$1 ORDER BY line_no', [v1.id]);
    await db.query('UPDATE expenses SET amount=1200, original_amount=1200 WHERE id=$1', [id('bill')]);
    const chain = await q<{ kind: string; entry_version: number | null; reverses_id: string | null; total: string }>(db, "SELECT p.kind, p.entry_version, p.reverses_id, (SELECT sum(debit)::text FROM accounting_posting_lines l WHERE l.posting_id=p.id) total FROM accounting_postings p WHERE source_entry_id=$1 ORDER BY created_at, kind", [id('bill')]);
    expect(chain.map(c => `${c.kind}:${c.entry_version ?? '-'}:${Number(c.total)}`).sort()).toEqual(['entry:1:1000', 'entry:2:1200', 'entry_reversal:-:1000'].sort());
    expect(await q(db, 'SELECT code,debit,credit FROM accounting_posting_lines WHERE posting_id=$1 ORDER BY line_no', [v1.id])).toEqual(v1Lines);
    await db.query('DELETE FROM expenses WHERE id=$1', [id('refund')]);
    const after = await preview(db);
    expect(after.proposals).toEqual([]);
    const active = await q(db, "SELECT l.entity_id, l.code, sum(l.signed_amount)::numeric s FROM accounting_posting_lines l JOIN accounting_postings p ON p.id=l.posting_id WHERE p.kind IN ('entry','entry_reversal') GROUP BY 1,2 HAVING sum(l.signed_amount)<>0 ORDER BY 1,2");
    expect(active.map(r => `${r['entity_id']}|${r['code']}|${Number(r['s'])}`)).toEqual(after.trialBalance.filter(r => Number(r['closing']) !== 0).map(r => `${r['entityId']}|${r['code']}|${Number(r['closing'])}`));
    await expect(db.query('SELECT public.accounting_backfill_undo($1,$2)', [uid(7101), 'no'])).rejects.toThrow('reason');
    const undo = (await one<{ r: Row }>(db, 'SELECT public.accounting_backfill_undo($1,$2) r', [uid(7101), 'Owner review found mapping gaps'])).r;
    expect(undo['reversed']).toBeGreaterThan(10);
    expect(await q(db, "SELECT 1 FROM accounting_postings p WHERE kind='entry' AND NOT EXISTS (SELECT 1 FROM accounting_postings r WHERE r.reverses_id=p.id)")).toEqual([]);
    const n = Number((await one<{ n: number }>(db, 'SELECT count(*)::int n FROM accounting_postings')).n);
    await db.query('UPDATE expenses SET amount=1300, original_amount=1300 WHERE id=$1', [id('bill')]);
    expect(Number((await one<{ n: number }>(db, 'SELECT count(*)::int n FROM accounting_postings')).n)).toBe(n); // deactivated: no sync
    expect((await one<{ r: Row }>(db, 'SELECT public.accounting_backfill_undo($1,$2) r', [uid(7101), 'Owner review found mapping gaps'])).r['replayed']).toBe(true);
    // Backfill never posts into a closed period: those entries are listed for Audit instead.
    await db.query("SELECT public.change_accounting_period(_id=>$1,_action=>'closed',_period=>'p-2026-04',_from=>'2026-04-01',_to=>'2026-04-30',_reason=>'April close',_expected=>$2::jsonb)", [uid(7102), JSON.stringify({ closedPeriods: [], periodLog: [] })]);
    const closed = await preview(db);
    expect(closed.proposals).toEqual([]);
    expect(closed.exceptions.filter(x => String(x['exception']).includes('period is closed')).length).toBeGreaterThan(10);
  }, 60000);

  it('RLS: other owners cannot read or write postings; company members and accountants see only granted companies and lose access on revocation', async () => {
    const db = await installed(); await actAs(db, OWNER);
    await commit(db, uid(7201));
    await postJournal(db, journal({ id: uid(5400) }), uid(5401));
    await actAs(db, OTHER);
    for (const t of ['accounting_postings', 'accounting_posting_lines', 'accounting_journal_evidence', 'accounting_backfill_runs', 'accounting_review_grants', 'accounting_exception_reviews']) expect(await q(db, `SELECT * FROM ${t}`)).toEqual([]);
    await expect(db.query(`INSERT INTO accounting_postings(id,owner_id,entity_id,posting_date,kind,idempotency_key) VALUES (gen_random_uuid(),$1,'A','2026-06-01','entry','x')`, [OWNER])).rejects.toThrow('permission denied');
    await expect(db.query(`INSERT INTO accounting_posting_lines(id,posting_id,owner_id,line_no,entity_id,code,label,role,debit) VALUES (gen_random_uuid(),gen_random_uuid(),$1,1,'A','c','c','asset',1)`, [OWNER])).rejects.toThrow('permission denied');
    const otherPreview = await preview(db);
    expect(otherPreview.proposals.map(x => x['entityId'])).toEqual(['X1']);
    await expect(postJournal(db, journal({ id: uid(5402), entityId: 'X1' }), uid(5403))).rejects.toThrow('Company original unavailable'); // owner's DOC cannot be borrowed
    const bank = id('bank');
    await expect(postJournal(db, journal({ id: uid(5404), entityId: 'X1', documentIds: [OTHER_DOC], legs: [{ code: 'expense:x', label: 'X', role: 'expense', debit: 5, credit: 0 }, { code: `account:${bank}`, label: 'Owner bank', role: 'asset', debit: 0, credit: 5, accountId: bank }] }), uid(5405))).rejects.toThrow('Linked company account unavailable');
    await expect(db.query('SELECT public.review_accounting_exception($1,$2,$3,$4,$5)', [uid(5406), OWNER, uid(5400), 'x', 'Not my company at all'])).rejects.toThrow('not authorised');
    await actAs(db, OWNER);
    const grant = (await one<{ g: string }>(db, "SELECT public.grant_entity_access('A','member@example.test',false) g")).g;
    await actAs(db, MEMBER);
    const seen = await q<{ entity_id: string }>(db, 'SELECT DISTINCT entity_id FROM accounting_posting_lines');
    expect(seen.map(r => r.entity_id)).toEqual(['A']);
    expect((await q(db, 'SELECT * FROM accounting_postings')).length).toBeGreaterThan(5);
    await actAs(db, OWNER);
    await db.query('SELECT public.revoke_entity_access($1)', [grant]);
    await actAs(db, MEMBER);
    expect(await q(db, 'SELECT * FROM accounting_postings')).toEqual([]);
    expect(await q(db, 'SELECT * FROM accounting_posting_lines')).toEqual([]);
    expect(await q(db, 'SELECT * FROM accounting_journal_evidence')).toEqual([]);
  }, 60000);

  it('delete_my_finance_data and restore_finance_backup succeed with postings present; erasure removes only the caller’s accounting rows', async () => {
    const db = await installed(); await actAs(db, OWNER);
    await commit(db, uid(7301));
    const bank = id('bank');
    const j = journal({ id: uid(5500), legs: [{ code: 'expense:rent', label: 'Rent', role: 'expense', debit: 700, credit: 0 }, { code: `account:${bank}`, label: 'Alpha bank', role: 'asset', debit: 0, credit: 700, accountId: bank }] });
    await postJournal(db, j, uid(5501));
    await postJournal(db, reverseAccountingJournal(j, uid(5502), '2026-05-12', 'Reverse duplicated rent'), uid(5503));
    await db.query('SELECT public.set_accounting_review_grant($1,$2,false)', ['A', 'accountant@example.test']);
    await db.query('SELECT public.review_accounting_exception($1,$2,$3,$4,$5)', [uid(5504), OWNER, j.id, 'rent', 'Owner note on rent journal']);
    await actAs(db, OTHER); await commit(db, uid(7302)); await actAs(db, OWNER);
    const backup: Record<string, Row[]> = {};
    for (const [t, col] of [['accounts', 'owner_id'], ['finance_preferences', 'owner_id'], ['expenses', 'employee_id'], ['documents', 'owner_id']] as const) backup[t] = (await q<{ r: Row }>(db, `SELECT to_jsonb(x) r FROM ${t} x WHERE ${col}=$1`, [OWNER])).map(r => r.r);
    const counts = async () => (await one<Row>(db, `SELECT (SELECT count(*)::int FROM accounting_postings WHERE owner_id=$1) p, (SELECT count(*)::int FROM accounting_posting_lines WHERE owner_id=$1) l, (SELECT count(*)::int FROM expenses WHERE employee_id=$1) e`, [OWNER]));
    const before = await counts();
    // Same-account restore over existing records (journal anchors, settlement-free entries, locked originals).
    const same = (await one<{ r: Row }>(db, 'SELECT public.restore_finance_backup($1::jsonb) r', [JSON.stringify(backup)])).r;
    expect(same['accounting']).toEqual({ rebuiltJournals: 0, exceptions: [] });
    expect(await counts()).toEqual(before);
    expect((await preview(db)).proposals).toEqual([]);
    await db.query('SELECT public.delete_my_finance_data()');
    await actAs(db, null);
    for (const t of ['accounting_postings', 'accounting_posting_lines', 'accounting_backfill_runs', 'accounting_review_grants', 'accounting_exception_reviews']) expect(await q(db, `SELECT 1 FROM ${t} WHERE owner_id=$1`, [OWNER])).toEqual([]);
    expect(Number((await one<{ n: number }>(db, 'SELECT count(*)::int n FROM accounting_postings WHERE owner_id=$1', [OTHER])).n)).toBeGreaterThan(0);
    await actAs(db, OWNER);
    // Restore after erasure: anchors return and both journal postings are rebuilt (original before reversal).
    const restored = (await one<{ r: Row }>(db, 'SELECT public.restore_finance_backup($1::jsonb) r', [JSON.stringify(backup)])).r;
    expect(restored['accounting']).toEqual({ rebuiltJournals: 2, exceptions: [] });
    expect((await q(db, 'SELECT id FROM accounting_journal_evidence ORDER BY created_at')).map(r => r['id']).sort()).toEqual([j.id, uid(5502)].sort());
    expect(await q(db, "SELECT reverses_id IS NOT NULL r FROM accounting_postings WHERE journal_id=$1", [uid(5502)])).toEqual([{ r: true }]);
    // Entry postings are not recreated automatically: a new reviewed backfill is required.
    expect(await q(db, "SELECT 1 FROM accounting_postings WHERE kind='entry'")).toEqual([]);
    expect((await preview(db)).proposals.length).toBeGreaterThan(10);
  }, 60000);
});

describe('P3 ordering with the parallel security proposals (P1 → P2 → P3)', () => {
  it('installs after P1/P2; P1 erasure still removes postings and revoked company members lose posting access', async () => {
    const P1 = '.lovable/staged-sql/proposed/P1_security_containment.sql', P2 = '.lovable/staged-sql/proposed/P2_v31_role_model.sql';
    const { existsSync } = await import('node:fs');
    if (!existsSync(P1) || !existsSync(P2)) return; // P1/P2 are drafted in parallel; ordering check runs once they exist
    const db = await fullSchemaDb();
    await seed(db);
    await db.exec(readSql(P1)); await db.exec(readSql(P2)); await db.exec(readSql(P3));
    await actAs(db, OWNER);
    await commit(db, uid(7501));
    await postJournal(db, journal({ id: uid(5700) }), uid(5701));
    const grant = (await one<{ g: string }>(db, "SELECT public.grant_entity_access('A','member@example.test',false) g")).g;
    await actAs(db, MEMBER);
    expect((await q(db, 'SELECT * FROM accounting_posting_lines')).length).toBeGreaterThan(0);
    await actAs(db, OWNER); await db.query('SELECT public.revoke_entity_access($1)', [grant]);
    await actAs(db, MEMBER); expect(await q(db, 'SELECT * FROM accounting_posting_lines')).toEqual([]);
    await actAs(db, OWNER); await db.query('SELECT public.delete_my_finance_data()');
    await actAs(db, null);
    expect(await q(db, 'SELECT 1 FROM accounting_postings WHERE owner_id=$1', [OWNER])).toEqual([]);
  }, 90000);
});

/** Row counts + content hashes for every pre-existing public table, and a catalog fingerprint. */
async function tableSnapshot(db: PGlite) {
  await actAs(db, null);
  const tables = (await q<{ t: string }>(db, "SELECT table_name t FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name NOT LIKE 'accounting\\_%' ORDER BY 1")).map(r => r.t);
  const out: Record<string, string> = {};
  for (const t of tables) out[t] = (await one<{ s: string }>(db, `SELECT count(*)||':'||coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)),'') s FROM public.${t} x`)).s;
  return out;
}
async function catalogSnapshot(db: PGlite) {
  await actAs(db, null);
  return {
    functions: await q(db, "SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, md5(p.prosrc) src, p.prosecdef, p.proconfig::text cfg, p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2,3"),
    triggers: await q(db, "SELECT tgrelid::regclass::text rel, tgname, md5(pg_get_triggerdef(oid)) def FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1,2"),
    policies: await q(db, "SELECT * FROM pg_policies ORDER BY schemaname, tablename, policyname"),
    relations: await q(db, "SELECT n.nspname, c.relname, c.relkind, c.relacl::text acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') ORDER BY 1,2"),
    columns: await q(db, "SELECT table_name, column_name, data_type, column_default, is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY 1,2"),
    schemas: await q(db, "SELECT nspname, nspacl::text FROM pg_namespace ORDER BY 1"),
  };
}

describe('P3 data preservation and rollback to the 0088 state', () => {
  it('installing, using and rolling back P3 leaves every existing owner table byte-identical and the catalog equal to 0088', async () => {
    const db = await fullSchemaDb();
    await seed(db);
    const tables0 = await tableSnapshot(db), catalog0 = await catalogSnapshot(db);
    expect(Object.keys(tables0).length).toBeGreaterThan(50);
    expect(Number(tables0['expenses']!.split(':')[0])).toBe(fixtureEntries().length + 1);
    await db.exec(readSql(P3));
    expect(await tableSnapshot(db)).toEqual(tables0);
    await db.exec(readSql(P3_ROLLBACK));
    expect(await tableSnapshot(db)).toEqual(tables0);
    expect(await catalogSnapshot(db)).toEqual(catalog0);
    // Second cycle with postings committed: entries/accounts/preferences untouched; rollback refuses without the explicit discard flag.
    await db.exec(readSql(P3));
    await actAs(db, OWNER); await commit(db, uid(7401)); await actAs(db, OTHER); await commit(db, uid(7402));
    expect(await tableSnapshot(db)).toEqual(tables0);
    await expect(db.exec(readSql(P3_ROLLBACK))).rejects.toThrow('Postings exist');
    await db.exec(`BEGIN; SET LOCAL ledgerline.rollback_discard_postings = 'on'; ${readSql(P3_ROLLBACK)} COMMIT;`);
    expect(await tableSnapshot(db)).toEqual(tables0);
    expect(await catalogSnapshot(db)).toEqual(catalog0);
    // The restored 0072 restore function still works after rollback.
    await actAs(db, OWNER);
    expect((await one<{ r: Row }>(db, "SELECT public.restore_finance_backup('{}'::jsonb) r")).r['counts']).toBeTruthy();
  }, 90000);
});
