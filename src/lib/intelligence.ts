// Phase 2 & 3 rules (pure, tested): decision simulator, behaviour patterns, emergency fund, irregular expenses,
// milestones, trips, merchant intelligence and the weekly brief. All money is INR, rounded to paise.
import { accountBalance, cashflow, isLiability, netWorth, type Account, type Txn, type Valuation } from "./ledger";
import { addDays, addMonths, daysBetween, forecast, monthEnd, prepayment, type Commitment } from "./planning";
import { categoryParts } from "./expenses";

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => r2(xs.reduce((s, x) => s + x, 0));
export interface Row extends Txn { id: string; category: string; merchant: string | null; title: string; tags?: string[]; currency?: string; originalAmount?: number; fxRate?: number; allocations?: { category: string; amount: number }[]; reimbursementStatus?: string; paymentMethod?: string }
const isSpend = (t: Txn) => (t.txnType ?? "expense") === "expense";
const CASH = ["savings", "current", "cash", "wallet"];

// ---------- 8. Decision simulator ----------
export const SCENARIOS = ["purchase", "postpone", "loan_extra", "increase_savings", "reduce_category", "card_payment", "new_recurring", "goal_allocation"] as const;
export type ScenarioKind = (typeof SCENARIOS)[number];
export const SCENARIO_LABEL: Record<ScenarioKind, string> = {
  purchase: "Make a purchase", postpone: "Postpone a purchase", loan_extra: "Pay extra on a loan", increase_savings: "Increase monthly savings",
  reduce_category: "Cut a spending category", card_payment: "Large card payment", new_recurring: "New recurring expense", goal_allocation: "Put money into a goal",
};
export interface Scenario { kind: ScenarioKind; amount: number; date: string; recurring: boolean; postponeTo?: string; loanIndex?: number; goalIndex?: number; months?: number }
export interface SimInput {
  cash: number; floor: number; commitments: Commitment[]; today: string; days: number;
  goals: { name: string; target: number; saved: number; monthly: number }[];
  loans: { name: string; principal: number; rate: number; emi: number }[];
  monthlySavings: number;
}
export interface SimSide { cash: number; available: number; lowest: number; lowestDate: string; shortDays: number; endBalance: number; savingsPerMonth: number; goal?: { name: string; pct: number; eta: string | null } }

function side(i: SimInput, extra: Commitment[], cashDelta: number, savingsDelta: number, goalIdx?: number, goalAdd = 0, goalMonthlyAdd = 0): SimSide {
  const f = forecast({ startBalance: i.cash + cashDelta, commitments: [...i.commitments, ...extra], today: i.today, days: i.days, floor: i.floor });
  const lowest = Math.min(f.lowest.balance, i.cash + cashDelta);
  const g = goalIdx !== undefined ? i.goals[goalIdx] : undefined;
  let goal: SimSide["goal"];
  if (g) {
    const saved = g.saved + goalAdd, monthly = g.monthly + goalMonthlyAdd, rem = Math.max(0, g.target - saved);
    goal = { name: g.name, pct: g.target > 0 ? Math.min(100, Math.round((saved / g.target) * 100)) : 0, eta: rem === 0 ? i.today : monthly > 0 ? addMonths(i.today, Math.ceil(rem / monthly)) : null };
  }
  return { cash: r2(i.cash + cashDelta), available: Math.max(0, r2(lowest - i.floor)), lowest: r2(lowest), lowestDate: f.lowest.date, shortDays: f.shortDates.length, endBalance: f.series.at(-1)!.balance, savingsPerMonth: r2(i.monthlySavings + savingsDelta), goal };
}

const oneOff = (name: string, amount: number, date: string, recurring: boolean): Commitment => ({ id: `sim-${name}`, name, kind: "planned_purchase", direction: "out", amount, frequency: recurring ? "monthly" : "once", intervalDays: null, nextDue: date, accountId: null, category: "Miscellaneous", confirmed: true, essential: false, status: "active" });

