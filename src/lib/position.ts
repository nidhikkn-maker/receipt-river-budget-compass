// One place that turns raw records into the figures the Home, Plan, Wealth and AI screens show.
import { accountBalance, accountValue, cashflow, isLiability, netWorth, type Account, type Txn, type Valuation } from "./ledger";
import { addDays, amortize, closureDate, debtScenarios, detectSubscriptions, forecast, goalProgress, incomeTracking, monthEnd, occurrences, safeToSpend, subscriptionSummary, type Commitment } from "./planning";
import { cardCycle, cardDues, type CardEmi, type LoanPayment } from "./cards";
import { anomalies, budgetRecommendations, lastMonthCompare, monthToDateCompare, savingsIdeas, spendBy } from "./insights";

export const CASH_KINDS = ["savings", "current", "cash", "wallet"];

interface Rec extends Txn { merchant: string | null; category: string; paymentMethod: string; title: string; tags?: string[]; reimbursementStatus?: string }
export interface PositionLoan {
  id?: string; name: string; principal: number; rate: number; emi: number; nextDue: string;
  accountId?: string | null; loanType?: string; sourceTransactionId?: string | null; original?: number; startDate?: string | null; payments?: LoanPayment[]; status?: string;
}
export interface PositionInput {
  accounts: Account[];
  transactions: Rec[];
  commitments: Commitment[];
  goals: { name: string; target: number; saved: number; monthly: number; reserve: boolean }[];
  loans: PositionLoan[];
  today: string;
  days: number;
  includeUnconfirmed?: boolean;
  valuations?: Valuation[];
  budgets?: Record<string, number>;
  cardAlertPct?: number;
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

export const isCardEmi = (l: PositionLoan) => l.loanType === "credit_card_emi";
export const cardEmisOf = (loans: PositionLoan[]): CardEmi[] => loans.filter((l) => isCardEmi(l) && l.status !== "closed").map((l) => ({
  id: l.id ?? l.name, name: l.name, accountId: l.accountId ?? null, sourceTransactionId: l.sourceTransactionId ?? null, original: l.original ?? l.principal,
  startDate: l.startDate ?? "0000-01-01", emi: l.emi, rate: l.rate, payments: l.payments ?? [],
}));

export interface Alert { level: "high" | "medium" | "info"; text: string; to: string }

export function position(i: PositionInput) {
  const live = i.accounts.filter((a) => !a.archived);
  const cashAccounts = live.filter((a) => CASH_KINDS.includes(a.kind) && a.includeInCash !== false);
  const cash = cashAccounts.reduce((s, a) => s + accountBalance(a, i.transactions), 0);
  const minBalance = cashAccounts.reduce((s, a) => s + (a.minBalance ?? 0), 0);
  const reserves = i.goals.filter((g) => g.reserve).reduce((s, g) => s + g.saved, 0);
  const emis = cardEmisOf(i.loans);
  const cards = live.filter((a) => a.kind === "credit_card").map((a) => {
    const cycle = cardCycle(a, i.transactions, emis, i.today, i.cardAlertPct ?? 30);
    return {
      id: a.id, name: a.name, due: cycle.owed, limit: a.creditLimit ?? null, utilisation: cycle.utilisation,
      dueDate: cycle.dueDate ?? (a.dueDay ? nextDayOfMonth(i.today, a.dueDay) : null), cycle, account: a,
    };
  });
  const cardOut = cards.flatMap((c) => cardDues(c.account, c.cycle, i.today));
  const activeLoans = i.loans.filter((l) => l.status !== "closed");
  // EMIs from the loans list are scheduled like monthly commitments; card EMIs are billed on the card instead.
  const loanCommitments: Commitment[] = activeLoans.filter((l) => !isCardEmi(l)).map((l, k) => ({ id: `loan-${l.id ?? k}`, name: `${l.name} EMI`, kind: "emi", direction: "out", amount: l.emi, frequency: "monthly", intervalDays: null, nextDue: l.nextDue, accountId: null, category: "Financial charges", confirmed: true, essential: true, status: "active" }));
  const all = [...i.commitments, ...loanCommitments];
  const input = { startBalance: cash, commitments: all, today: i.today, days: i.days, includeUnconfirmed: !!i.includeUnconfirmed, extraOut: cardOut };
  const sts = safeToSpend({ ...input, reserves, minBalance });
  const fc = forecast({ ...input, floor: minBalance + reserves });
  const month = i.today.slice(0, 7);
  const flow = cashflow(i.transactions, `${month}-01`, monthEnd(i.today));
  const end = addDays(i.today, i.days);
  const upcoming = [...occurrences(all, i.today, end), ...cardOut.filter((c) => c.date <= end).map((c) => ({ name: c.name, date: c.date, amount: c.amount, direction: "out" as const, confirmed: true, essential: true, overdue: false, commitmentId: "", kind: "bill" as const }))]
    .sort((a, b) => a.date.localeCompare(b.date));
  const unlinkedLoanOwed = activeLoans.filter((l) => !l.accountId).reduce((s, l) => s + l.principal, 0);
  const nw = netWorth(live, i.transactions, i.valuations ?? []);
  const pending = i.transactions.filter((t) => t.reimbursementStatus === "pending");
  const subs = subscriptionSummary(i.commitments, i.transactions.filter((t) => (t.txnType ?? "expense") === "expense"), i.today);
  const income = incomeTracking(i.commitments, i.transactions, i.today);
  const loans = activeLoans.map((l) => { const a = amortize(l.principal, l.rate, l.emi); return { ...l, monthsLeft: a.months, interestLeft: a.totalInterest, payable: a.payable, closesOn: closureDate(l.nextDue, a.months) }; });

  const alerts: Alert[] = [];
  for (const c of i.commitments.filter((x) => x.status === "active" && x.direction === "out" && x.nextDue < i.today)) alerts.push({ level: "high", text: `${c.name} was due on ${c.nextDue}`, to: "/plan" });
  if (fc.shortDates.length) alerts.push({ level: "high", text: `Money runs short from ${fc.shortDates[0]} — lowest ${Math.round(sts.lowest).toLocaleString("en-IN")}`, to: "/plan" });
  for (const c of cards) {
    if (c.cycle.status === "overdue") alerts.push({ level: "high", text: `${c.name} bill of ₹${c.cycle.remainingDue.toLocaleString("en-IN")} is overdue`, to: "/wealth" });
    else if (c.cycle.remainingDue > 0 && c.cycle.dueDate && c.cycle.dueDate <= addDays(i.today, 5)) alerts.push({ level: "medium", text: `${c.name} bill ₹${c.cycle.remainingDue.toLocaleString("en-IN")} due ${c.cycle.dueDate}`, to: "/wealth" });
    if (c.cycle.highUtilisation) alerts.push({ level: "medium", text: `${c.name} is ${c.utilisation}% used`, to: "/wealth" });
  }
  for (const l of income.late) alerts.push({ level: "medium", text: `${l.name} is ${l.daysLate} day${l.daysLate === 1 ? "" : "s"} late`, to: "/plan" });
  for (const a of cashAccounts) { const b = accountBalance(a, i.transactions); if ((a.minBalance ?? 0) > 0 && b < (a.minBalance ?? 0)) alerts.push({ level: "medium", text: `${a.name} is below its minimum balance`, to: "/wealth" }); }
  if (i.budgets) {
    const spentBy: Record<string, number> = {};
    for (const t of i.transactions) if ((t.txnType ?? "expense") === "expense" && t.date.startsWith(month)) spentBy[t.category] = (spentBy[t.category] ?? 0) + t.amount;
    for (const [cat, b] of Object.entries(i.budgets)) if (b > 0 && (spentBy[cat] ?? 0) >= b * 0.9) alerts.push({ level: (spentBy[cat] ?? 0) > b ? "high" : "medium", text: `${cat}: ${Math.round(((spentBy[cat] ?? 0) / b) * 100)}% of budget used`, to: "/budgets" });
  }
  for (const d of subs.duplicates) alerts.push({ level: "info", text: `Possible duplicate subscriptions: ${d.names.join(" & ")}`, to: "/plan" });
  for (const x of anomalies(i.transactions, i.today, 7)) alerts.push({ level: "info", text: `Unusual: ${x.title} — ${x.reason}`, to: "/expenses" });

  return {
    cash: Math.round(cash * 100) / 100, minBalance, reserves, cards, flow, safe: sts, forecast: fc, upcoming, alerts,
    netWorth: { assets: nw.assets, liabilities: Math.round((nw.liabilities + unlinkedLoanOwed) * 100) / 100, net: Math.round((nw.net - unlinkedLoanOwed) * 100) / 100 },
    liabilitiesFromLoans: unlinkedLoanOwed,
    reimbursements: { pendingCount: pending.length, pendingAmount: Math.round(pending.reduce((s, t) => s + t.amount, 0) * 100) / 100 },
    income,
    subscriptions: { active: subs.counts.active, monthly: subs.monthly, annual: subs.annual, summary: subs, detected: detectSubscriptions(i.transactions.filter((t) => (t.txnType ?? "expense") === "expense")) },
    loans,
    goals: i.goals.map((g) => ({ ...g, ...goalProgress(g, i.today) })),
    accounts: live.map((a) => { const v = accountValue(a, i.transactions, i.valuations ?? []); return { id: a.id, name: a.name, kind: a.kind, balance: v.value, valuedOn: v.valuedOn, valuationSource: v.source, liability: isLiability(a.kind) }; }),
  };
}

/** Compact, verified figures the AI assistant may quote. Every number comes from the engines above. */
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
    const f = cashflow(i.transactions, `${m}-01`, monthEnd(`${m}-01`));
    months[m] = { spent: f.spent, income: f.income };
  }
  const thisMonth = spend.filter((t) => t.date.startsWith(i.today.slice(0, 7)));
  const last6 = spend.filter((t) => t.date >= Object.keys(months).sort()[0] + "-01");
  const byAccount = spendBy(last6, (t) => i.accounts.find((a) => a.id === t.accountId)?.name ?? "No account", 20);
  return {
    today: i.today,
    currency: "INR",
    actual: {
      cashInAccounts: p.cash, accounts: p.accounts, netWorth: p.netWorth, loanPrincipalOutstanding: p.loans.reduce((s, l) => s + l.principal, 0),
      thisMonth: { ...p.flow, byCategory: sumBy(thisMonth, (t) => t.category) },
      last6Months: { byMonth: months, byCategory: sumBy(last6, (t) => t.category), byPaymentMethod: sumBy(last6, (t) => t.paymentMethod), byAccount, topMerchants: Object.entries(sumBy(last6, (t) => t.merchant ?? "Unknown")).sort((a, b) => b[1] - a[1]).slice(0, 10) },
      creditCards: p.cards.map((c) => ({ name: c.name, owed: c.cycle.owed, limit: c.limit, utilisation: c.utilisation, status: c.cycle.status, statementBalance: c.cycle.statementBalance, remainingDue: c.cycle.remainingDue, dueDate: c.cycle.dueDate, unbilled: c.cycle.unbilled, interestSinceStatement: c.cycle.interestSinceStatement, emiOutstanding: c.cycle.emiOutstanding })),
      goals: p.goals,
      pendingReimbursements: p.reimbursements,
      incomeThisMonth: { received: p.income.received, bySource: p.income.bySource, late: p.income.late },
      transactionCount: i.transactions.length,
    },
    estimated: {
      periodDays: i.days, safeToSpend: p.safe.amount, safeToSpendSteps: p.safe.steps, lowestProjectedBalance: p.safe.lowest, lowestOn: p.safe.lowestDate,
      shortfallDates: p.forecast.shortDates.slice(0, 10), endBalance: p.forecast.series.at(-1)?.balance,
      upcomingPayments: p.upcoming.slice(0, 25).map((u) => ({ name: u.name, date: u.date, amount: u.amount, direction: u.direction, confirmed: u.confirmed, overdue: u.overdue })),
      expectedIncomeRestOfMonth: { all: p.income.expectedRemaining, confirmedOnly: p.income.expectedConfirmed },
      subscriptions: { activeCount: p.subscriptions.active, monthlyCost: p.subscriptions.monthly, annualCost: p.subscriptions.annual, priceIncreases: p.subscriptions.summary.increases, possibleDuplicates: p.subscriptions.summary.duplicates.map((d) => d.names), possibleFromHistory: p.subscriptions.detected.slice(0, 10) },
      loans: p.loans.map((l) => ({ name: l.name, outstanding: l.principal, rate: l.rate, emi: l.emi, nextDue: l.nextDue, monthsLeft: Number.isFinite(l.monthsLeft) ? l.monthsLeft : null, interestLeft: Number.isFinite(l.interestLeft) ? l.interestLeft : null, closesOn: l.closesOn, payable: l.payable })),
      debtWhatIfs_HYPOTHETICAL: debtScenarios(p.loans.map((l) => ({ name: l.name, principal: l.principal, rate: l.rate, emi: l.emi }))),
    },
    insights: {
      monthToDateVsLastMonth: monthToDateCompare(i.transactions, i.today),
      lastMonthVsMonthBefore: lastMonthCompare(i.transactions, i.today),
      unusualTransactions: anomalies(i.transactions, i.today).slice(0, 10),
      budgetSuggestions: budgetRecommendations(i.transactions, i.budgets ?? {}, i.today).slice(0, 12),
      savingsIdeas: savingsIdeas(i.transactions, i.today, p.subscriptions.monthly),
      alerts: p.alerts.map((a) => a.text),
    },
    missing: [
      !i.accounts.length && "No accounts added, so balances and safe-to-spend are unknown.",
      !i.commitments.some((c) => c.direction === "in") && "No expected income recorded.",
      !i.commitments.length && !i.loans.length && "No recurring payments or loans recorded.",
    ].filter(Boolean),
  };
}
