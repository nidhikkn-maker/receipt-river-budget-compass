import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { defaultPreferences } from '@/lib/preferences';
import type { FinancialReview } from '@/lib/financial-review';
const mocks = vi.hoisted(() => ({ save: vi.fn(), store: {} as Record<string, unknown> }));
vi.mock('@/lib/store', () => ({ useStore: () => mocks.store }));
import { ReviewMappingPanel } from './ReviewMappingPanel';
afterEach(cleanup);
describe('controlled bulk activity confirmation', () => {
  it('does not save on preview or cancel, and explicitly confirms reviewed records', async () => {
    const transaction = { id: 'sample', title: 'Sample', amount: 50, date: '2026-04-01', txnType: 'expense', tags: [], description: 'Source' };
    const rows = [{ transaction, group: 'category' }] as FinancialReview[];
    mocks.save.mockResolvedValue(undefined);
    mocks.store = { transactions: [transaction], preferences: { ...defaultPreferences(), tags: [{ group: 'Project', name: 'Audit' }] }, applyReviewMapping: mocks.save };
    const done = vi.fn(); render(<ReviewMappingPanel rows={rows} onSaved={done} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Mapping value' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Audit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview mapping' }));
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect(done).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Preview mapping' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Apply Mapping' }));
    await waitFor(() => expect(done).toHaveBeenCalledWith([]));
    expect(mocks.save.mock.calls[0]?.[0].records[0].id).toBe('sample');
    expect(transaction.tags).toEqual([]);
  });
});