/** Before/after comparison. Never touches real records: outputs only. */
export function simulate(i: SimInput, s: Scenario) {
  const amt = Math.max(0, r2(s.amount));
  const before = side(i, [], 0, 0, s.goalIndex);
  let after: SimSide; let loan: null | { interestSaved: number; monthsSaved: number } = null; const notes: string[] = [];
  switch (s.kind) {
    case "purchase": case "card_payment": after = side(i, [oneOff("Simulated", amt, s.date, s.recurring)], 0, s.recurring ? -amt : 0, s.goalIndex); break;
    case "new_recurring": after = side(i, [oneOff("Simulated", amt, s.date, true)], 0, -amt, s.goalIndex); break;
    case "postpone": {
      // The purchase moves from `date` to `postponeTo`: compare buying now vs later.
      const later = s.postponeTo ?? addMonths(s.date, 1);
      const now = side(i, [oneOff("Now", amt, s.date, false)], 0, 0, s.goalIndex);
      after = side(i, [oneOff("Later", amt, later, false)], 0, 0, s.goalIndex);
      return { before: now, after, loan, notes: [`Buying on ${later} instead of ${s.date}.`], hypothetical: true as const };
    }
    case "loan_extra": {
      const l = i.loans[s.loanIndex ?? 0];
      if (l) { const p = prepayment(l.principal, l.rate, l.emi, amt); loan = { interestSaved: p.reduceTenure.interestSaved, monthsSaved: p.reduceTenure.monthsSaved }; notes.push(`${l.name}: keeping the EMI, the loan closes ${p.reduceTenure.monthsSaved} months sooner.`); }
      else notes.push("No loan selected.");
      after = side(i, [oneOff("Loan prepayment", amt, s.date, s.recurring)], 0, 0, s.goalIndex); break;
    }
    case "increase_savings": after = side(i, [oneOff("Extra saving", amt, s.date, true)], 0, amt, s.goalIndex, 0, amt); notes.push("Saved money leaves spendable cash but adds to savings."); break;
    case "reduce_category": after = side(i, [{ ...oneOff("Spending cut", amt, s.date, true), direction: "in" }], 0, amt, s.goalIndex); notes.push("Assumes the cut is kept every month."); break;
    case "goal_allocation": after = side(i, [oneOff("Goal allocation", amt, s.date, s.recurring)], 0, 0, s.goalIndex, s.recurring ? 0 : amt, s.recurring ? amt : 0); break;
  }
  return { before, after, loan, notes, hypothetical: true as const };
}

// ---------- 9. Behaviour analysis ----------
export interface Observation { key: string; title: string; detail: string; impact: number; period: string; action: string; txnIds: string[] }
const monthOf = (d: string) => d.slice(0, 7);
const prevMonth = (m: string) => { const [y, mo] = m.split("-").map(Number); const t = y! * 12 + mo! - 2; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };

