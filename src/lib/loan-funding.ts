import { balanceAsOf, type Account, type Txn } from "./ledger";
import { dueIn, type EmiTarget } from "./emi-match";
import { addDays } from "./planning";

export function validateBankBalance(actual: number, date: string, today: string) {
  if (!Number.isFinite(actual) || actual < 0) throw new Error("Enter a bank balance of zero or more");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || date > today) throw new Error("Choose a valid balance date, no later than today");
}

export function bankBalanceKnown(account: Account) {
  return (account.details as Record<string, unknown> | undefined)?.["needsBalance"] !== true;
}

export interface FundingReminder { key: string; loanId: string; name: string; due: string; fundingDate: string; received: number; expected: number; shortfall: number; status: "missing" | "short" }
/** Recorded transfers only, not predictions or EMI-sized unrelated expenses. Small gaps remain visible. */
export function loanFundingReminders(targets: EmiTarget[], loans: { id?: string; nextDue: string; payments?: { date: string; total: number }[] }[], transactions: Txn[], today: string, leadDays: number): FundingReminder[] {
  return targets.flatMap(target => {
    const loan = loans.find(l => l.id === target.loanId);
    if (!loan || !target.fundingFromAccountId || !target.payFromAccountId || !target.fundingDay) return [];
    const due = loan.nextDue;
    const d = new Date(`${due}T00:00:00Z`);
    let fundingDate = dueIn(d.getUTCFullYear(), d.getUTCMonth(), target.fundingDay);
    if (fundingDate > due) fundingDate = dueIn(d.getUTCFullYear(), d.getUTCMonth() - 1, target.fundingDay);
    if (today < fundingDate || today > due || due > addDays(today, Math.min(30, Math.max(0, leadDays)))) return [];
    if (transactions.some(t => !t.transferCounterpartOf && t.txnType === "loan_repayment" && t.accountId === target.payFromAccountId && t.toAccountId === target.loanAccountId && t.date >= addDays(due, -7) && t.date <= today && t.amount >= target.emi) || (loan.payments ?? []).some(p => p.date >= addDays(due, -7) && p.date <= today && p.total >= target.emi)) return [];
    const received = Math.round(transactions.filter(t => !t.transferCounterpartOf && t.txnType === "transfer" && t.accountId === target.fundingFromAccountId && t.toAccountId === target.payFromAccountId && t.date >= addDays(fundingDate, -7) && t.date <= today).reduce((sum, t) => sum + t.amount, 0) * 100) / 100;
    const shortfall = Math.round(Math.max(0, target.emi - received) * 100) / 100;
    return shortfall > 0 ? [{ key: `loan-funding:${target.loanId}:${due}`, loanId: target.loanId, name: target.name, due, fundingDate, received, expected: target.emi, shortfall, status: received > 0 ? "short" as const : "missing" as const }] : [];
  });
}

export const currentBankBalance = (account: Account, transactions: Txn[], today: string) => balanceAsOf(account, transactions, today);