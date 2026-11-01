import { type Expense, type ExpenseInput, type Scope, type StatementLine } from './expenses';
import { classifyStatementLine, type StatementContext } from './statement-auto';
import { bankRef, fingerprintLines } from './statement-fingerprint';
import { accountBalance, isLiability, type Account } from './ledger';

export const HISTORICAL_START = '2026-04-01';
export const REVIEW_GROUPS = ['Ready to approve', 'Suggested classification', 'Needs your decision', 'Possible duplicates', 'Transfers and settlements', 'Unmatched or uncertain'] as const;
export interface ImportProposal extends ExpenseInput { reviewed?: boolean; duplicateOverride?: boolean; reimbursable?: boolean; organisation?: string; subcategory?: string; reimbursementOrganisation?: string }
export interface ImportRule { id: string; merchant: string; account_id: string | null; mappings: Partial<ImportProposal>; enabled: boolean }
export interface ImportRow { id: string; fingerprint: string; line: StatementLine; proposal: ImportProposal; review_group: string; confidence: string; decision: 'review' | 'approved' | 'excluded'; duplicate_kind: 'new' | 'exact' | 'likely' | 'possible'; duplicate_id: string | null }
export interface ImportBatch { id: string; account_id: string; file_name: string; file_path: string; currency: string; status: string; error: string | null; period_from: string | null; period_to: string | null; opening_balance: number | null; closing_balance: number | null; source_balances?: import('./balance-verification').BalanceEvidence; balance_verification?: import('./balance-verification').BalanceReview; allow_ai?:boolean; next_page?:number; total_pages?:number|null }

/** Merchant families are grouping hints, never a permanent category decision. */
export function merchantFamily(description: string): string {
  const text = description.normalize('NFKC').toUpperCase();
  const brand = text.match(/\b(SWIGGY|ZOMATO|AMAZON|FLIPKART|UBER|OLA|INSTAMART|BIGBASKET)\b/);
  if (brand?.[1]) return brand[1] === 'INSTAMART' ? 'SWIGGY' : brand[1];
  return text.replace(/\b(UPI|POS|NEFT|IMPS|RTGS|ORDER|TXN|REF|DR|CR)\b/g, ' ').replace(/\d{5,}/g, '').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Unknown merchant';
}

export function duplicateOf(line: StatementLine, accountId: string, currency: string, transactions: Expense[]) {
  const ref = bankRef(line.description);
  const candidates = transactions.filter(t => {
    const credit = line.direction === 'credit';
    const direction = ['income','refund','reimbursement','advance'].includes(t.txnType ?? 'expense') || t.toAccountId === accountId;
    return (t.accountId === accountId || t.toAccountId === accountId) && credit === direction && t.currency === currency && Math.abs(t.originalAmount - line.amount) < 0.01;
  });
  const exact = candidates.find(t => t.date === line.date && ref && bankRef(t.statementRef ?? t.description) === ref);
  if (exact) return { kind: 'exact' as const, id: exact.id };
  const likely = candidates.find(t => t.date === line.date && merchantFamily(t.merchant ?? t.title) === merchantFamily(line.description));
  if (likely) return { kind: 'likely' as const, id: likely.id };
  const possible = candidates.find(t => Math.abs(Date.parse(t.date) - Date.parse(line.date)) <= 2 * 864e5);
  return possible ? { kind: 'possible' as const, id: possible.id } : { kind: 'new' as const, id: null };
}

export function stageImport(lines: StatementLine[], ctx: StatementContext, rules: ImportRule[], known: Set<string>): Omit<ImportRow, 'id'>[] {
  const fingerprints = fingerprintLines(lines, ctx.accountId ?? '');
  return lines.map((line, i) => {
    const draft = classifyStatementLine(line, ctx);
    const mappings = rules.filter(r => r.enabled && (!r.account_id || r.account_id === ctx.accountId) && merchantFamily(r.merchant) === merchantFamily(line.description));
    const conflict = mappings.length > 1 && new Set(mappings.map(r => JSON.stringify(r.mappings))).size > 1;
    const mapped = !conflict ? mappings[0]?.mappings : undefined;
    const proposal: ImportProposal = { title: draft.title, merchant: draft.merchant, category: draft.category, scope: draft.scope, memberId: null, amount: line.amount, currency: ctx.currency, date: line.date, paymentMethod: draft.paymentMethod, txnType: draft.txnType, accountId: ctx.accountId, toAccountId: null, description: line.description, tags: [], ...mapped };
    // Rule mappings can only enrich classifications, never change source money or date.
    proposal.amount = line.amount; proposal.date = line.date; proposal.currency = ctx.currency;
    const fingerprint = fingerprints[i] ?? '';
    const duplicate = known.has(fingerprint) ? { kind: 'exact' as const, id: null } : duplicateOf(line, ctx.accountId ?? '', ctx.currency, ctx.transactions);
    const group = duplicate.kind !== 'new' ? REVIEW_GROUPS[3] : draft.txnType === 'transfer' ? REVIEW_GROUPS[4] : conflict || /confirm it is income/.test(draft.reason) ? REVIEW_GROUPS[2] : draft.uncertain && !mapped ? REVIEW_GROUPS[5] : mapped ? REVIEW_GROUPS[0] : REVIEW_GROUPS[1];
    return { line, fingerprint, proposal, review_group: group, confidence: mapped && !conflict ? 'high' : draft.uncertain ? 'low' : 'medium', decision: 'review', duplicate_kind: duplicate.kind, duplicate_id: duplicate.id };
  });
}