/** Factual, rule-based patterns from saved spending. No assumptions about motives. */
export function behaviour(txns: Row[], today: string, impulseLimit = 2000): Observation[] {
  const spend = txns.filter(isSpend);
  const out: Observation[] = [];
  const cur = monthOf(today), prev = prevMonth(cur), last3 = [prevMonth(prev), prev, cur];
  const byCatMonth = (m: string) => { const t: Record<string, { amt: number; ids: string[] }> = {}; for (const e of spend.filter((x) => monthOf(x.date) === m)) for (const p of categoryParts(e)) { (t[p.category] ??= { amt: 0, ids: [] }).amt += p.amount; t[p.category]!.ids.push(e.id); } return t; };
  const now = byCatMonth(cur), before = byCatMonth(prev);
  // Unusual increases: category up >30% and >₹1,000 vs last month.
  for (const [c, v] of Object.entries(now)) { const b = before[c]?.amt ?? 0; if (b > 0 && v.amt > b * 1.3 && v.amt - b >= 1000) out.push({ key: `rise:${c}`, title: `${c} is up ${Math.round(((v.amt - b) / b) * 100)}%`, detail: `₹${r2(v.amt).toLocaleString("en-IN")} this month vs ₹${r2(b).toLocaleString("en-IN")} last month.`, impact: r2(v.amt - b), period: `${cur} vs ${prev}`, action: `Review the ${v.ids.length} ${c} entries or set a budget.`, txnIds: v.ids }); }
  // Concentration: one category >40% of the last 3 months.
  const window = spend.filter((x) => last3.includes(monthOf(x.date)));
  const total = sum(window.map((x) => x.amount));
  const cat3: Record<string, { amt: number; ids: string[] }> = {}; for (const e of window) for (const p of categoryParts(e)) { (cat3[p.category] ??= { amt: 0, ids: [] }).amt += p.amount; cat3[p.category]!.ids.push(e.id); }
  for (const [c, v] of Object.entries(cat3)) if (total > 0 && v.amt / total > 0.4) out.push({ key: `conc:${c}`, title: `${Math.round((v.amt / total) * 100)}% of spending is ${c}`, detail: `₹${r2(v.amt).toLocaleString("en-IN")} of ₹${total.toLocaleString("en-IN")} over three months.`, impact: r2(v.amt), period: `${last3[0]} – ${cur}`, action: "Check whether this category needs its own budget.", txnIds: v.ids });
  // Weekday vs weekend daily average over the last 90 days.
  const from90 = addDays(today, -89); const recent = spend.filter((x) => x.date >= from90 && x.date <= today);
  const wk = recent.filter((x) => [0, 6].includes(new Date(x.date + "T00:00:00Z").getUTCDay()));
  const wd = recent.filter((x) => !wk.includes(x));
  const wkAvg = r2(sum(wk.map((x) => x.amount)) / 26), wdAvg = r2(sum(wd.map((x) => x.amount)) / 64);
  if (recent.length >= 10 && wdAvg > 0 && wkAvg > wdAvg * 1.5) out.push({ key: "weekend", title: "Weekend days cost more", detail: `Average ₹${wkAvg.toLocaleString("en-IN")} per weekend day vs ₹${wdAvg.toLocaleString("en-IN")} per weekday (last 90 days).`, impact: r2((wkAvg - wdAvg) * 8), period: "Last 90 days", action: "Plan a weekend spending limit.", txnIds: wk.map((x) => x.id) });
  // Merchant patterns: same merchant ≥4 times this month.
  const m: Record<string, Row[]> = {}; for (const e of spend.filter((x) => monthOf(x.date) === cur && x.merchant)) (m[normaliseMerchant(e.merchant!)] ??= []).push(e);
  for (const [k, list] of Object.entries(m)) if (list.length >= 4) out.push({ key: `merchant:${k}`, title: `${list.length} payments to ${list[0]!.merchant} this month`, detail: `Total ₹${sum(list.map((x) => x.amount)).toLocaleString("en-IN")}.`, impact: sum(list.map((x) => x.amount)), period: cur, action: "Consider whether a plan or bulk purchase is cheaper.", txnIds: list.map((x) => x.id) });
  // Impulse rule (explicit): discretionary-category purchase ≥ limit on a day with 3+ other purchases, or between 10pm–5am is not knowable, so only the same-day rule is used.
  const disc = ["Shopping", "Entertainment", "Food and beverages", "Personal care"];
  const byDay: Record<string, Row[]> = {}; for (const e of spend.filter((x) => x.date >= addDays(today, -29))) (byDay[e.date] ??= []).push(e);
  const imp = Object.values(byDay).filter((d) => d.length >= 4).flatMap((d) => d.filter((x) => disc.includes(x.category) && x.amount >= impulseLimit));
  if (imp.length) out.push({ key: "impulse", title: `${imp.length} large discretionary purchases on busy spending days`, detail: `Rule: ${disc.join(", ")} purchases of ₹${impulseLimit.toLocaleString("en-IN")}+ on days with 4 or more payments (last 30 days).`, impact: sum(imp.map((x) => x.amount)), period: "Last 30 days", action: "Try a 24-hour wait before large discretionary buys.", txnIds: imp.map((x) => x.id) });
  // Spending growing faster than income (this quarter vs previous quarter).
  const q = (start: string, end: string) => cashflow(txns, start, end);
  const qNow = q(addDays(today, -89), today), qPrev = q(addDays(today, -179), addDays(today, -90));
  if (qPrev.spent > 0 && qPrev.income > 0) { const sg = (qNow.spent - qPrev.spent) / qPrev.spent, ig = (qNow.income - qPrev.income) / qPrev.income; if (sg > ig + 0.1) out.push({ key: "growth", title: "Spending is growing faster than income", detail: `Spending ${Math.round(sg * 100)}% vs income ${Math.round(ig * 100)}% compared with the previous 90 days.`, impact: r2(qNow.spent - qPrev.spent), period: "Last 90 vs previous 90 days", action: "Look at the categories with the biggest increases above.", txnIds: [] }); }
  // Seasonal: this month vs same month last year.
  const ly = `${Number(cur.slice(0, 4)) - 1}${cur.slice(4)}`;
  const tNow = sum(spend.filter((x) => monthOf(x.date) === cur).map((x) => x.amount)), tLy = sum(spend.filter((x) => monthOf(x.date) === ly).map((x) => x.amount));
  if (tLy > 0 && Math.abs(tNow - tLy) / tLy > 0.25) out.push({ key: "season", title: `${tNow > tLy ? "Higher" : "Lower"} than the same month last year`, detail: `₹${tNow.toLocaleString("en-IN")} vs ₹${tLy.toLocaleString("en-IN")} in ${ly}.`, impact: r2(tNow - tLy), period: `${cur} vs ${ly}`, action: "Seasonal costs can be planned in Irregular expenses.", txnIds: [] });
  return out.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
}

