import { type Expense, type ExpenseInput, type Scope, type StatementLine } from './expenses';
import { classifyStatementLine, type StatementContext } from './statement-auto';
import { bankRef, fingerprintLines } from './statement-fingerprint';
import { accountBalance, isLiability, type Account } from './ledger';

export const HISTORICAL_START = '2026-04-01';
export const REVIEW_GROUPS = ['Ready to approve', 'Suggested classification', 'Needs your decision', 'Possible duplicates', 'Transfers and settlements', 'Unmatched or uncertain'] as const;
export interface ImportProposal extends ExpenseInput { reviewed?: boolean; categoryConfirmed?: boolean; duplicateOverride?: boolean; reimbursable?: boolean; organisation?: string; subcategory?: string; reimbursementOrganisation?: string }
export interface ImportRuleConditions { description?: string; direction?: 'debit' | 'credit'; currency?: string; minAmount?: number; maxAmount?: number }
export interface ImportRule { id: string; merchant: string; account_id: string | null; mappings: Partial<ImportProposal>; enabled: boolean; conditions?: ImportRuleConditions; priority?: number }
export interface ImportRow { id: string; fingerprint: string; line: StatementLine; proposal: ImportProposal; review_group: string; confidence: string; decision: 'review' | 'approved' | 'excluded'; duplicate_kind: 'new' | 'exact' | 'likely' | 'possible'; duplicate_id: string | null }
export interface ImportBatch { id: string; account_id: string; file_name: string; file_path: string; currency: string; status: string; error: string | null; period_from: string | null; period_to: string | null; opening_balance: number | null; closing_balance: number | null; source_balances?: import('./balance-verification').BalanceEvidence; balance_verification?: import('./balance-verification').BalanceReview; statement_identity?: import('./statement-evidence').StatementIdentity[]; statement_review?: import('./statement-evidence').StatementReview; allow_ai?:boolean; next_page?:number; total_pages?:number|null }

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

/** Conditions compare original statement values, never converted ledger amounts. */
export function importRuleMatches(rule: ImportRule, line: StatementLine, accountId: string | null | undefined, currency: string): boolean {
  const c = rule.conditions ?? {};
  if (!rule.enabled || (rule.account_id && rule.account_id !== accountId) || merchantFamily(rule.merchant) !== merchantFamily(line.description)) return false;
  if (c.description && !line.description.normalize('NFKC').toLocaleLowerCase().includes(c.description.normalize('NFKC').toLocaleLowerCase())) return false;
  if (c.direction && c.direction !== (line.direction ?? 'debit')) return false;
  if (c.currency && c.currency.toUpperCase() !== currency.toUpperCase()) return false;
  if (c.minAmount !== undefined && (!Number.isFinite(c.minAmount) || c.minAmount < 0 || line.amount < c.minAmount)) return false;
  if (c.maxAmount !== undefined && (!Number.isFinite(c.maxAmount) || c.maxAmount < 0 || line.amount > c.maxAmount)) return false;
  return true;
}

/** Even malformed stored mappings cannot grant approval or change source identity/money. */
export function safeImportRuleMappings(p: Partial<ImportProposal>): Partial<ImportProposal> {
  const allowed = ['category', 'scope', 'organisation', 'subcategory', 'tags', 'txnType', 'reimbursable', 'reimbursementOrganisation'] as const;
  const result = Object.fromEntries(allowed.filter(key => p[key] !== undefined).map(key => [key, p[key]])) as Partial<ImportProposal>;
  if (result.txnType && !['expense','income','refund','transfer','card_payment','loan_repayment','investment','reimbursement','advance','advance_settlement'].includes(result.txnType)) delete result.txnType;
  if (result.tags) result.tags = [...new Set(result.tags.filter(t => typeof t === 'string' && !/^Trip:/i.test(t)))];
  return result;
}

export function matchingImportRules(rules: ImportRule[], line: StatementLine, accountId: string | null | undefined, currency: string) {
  const matches = rules.filter(rule => importRuleMatches(rule, line, accountId, currency));
  const priority = Math.max(0, ...matches.map(rule => rule.priority ?? 0));
  const top = matches.filter(rule => (rule.priority ?? 0) === priority);
  const key = (rule: ImportRule) => JSON.stringify(Object.entries(safeImportRuleMappings(rule.mappings)).sort(([a],[b]) => a.localeCompare(b)));
  return { matches, top, conflict: new Set(top.map(key)).size > 1 };
}

