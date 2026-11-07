// Loan repayment history: walks repayments into a loan's account, newest balance = the loan's current outstanding.
// Two ways a repayment reaches a loan: a "Loan repayment" entry (optionally split into principal and interest),
// or an EMI recorded from the loan card, which writes the principal as a transfer into the loan account
// and the interest as a separate financial charge. Both are read here so the history never misses a payment.
import type { Expense } from "./expenses";
import { repaymentParts } from "./ledger";
import { roundMoney, addMoney, subtractMoney, proportionMoney, sumMoney } from "./money";

const r2 = roundMoney;
export interface LoanHistoryRow { id: string; date: string; amount: number; principal: number; interest: number; split: boolean; balanceBefore: number; balanceAfter: number }
type Src = Pick<Expense, "id" | "date" | "amount" | "txnType" | "toAccountId" | "principal" | "interest"> & Partial<Pick<Expense, "category" | "title" | "originalAmount" | "transferCounterpartOf">>;

/** Repayments without a saved split count fully as principal, because the ledger moves the whole payment into the loan account. */
export function loanHistory(accountId: string | null, outstanding: number, txns: Src[], loanName = "") {
  if (!accountId) return { rows: [] as LoanHistoryRow[], totalPrincipal: 0, totalInterest: 0, totalPaid: 0 };
  const groups = new Map<string, { ids: string[]; principal: number; interest: number; split: boolean }>();
  const add = (date: string, id: string, principal: number, interest: number, split: boolean) => {
    const g = groups.get(date) ?? { ids: [], principal: 0, interest: 0, split: false };
    g.ids.push(id); g.principal = addMoney(g.principal, principal); g.interest = addMoney(g.interest, interest); g.split = g.split || split;
    groups.set(date, g);
  };
  for (const x of txns) {
    if (x.transferCounterpartOf) continue;
    if (x.txnType === "loan_repayment" && x.toAccountId === accountId) {
      const split = x.principal != null && x.interest != null;
      const parts = repaymentParts(x);
      add(x.date, x.id, parts.principal, parts.interest, split);
    } else if (x.txnType === "transfer" && x.toAccountId === accountId && x.category === "Loan repayment") {
      add(x.date, x.id, x.amount, 0, true);
    } else if (loanName && x.txnType === "expense" && x.category === "Financial charges" && (x.title ?? "").startsWith(`${loanName} — interest`)) {
      add(x.date, x.id, 0, x.amount, true);
    }
  }
  let after = r2(outstanding);
  const rows: LoanHistoryRow[] = [];
  for (const date of [...groups.keys()].sort((a, b) => b.localeCompare(a))) {
    const g = groups.get(date);
    const id = g?.ids[0];
    if (!g || !id) continue;
    const before = addMoney(after, g.principal);
    rows.push({ id, date, amount: addMoney(g.principal, g.interest), principal: g.principal, interest: g.interest, split: g.split, balanceBefore: before, balanceAfter: after });
    after = before;
  }
  rows.reverse();
  const totalPrincipal = sumMoney(rows.map(r => r.principal)), totalInterest = sumMoney(rows.map(r => r.interest));
  return { rows, totalPrincipal, totalInterest, totalPaid: addMoney(totalPrincipal, totalInterest) };
}

/** Chart points for the repayment history: the balance before the first repayment, then the balance left after each one. */
export function loanBalanceChart(rows: LoanHistoryRow[]) {
  if (!rows.length) return [] as { label: string; balance: number }[];
  return [{ label: "Opening", balance: rows[0]?.balanceBefore ?? 0 }, ...rows.map((r) => ({ label: r.date, balance: r.balanceAfter }))];
}

/** CSV rows for the repayment history: one line per repayment, then the totals and the current outstanding. */
export function loanHistoryRows(hist: ReturnType<typeof loanHistory>, outstanding: number): string[][] {
  return [
    ["Date", "Paid", "Principal", "Interest", "Balance after"],
    ...hist.rows.map((r) => [r.date, String(r.amount), String(r.principal), r.split ? String(r.interest) : "", String(r.balanceAfter)]),
    ["Total", String(hist.totalPaid), String(hist.totalPrincipal), String(hist.totalInterest), String(outstanding)],
  ];
}

export interface PayoffProjection { payment: number; basis: "recent" | "emi"; months: number; payoffDate: string; interestLeft: number; payable: boolean }
/** Payoff estimate: average of the last three repayments (or the scheduled EMI when none), applied monthly with interest on the remaining balance. */
export function payoffProjection(outstanding: number, annualRate: number, rows: LoanHistoryRow[], emi: number, today: string): PayoffProjection {
  const recent = rows.slice(-3);
  const basis = recent.length ? "recent" : "emi";
  const payment = recent.length ? proportionMoney(sumMoney(recent.map(r => r.amount)), 1, recent.length) : r2(emi);
  const start = rows.at(-1)?.date ?? today;
  let bal = r2(outstanding), months = 0, interestLeft = 0;
  const monthlyInterest = (balance: number) => proportionMoney(balance, annualRate, 1200);
  if (bal <= 0) return { payment, basis, months: 0, payoffDate: start, interestLeft: 0, payable: true };
  if (payment <= monthlyInterest(bal) || payment <= 0) return { payment, basis, months: Infinity, payoffDate: "", interestLeft: Infinity, payable: false };
  while (bal > 0.005 && months < 1200) { const i = monthlyInterest(bal); interestLeft = addMoney(interestLeft, i); bal = subtractMoney(addMoney(bal, i), payment); months++; }
  const d = new Date(`${start}T00:00:00Z`); const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return { payment, basis, months, payoffDate: d.toISOString().slice(0, 10), interestLeft, payable: true };
}