// ---------- 10. Emergency fund ----------
export interface EmergencySettings { accountIds: string[]; excludeEarmarked: boolean; essentialCategories: string[]; includeEmis: boolean; targetMonths: number; method: "conservative" | "custom"; customMonthly: number; monthlyContribution: number }
export const DEFAULT_ESSENTIALS = ["Groceries", "Utility bills", "Medical and healthcare", "Insurance", "Education", "Household expenses", "Fuel and vehicle expenses", "Domestic staff"];
export function defaultEmergency(): EmergencySettings { return { accountIds: [], excludeEarmarked: true, essentialCategories: DEFAULT_ESSENTIALS, includeEmis: true, targetMonths: 6, method: "conservative", customMonthly: 0, monthlyContribution: 0 }; }

/** Coverage = eligible liquid reserves ÷ monthly essentials. Credit limits and non-cash assets never count. */
export function emergencyFund(s: EmergencySettings, accounts: Account[], txns: Row[], emis: number, earmarked: number, today: string) {
  const eligible = accounts.filter((a) => !a.archived && CASH.includes(a.kind) && !isLiability(a.kind) && (s.accountIds.length === 0 || s.accountIds.includes(a.id)));
  const gross = sum(eligible.map((a) => Math.max(0, accountBalance(a, txns))));
  const reserves = Math.max(0, r2(gross - (s.excludeEarmarked ? earmarked : 0)));
  const months = [1, 2, 3, 4, 5, 6].map((k) => { const end = monthEnd(addMonths(`${today.slice(0, 7)}-01`, -k)); const start = `${end.slice(0, 7)}-01`; return sum(txns.filter((t) => isSpend(t) && t.date >= start && t.date <= end).flatMap((t) => categoryParts(t).filter((p) => s.essentialCategories.includes(p.category)).map((p) => p.amount))); });
  const withData = months.filter((x) => x > 0);
  // Conservative: the highest of the last six months, not the average.
  const base = s.method === "custom" && s.customMonthly > 0 ? s.customMonthly : withData.length ? Math.max(...withData) : 0;
  const monthly = r2(base + (s.includeEmis ? emis : 0));
  const coverage = monthly > 0 ? Math.round((reserves / monthly) * 10) / 10 : null;
  const target = r2(monthly * s.targetMonths);
  const gap = Math.max(0, r2(target - reserves));
  const eta = gap === 0 ? today : s.monthlyContribution > 0 ? addMonths(today, Math.ceil(gap / s.monthlyContribution)) : null;
  return { reserves, gross, earmarked: s.excludeEarmarked ? earmarked : 0, monthly, essentials: r2(base), emis: s.includeEmis ? emis : 0, coverage, target, gap, eta, pct: target > 0 ? Math.min(100, Math.round((reserves / target) * 100)) : 0, accounts: eligible.map((a) => a.name), monthsWithData: withData.length };
}

