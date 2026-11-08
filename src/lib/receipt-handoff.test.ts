import { describe, expect, it } from 'vitest';
import { receiptAsset } from './receipt-handoff';
import type { Expense } from './expenses';
import type { VaultDoc } from './documents';
const entry = { id: 'payment', txnType: 'expense', title: 'Computer', merchant: 'Seller', amount: 432.1, originalAmount: 5, currency: 'USD', date: '2026-04-03' } as Expense;
describe('source-linked asset handoff', () => {
  it('uses stored INR cost and preserves the payment and source document', () => {
    const doc = { id: 'invoice', transactionId: 'payment' } as VaultDoc;
    expect(receiptAsset(entry, [], [doc], 'asset', 'computer')).toMatchObject({ cost: 432.1, paymentId: 'payment', transactionId: 'payment', docId: 'invoice', purchaseDate: '2026-04-03' });
  });
  it('returns the existing register record rather than duplicating a payment-linked asset', () => {
    const prior = receiptAsset(entry, [], [], 'asset', 'computer');
    expect(receiptAsset(entry, [prior], [], 'other', 'vehicle')).toBe(prior);
  });
  it('refuses a transfer as an asset purchase', () => {
    expect(() => receiptAsset({ ...entry, txnType: 'transfer' }, [], [], 'asset', 'computer')).toThrow();
  });
});