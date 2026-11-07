// @vitest-environment node
// Canonical pipeline and real disposable persistence; not a hosted store/RLS certificate.
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { applyUpload, PartialUploadError, undoUpload, type ApplyApi, type ApplyResult } from './apply';
import { buildPlan } from './plan';
import { fromStatementLines, type StmtFile } from './line';
import { settledUpload } from './history';
import { accountBalance, cashflow, type Account } from '../ledger';
import type { Expense } from '../expenses';
import type { StatementUpload } from '../preferences';
import { buildReportDoc, emptyFilters } from '../report-centre';

const account: Account = { id: 'bank', name: 'Synthetic bank', kind: 'savings', openingBalance: 1000, archived: false };
const file: StmtFile = { name: 'invoice-bank.csv', accountId: 'bank', hint: null, currency: 'INR', opening: 1000, closing: 270, lines: fromStatementLines('invoice-bank.csv', [
  { ref: 'a', date: '2026-10-02', description: 'SWIGGY ORDER', amount: 250 },
  { ref: 'b', date: '2026-10-03', description: 'AMAZON PURCHASE', amount: 480 }
]) };

it.each(['source-before', 'save-before', 'save-after', 'evidence-before', 'evidence-after', 'draft-after', 'checkpoint-after', 'refresh-after'])(
  'interruption at %s: no false completion, exact retry, persisted evidence/report and complete undo', async stage => {
    const db = new PGlite();
    try {
      await db.exec('CREATE TABLE ledger(id text PRIMARY KEY, data jsonb); CREATE TABLE evidence(id text PRIMARY KEY); CREATE TABLE history(data jsonb); CREATE TABLE drafts(id text PRIMARY KEY, transaction_id text)');
      await db.exec("INSERT INTO drafts VALUES('receipt',NULL)");
      const entries = async () => (await db.query<{ data: Expense }>('SELECT data FROM ledger ORDER BY id')).rows.map(r => r.data);
      const reviewed = buildPlan([file], [account], [], [{ name: 'Food', archived: false }, { name: 'Other', archived: false }]).accounts[0];
      if (!reviewed) throw Error('Missing account review');
      const decisions = [...reviewed.auto, ...reviewed.ask];
      const first = decisions[0]; if (!first) throw Error('Missing reviewed line');
      let injected = false;
      const interrupt = (at: string) => { if (!injected && stage === at) { injected = true; throw Error(`Interrupted ${at}`); } };
      let last: ApplyResult = { posted: [], reconciled: [], createdAccounts: [] };
      const api: ApplyApi = {
        transactions: [], addAccount: async () => { throw Error('Unexpected creation'); }, setArchived: async () => {},
        prepareSource: async () => { interrupt('source-before'); await db.exec("INSERT INTO evidence VALUES('original') ON CONFLICT DO NOTHING"); return 'original'; },
        save: async (input, opts) => {
          interrupt('save-before');
          await db.query('INSERT INTO ledger VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING', [opts?.createId, JSON.stringify({ ...input, id: opts?.createId, originalAmount: input.amount, currency: 'INR', fxRate: 1, receipts: ['bill.jpg'], splits: [], statementRef: null, reconciledAt: null })]);
          interrupt('save-after');
        }, reconcile: async (id, ref) => {
          interrupt('evidence-before');
          await db.query('UPDATE ledger SET data=data || $2::jsonb WHERE id=$1', [id, JSON.stringify({ statementRef: ref, reconciledAt: ref ? '2026-11-07' : null })]);
          interrupt('evidence-after');
        }, linkDraft: async (id, transactionId) => { await db.query('UPDATE drafts SET transaction_id=$2 WHERE id=$1', [id, transactionId]); interrupt('draft-after'); },
        unlinkDraft: async id => { await db.query('UPDATE drafts SET transaction_id=NULL WHERE id=$1', [id]); },
        checkpoint: async r => { last = structuredClone(r); await db.exec('DELETE FROM history'); await db.query('INSERT INTO history VALUES($1::jsonb)', [JSON.stringify(r)]); if (r.posted.length) interrupt('checkpoint-after'); },
        refresh: async () => { interrupt('refresh-after'); }, remove: async e => { await db.query('DELETE FROM ledger WHERE id=$1', [e.id]); }
      };
      const requests = [{ account: reviewed, decisions, reconcileIds: [], draftLinks: { [first.line.key]: { draftId: 'receipt', overrides: { merchant: 'Swiggy' }, files: async () => [] } } }];
      try { await applyUpload(requests, api); expect(stage).toBe('refresh-after'); }
      catch (error) { expect(error).toBeInstanceOf(PartialUploadError); }
      const savedBefore = await entries();
      const upload = (): StatementUpload => ({ ...last, id: 'run', at: '2026-11-07', label: file.name, status: 'interrupted', expected: { posted: 2, reconciled: 0, drafts: 1 } });
      const readDrafts = async () => (await db.query<{ id: string; transaction_id: string | null }>('SELECT * FROM drafts')).rows.map(d => ({ id: d.id, status: d.transaction_id ? 'saved' : 'ready', transactionId: d.transaction_id }));
      if (stage !== 'refresh-after') expect(settledUpload(upload(), savedBefore, await readDrafts())).toBeNull();
      // A fresh persistence read plus the original accepted request safely replays stable identities.
      await applyUpload(requests, api); await applyUpload(requests, api);
      const saved = await entries();
      expect(saved).toHaveLength(2); expect(new Set(saved.map(e => e.id)).size).toBe(2);
      expect(saved.every(e => e.statementRef?.startsWith('document:original · '))).toBe(true);
      expect(settledUpload(upload(), saved, await readDrafts())?.status).toBe('complete');
      expect(accountBalance(account, saved)).toBe(270); expect(cashflow(saved)).toEqual({ income: 0, spent: 730, net: -730 });
      expect((await db.query('SELECT * FROM evidence')).rows).toHaveLength(1);
      const report = buildReportDoc('monthly', emptyFilters('2026-10-01', '2026-10-31'), { transactions: saved, accounts: [account], valuations: [], commitments: [], loans: [], budgets: {}, trips: [], drafts: [], memberName: () => 'Me', accountName: () => account.name, today: '2026-10-31' });
      expect(report.summary.find(r => r[0] === 'Total expenses')?.[1]).toBe('INR 730.00');
      expect(report.summary.find(r => r[0] === 'Available balances (today)')?.[1]).toBe('INR 270.00');
      expect((await undoUpload(last, { ...api, transactions: saved })).left).toEqual([]);
      expect(await entries()).toHaveLength(0); expect(accountBalance(account, await entries())).toBe(1000);
      expect((await readDrafts())[0]?.transactionId).toBeNull();
      expect((await db.query('SELECT * FROM evidence')).rows).toHaveLength(1);
    } finally { await db.close(); }
  }, 20000
);