// ---------- 11. Irregular expenses ----------
export interface IrregularCandidate { key: string; name: string; category: string; occurrences: { date: string; amount: number }[]; lastDate: string; nextDate: string; estimate: number; monthlyProvision: number; everyMonths: number }
/** Payments that recur roughly yearly (or 6-monthly) by merchant/category, from 300+ days of history. */
export function irregularCandidates(txns: Row[], today: string): IrregularCandidate[] {
  const groups: Record<string, Row[]> = {};
  for (const t of txns.filter(isSpend)) { const k = t.merchant ? normaliseMerchant(t.merchant) : `cat:${t.category}`; (groups[k] ??= []).push(t); }
  const out: IrregularCandidate[] = [];
  for (const [key, list0] of Object.entries(groups)) {
    const list = [...list0].sort((a, b) => a.date.localeCompare(b.date));
    if (list.length < 2 || list.length > 6) continue;
    const gaps = list.slice(1).map((t, k) => daysBetween(list[k]!.date, t.date));
    const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const yearly = avg >= 330 && avg <= 400, half = avg >= 160 && avg <= 205;
    if (!(yearly || half) || gaps.some((g) => Math.abs(g - avg) > 45)) continue;
    const everyMonths = yearly ? 12 : 6;
    const last = list.at(-1)!;
    let next = addMonths(last.date, everyMonths); while (next < today) next = addMonths(next, everyMonths);
    // Estimate = latest amount grown by the average change between occurrences (never below zero).
    const growth = list.length > 1 ? (last.amount - list[0]!.amount) / (list.length - 1) : 0;
    const estimate = Math.max(0, r2(last.amount + growth));
    const monthsLeft = Math.max(1, Math.ceil(daysBetween(today, next) / 30.4));
    out.push({ key, name: last.merchant ?? last.category, category: last.category, occurrences: list.map((t) => ({ date: t.date, amount: t.amount })), lastDate: last.date, nextDate: next, estimate, monthlyProvision: r2(estimate / monthsLeft), everyMonths });
  }
  return out.sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}
export const provisionFor = (amount: number, due: string, today: string) => r2(amount / Math.max(1, Math.ceil(daysBetween(today, due) / 30.4)));

