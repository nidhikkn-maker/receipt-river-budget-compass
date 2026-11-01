import { SCOPE_LABEL } from './expenses';
import { TXN_LABEL, type Account } from './ledger';
import { classificationStatus, merchantFamily, type ImportRow } from './historical-import';

export const IMPORT_GROUP_DIMENSIONS = [
  { id: 'merchant', label: 'Merchant' },
  { id: 'category', label: 'Category' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'type', label: 'Transaction type' },
  { id: 'direction', label: 'Money in / out' },
  { id: 'account', label: 'Account' },
  { id: 'organisation', label: 'Organisation' },
  { id: 'confidence', label: 'Review status' },
] as const;
export type ImportGroupDimension = typeof IMPORT_GROUP_DIMENSIONS[number]['id'];

/** Grouping is presentation only: use original amounts, retain direction and never approve rows. */
export function groupImportRows(rows: ImportRow[], dimension: ImportGroupDimension, accounts: Account[]) {
  const groups = new Map<string, { key: string; label: string; rows: ImportRow[]; debit: number; credit: number }>();
  for (const row of rows) {
    const p = row.proposal;
    let key: string, label: string;
    switch (dimension) {
      case 'category': key = label = p.category || 'Unclassified'; break;
      case 'workspace': key = p.scope; label = SCOPE_LABEL[p.scope]; break;
      case 'type': key = p.txnType ?? 'expense'; label = TXN_LABEL[p.txnType ?? 'expense']; break;
      case 'direction': key = row.line.direction ?? 'debit'; label = key === 'credit' ? 'Money in' : 'Money out'; break;
      case 'account': key = p.accountId ?? ''; label = accounts.find(a => a.id === key)?.name ?? 'Account not confirmed'; break;
      case 'organisation': key = label = p.organisation?.trim() || 'No organisation'; break;
      case 'confidence': key = label = classificationStatus(row); break;
      default: key = label = merchantFamily(row.line.description);
    }
    const group = groups.get(key) ?? { key, label, rows: [], debit: 0, credit: 0 };
    group.rows.push(row);
    if (row.line.direction === 'credit') group.credit += row.line.amount;
    else group.debit += row.line.amount;
    groups.set(key, group);
  }
  return [...groups.values()].map(g => ({ ...g, debit: Math.round(g.debit * 100) / 100, credit: Math.round(g.credit * 100) / 100 }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
}