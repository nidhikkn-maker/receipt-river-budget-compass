import type { Expense } from './expenses';
import type { Account } from './ledger';
import type { InboxItem } from './inbox';
import { financialReview, type FinancialReview } from './financial-review';

export const REVIEW_FILTERS = { all: 'All transactions', category: 'Categorisation required', missing: 'Missing information', type: 'Financial type confirmation', conflict: 'Possible duplicates', ready: 'Suggested corrections' } as const;
export type ReviewFilter = keyof typeof REVIEW_FILTERS;

/** Only required saved fields create issues. Personal ownership never implies responsibility. */
export function centreReview(items: InboxItem[], transactions: Expense[], accounts: Account[], categories: string[]) {
  const augmented = [...items];
  for (const e of transactions) {
    const missing: string[] = [];
    if (!accounts.some(a => a.id === e.accountId && !a.archived)) missing.push('Source account');
    if (['business', 'official'].includes(e.scope) && !e.department?.trim() && !e.workspaceAllocations?.length) missing.push('Organisation');
    if (!e.paymentMethod) missing.push('Payment method');
    for (const field of missing) augmented.push({ key: `required:${field}:${e.id}`, type: 'missing_details', transactionId: e.id, title: e.title, description: `${field} requires confirmation`, amount: e.amount, date: e.date, accountName: null, priority: 'medium', action: `Confirm ${field.toLowerCase()}` });
  }
  return financialReview(augmented, transactions, accounts, categories);
}

export function matchesReview(row: FinancialReview, filter: ReviewFilter) {
  if (filter === 'all') return true;
  if (filter === 'category') return row.issues.some(i => i.type === 'uncategorised');
  if (filter === 'missing') return row.group === 'missing' || row.issues.some(i => i.type === 'missing_details');
  if (filter === 'type') return !!row.suggestedType || row.group === 'type';
  if (filter === 'conflict') return row.group === 'conflict';
  return !!row.suggestedCategory || !!row.suggestedType;
}

export function reviewCounts(rows: FinancialReview[]) {
  const unique = [...new Map(rows.map(r => [r.transaction.id, r])).values()];
  const issues = unique.map(r => new Set([...r.issues.map(i => i.key), ...(r.suggestedType ? [`type:${r.transaction.id}`] : [])]).size);
  return { transactions: unique.length, issues: issues.reduce((a, b) => a + b, 0), multiple: issues.filter(n => n > 1).length,
    category: unique.filter(r => matchesReview(r, 'category')).length, missing: unique.filter(r => matchesReview(r, 'missing')).length,
    type: unique.filter(r => matchesReview(r, 'type')).length, conflict: unique.filter(r => matchesReview(r, 'conflict')).length };
}

export function selectReviewIds(previous: Iterable<string>, rows: FinancialReview[]) {
  return new Set([...previous, ...rows.map(r => r.transaction.id)]);
}

export function selectedReviewSummary(rows: FinancialReview[]) {
  const entries = [...new Map(rows.map(r => [r.transaction.id, r.transaction])).values()];
  return { count: entries.length, total: Math.round(entries.reduce((sum, e) => sum + e.amount, 0) * 100) / 100,
    accounts: new Set(entries.map(e => e.accountId ?? 'Unknown')).size,
    organisations: [...new Set(entries.map(e => e.department || 'Unknown'))], types: [...new Set(entries.map(e => e.txnType ?? 'expense'))],
    missing: rows.filter(r => matchesReview(r, 'missing')).length, conflicts: rows.filter(r => matchesReview(r, 'conflict')).length };
}