// ---------- 12. Milestones ----------
export const MILESTONE_METRICS = ["emergency_amount", "emergency_months", "net_worth", "savings", "card_debt", "loan_balance", "custom"] as const;
export type MilestoneMetric = (typeof MILESTONE_METRICS)[number];
export const METRIC_LABEL: Record<MilestoneMetric, string> = { emergency_amount: "Emergency reserve (₹)", emergency_months: "Emergency coverage (months)", net_worth: "Net worth (₹)", savings: "Total cash savings (₹)", card_debt: "Credit card dues down to (₹)", loan_balance: "Loan balance down to (₹)", custom: "Manual progress (₹)" };
export interface Milestone { id: string; name: string; metric: MilestoneMetric; target: number; targetDate: string | null; loanName?: string; manual?: number; start?: number; notify: boolean; history: { date: string; value: number }[]; createdAt: string }
export interface Metrics { emergencyAmount: number; emergencyMonths: number | null; netWorth: number; savings: number; cardDebt: number; loans: { name: string; principal: number }[] }
export const isReduction = (m: MilestoneMetric) => m === "card_debt" || m === "loan_balance";
export function metricValue(m: Milestone, x: Metrics): number {
  switch (m.metric) {
    case "emergency_amount": return x.emergencyAmount; case "emergency_months": return x.emergencyMonths ?? 0; case "net_worth": return x.netWorth;
    case "savings": return x.savings; case "card_debt": return x.cardDebt; case "custom": return m.manual ?? 0;
    case "loan_balance": return x.loans.find((l) => l.name === m.loanName)?.principal ?? 0;
  }
}
/** Progress from the starting value toward the target; reductions (debts) count downward. ETA from recorded history pace. */
export function milestoneProgress(m: Milestone, x: Metrics, today: string) {
  const value = r2(metricValue(m, x));
  const start = m.start ?? m.history[0]?.value ?? value;
  const red = isReduction(m.metric);
  const done = red ? value <= m.target : value >= m.target;
  const span = red ? start - m.target : m.target - (red ? 0 : Math.min(start, 0));
  const moved = red ? start - value : value - Math.min(start, 0);
  const pct = done ? 100 : span > 0 ? Math.max(0, Math.min(99, Math.round((moved / span) * 100))) : 0;
  const remaining = done ? 0 : r2(Math.abs(m.target - value));
  const h = [...m.history].sort((a, b) => a.date.localeCompare(b.date));
  let eta: string | null = done ? today : null;
  if (!done && h.length >= 2) { const first = h[0]!, days = daysBetween(first.date, today); const rate = days > 0 ? (red ? first.value - value : value - first.value) / days : 0; if (rate > 0) eta = addDays(today, Math.ceil(remaining / rate)); }
  const onTrack = m.targetDate ? (eta ? eta <= m.targetDate : false) : null;
  return { value, start, pct, remaining, done, eta, onTrack };
}
/** Add today's value to history (one point per day, latest 120). */
export function recordProgress(m: Milestone, value: number, today: string): Milestone {
  const history = [...m.history.filter((p) => p.date !== today), { date: today, value: r2(value) }].sort((a, b) => a.date.localeCompare(b.date)).slice(-120);
  return { ...m, history };
}

// ---------- 13. Trips ----------
export interface Trip { id: string; name: string; destination: string; start: string; end: string; budget: number; currencies: string[] }
export const tripTag = (t: Pick<Trip, "name">) => `Trip: ${t.name}`;
/** Uses the INR amount and exchange rate stored on each entry — today's rate never rewrites history. */
export function tripSummary(t: Trip, txns: Row[]) {
  const tag = tripTag(t);
  const list = txns.filter((x) => isSpend(x) && ((x.tags ?? []).includes(tag)));
  const total = sum(list.map((x) => x.amount));
  const days = Math.max(1, daysBetween(t.start, t.end) + 1);
  const daily: Record<string, number> = {}; for (const x of list) daily[x.date] = r2((daily[x.date] ?? 0) + x.amount);
  const cats: Record<string, number> = {}; for (const x of list) for (const p of categoryParts(x)) cats[p.category] = r2((cats[p.category] ?? 0) + p.amount);
  const cur: Record<string, { original: number; inr: number; rates: number[] }> = {};
  for (const x of list) { const c = x.currency ?? "INR"; const v = (cur[c] ??= { original: 0, inr: 0, rates: [] }); v.original = r2(v.original + (x.originalAmount ?? x.amount)); v.inr = r2(v.inr + x.amount); if (x.fxRate && !v.rates.includes(x.fxRate)) v.rates.push(x.fxRate); }
  const reimbursable = sum(list.filter((x) => (x.tags ?? []).includes("Purpose: Reimbursable") || x.reimbursementStatus === "pending").map((x) => x.amount));
  return { tag, entries: list, total, perDay: r2(total / days), days, daily: Object.entries(daily).sort().map(([date, amount]) => ({ date, amount })), categories: Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount })), currencies: Object.entries(cur).map(([currency, v]) => ({ currency, ...v })), variance: r2(t.budget - total), reimbursable, overBudget: t.budget > 0 && total > t.budget };
}