export function stageImport(lines: StatementLine[], ctx: StatementContext, rules: ImportRule[], known: Set<string>): Omit<ImportRow, 'id'>[] {
  const fingerprints = fingerprintLines(lines, ctx.accountId ?? '');
  return lines.map((line, i) => {
    const draft = classifyStatementLine(line, ctx);
    const { top, conflict } = matchingImportRules(rules, line, ctx.accountId, ctx.currency);
    const mapped = !conflict && top[0] ? safeImportRuleMappings(top[0].mappings) : undefined;
    const proposal: ImportProposal = { title: draft.title, merchant: draft.merchant, category: draft.category, scope: draft.scope, memberId: null, amount: line.amount, currency: ctx.currency, date: line.date, paymentMethod: draft.paymentMethod, txnType: draft.txnType, accountId: draft.accountId, toAccountId: draft.toAccountId ?? null, description: line.description, tags: [], ...mapped };
    if (draft.txnType === 'card_payment') { proposal.txnType = 'card_payment'; proposal.accountId = draft.accountId; proposal.toAccountId = draft.toAccountId ?? null; }
    // Rule mappings can only enrich classifications, never change source money or date.
    proposal.amount = line.amount; proposal.date = line.date; proposal.currency = ctx.currency;
    const fingerprint = fingerprints[i] ?? '';
    const duplicate = draft.existingPaymentId ? { kind: 'exact' as const, id: draft.existingPaymentId } : known.has(fingerprint) ? { kind: 'exact' as const, id: null } : duplicateOf(line, ctx.accountId ?? '', ctx.currency, ctx.transactions);
    const group = duplicate.kind !== 'new' ? REVIEW_GROUPS[3] : ['transfer', 'card_payment'].includes(draft.txnType) ? REVIEW_GROUPS[4] : conflict || /confirm it is income/.test(draft.reason) ? REVIEW_GROUPS[2] : draft.uncertain && !mapped ? REVIEW_GROUPS[5] : mapped ? REVIEW_GROUPS[0] : REVIEW_GROUPS[1];
    return { line, fingerprint, proposal, review_group: group, confidence: mapped && !conflict ? 'high' : draft.uncertain ? 'low' : 'medium', decision: 'review', duplicate_kind: duplicate.kind, duplicate_id: duplicate.id };
  });
}

export function postingBlockers(row: ImportRow, accounts: Account[], today: string, statement?: Pick<ImportBatch, 'account_id' | 'currency'>): string[] {
  const p = row.proposal, out: string[] = [];
  if (statement) {
    if (p.amount !== row.line.amount || p.date !== row.line.date || p.currency !== statement.currency) out.push('Source amount, date and currency must remain unchanged');
    if (p.accountId !== statement.account_id && p.toAccountId !== statement.account_id) out.push('Entry must involve the statement account');
    if (row.line.direction === 'credit' && p.txnType === 'income' && accounts.some(a => a.id === statement.account_id && a.kind === 'credit_card')) out.push('Credit-card credits are repayments or refunds, never income');
    if (['transfer','card_payment','loan_repayment','investment'].includes(p.txnType ?? '') && (row.line.direction === 'credit' ? p.toAccountId !== statement.account_id : p.accountId !== statement.account_id)) out.push('Transfer direction must match statement');
  }
  if (!accounts.some(a => a.id === p.accountId && !a.archived)) out.push('Confirm payment account');
  if (!p.date || p.date < HISTORICAL_START || p.date > today) out.push('Date must be from 1 April 2026 through today');
  if (!Number.isFinite(p.amount) || p.amount <= 0) out.push('Confirm a positive amount');
  if (!p.title?.trim() || !p.category?.trim()) out.push('Confirm title and category');
  if (/miscellaneous\s*[—–-]\s*check/i.test(p.category ?? '')) out.push('Choose a final category');
  if (/^miscellaneous$/i.test(p.category?.trim() ?? '') && !p.categoryConfirmed) out.push('Explicitly confirm Miscellaneous as the final category');
  if (row.duplicate_kind === 'exact') out.push('Already imported');
  if (['likely','possible'].includes(row.duplicate_kind) && !p.duplicateOverride) out.push('Confirm this is a separate payment');
  if (['transfer','card_payment','loan_repayment','investment'].includes(p.txnType ?? '') && (!p.toAccountId || p.accountId === p.toAccountId || !accounts.some(a => a.id === p.toAccountId && !a.archived))) out.push('Confirm destination account');
  if (p.txnType === 'card_payment' && !accounts.some(a => a.id === p.toAccountId && !a.archived && a.kind === 'credit_card')) out.push('Card payment destination must be a credit-card account');
  if (!p.reviewed) out.push('Review classification');
  return out;
}

