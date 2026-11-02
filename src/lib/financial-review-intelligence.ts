import type { Expense } from './expenses';
import type { FinancialReview } from './financial-review';
import { matchingImportRules, safeImportRuleMappings, type ImportRule } from './historical-import';
import { detectSubscriptions, type Commitment } from './planning';

const merchantKey = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const directionOf = (e: Expense) => ['income', 'refund', 'reimbursement', 'advance'].includes(e.txnType ?? 'expense') ? 'credit' as const : 'debit' as const;

/** Existing user rules are proposals only. Responsibility mismatch never changes eligibility. */
export function applyReviewRules(rows: FinancialReview[], rules: ImportRule[], activeCategories: string[]): FinancialReview[] {
  return rows.map(row => {
    const e = row.transaction;
    if (row.group === 'conflict' || !(e.description ?? '').trim()) return row;
    const match = matchingImportRules(rules, { ref: e.id, date: e.date, description: e.description, amount: e.originalAmount, direction: directionOf(e) }, e.accountId, e.currency);
    if (match.conflict) return { ...row, group: 'conflict', status: 'Unresolved', confidence: 'low', evidence: [...row.evidence, 'Saved classification rules disagree at the same priority; choose a treatment manually.'] };
    const rule = match.top[0];
    if (!rule) return row;
    const mapping = safeImportRuleMappings(rule.mappings);
    const type = mapping.txnType ?? e.txnType ?? 'expense';
    if (type !== (e.txnType ?? 'expense')) return { ...row, group: 'type', status: 'Suggested Correction', confidence: 'medium', suggestedType: type, evidence: [...row.evidence, `Confirmed rule “${rule.merchant}” proposes ${type}. Financial type and both accounts still require review.`] };
    const responsibilityMismatch = (mapping.scope && mapping.scope !== e.scope) ||
      (mapping.organisation !== undefined && mapping.organisation !== (e.department ?? '')) ||
      mapping.reimbursable === true || !!mapping.reimbursementOrganisation || e.workspaceAllocations?.length;
    if (responsibilityMismatch) return { ...row, evidence: [...row.evidence, `Rule “${rule.merchant}” has different workspace, organisation or reimbursement treatment. It cannot approve this category alone.`] };
    const category = mapping.category;
    if (!category || category === 'Miscellaneous' || !activeCategories.includes(category) || row.suggestedType || row.group !== 'category' || e.allocations?.length) return row;
    return { ...row, group: 'ready', status: 'Suggested Correction', confidence: 'high', suggestedCategory: category,
      evidence: [...row.evidence, `Confirmed rule “${rule.merchant}” matches the original narration, account, currency and amount conditions. No record is changed until you confirm.`] };
  });
}

export interface ReviewCohort { key: string; label: string; rows: FinancialReview[]; cadence: number | null; profileIds: string[]; changedAmount: boolean }
/** Separate ownership, financial type and claim treatment; repeats are never removed. */
export function reviewCohorts(rows: FinancialReview[], commitments: Commitment[]): ReviewCohort[] {
  const buckets = new Map<string, FinancialReview[]>();
  for (const row of rows) {
    const e = row.transaction;
    if (!e.merchant || !merchantKey(e.merchant) || /^(upi|imps|neft|payment|transfer)$/.test(merchantKey(e.merchant))) continue;
    const key = JSON.stringify([merchantKey(e.merchant), e.accountId, e.currency, e.txnType ?? 'expense', e.scope, e.department ?? '', e.memberId, e.reimbursementStatus ?? 'none', e.reimbursement?.payer ?? '', e.reimbursement?.reimbursable ?? null, e.workspaceAllocations ?? [], row.group, row.suggestedCategory ?? e.category]);
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }
  return [...buckets.entries()].filter(([, list]) => list.length >= 2).map(([key, list]) => {
    const first = list[0]?.transaction;
    const datesUnique = new Set(list.map(r => r.transaction.date)).size === list.length;
    const candidate = datesUnique && first?.txnType !== 'income' && (first?.txnType ?? 'expense') === 'expense'
      ? detectSubscriptions(list.map(r => ({ merchant: 'cohort', amount: r.transaction.originalAmount, date: r.transaction.date })))[0] : undefined;
    const profiles = commitments.filter(c => c.kind === 'subscription' && c.status === 'active' && c.accountId === first?.accountId && merchantKey(c.name) === merchantKey(first?.merchant ?? ''));
    return { key, label: first?.merchant ?? 'Merchant', rows: list, cadence: candidate?.everyDays ?? null, profileIds: profiles.map(c => c.id), changedAmount: candidate?.increased ?? false };
  });
}

/** Seeds the existing reviewed rule editor; no approval/source identifiers are writable. */
export function reviewRuleSeed(e: Expense, category: string): ImportRule {
  if (!e.merchant?.trim() || /^(upi|imps|neft|payment|transfer)$/i.test(e.merchant.trim())) throw Error('Choose a confirmed merchant before remembering a rule.');
  if (!e.accountId) throw Error('Confirm the account before remembering a rule.');
  if (!category || category === 'Miscellaneous') throw Error('Choose a specific category first.');
  if ((e.txnType ?? 'expense') !== 'expense' || e.workspaceAllocations?.length || e.allocations?.length) throw Error('Use individual rule conditions for mixed or non-expense records.');
  return { id: 'preview', enabled: true, merchant: e.merchant, account_id: e.accountId, priority: 0,
    conditions: { currency: e.currency, direction: 'debit', ...(e.description ? { description: e.description } : {}) },
    mappings: { category, scope: e.scope, organisation: e.department ?? '', txnType: 'expense' } };
}