// ---------- 14. Merchant intelligence ----------
/** Lowercase, strip payment-rail noise and digits so spelling variants line up. Original names are never changed. */
export function normaliseMerchant(s: string) {
  return s.toLowerCase().replace(/\b(upi|pos|imps|neft|ach|vps|ecom|pvt|ltd|limited|india|inc|llp|www|com|in)\b/g, " ").replace(/[^a-z]+/g, " ").trim().split(/\s+/).slice(0, 3).join(" ");
}
export type MerchantAliases = Record<string, string>; // original-normalised key -> profile name
export const merchantKey = (raw: string, aliases: MerchantAliases) => aliases[normaliseMerchant(raw)] ?? normaliseMerchant(raw);

export function merchantProfiles(txns: Row[], aliases: MerchantAliases, today: string) {
  const cur = monthOf(today), prev = prevMonth(cur);
  const g: Record<string, Row[]> = {};
  for (const t of txns.filter((x) => isSpend(x) && x.merchant)) (g[merchantKey(t.merchant!, aliases)] ??= []).push(t);
  return Object.entries(g).map(([key, list]) => {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const names = [...new Set(list.map((x) => x.merchant!))];
    const thisM = sum(list.filter((x) => monthOf(x.date) === cur).map((x) => x.amount)), lastM = sum(list.filter((x) => monthOf(x.date) === prev).map((x) => x.amount));
    const gaps = sorted.slice(1).map((t, k) => daysBetween(sorted[k]!.date, t.date));
    const avgGap = gaps.length ? gaps.reduce((s, x) => s + x, 0) / gaps.length : 0;
    const recurring = gaps.length >= 2 && avgGap >= 25 && avgGap <= 35 && gaps.every((x) => Math.abs(x - avgGap) <= 6);
    return { key, name: aliasDisplay(key, names), names, total: sum(list.map((x) => x.amount)), count: list.length, thisMonth: thisM, lastMonth: lastM, increase: lastM > 0 && thisM > lastM * 1.3 && thisM - lastM >= 500, recurring, lastDate: sorted.at(-1)!.date, ids: list.map((x) => x.id) };
  }).sort((a, b) => b.total - a.total);
}
const aliasDisplay = (key: string, names: string[]) => (names.length === 1 ? names[0]! : key.replace(/\b\w/g, (c) => c.toUpperCase()));
/** Merge: every listed variant points to the target profile key. */
export function mergeMerchants(aliases: MerchantAliases, variants: string[], target: string): MerchantAliases { const next = { ...aliases }; for (const v of variants) next[normaliseMerchant(v)] = target; return next; }
export function unmergeMerchant(aliases: MerchantAliases, variant: string): MerchantAliases { const next = { ...aliases }; delete next[normaliseMerchant(variant)]; return next; }
/** Suggested merges: different raw names whose normalised forms share a first word of 4+ letters. */
export function mergeSuggestions(profiles: { key: string; name: string }[]) {
  const by: Record<string, string[]> = {};
  for (const p of profiles) { const w = p.key.split(" ")[0] ?? ""; if (w.length >= 4) (by[w] ??= []).push(p.key); }
  return Object.entries(by).filter(([, ks]) => ks.length > 1).map(([word, keys]) => ({ word, keys }));
}

