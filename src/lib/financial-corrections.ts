import type { Expense } from "./expenses";
import { accountBalance, cashflow, isMove, MOVE_TARGET, type Account, type TxnType } from "./ledger";
import type { FinancialReview } from "./financial-review";

export const CORRECTION_TYPES = ["expense", "income", "refund", "transfer", "card_payment", "loan_repayment", "investment"] as const;
export interface CorrectionChoice { txnType?: TxnType; accountId?: string; toAccountId?: string; principal?: number; interest?: number }
export const correctionSnapshot = (e: Expense) => ({ id: e.id, revision: e.correctionRevision ?? 0 });
export const correctionAccount = (a: Account) => ({ id: a.id, name: a.name, kind: a.kind, archived: a.archived });
const round = (n: number) => Math.round(n * 100) / 100;

/** Changes are never suggestions applied automatically. Deltas reuse the ledger, preserving saved INR and FX. */
export function correctionPreview(rows: FinancialReview[], choice: CorrectionChoice, accounts: Account[], transactions: Expense[]) {
  if (!rows.length || rows.length > 500 || new Set(rows.map(r => r.transaction.id)).size !== rows.length) throw Error("Select between 1 and 500 distinct transactions.");
  const records = rows.map(r => r.transaction);
  const after = records.map(e => {
    const row = rows.find(r => r.transaction.id === e.id);
    if (row?.group === "conflict") throw Error("Resolve duplicate and split conflicts individually first.");
    const type = choice.txnType ?? e.txnType ?? "expense";
    if (!(CORRECTION_TYPES as readonly string[]).includes(type) || !(CORRECTION_TYPES as readonly string[]).includes(e.txnType ?? "expense")) throw Error("Claims, adjustments and advances require their dedicated review.");
    const source = accounts.find(a => a.id === (choice.accountId ?? e.accountId) && !a.archived);
    const destination = isMove(type) ? accounts.find(a => a.id === (choice.toAccountId ?? e.toAccountId) && !a.archived) : undefined;
    if (!source) throw Error("Confirm an active source account for every transaction.");
    if (isMove(type) && (!destination || destination.id === source.id)) throw Error("Confirm two different active accounts for each movement.");
    const targets = MOVE_TARGET[type];
    if (destination && targets && !targets.includes(destination.kind)) throw Error("Receiving account does not match the transaction type.");
    const changedType = type !== (e.txnType ?? "expense");
    if (changedType && ((e.reimbursementStatus ?? "none") !== "none" || Object.keys(e.reimbursement ?? {}).length || e.allocations?.length || e.workspaceAllocations?.length || e.splits.length || e.tripId || e.tags?.some(t => /^Trip:/.test(t)))) throw Error("Linked claims, trips and split entries need individual review before changing type.");
    if (e.paymentInstrumentId && source.id !== e.accountId) throw Error("Review the linked payment method individually before changing its account.");
    if (changedType && isMove(type) && transactions.some(t => t.id !== e.id && t.accountId === destination?.id && t.currency === e.currency && Math.abs(t.originalAmount - e.originalAmount) < 0.005 && Math.abs(Date.parse(t.date) - Date.parse(e.date)) <= 2 * 86400000 && ["income", "refund", "reimbursement", "advance"].includes(t.txnType ?? "expense"))) throw Error("A possible receiving-side entry already exists. Review the pair individually to avoid counting it twice.");
    const principal = type === "loan_repayment" ? (choice.principal ?? e.principal) : null;
    const interest = type === "loan_repayment" ? (choice.interest ?? e.interest) : null;
    if (type === "loan_repayment" && (principal == null || interest == null || !Number.isFinite(principal) || !Number.isFinite(interest) || principal < 0 || interest < 0 || Math.round((principal + interest) * 100) !== Math.round(e.originalAmount * 100))) throw Error("Confirm principal and interest in the original currency; together they must equal every selected payment.");
    return { ...e, txnType: type, accountId: source.id, toAccountId: destination?.id ?? null, principal, interest, reconciledAt: null };
  });
  if (after.every((e, i) => e.txnType === (records[i]?.txnType ?? "expense") && e.accountId === records[i]?.accountId && (e.toAccountId ?? null) === (records[i]?.toAccountId ?? null) && (e.principal ?? null) === (records[i]?.principal ?? null) && (e.interest ?? null) === (records[i]?.interest ?? null))) throw Error("No account or transaction-type changes selected.");
  const involved = accounts.filter(a => [...records, ...after].some(e => e.accountId === a.id || e.toAccountId === a.id));
  const beforeFlow = cashflow(records), afterFlow = cashflow(after);
  return { records, after, choice, snapshots: records.map(correctionSnapshot), accounts: involved.map(correctionAccount),
    balanceChanges: involved.map(a => ({ id: a.id, name: a.name, kind: a.kind, change: round(accountBalance({ ...a, openingBalance: 0 }, after) - accountBalance({ ...a, openingBalance: 0 }, records)) })),
    incomeChange: round(afterFlow.income - beforeFlow.income), spendingChange: round(afterFlow.spent - beforeFlow.spent),
    fingerprint: JSON.stringify(records), accountFingerprint: JSON.stringify(involved.map(correctionAccount)) };
}
export type CorrectionPreview = ReturnType<typeof correctionPreview>;
export function correctionStillCurrent(p: CorrectionPreview, transactions: Expense[], accounts: Account[]) {
  return JSON.stringify(p.records.map(e => transactions.find(t => t.id === e.id))) === p.fingerprint && JSON.stringify(accounts.filter(a => p.accounts.some(b => b.id === a.id)).map(correctionAccount)) === p.accountFingerprint;
}