import type { Expense } from "./expenses";
import { accountBalance, isLiability, type Account } from "./ledger";
import type { FinancePreferences } from "./preferences";
import type { ImportBatch, ImportRow } from "./historical-import";
import { verifyHistoricalBalances } from "./balance-verification";
export interface StatementStatusEvidence { batch: ImportBatch; rows: ImportRow[]; posted: { fingerprint: string; transaction_id: string; posted_at: string }[] }
const validDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s));

/** Account identity is the reviewed account selection, not filename inference. Import readiness is not reconciliation. */
export function accountStatementStatus(account: Account, evidence: StatementStatusEvidence[], transactions: Expense[], preferences: FinancePreferences, today: string) {
  const mine = evidence.filter(s => s.batch.account_id === account.id);
  const ordered = [...mine].sort((a, b) => (b.batch.period_to ?? "").localeCompare(a.batch.period_to ?? ""));
  const latest = ordered[0];
  const successful = ordered.find(s => s.batch.status === "review");
  const batch = latest?.batch;
  const periodValid = !!batch && validDate(batch.period_from) && validDate(batch.period_to) && batch.period_from <= batch.period_to && batch.period_to <= today && !!latest && latest.rows.every(r => r.line.date >= (batch.period_from ?? "") && r.line.date <= (batch.period_to ?? ""));
  const review = batch?.balance_verification;
  const coverageConfirmed = periodValid && !!review?.checkedOriginal && !!review.sourceReference?.trim() && validDate(review.reviewedAt?.slice(0, 10));
  const policy = preferences.freshness.perAccount[account.id] ?? preferences.freshness;
  const days = coverageConfirmed && batch?.period_to ? Math.floor((Date.parse(today) - Date.parse(batch.period_to)) / 86400000) : null;
  const freshness = days == null ? "Unknown" : days <= policy.reviewDays ? "Current" : days <= policy.outdatedDays ? "Becoming Outdated" : "Outdated";
  const rows = latest?.rows ?? [];
  const postMap = new Map((latest?.posted ?? []).map(p => [p.fingerprint, p]));
  const matched = rows.filter(r => {
    const post = postMap.get(r.fingerprint);
    const t = transactions.find(t => t.id === (post?.transaction_id ?? (r.duplicate_kind === "exact" ? r.duplicate_id : null)));
    if (!t || t.currency !== batch?.currency || t.date !== r.line.date || Math.abs(t.originalAmount - r.line.amount) >= 0.005) return false;
    const incoming = ["income", "refund", "reimbursement", "advance"].includes(t.txnType ?? "expense") && t.accountId === account.id || t.toAccountId === account.id;
    return r.line.direction === "credit" ? incoming : t.accountId === account.id && !incoming;
  });
  const unresolved = rows.length - matched.length;
  const postedCount = rows.filter(r => postMap.has(r.fingerprint)).length;
  const duplicates = rows.filter(r => r.duplicate_kind === "exact").length;
  const imported = !batch ? "Not Imported" : ["queued", "processing"].includes(batch.status) ? "Importing" : batch.status === "review" ? "Imported" : "Import Failed";
  const closing = review?.sourceClosing;
  const usableBalance = coverageConfirmed && typeof closing === "number" && Number.isFinite(closing) && batch?.closing_balance != null && Math.abs(Number(batch.closing_balance) - closing) < 0.005;
  const ledgerClosing = batch?.period_to ? accountBalance(account, transactions.filter(t => t.date <= (batch.period_to ?? ""))) : null;
  const difference = usableBalance && ledgerClosing != null && batch?.currency === "INR" ? Math.round((closing - ledgerClosing) * 100) / 100 : null;
  const balance = !usableBalance ? "Not Verified" : batch?.currency !== "INR" ? "Verification Unavailable" : difference === 0 ? "Verified" : "Difference Found";
  const check = batch && latest && periodValid ? verifyHistoricalBalances({ opening: batch.opening_balance == null ? null : Number(batch.opening_balance), closing: batch.closing_balance == null ? null : Number(batch.closing_balance), sourceOpening: review?.sourceOpening ?? null, sourceClosing: review?.sourceClosing ?? null, checkedOriginal: review?.checkedOriginal ?? false, reference: review?.sourceReference ?? "", lines: rows.map(r => r.line), liability: isLiability(account.kind), ledgerOpening: batch.currency === "INR" ? accountBalance(account, transactions.filter(t => t.date < (batch.period_from ?? ""))) : null, ledgerClosing: batch.currency === "INR" ? ledgerClosing : null, unresolved }) : null;
  const reconciliation = !latest || !rows.length ? "Not Started" : batch?.status !== "review" ? "Requires Review" : unresolved ? matched.length ? "In Progress" : "Requires Review" : check?.fullyReconciled ? "Reconciled" : difference !== null && difference !== 0 || check?.difference != null && check.difference !== 0 ? "Differences Found" : "Requires Review";
  const missing = [!coverageConfirmed ? "Statement coverage has not been confirmed against the original." : "", !usableBalance ? "A reviewed closing balance is missing." : "", unresolved ? `${unresolved} statement rows are not matched to current ledger entries.` : "", batch?.currency !== "INR" && batch ? "Original-currency comparison with the INR ledger is unavailable." : "", !batch ? "No historical import is linked to this account." : ""].filter(Boolean);
  return { accountId: account.id, name: account.name, batchId: batch?.id, imported, statementThrough: coverageConfirmed ? batch?.period_to ?? null : null, periodFrom: batch?.period_from ?? null, periodTo: batch?.period_to ?? null, freshness, reconciliation, balance, difference, confirmedBalance: balance === "Verified" ? closing ?? null : null, reconciliationDate: reconciliation === "Reconciled" ? review?.reviewedAt ?? null : null, lastSuccessfulImport: successful?.batch.file_name ?? null, parsed: rows.length, posted: postedCount, duplicates, unresolved, matched: matched.length, missing, attention: imported !== "Imported" || freshness !== "Current" || reconciliation !== "Reconciled" || balance !== "Verified" };
}
export function accountStatementSummary(rows: ReturnType<typeof accountStatementStatus>[]) {
  return { total: rows.length, current: rows.filter(r => r.freshness === "Current").length, reconciled: rows.filter(r => r.reconciliation === "Reconciled").length, verified: rows.filter(r => r.balance === "Verified").length, attention: rows.filter(r => r.attention).length };
}