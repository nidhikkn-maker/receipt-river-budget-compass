// Insights analytics: trends, comparisons, anomalies and budget suggestions (pure, tested). All money in INR.
import { cashflow, netWorth, type Account, type Txn, type Valuation } from "./ledger";
import { addDays, monthEnd } from "./planning";

interface Row extends Txn { category: string; merchant: string | null; title: string; paymentMethod?: string }
const r2 = (n: number) => Math.round(n * 100) / 100;
const isSpend = (t: Txn) => (t.txnType ?? "expense") === "expense";

/** The last `n` months ending with today's month, oldest first, as YYYY-MM. */
export function lastMonths(today: string, n: number): string[] {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  return Array.from({ length: n }, (_, k) => {
    const t = y * 12 + (m - 1) - (n - 1 - k);
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
  });
}
export const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleString("en", { month: "short", timeZone: "UTC" });

/** Income, spending and net per month (transfers excluded, refunds/reimbursements reduce spending). */
export function monthlySeries(txns: Txn[], today: string, n = 12) {
  let cumulative = 0;
  return lastMonths(today, n).map((month) => {
    const f = cashflow(txns, `${month}-01`, monthEnd(`${month}-01`));
    cumulative = r2(cumulative + f.net);
    return { month, label: monthLabel(month), income: f.income, spent: f.spent, net: f.net, savingsRate: f.income > 0 ? Math.round((f.net / f.income) * 100) : null, cumulative };
  });
}

/** Spending per week (weeks start on Monday), oldest first. */
export function weeklySpend(txns: Txn[], today: string, n = 12) {
  const d = new Date(today + "T00:00:00Z");
  const monday = addDays(today, -((d.getUTCDay() + 6) % 7));
  return Array.from({ length: n }, (_, k) => {
    const start = addDays(monday, -7 * (n - 1 - k));
    const end = addDays(start, 6);
    return { week: start, label: `${start.slice(8)}/${start.slice(5, 7)}`, spent: cashflow(txns, start, end).spent };
  });
}

/** Spending by any key, largest first. */
export function spendBy(rows: Row[], keyOf: (t: Row) => string, limit = 50) {
  const o = new Map<string, number>();
  for (const t of rows) if (isSpend(t)) o.set(keyOf(t), r2((o.get(keyOf(t)) ?? 0) + t.amount));
  return [...o.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, limit);
}

/** Category spending in period A vs period B, biggest increases first. */
export function compareRanges(rows: Row[], a: { from: string; to: string }, b: { from: string; to: string }) {
  const sum = (r: { from: string; to: string }) => {
    const o: Record<string, number> = {};
    for (const t of rows) if (isSpend(t) && t.date >= r.from && t.date <= r.to) o[t.category] = r2((o[t.category] ?? 0) + t.amount);
    return o;
  };
  const now = sum(a), before = sum(b);
  const cats = [...new Set([...Object.keys(now), ...Object.keys(before)])];
  const out = cats.map((category) => ({ category, now: now[category] ?? 0, before: before[category] ?? 0, delta: r2((now[category] ?? 0) - (before[category] ?? 0)) }));
  const total = { now: r2(out.reduce((s, x) => s + x.now, 0)), before: r2(out.reduce((s, x) => s + x.before, 0)) };
  return { rows: out.sort((x, y) => y.delta - x.delta), total: { ...total, delta: r2(total.now - total.before) } };
}

/** Month-to-date vs the same days of last month. */
export function monthToDateCompare(rows: Row[], today: string) {
  const day = Number(today.slice(8, 10));
  const [prev] = lastMonths(today, 2);
  const prevEnd = monthEnd(`${prev}-01`);
  const sameDay = `${prev}-${String(Math.min(day, Number(prevEnd.slice(8)))).padStart(2, "0")}`;
  return compareRanges(rows, { from: `${today.slice(0, 7)}-01`, to: today }, { from: `${prev}-01`, to: sameDay });
}

/** Last full month vs the month before it. */
export function lastMonthCompare(rows: Row[], today: string) {
  const [m2, m1] = lastMonths(today, 3);
  return { months: [m2!, m1!], ...compareRanges(rows, { from: `${m1}-01`, to: monthEnd(`${m1}-01`) }, { from: `${m2}-01`, to: monthEnd(`${m2}-01`) }) };
}