// ---------- 15. Weekly brief ----------
export interface BriefSettings { enabled: boolean; day: number; hour: number }
export interface BriefInput { txns: Row[]; accounts: Account[]; valuations?: Valuation[]; commitments: Commitment[]; upcoming: { name: string; date: string; amount: number; direction: "in" | "out" }[]; lowest: number; floor: number; staleAccounts: string[]; pendingReimbursements: number; missingItems: number; budgetWarnings: string[]; today: string }
/** Week = the seven days ending yesterday (Mon–Sun when generated on Monday). */
export function weeklyBrief(i: BriefInput) {
  const end = addDays(i.today, -1), start = addDays(end, -6), pEnd = addDays(start, -1), pStart = addDays(pEnd, -6);
  const w = cashflow(i.txns, start, end), p = cashflow(i.txns, pStart, pEnd);
  const week = i.txns.filter((t) => isSpend(t) && t.date >= start && t.date <= end);
  const cats: Record<string, number> = {}; for (const t of week) for (const x of categoryParts(t)) cats[x.category] = r2((cats[x.category] ?? 0) + x.amount);
  const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
  const avg = week.length ? w.spent / week.length : 0;
  const significant = week.filter((t) => t.amount >= Math.max(2000, avg * 2)).sort((a, b) => b.amount - a.amount).slice(0, 5).map((t) => ({ id: t.id, title: t.merchant ?? t.title, amount: t.amount, date: t.date }));
  const change = p.spent > 0 ? Math.round(((w.spent - p.spent) / p.spent) * 100) : null;
  const next7 = i.upcoming.filter((u) => u.date >= i.today && u.date <= addDays(i.today, 7));
  const due = next7.filter((u) => u.direction === "out"), income = next7.filter((u) => u.direction === "in");
  const shortfall = i.lowest < i.floor;
  const recs: string[] = [];
  if (shortfall) recs.push(`Cash is projected to dip below your safety floor — lowest ₹${Math.round(i.lowest).toLocaleString("en-IN")}. Move money or delay a payment.`);
  if (i.staleAccounts.length) recs.push(`Reconcile ${i.staleAccounts.slice(0, 2).join(", ")} — figures depend on outdated balances.`);
  if (i.budgetWarnings.length) recs.push(`Budget pressure: ${i.budgetWarnings[0]}.`);
  if (change !== null && change > 25 && top) recs.push(`Spending rose ${change}% this week, mostly ${top[0]}.`);
  if (i.pendingReimbursements > 0) recs.push(`Follow up ₹${Math.round(i.pendingReimbursements).toLocaleString("en-IN")} of pending reimbursements.`);
  return {
    period: { start, end }, snapshot: { spent: w.spent, income: w.income, net: w.net, prevSpent: p.spent, change },
    highlights: { topCategory: top ? { category: top[0], amount: top[1] } : null, significant, unusual: change !== null && Math.abs(change) > 25 ? `${change > 0 ? "Up" : "Down"} ${Math.abs(change)}% vs the previous week` : null },
    upcoming: { due, income, dueTotal: sum(due.map((x) => x.amount)), incomeTotal: sum(income.map((x) => x.amount)), shortfall, lowest: r2(i.lowest) },
    attention: { staleAccounts: i.staleAccounts, pendingReimbursements: r2(i.pendingReimbursements), missingItems: i.missingItems, budgetWarnings: i.budgetWarnings },
    recommendations: recs.slice(0, 3), netWorth: netWorth(i.accounts.filter((a) => !a.archived), i.txns, i.valuations ?? []).netWorth,
  };
}
export type WeeklyBrief = ReturnType<typeof weeklyBrief>;
/** True when the scheduled brief for this week is due and not yet generated. */
export function briefDue(s: BriefSettings, lastGenerated: string | null, now: Date) {
  if (!s.enabled) return false;
  const d = now.getDay(), h = now.getHours();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const back = (d - s.day + 7) % 7; const slot = addDays(today, -back);
  if (back === 0 && h < s.hour) return false;
  return !lastGenerated || lastGenerated < slot;
}