export function classificationStatus(row: ImportRow): 'Verified' | 'Suggested' | 'Needs review' {
  const p = row.proposal;
  if (/miscellaneous\s*[—–-]\s*check/i.test(p.category ?? '') || (/^miscellaneous$/i.test(p.category?.trim() ?? '') && !p.categoryConfirmed)) return 'Needs review';
  if (p.reviewed) return 'Verified';
  if (row.confidence === 'low' || ['Needs your decision', 'Unmatched or uncertain'].includes(row.review_group)) return 'Needs review';
  return 'Suggested';
}

/** Bulk patches enrich tags; they never erase existing tags or source money. */
export function mergeImportPatch(proposal: ImportProposal, patch: Partial<ImportProposal>): ImportProposal {
  return { ...proposal, ...patch, tags: [...new Set([...(proposal.tags ?? []), ...(patch.tags ?? [])])] };
}

export function importSelectionSummary(rows: ImportRow[], accounts: Account[], today: string, statement?: Pick<ImportBatch, 'account_id' | 'currency'>) {
  const eligible = rows.filter(r => r.decision === 'approved' && postingBlockers(r, accounts, today, statement).length === 0);
  const types = new Map<string, { count: number; amount: number }>();
  for (const row of eligible) {
    const key = row.proposal.txnType ?? 'expense', old = types.get(key) ?? { count: 0, amount: 0 };
    types.set(key, { count: old.count + 1, amount: Math.round((old.amount + row.line.amount) * 100) / 100 });
  }
  return { selected: rows.length, eligible, requiresReview: rows.filter(r => r.duplicate_kind !== 'exact' && !eligible.includes(r)).length, duplicates: rows.filter(r => r.duplicate_kind === 'exact').length, types: [...types].map(([type, totals]) => ({ type, ...totals })) };
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
/** Pre-confirmation reconciliation summary. Pure: never creates adjustments or entries. */
export function importReconciliationSummary(input: { opening: number | null; closing: number | null; sourceOpening?: number | null; sourceClosing?: number | null; rows: ImportRow[]; posted: Set<string>; importingIds: Set<string>; liability: boolean }) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const sign = (l: StatementLine) => (l.direction === 'credit' ? 1 : -1) * (input.liability ? -1 : 1);
  const credits = r2(input.rows.filter(r => r.line.direction === 'credit').reduce((s, r) => s + r.line.amount, 0));
  const debits = r2(input.rows.filter(r => r.line.direction !== 'credit').reduce((s, r) => s + r.line.amount, 0));
  const statement = reconcileStatement(input.opening, input.closing, input.rows.map(r => r.line), input.liability);
  const recordedRows = input.rows.filter(r => input.posted.has(r.fingerprint) || input.importingIds.has(r.id));
  const recordedMovement = r2(recordedRows.reduce((s, r) => s + sign(r.line) * r.line.amount, 0));
  const notImported = input.rows.filter(r => !input.posted.has(r.fingerprint) && !input.importingIds.has(r.id));
  const notImportedMovement = r2(statement.movement - recordedMovement);
  const balanceAfterImport = input.opening == null ? null : r2(input.opening + recordedMovement);
  const discrepancies: string[] = [];
  if (input.opening == null) discrepancies.push('Opening balance is missing');
  if (input.closing == null) discrepancies.push('Closing balance is missing');
  if (statement.difference != null && !statement.verified) discrepancies.push(`Statement lines do not add up: closing differs from opening plus lines by ${statement.difference}`);
  if (input.sourceOpening != null && input.opening != null && Math.abs(input.sourceOpening - input.opening) >= 0.01) discrepancies.push(`Opening balance differs from the statement's printed opening by ${r2(input.opening - input.sourceOpening)}`);
  if (input.sourceClosing != null && input.closing != null && Math.abs(input.sourceClosing - input.closing) >= 0.01) discrepancies.push(`Closing balance differs from the statement's printed closing by ${r2(input.closing - input.sourceClosing)}`);
  if (notImported.length) discrepancies.push(`${notImported.length} line${notImported.length === 1 ? '' : 's'} will remain unimported (net ${notImportedMovement})`);
  return { credits, debits, movement: statement.movement, expectedClosing: statement.importedBalance, difference: statement.difference, linesBalance: statement.verified, recordedCount: recordedRows.length, recordedMovement, balanceAfterImport, notImportedCount: notImported.length, notImportedMovement, discrepancies };
}