/** Net worth at each month end (or today for the current month). */
export function netWorthSeries(accounts: Account[], txns: Txn[], valuations: Valuation[], today: string, n = 12) {
  return lastMonths(today, n).map((month) => {
    const end = monthEnd(`${month}-01`);
    const asOf = end > today ? today : end;
    return { month, label: monthLabel(month), ...netWorth(accounts, txns, valuations, asOf) };
  });
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };

export interface Anomaly { id: string; title: string; date: string; amount: number; category: string; reason: string; typical: number | null }

/**
 * Unusual spending in the last `recentDays`: far above the category's usual amount (needs 5+ earlier entries),
 * or the same merchant charging the same amount twice within two days.
 */
export function anomalies(rows: Row[], today: string, recentDays = 30, lookbackDays = 180): Anomaly[] {
  const spend = rows.filter(isSpend);
  const recentFrom = addDays(today, -recentDays), lookFrom = addDays(today, -lookbackDays);
  const out: Anomaly[] = [];
  for (const t of spend.filter((x) => x.date >= recentFrom && x.date <= today)) {
    const prior = spend.filter((x) => x.id !== t.id && x.category === t.category && x.date >= lookFrom && x.date < t.date).map((x) => x.amount);
    if (prior.length >= 5) {
      const med = median(prior);
      const mad = Math.max(1, median(prior.map((x) => Math.abs(x - med))));
      if (t.amount > 2 * med && t.amount > med + 4 * mad) out.push({ id: t.id, title: t.title, date: t.date, amount: t.amount, category: t.category, reason: `About ${Math.round(t.amount / med)}× your usual ${t.category} spend`, typical: r2(med) });
    }
    const twin = spend.find((x) => x.id !== t.id && x.id < t.id && !!t.merchant && x.merchant?.toLowerCase() === t.merchant.toLowerCase() && Math.abs(x.amount - t.amount) < 0.01 && Math.abs(new Date(x.date).getTime() - new Date(t.date).getTime()) <= 2 * 864e5);
    if (twin) out.push({ id: t.id, title: t.title, date: t.date, amount: t.amount, category: t.category, reason: `Same amount at ${t.merchant} on ${twin.date} — possible double charge`, typical: null });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Suggested monthly budgets from the average of the last three full months, rounded up to ₹500. */
export function budgetRecommendations(rows: Row[], budgets: Record<string, number>, today: string) {
  const months = lastMonths(today, 4).slice(0, 3);
  const from = `${months[0]}-01`, to = monthEnd(`${months[2]}-01`);
  const totals: Record<string, number> = {};
  for (const t of rows) if (isSpend(t) && t.date >= from && t.date <= to) totals[t.category] = (totals[t.category] ?? 0) + t.amount;
  return Object.entries(totals).map(([category, total]) => {
    const average = r2(total / 3);
    const suggested = Math.ceil(average / 500) * 500;
    const current = budgets[category] ?? 0;
    return { category, average, suggested, current, note: !current ? "No budget yet" : current < average ? "Budget is below what you usually spend" : current > suggested * 1.5 ? "Budget is well above your usual spend" : "Budget fits your usual spend" };
  }).sort((a, b) => b.average - a.average);
}

/** Concrete savings ideas, each with the verified amount behind it. */
export function savingsIdeas(rows: Row[], today: string, subscriptionsMonthly: number) {
  const ideas: { idea: string; amount: number }[] = [];
  const cmp = lastMonthCompare(rows, today);
  for (const r of cmp.rows.filter((x) => x.delta > 1000 && x.before > 0 && x.delta / x.before > 0.2).slice(0, 3)) {
    ideas.push({ idea: `${r.category} rose by ${Math.round((r.delta / r.before) * 100)}% last month — returning to the earlier level saves this much a month`, amount: r.delta });
  }
  if (subscriptionsMonthly > 0) ideas.push({ idea: "Review active subscriptions — total monthly cost", amount: r2(subscriptionsMonthly) });
  return ideas;
}