it('Undo retains failed draft cleanup for a later retry instead of reporting success', async () => {
  const unlinkDraft = async () => { throw Error('outage'); };
  const api: ApplyApi = { transactions: [], save: async () => {}, remove: async () => {}, reconcile: async () => {}, addAccount: async () => '', setArchived: async () => {}, refresh: async () => {}, unlinkDraft };
  const r = { posted: ['p'], reconciled: [], createdAccounts: [], linkedDrafts: [{ draftId: 'receipt', transactionId: 'p' }] };
  expect((await undoUpload(r, api)).left).toEqual(['draft:receipt']);
  expect((await undoUpload(r, { ...api, unlinkDraft: async () => {} })).left).toEqual([]);
});

it('Undo retains failed account cleanup and refuses to hide unknown committed planned writes', async () => {
  const api: ApplyApi = { transactions: [], save: async () => {}, remove: async () => {}, reconcile: async () => {}, addAccount: async () => '', setArchived: async () => { throw Error('outage'); }, refresh: async () => {} };
  expect((await undoUpload({ posted: [], reconciled: [], createdAccounts: [{ id: 'a', name: 'Bank' }] }, api)).left).toEqual(['account:a']);
  expect((await undoUpload({ posted: [], reconciled: [], createdAccounts: [], evidence: [{ id: 'unknown', ref: 'document:d · line' }] }, { ...api, transactions: [{ id: 'unknown' } as Expense] })).left).toEqual(['unknown']);
});