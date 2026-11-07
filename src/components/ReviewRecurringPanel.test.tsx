import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Expense } from '@/lib/expenses';
const mocks = vi.hoisted(() => ({ save: vi.fn(), store: {} as Record<string, unknown> }));
vi.mock('@/lib/store', () => ({ useStore: () => mocks.store }));
vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
import { ReviewRecurringPanel } from './ReviewRecurringPanel';
afterEach(cleanup);
const expense: Expense = { id: 'sample', title: 'Software', merchant: 'Vendor', amount: 100, originalAmount: 100, currency: 'INR', fxRate: 1, date: '2026-04-01', category: 'Software', scope: 'personal', memberId: null, splits: [], receipts: [], description: 'Original source', paymentMethod: 'upi', accountId: 'bank', reconciledAt: null, statementRef: null, txnType: 'expense' };
describe('controlled recurring profile flow', () => {
  it('requires explicit confirmation and preserves one retry identifier without creating a ledger entry', async () => {
    mocks.save.mockRejectedValueOnce(new Error('Interrupted')).mockResolvedValueOnce(undefined);
    mocks.store = { accounts: [{ id: 'bank', name: 'Bank' }], commitments: [], saveRecurringReview: mocks.save };
    const done = vi.fn(); render(<ReviewRecurringPanel expense={expense} cadence={30} onSaved={done} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview recurring profile' }));
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Save Profile' }));
    await screen.findByRole('alert');
    const id = mocks.save.mock.calls[0]?.[1];
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Save Profile' }));
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[1]?.[1]).toBe(id);
    expect(expense.description).toBe('Original source');
  });
});