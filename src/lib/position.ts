// One place that turns raw records into the figures the Home, Plan and AI screens show.
import { accountBalance, cashflow, isLiability, netWorth, type Account, type Txn } from "./ledger";
import { addDays, detectSubscriptions, forecast, monthlyCost, occurrences, safeToSpend, amortize, goalProgress, type Commitment } from "./planning";

export const CASH_KINDS = ["savings", "current", "cash", "wallet"];

interface Rec extends Txn { merchant: string | null; category: string; paymentMethod: string; title: string; tags?: string[] }
export interface PositionInput {
  accounts: Account[];
  transactions: Rec[];
  commitments: Commitment[];
  goals: { name: string; target: number; saved: number; monthly: number; reserve: boolean }[];
  loans: { name: string; principal: number; rate: number; emi: number; nextDue: string }[];
  today: string;
  days: number;
  includeUnconfirmed?: boolean;
}

/** Next calendar date (≥ today) falling on a given day of month. */
export function nextDayOfMonth(today: string, day: number) {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const make = (yy: number, mm: number) => {
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
  };
  const d = make(y, m);
  return d >= today ? d : m === 12 ? make(y + 1, 1) : make(y, m + 1);
}

export function position(i: PositionInput) {
  const live = i.accounts.filter((a) => !a.archived);
  const cashAccounts = live.filter((a) => CASH_KINDS.includes(a.kind));
  const cash = cashAccounts.reduce((s, a) => s + accountBalance(a, i.transactions), 0);
  const minBalance = cashAccounts.reduce((s, a) => s + (a.minBalance ?? 0), 0);
  const reserves = i.goals.filter((g) => g.reserve).reduce((s, g) => s + g.saved, 0);
  const cards = live.filter((a) => a.kind === "credit_card").map((a) => {
    const due = accountBalance(a, i.transactions);
    return { name: a.name, due, limit: a.creditLimit ?? null, utilisation: a.creditLimit ? Math.round((due / a.creditLimit) * 100) : null, dueDate: a.dueDay ? nextDayOfMonth(i.today, a.dueDay) : null };
  });
  const cardOut = cards.filter((c) => c.due > 0 && c.dueDate).map((c) => ({ date: c.dueDate!, amount: c.due, name: `${c.name} bill` }));
  // EMIs from the loans list are scheduled like monthly commitments
  const loanCommitments: Commitment[] = i.loans.map((l, k) => ({ id: `loan-${k}`, name: `${l.name} EMI`, kind: "emi", direction: "out", amount: l.emi, frequency: "monthly", intervalDays: null, nextDue: l.nextDue, accountId: null, category: "Bills & Utilities", confirmed: true, essential: true, status: "active" }));
  const all = [...i.commitments, ...loanCommitments];
  const input = { startBalance: cash, commitments: all, today: i.today, days: i.days, includeUnconfirmed: !!i.includeUnconfirmed, extraOut: cardOut };
  const sts = safeToSpend({ ...input, reserves, minBalance });
  const fc = forecast({ ...input, floor: minBalance + reserves });
  const month = i.today.slice(0, 7);
  const flow = cashflow(i.transactions, `${month}-01`, `${month}-31`);
  const upcoming = [...occurrences(all, i.today, addDays(i.today, i.days)), ...cardOut.map((c) => ({ name: c.name, date: c.date, amount: c.amount, direction: "out" as const, confirmed: true, essential: true, overdue: false, commitmentId: "" }))]
    .sort((a, b) => a.date.localeCompare(b.date));
  const subs = i.commitments.filter((c) => c.kind === "subscription" && c.status === "active");
  return {
    cash: Math.round(cash * 100) / 100, minBalance, reserves, cards, flow, safe: sts, forecast: fc, upcoming,
    netWorth: netWorth(live, i.transactions),
    liabilitiesFromLoans: i.loans.reduce((s, l) => s + l.principal, 0),
    subscriptions: { active: subs.length, monthly: subs.reduce((s, c) => s + monthlyCost(c), 0), detected: detectSubscriptions(i.transactions.filter((t) => (t.txnType ?? "expense") === "expense")) },
    loans: i.loans.map((l) => { const a = amortize(l.principal, l.rate, l.emi); return { ...l, monthsLeft: a.months, interestLeft: a.totalInterest, payable: a.payable }; }),
    goals: i.goals.map((g) => ({ ...g, ...goalProgress(g, i.today) })),
    accounts: live.map((a) => ({ name: a.name, kind: a.kind, balance: accountBalance(a, i.transactions), liability: isLiability(a.kind) })),
  };
}

/** Compact, verified figures the AI assistant may quote. Every number comes from the engine above. */
export function assistantFacts(i: PositionInput) {
  const p = position(i);
  const spend = i.transactions.filter((t) => (t.txnType ?? "expense") === "expense");
  const sumBy = (rows: Rec[], key: (t: Rec) => string) => {
    const o: Record<string, number> = {};
    for (const t of rows) o[key(t)] = Math.round(((o[key(t)] ?? 0) + t.amount) * 100) / 100;
    return o;
  };
  const months: Record<string, { spent: number; income: number }> = {};
  for (let k = 0; k < 6; k++) {
    const d = new Date(i.today + "T00:00:00Z"); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - k);
    const m = d.toISOString().slice(0, 7);
    const f = cashflow(i.transactions, `${m}-01`, `${m}-31`);
    months[m] = { spent: f.spent, income: f.income };
  }
  const thisMonth = spend.filter((t) => t.date.startsWith(i.today.slice(0, 7)));
  const last6 = spend.filter((t) => t.date >= Object.keys(months).sort()[0] + "-01");
  return {
    today: i.today,
    currency: "INR",
    actual: {
      cashInAccounts: p.cash, accounts: p.accounts, netWorth: p.netWorth, loanPrincipalOutstanding: p.liabilitiesFromLoans,
      thisMonth: { ...p.flow, byCategory: sumBy(thisMonth, (t) => t.category) },
      last6Months: { byMonth: months, byCategory: sumBy(last6, (t) => t.category), byPaymentMethod: sumBy(last6, (t) => t.paymentMethod), topMerchants: Object.entries(sumBy(last6, (t) => t.merchant ?? "Unknown")).sort((a, b) => b[1] - a[1]).slice(0, 10) },
      creditCards: p.cards, goals: p.goals,
      transactionCount: i.transactions.length,
    },
    estimated: {
      periodDays: i.days, safeToSpend: p.safe.amount, safeToSpendSteps: p.safe.steps, lowestProjectedBalance: p.safe.lowest, lowestOn: p.safe.lowestDate,
      shortfallDates: p.forecast.shortDates.slice(0, 10), endBalance: p.forecast.series.at(-1)?.balance,
      upcomingPayments: p.upcoming.slice(0, 25).map((u) => ({ name: u.name, date: u.date, amount: u.amount, direction: u.direction, confirmed: u.confirmed, overdue: u.overdue })),
      subscriptions: { activeCount: p.subscriptions.active, monthlyCost: p.subscriptions.monthly, possibleFromHistory: p.subscriptions.detected.slice(0, 10) },
      loans: p.loans,
    },
    missing: [
      !i.accounts.length && "No accounts added, so balances and safe-to-spend are unknown.",
      !i.commitments.some((c) => c.direction === "in") && "No expected income recorded.",
      !i.commitments.length && !i.loans.length && "No recurring payments or loans recorded.",
    ].filter(Boolean),
  };
}
