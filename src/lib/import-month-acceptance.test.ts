import { describe, expect, it } from 'vitest';
import { CATEGORIES, type Expense, type StatementLine } from './expenses';
import { accountBalance, cashflow, type Account } from './ledger';
import { importSelectionSummary, orientStatementMove, postingBlockers, reconcileStatement, stageImport, type ImportRow } from './historical-import';

const bank: Account = { id: 'bank', name: 'Bank', kind: 'savings', openingBalance: 10000, archived: false };
const card: Account = { id: 'card', name: 'Card', kind: 'credit_card', openingBalance: 0, archived: false };
const cash: Account = { id: 'cash', name: 'Cash', kind: 'cash', openingBalance: 0, archived: false };
const accounts = [bank, card, cash];
const today = '2026-11-01';
const bankStatement = { account_id: 'bank', currency: 'INR' };
const cardStatement = { account_id: 'card', currency: 'INR' };
const line = (ref: string, amount: number, description: string, direction: StatementLine['direction'] = 'debit'): StatementLine => ({ ref, date: '2026-04-15', amount, description, direction });
const bankLines = [line('salary', 5000, 'SALARY', 'credit'), line('food', 250, 'SWIGGY'), line('cash', 1000, 'ATM CASH WDL'), line('settlement', 1500, 'CREDIT CARD PAYMENT')];
const cardLines = [line('purchase', 2000, 'AMAZON POS'), line('refund', 200, 'AMAZON REFUND', 'credit'), line('settlement', 1500, 'NEFT PAYMENT', 'credit')];
function staged(lines: StatementLine[], accountId: string, known = new Set<string>(), transactions: Expense[] = []): ImportRow[] {
  return stageImport(lines, { accounts, accountId, currency: 'INR', transactions, categories: CATEGORIES.map(name => ({ name, archived: false })) }, [], known).map((r, i) => ({ ...r, id: `${accountId}-${i}` }));
}
function reviewed(rows: ImportRow[]): ImportRow[] {
  return rows.map(row => {
    const proposal = { ...row.proposal, reviewed: true, categoryConfirmed: true };
    if (row.line.ref === 'cash') proposal.toAccountId = 'cash';
    if (row.line.ref === 'settlement') {
      proposal.txnType = 'card_payment';
      proposal.accountId = 'bank';
      proposal.toAccountId = 'card';
    }
    return { ...row, decision: 'approved', proposal: orientStatementMove(proposal, row.line.direction, row.proposal.accountId ?? '') };
  });
}
const asExpenses = (rows: ImportRow[]): Expense[] => rows.map(r => ({ ...r.proposal, id: r.id, originalAmount: r.line.amount, fxRate: 1, splits: [], receipts: [], reconciledAt: null, statementRef: r.line.description }));

