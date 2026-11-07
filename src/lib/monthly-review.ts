// Monthly review figures: every number is computed here (verified); the AI only explains them.
import { accountBalance, cashflow, type Account } from "./ledger";
import { addDays, monthEnd, monthlyCost, occurrences, type Commitment } from "./planning";
import { budgetUsage, categoryTotals, type Budgets, type Expense } from "./expenses";
import { anomalies } from "./insights";
import { reimbursementSummary } from "./reimbursements";

const r2 = (n: number) => Math.round(n * 100) / 100;
export const prevMonth = (m: string) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y!, mo! - 2, 1)); return d.toISOString().slice(0, 7); };

export interface ReviewInput {
  month: string; transactions: Expense[]; accounts: Account[]; commitments: Commitment[]; budgets: Budgets;
  goals: { name: string; target: number; saved: number }[]; loans: { name: string; principal: number; emi: number; original?: number }[]; today: string;
}

export function monthlyReview(i: ReviewInput) {
  const from = `${i.month}-01`, to = monthEnd(from);
  const pm = prevMonth(i.month), pFrom = `${pm}-01`, pTo = monthEnd(pFrom);
  const tx = i.transactions.filter((t) => t.date <= to);
  const spend = (a: string, b: string) => tx.filter((t) => (t.txnType ?? "expense") === "expense" && t.date >= a && t.date <= b);
  const cur = cashflow(tx, from, to), prev = cashflow(tx, pFrom, pTo);
  const byCat = categoryTotals(spend(from, to)), prevCat = categoryTotals(spend(pFrom, pTo));
  const changes = [...new Set([...Object.keys(byCat), ...Object.keys(prevCat)])].map((c) => ({ category: c, now: byCat[c] ?? 0, before: prevCat[c] ?? 0, change: r2((byCat[c] ?? 0) - (prevCat[c] ?? 0)) }))
    .filter((x) => x.change !== 0).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const recurringCats = new Set(i.commitments.filter((c) => c.direction === "out" && c.status === "active").map((c) => c.category).filter(Boolean));
  const budgets = budgetUsage(spend(from, to), i.budgets, i.month).filter((b) => b.budget > 0).map((b) => ({ ...b, over: b.spent > b.budget }));
  const cards = i.accounts.filter((a) => !a.archived && a.kind === "credit_card").map((a) => ({ name: a.name, owed: r2(Math.max(0, accountBalance(a, tx))), limit: a.creditLimit ?? null }));
  const upcomingFrom = i.today > to ? i.today : addDays(to, 1);
  const upcoming = occurrences(i.commitments.filter((c) => c.status === "active"), upcomingFrom, addDays(upcomingFrom, 30)).slice(0, 15).map((o) => ({ name: o.name, date: o.date, amount: o.amount, direction: o.direction }));
  const unusual = anomalies(tx, to, Number(to.slice(8, 10))).slice(0, 8).map((a) => ({ title: a.title, date: a.date, amount: a.amount, category: a.category, reason: a.reason }));
  const reimb = reimbursementSummary(tx.filter((t) => (t.txnType ?? "expense") === "expense"), to);
  const recurring = i.commitments.filter((c) => c.direction === "out" && c.status === "active").map((c) => ({ name: c.name, monthly: r2(monthlyCost(c)) }));
  const recs: string[] = [];
  if (cur.net < 0) recs.push("Spending exceeded income this month — review the largest increases below.");
  for (const b of budgets.filter((x) => x.over).slice(0, 3)) recs.push(`${b.category} went over budget by ₹${r2(b.spent - b.budget).toLocaleString("en-IN")}.`);
  for (const c of changes.filter((x) => x.change > 0 && !recurringCats.has(x.category)).slice(0, 2)) recs.push(`${c.category} rose by ₹${c.change.toLocaleString("en-IN")} — check whether it was a one-off.`);
  if (reimb.outstanding > 0) recs.push(`Follow up ₹${reimb.outstanding.toLocaleString("en-IN")} of outstanding reimbursements.`);
  if (cards.some((c) => c.limit && c.owed / c.limit > 0.3)) recs.push("A credit card is above 30% utilisation — pay it down before the statement date.");
  return {
    month: i.month, period: { from, to },
    income: cur.income, expenditure: cur.spent, netCashFlow: cur.net,
    previous: { month: pm, income: prev.income, expenditure: prev.spent, netCashFlow: prev.net },
    byCategory: Object.entries(byCat).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    changes: changes.slice(0, 10).map((c) => ({ ...c, nature: recurringCats.has(c.category) ? "recurring" : "exceptional" })),
    unusual, recurring, creditCards: cards, upcoming, budgets,
    savings: i.goals.map((g) => ({ name: g.name, saved: g.saved, target: g.target, pct: g.target > 0 ? Math.round((g.saved / g.target) * 100) : null })),
    loans: i.loans.map((l) => ({ name: l.name, outstanding: r2(l.principal), emi: l.emi, repaidPct: l.original && l.original > 0 ? Math.round((1 - l.principal / l.original) * 100) : null })),
    reimbursements: { outstanding: reimb.outstanding, received: reimb.received, byPayer: reimb.byPayer },
    recommendations: recs,
  };
}
export type MonthlyReview = ReturnType<typeof monthlyReview>;

/** Stable fingerprint: if records change after a report is saved, the hash changes and the report shows as outdated. */
export function reviewHash(r: MonthlyReview): string {
  const s = JSON.stringify({ ...r, upcoming: undefined });
  let h = 5381;
  for (let k = 0; k < s.length; k++) h = ((h << 5) + h + s.charCodeAt(k)) | 0;
  return (h >>> 0).toString(16);
}
