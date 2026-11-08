import type { Asset, AssetKind } from './assets';
import type { Expense } from './expenses';
import type { VaultDoc } from './documents';

/** A register link only: never posts, changes a payment or invents an asset account. */
export function receiptAsset(entry: Expense, assets: Asset[], documents: VaultDoc[], id: string, kind: AssetKind): Asset {
  const existing = assets.find(a => a.transactionId === entry.id || a.paymentId === entry.id);
  if (existing) return existing;
  if (entry.txnType !== 'expense' || !(entry.amount > 0)) throw new Error('Choose a saved purchase with a positive amount.');
  const docs = documents.filter(d => d.transactionId === entry.id);
  return { id, name: entry.title || entry.merchant || '', kind, cost: entry.amount, inUse: entry.date,
    purchaseDate: entry.date, sharePct: 100, bookMethod: 'slm', bookRatePct: 0,
    transactionId: entry.id, paymentId: entry.id, supplier: entry.merchant || undefined,
    docId: docs.length === 1 ? docs[0]?.id : undefined, docIds: docs.map(d => d.id) };
}