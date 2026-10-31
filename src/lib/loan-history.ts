// Loan repayment history: walks repayments into a loan's account, newest balance = the loan's current outstanding.
// Two ways a repayment reaches a loan: a "Loan repayment" entry (optionally split into principal and interest),
// or an EMI recorded from the loan card, which writes the principal as a transfer into the loan account
// and the interest as a separate financial charge. Both are read here so the history never misses a payment.
import type { Expense } from "./expenses";

const r2 = (n: number) => Math.round(n * 100) / 100;
export interface LoanHistoryRow { id: string; date: string; amount: number; principal: number; interest: number; split: boolean; balanceBefore: number; balanceAfter: number }
type Src = Pick<Expense, "id" | "date" | "amount" | "txnType" | "toAccountId" | "principal" | "interest" | "category" | "title">;

/** Repayments without a saved split count fully as principal, because the ledger moves the whole payment into the loan account. */
export function loanHistory(accountId: string | null, outstanding: number, txns: Src[], loanName = "") {
  if (!accountId) return { rows: [] as LoanHistoryRow[], totalPrincipal: 0, totalInterest: 0, totalPaid: 0 };
  const groups = new Map<string, { ids: string[]; principal: number; interest: number; split: boolean }>();
  const add = (date: string, id: string, principal: number, interest: number, split: boolean) => {
    const g = groups.get(date) ?? { ids: [], principal: 0, interest: 0, split: false };
    g.ids.push(id); g.principal = r2(g.principal + principal); g.interest = r2(g.interest + interest); g.split = g.split || split;
    groups.set(date, g);
  };
  for (const x of txns) {
    if (x.txnType === "loan_repayment" && x.toAccountId === accountId) {
      const split = x.principal != null && x.interest != null;
      add(x.date, x.id, split ? x.principal! : x.amount, split ? x.interest! : 0, split);
    } else if (x.txnType === "transfer" && x.toAccountId === accountId && x.category === "Loan repayment") {
      add(x.date, x.id, x.amount, 0, true);
    } else if (loanName && x.txnType === "expense" && x.category === "Financial charges" && (x.title ?? "").startsWith(`${loanName} — interest`)) {
      add(x.date, x.id, 0, x.amount, true);
    }
  }
  let after = r2(outstanding);
  const rows: LoanHistoryRow[] = [];
  for (const date of [...groups.keys()].sort((a, b) => b.localeCompare(a))) {
    const g = groups.get(date)!;
    const before = r2(after + g.principal);
    rows.push({ id: g.ids[0]!, date, amount: r2(g.principal + g.interest), principal: g.principal, interest: g.interest, split: g.split, balanceBefore: before, balanceAfter: after });
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
