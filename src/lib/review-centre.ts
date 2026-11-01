import type { Expense } from './expenses';
import type { Account } from './ledger';
import type { InboxItem } from './inbox';
import { categoryReviewPreview, financialReview, type FinancialReview } from './financial-review';
import { cashflow } from './ledger';

export const REVIEW_FILTERS = { all: 'All transactions', category: 'Categorisation required', missing: 'Missing information', type: 'Financial type confirmation', conflict: 'Possible duplicates', ready: 'Suggested corrections', confirmable:'Ready to Confirm' } as const;
export type ReviewFilter = keyof typeof REVIEW_FILTERS;
export const MISSING_FIELDS = { all: 'All missing fields', category: 'Category', account: 'Source account', organisation: 'Organisation', type: 'Financial type', payment: 'Payment method', receiving: 'Receiving account', other: 'Other required details' } as const;
export type MissingField = keyof typeof MISSING_FIELDS;
export function missingFieldMatches(row: FinancialReview, field: MissingField) {
  if (field === 'all') return true;
  if (field === 'category') return matchesReview(row, 'category');
  if (field === 'type') return matchesReview(row, 'type');
  if (field === 'account') return row.issues.some(i => /source account|no account recorded/i.test(i.description));
  if (field === 'organisation') return row.issues.some(i => /organisation requires/i.test(i.description));
  if (field === 'payment') return row.issues.some(i => /payment method requires/i.test(i.description));
  if (field === 'receiving') return row.evidence.some(i => /receiving account requires/i.test(i));
  return row.issues.some(i => i.type === 'unverified_import' || i.type === 'inconsistency');
}

/** Only required saved fields create issues. Personal ownership never implies responsibility. */
export function centreReview(items: InboxItem[], transactions: Expense[], accounts: Account[], categories: string[]) {
  const augmented = [...items];
  for (const e of transactions) {
    const missing: string[] = [];
    if (!accounts.some(a => a.id === e.accountId && !a.archived) && !items.some(i => i.transactionId === e.id && i.type === 'missing_details' && /account/i.test(i.description))) missing.push('Source account');
    if (['business', 'official'].includes(e.scope) && !e.department?.trim() && !e.workspaceAllocations?.length) missing.push('Organisation');
    if (!e.paymentMethod) missing.push('Payment method');
    if (['transfer','card_payment','loan_repayment','investment'].includes(e.txnType??'expense') && (!e.toAccountId || e.toAccountId===e.accountId || !accounts.some(a=>a.id===e.toAccountId&&!a.archived)) && !items.some(i=>i.transactionId===e.id&&i.type==='missing_details'&&/receiving account/i.test(i.description))) missing.push('Receiving account');
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
  if (filter === 'confirmable') return confirmableImportRows([row]).length>0;
  return !!row.suggestedCategory || !!row.suggestedType;
}

export function reviewCounts(rows: FinancialReview[]) {
  const unique = [...new Map(rows.map(r => [r.transaction.id, r])).values()];
  const issues = unique.map(r => new Set([...r.issues.map(i => i.key), ...(r.suggestedType ? [`type:${r.transaction.id}`] : []), ...(r.suggestedCategory && !r.issues.some(i => i.type === 'uncategorised') ? [`category:${r.transaction.id}`] : []), ...(r.group === 'conflict' && !r.issues.some(i => ['duplicate','inconsistency'].includes(i.type)) ? [`conflict:${r.transaction.id}`] : [])]).size);
  return { transactions: unique.length, issues: issues.reduce((a, b) => a + b, 0), multiple: issues.filter(n => n > 1).length,
    category: unique.filter(r => matchesReview(r, 'category')).length, missing: unique.filter(r => matchesReview(r, 'missing')).length,
    type: unique.filter(r => matchesReview(r, 'type')).length, conflict: unique.filter(r => matchesReview(r, 'conflict')).length,
    ready: confirmableImportRows(unique).length };
}

export function selectReviewIds(previous: Iterable<string>, rows: FinancialReview[]) {
  return new Set([...previous, ...rows.map(r => r.transaction.id)]);
}

export function selectedReviewSummary(rows: FinancialReview[]) {
  const entries = [...new Map(rows.map(r => [r.transaction.id, r.transaction])).values()];
  const flow=cashflow(entries);
  return { count: entries.length, total: Math.round(entries.reduce((sum, e) => sum + e.amount, 0) * 100) / 100,
    amounts:{expenses:flow.spent,income:flow.income,transfers:entries.filter(e=>e.txnType==='transfer').reduce((s,e)=>s+e.amount,0),settlements:entries.filter(e=>e.txnType==='card_payment').reduce((s,e)=>s+e.amount,0)},
    accounts: new Set(entries.map(e => e.accountId ?? 'Unknown')).size,
    organisations: [...new Set(entries.map(e => e.department || 'Unknown'))], types: [...new Set(entries.map(e => e.txnType ?? 'expense'))],
    missing: rows.filter(r => matchesReview(r, 'missing')).length, conflicts: rows.filter(r => matchesReview(r, 'conflict')).length };
}

export function centreCategoryPreview(rows: FinancialReview[], category: string) {
  const eligible: FinancialReview[] = [], excluded: { id: string; title: string; reason: string }[] = [];
  for (const row of rows) {
    try { categoryReviewPreview([row], category); eligible.push(row); }
    catch (e) { excluded.push({ id: row.transaction.id, title: row.transaction.title, reason: e instanceof Error ? e.message : 'Individual review required' }); }
  }
  const preview = categoryReviewPreview(eligible, category);
  return { ...preview, selectedCount: rows.length, excluded, remainingIssues: rows.reduce((sum,row)=>sum+reviewCounts([{...row,issues:row.issues.filter(i=>i.type!=='uncategorised'||!eligible.includes(row)),suggestedCategory:eligible.includes(row)?undefined:row.suggestedCategory}]).issues,0) };
}
/** Rows whose only open issue is an unconfirmed statement import, with no suggested change or conflict. */
export function confirmableImportRows(rows: FinancialReview[]) {
  return rows.filter(r => r.issues.length > 0 && r.issues.every(i => i.type === 'unverified_import') && !r.suggestedType && !r.suggestedCategory && r.group === 'ready');
}
