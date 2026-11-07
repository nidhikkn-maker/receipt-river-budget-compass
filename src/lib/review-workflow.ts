import type { FinancialReview } from './financial-review';
import { confirmableImportRows, centreCategoryPreview } from './review-centre';

export function selectionScope(selected: Iterable<string>, rows: FinancialReview[], matching: FinancialReview[]) {
  const ids = new Set(selected), matches = new Set(matching.map(r => r.transaction.id)),availableIds=new Set(rows.map(r=>r.transaction.id));
  const available = rows.filter(r => ids.has(r.transaction.id));
  return { total: available.length, matching: available.filter(r => matches.has(r.transaction.id)).length,
    hidden: available.filter(r => !matches.has(r.transaction.id)).length,
    obsolete: [...ids].filter(id => !availableIds.has(id)).length };
}

export function reviewActionEligibility(rows: FinancialReview[]) {
  const categories = new Set(rows.map(r => r.suggestedCategory ?? r.transaction.category).filter(c => c && c !== 'Miscellaneous'));
  // Eligibility is determined by the same validator used by the actual confirmation.
  let category = false;
  for (const value of ['__eligibility__', ...categories]) {
    try { if (centreCategoryPreview(rows, value).records.length) { category = true; break; } } catch { /* no eligible rows */ }
  }
  return { category, confirm: confirmableImportRows(rows).length,
    suggestions: rows.some(r => !!r.suggestedCategory && r.group !== 'conflict'),
    transfers: rows.some(r => ['transfer', 'card_payment'].includes(r.suggestedType ?? r.transaction.txnType ?? 'expense')) };
}

export function reviewStatus(row: FinancialReview) {
  if (row.group === 'conflict') return 'Exception';
  if (row.issues.some(i => i.type === 'unverified_import') && (row.transaction.correctionRevision ?? 0) > 0) return 'Reopened';
  if (confirmableImportRows([row]).length || row.suggestedCategory || row.suggestedType) return 'Ready to Confirm';
  return 'Needs Review';
}