describe('Representative April bank and card import acceptance', () => {
  it('leaves every extracted row under review, including uncertain credits', () => {
    const rows = staged([...bankLines, line('unknown', 75, 'UNKNOWN CREDIT', 'credit')], 'bank');
    expect(rows.map(r => r.decision)).toEqual(['review', 'review', 'review', 'review', 'review']);
    expect(importSelectionSummary(rows, accounts, today, bankStatement).eligible).toHaveLength(0);
  });
  it('separates bank income, expenses, cash transfers and card payments before posting', () => {
    expect(importSelectionSummary(reviewed(staged(bankLines, 'bank')), accounts, today, bankStatement).types).toEqual([
      { type: 'income', count: 1, amount: 5000 }, { type: 'expense', count: 1, amount: 250 },
      { type: 'transfer', count: 1, amount: 1000 }, { type: 'card_payment', count: 1, amount: 1500 },
    ]);
  });
  it('reconciles the bank month without adding adjustment or missing entries', () => {
    const rows = reviewed(staged(bankLines, 'bank'));
    expect(reconcileStatement(10000, 12250, bankLines, false)).toMatchObject({ importedBalance: 12250, difference: 0 });
    expect(accountBalance(bank, asExpenses(rows))).toBe(12250);
    expect(accountBalance(cash, asExpenses(rows))).toBe(1000);
    expect(rows).toHaveLength(4);
  });
  it('reconciles card purchases, refunds and a credited settlement', () => {
    const rows = reviewed(staged(cardLines, 'card'));
    expect(importSelectionSummary(rows, accounts, today, cardStatement).types).toEqual([
      { type: 'expense', count: 1, amount: 2000 }, { type: 'refund', count: 1, amount: 200 }, { type: 'card_payment', count: 1, amount: 1500 },
    ]);
    expect(accountBalance(card, asExpenses(rows))).toBe(300);
    expect(reconcileStatement(0, 300, cardLines, true).difference).toBe(0);
  });
  it('detects the card-side settlement already recorded from the bank', () => {
    const transactions = asExpenses(reviewed(staged(bankLines, 'bank')));
    const rows = staged(cardLines, 'card', new Set(), transactions);
    expect(rows.find(r => r.line.ref === 'settlement')?.duplicate_kind).toBe('exact');
    const summary = importSelectionSummary(reviewed(rows), accounts, today, cardStatement);
    expect(summary.requiresReview).toBe(0);
    expect(summary.duplicates).toBe(1);
    const combined = [...transactions, ...asExpenses(summary.eligible)];
    expect(accountBalance(bank, combined)).toBe(12250);
    expect(accountBalance(card, combined)).toBe(300);
    expect(cashflow(combined)).toEqual({ income: 5000, spent: 2050, net: 2950 });
  });
  it('holds every previously posted bank row on statement replay', () => {
    const first = staged(bankLines, 'bank');
    const replay = reviewed(staged(bankLines, 'bank', new Set(first.map(r => r.fingerprint))));
    expect(importSelectionSummary(replay, accounts, today, bankStatement)).toMatchObject({ duplicates: 4, eligible: [] });
  });
  it('holds every previously posted card row on statement replay', () => {
    const first = staged(cardLines, 'card');
    const replay = reviewed(staged(cardLines, 'card', new Set(first.map(r => r.fingerprint))));
    expect(importSelectionSummary(replay, accounts, today, cardStatement)).toMatchObject({ duplicates: 3, eligible: [] });
  });
  it('preserves two same-day equal purchases and their distinct fingerprints', () => {
    const rows = staged([line('one', 250, 'SWIGGY'), line('two', 250, 'SWIGGY')], 'bank');
    expect(new Set(rows.map(r => r.fingerprint)).size).toBe(2);
    expect(importSelectionSummary(reviewed(rows), accounts, today, bankStatement).types).toEqual([{ type: 'expense', count: 2, amount: 500 }]);
  });
  for (const [name, patch] of [ ['amount', { amount: 999 }], ['date', { date: '2026-04-16' }], ['currency', { currency: 'USD' }] ] as const) {
    it(`excludes a proposal whose ${name} differs from the original statement`, () => {
      const first = reviewed(staged(bankLines, 'bank'))[0];
      if (!first) throw Error('Missing fixture');
      const changed = { ...first, proposal: { ...first.proposal, ...patch } };
      expect(postingBlockers(changed, accounts, today, bankStatement)).toContain('Source amount, date and currency must remain unchanged');
      expect(importSelectionSummary([changed], accounts, today, bankStatement).eligible).toEqual([]);
    });
  }
  it('excludes entries assigned entirely outside the statement account', () => {
    const first = reviewed(staged(bankLines, 'bank'))[0];
    if (!first) throw Error('Missing fixture');
    expect(postingBlockers({ ...first, proposal: { ...first.proposal, accountId: 'cash' } }, accounts, today, bankStatement)).toContain('Entry must involve the statement account');
  });
  it('rejects a credited card payment pointing away from the statement card', () => {
    const first = reviewed(staged(cardLines, 'card')).find(r => r.line.ref === 'settlement');
    if (!first) throw Error('Missing fixture');
    expect(postingBlockers({ ...first, proposal: { ...first.proposal, accountId: 'card', toAccountId: 'bank' } }, accounts, today, cardStatement)).toContain('Transfer direction must match statement');
  });
  it('rejects archived destination accounts', () => {
    const first = reviewed(staged(bankLines, 'bank')).find(r => r.line.ref === 'cash');
    if (!first) throw Error('Missing fixture');
    expect(postingBlockers(first, accounts.map(a => ({ ...a, archived: a.id === 'cash' })), today, bankStatement)).toContain('Confirm destination account');
  });
});