export type ReadinessState = 'reading' | 'failed' | 'not_started' | 'blocked' | 'waiting' | 'ready' | 'reconciled';
export interface ReadinessCheck { label: string; ok: boolean }
/** Explains, in priority order, why a statement's reconciliation is or isn't ready. rows=null when lines aren't loaded. Pure, never saves. */
export function reconciliationReadiness(batch: ImportBatch, rows: ImportRow[] | null, posted: Set<string>, liability: boolean, currency = (n: number) => String(n)): { state: ReadinessState; title: string; reason: string; checks: ReadinessCheck[] } {
  if (['queued', 'processing'].includes(batch.status)) return { state: 'reading', title: 'Still reading', reason: `The statement is still being processed${batch.total_pages ? ` (page ${batch.next_page ?? 0} of ${batch.total_pages})` : ''}.`, checks: [] };
  if (['failed', 'paused', 'refused'].includes(batch.status)) return { state: 'failed', title: 'Failed', reason: batch.error ?? 'Processing stopped. Use Retry processing.', checks: [] };
  const identity = !!batch.statement_review?.identity?.confirmed;
  const s = importReconciliationSummary({ opening: batch.opening_balance, closing: batch.closing_balance, sourceOpening: batch.source_balances?.opening?.value ?? null, sourceClosing: batch.source_balances?.closing?.value ?? null, rows: rows ?? [], posted, importingIds: new Set(), liability });
  const so = batch.source_balances?.opening?.value, sc = batch.source_balances?.closing?.value;
  const od = so != null && batch.opening_balance != null ? Math.round((batch.opening_balance - so) * 100) / 100 : 0;
  const cd = sc != null && batch.closing_balance != null ? Math.round((batch.closing_balance - sc) * 100) / 100 : 0;
  const missing = [batch.opening_balance == null && 'opening', batch.closing_balance == null && 'closing'].filter(Boolean) as string[];
  const checks: ReadinessCheck[] = [{ label: 'Account confirmed', ok: identity }, { label: 'Opening and closing balances entered', ok: !missing.length }, { label: 'Entered balances match printed balances', ok: od === 0 && cd === 0 }];
  if (rows) checks.push({ label: 'Lines add up to closing balance', ok: !missing.length && s.linesBalance }, { label: 'All lines approved or imported', ok: s.notImportedCount === 0 });
  const verified = !!batch.balance_verification?.checkedOriginal;
  checks.push({ label: 'Balances checked against original', ok: verified });
  const r = (state: ReadinessState, title: string, reason: string) => ({ state, title, reason, checks });
  if (!identity) return r('not_started', 'Not started: account not confirmed', 'Confirm which account this statement belongs to.');
  if (missing.length) return r('not_started', 'Not started: balances missing', `Enter the ${missing.join(' and ')} balance.`);
  if (od !== 0 || cd !== 0) return r('blocked', 'Blocked: printed balance differs', `Entered balance differs from the one printed on the statement by ${currency(od !== 0 ? od : cd)}.`);
  if (!rows) return r('waiting', 'Open to check lines', 'Open this statement to check its lines against the balances.');
  if (!s.linesBalance) return r('blocked', "Blocked: lines don't add up", `Closing differs from opening plus lines by ${currency(s.difference ?? 0)}. Check for missing or extra lines.`);
  if (s.notImportedCount) return r('waiting', 'Waiting: lines still in review', `${s.notImportedCount} line${s.notImportedCount === 1 ? ' is' : 's are'} not yet approved or imported.`);
  if (verified) return r('reconciled', 'Reconciled', `Checked on ${batch.balance_verification!.reviewedAt.slice(0, 10)}.`);
  return r('ready', 'Ready to reconcile', 'Account confirmed, balances entered and lines add up. Check balances against the original to finish.');
}
