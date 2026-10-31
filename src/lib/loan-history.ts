// Loan repayment history: walks repayments into a loan's account, newest balance = the loan's current outstanding.
import type { Expense } from "./expenses";

const r2 = (n: number) => Math.round(n * 100) / 100;
export interface LoanHistoryRow { id: string; date: string; amount: number; principal: number; interest: number; split: boolean; balanceBefore: number; balanceAfter: number }

/** Repayments without a saved split count fully as principal, because the ledger moves the whole payment into the loan account. */
export function loanHistory(accountId: string | null, outstanding: number, txns: Pick<Expense, "id" | "date" | "amount" | "txnType" | "toAccountId" | "principal" | "interest">[]) {
  if (!accountId) return { rows: [] as LoanHistoryRow[], totalPrincipal: 0, totalInterest: 0, totalPaid: 0 };
  const pays = txns.filter((x) => x.txnType === "loan_repayment" && x.toAccountId === accountId).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  let after = r2(outstanding);
  const rows: LoanHistoryRow[] = [];
  for (const p of pays) {
    const split = p.principal != null && p.interest != null;
    const principal = r2(split ? p.principal! : p.amount), interest = r2(split ? p.interest! : 0);
    const before = r2(after + principal);
    rows.push({ id: p.id, date: p.date, amount: r2(p.amount), principal, interest, split, balanceBefore: before, balanceAfter: after });
    after = before;
  }
  rows.reverse();
  const totalPrincipal = r2(rows.reduce((s, r) => s + r.principal, 0)), totalInterest = r2(rows.reduce((s, r) => s + r.interest, 0));
  return { rows, totalPrincipal, totalInterest, totalPaid: r2(totalPrincipal + totalInterest) };
}

/** Chart points for the repayment history: the balance before the first repayment, then the balance left after each one. */
export function loanBalanceChart(rows: LoanHistoryRow[]) {
  if (!rows.length) return [] as { label: string; balance: number }[];
  return [{ label: "Opening", balance: rows[0]!.balanceBefore }, ...rows.map((r) => ({ label: r.date, balance: r.balanceAfter }))];
}
