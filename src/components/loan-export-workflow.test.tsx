// Actual loan card and export handler; isolated store, not hosted repayment persistence.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultPreferences } from '@/lib/preferences';
import { accountBalance, type Account } from '@/lib/ledger';
const local = vi.hoisted(() => ({ store: {} as Record<string, unknown>, download: vi.fn() }));
vi.mock('@/lib/store', () => ({ useStore: () => local.store }));
vi.mock('@/lib/reports', () => ({ downloadBlob: local.download }));
vi.mock('./LoanFundingPanel', () => ({ LoanFundingPanel: () => null }));
vi.mock('./books/LoanBalanceReview', () => ({ LoanBalanceReview: () => null }));
vi.mock('recharts', () => ({ ResponsiveContainer: () => null, LineChart: () => null, Line: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null }));
import { LoansPanel } from './WealthPanels';
afterEach(cleanup);
it('exports the actual loan CSV button with ledger-consistent FX principal, interest and outstanding', async () => {
  const account: Account = { id: 'loan', name: 'Test loan', kind: 'loan', openingBalance: 500, archived: false };
  const repayment = { id: 'repay', date: '2026-10-05', txnType: 'loan_repayment' as const, accountId: 'bank', toAccountId: 'loan', amount: 83, originalAmount: 1, principal: 0.9, interest: 0.1 };
  const principal = accountBalance(account, [repayment]);
  local.store = { accounts: [account], transactions: [repayment], loans: [{ id: 'l', name: 'Test loan', accountId: 'loan', principal, rate: 12, emi: 83, nextDue: '2026-11-05', loanType: 'personal', status: 'active', payments: [], foreclosurePct: 0 }], commitments: [], preferences: defaultPreferences() };
  const snapshot = JSON.stringify(local.store);
  render(<LoansPanel />);
  fireEvent.click(screen.getByText(/Repayment history/));
  fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
  const [blob, name] = local.download.mock.calls[0] ?? [];
  expect(name).toBe('loan-Test-loan-repayments.csv'); expect(blob.type).toBe('text/csv');
  const text = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsText(blob); });
  expect(text).toContain('"2026-10-05","83","74.7","8.3","425.3"');
  expect(JSON.stringify(local.store)).toBe(snapshot);
});