export function postingBlockers(row: ImportRow, accounts: Account[], today: string): string[] {
  const p = row.proposal, out: string[] = [];
  if (!accounts.some(a => a.id === p.accountId && !a.archived)) out.push('Confirm payment account');
  if (!p.date || p.date < HISTORICAL_START || p.date > today) out.push('Date must be from 1 April 2026 through today');
  if (!Number.isFinite(p.amount) || p.amount <= 0) out.push('Confirm a positive amount');
  if (!p.title?.trim() || !p.category?.trim()) out.push('Confirm title and category');
  if (row.duplicate_kind === 'exact') out.push('Already imported');
  if (['likely','possible'].includes(row.duplicate_kind) && !p.duplicateOverride) out.push('Confirm this is a separate payment');
  if (['transfer','card_payment','loan_repayment','investment'].includes(p.txnType ?? '') && (!p.toAccountId || p.accountId === p.toAccountId || !accounts.some(a => a.id === p.toAccountId))) out.push('Confirm destination account');
  if (!p.reviewed && row.review_group !== REVIEW_GROUPS[0]) out.push('Review classification');
  return out;
}

export function enrichedInput(p: ImportProposal): ExpenseInput {
  const tags = [...new Set([...(p.tags ?? []), ...(p.organisation ? [`Organisation: ${p.organisation}`] : []), ...(p.subcategory ? [`Subcategory: ${p.subcategory}`] : [])])];
  return { ...p, tags, reimbursementStatus: p.reimbursable ? 'pending' : 'none' };
}

export function orientStatementMove(proposal: ImportProposal, direction: StatementLine['direction'], statementAccount: string): ImportProposal {
  if (direction === 'credit' && ['transfer','card_payment','loan_repayment','investment'].includes(proposal.txnType ?? '') && proposal.accountId === statementAccount && proposal.toAccountId) {
    return { ...proposal, accountId: proposal.toAccountId, toAccountId: statementAccount };
  }
  return proposal;
}

/** Opening is the balance BEFORE this period. No adjustment or missing entry is created. */
export function reconcileStatement(opening: number | null, closing: number | null, lines: StatementLine[], liability: boolean) {
  const movement = Math.round(lines.reduce((sum, l) => sum + (l.direction === 'credit' ? 1 : -1) * (liability ? -1 : 1) * l.amount, 0) * 100) / 100;
  const importedBalance = opening == null ? null : Math.round((opening + movement) * 100) / 100;
  const difference = closing == null || importedBalance == null ? null : Math.round((closing - importedBalance) * 100) / 100;
  return { movement, importedBalance, difference, verified: difference != null && Math.abs(difference) < 0.01 };
}

export function coverageMonths(periods: { period_from: string | null; period_to: string | null }[], today: string) {
  const covered = new Set<string>();
  for (const p of periods) if (p.period_from && p.period_to) {
    for (let d = new Date(p.period_from.slice(0,7) + '-01T00:00:00Z'); d.toISOString().slice(0,10) <= p.period_to; d.setUTCMonth(d.getUTCMonth()+1)) covered.add(d.toISOString().slice(0,7));
  }
  const missing: string[] = [];
  for (let d = new Date(HISTORICAL_START + 'T00:00:00Z'); d.toISOString().slice(0,7) <= today.slice(0,7); d.setUTCMonth(d.getUTCMonth()+1)) if (!covered.has(d.toISOString().slice(0,7))) missing.push(d.toISOString().slice(0,7));
  return { covered: [...covered].sort(), missing };
}

export function historicalOpeningFor(account: Account, transactions: Expense[], opening: number, start: string) {
  const earlier = transactions.filter(t => t.date < start);
  return Math.round((opening - accountBalance({ ...account, openingBalance: 0 }, earlier)) * 100) / 100;
}
export { isLiability };
export type { Scope };