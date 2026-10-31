// Commitments, forecast, safe-to-spend, loans, goals, income and subscription tracking (pure, tested).
// All money in INR. Dates are YYYY-MM-DD strings.

export const FREQUENCIES = ["once", "daily", "weekly", "monthly", "quarterly", "half_yearly", "yearly", "custom"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const FREQ_LABEL: Record<Frequency, string> = {
  once: "One-off", daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", half_yearly: "Half-yearly", yearly: "Yearly", custom: "Custom",
};
export const COMMITMENT_KINDS = ["bill", "subscription", "emi", "insurance", "school_fee", "rent", "planned_purchase", "income", "other"] as const;
export type CommitmentKind = (typeof COMMITMENT_KINDS)[number];
export const KIND_LABEL: Record<CommitmentKind, string> = {
  bill: "Bill", subscription: "Subscription", emi: "EMI", insurance: "Insurance premium", school_fee: "School fee", rent: "Rent",
  planned_purchase: "Planned purchase", income: "Income", other: "Other",
};
/** Income sources (used as the category of income entries and expected income). */
export const INCOME_SOURCES = ["Salary", "Rental income", "Business distributions", "Interest income", "Dividends", "Refunds", "Gifts", "Asset sale proceeds", "Other income"] as const;
export type CommitmentStatus = "active" | "paused" | "cancelled" | "completed";

export interface Commitment {
  id: string;
  name: string;
  kind: CommitmentKind;
  direction: "in" | "out";
  amount: number;
  frequency: Frequency;
  intervalDays: number | null;
  nextDue: string;
  accountId: string | null;
  category: string;
  /** Income: is it confirmed? Unconfirmed income is excluded from the conservative view. */
  confirmed: boolean;
  essential: boolean;
  status: CommitmentStatus;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const toD = (s: string) => new Date(s + "T00:00:00Z");
const fromD = (d: Date) => d.toISOString().slice(0, 10);
export const NEVER = "9999-12-31";
export const addDays = (s: string, n: number) => { const d = toD(s); d.setUTCDate(d.getUTCDate() + n); return fromD(d); };
export function addMonths(s: string, n: number) {
  const d = toD(s); const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return fromD(d);
}
export const daysBetween = (a: string, b: string) => Math.round((toD(b).getTime() - toD(a).getTime()) / 86400000);
export const monthEnd = (s: string) => fromD(new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)), 0)));

/** The due date after `date` for this frequency. One-off items never come round again. */
export function nextAfter(date: string, f: Frequency, intervalDays: number | null = null): string {
  switch (f) {
    case "once": return NEVER;
    case "daily": return addDays(date, 1);
    case "weekly": return addDays(date, 7);
    case "monthly": return addMonths(date, 1);
    case "quarterly": return addMonths(date, 3);
    case "half_yearly": return addMonths(date, 6);
    case "yearly": return addMonths(date, 12);
    case "custom": return addDays(date, Math.max(1, intervalDays ?? 30));
  }
}

export interface Occurrence { commitmentId: string; name: string; date: string; amount: number; direction: "in" | "out"; confirmed: boolean; essential: boolean; overdue: boolean; kind?: CommitmentKind }

/** Scheduled occurrences from `from` through `to` (inclusive). Overdue unpaid ones are placed on `from`. */
export function occurrences(list: Commitment[], from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const c of list) {
    if (c.status !== "active" || !(c.amount > 0)) continue;
    let d = c.nextDue;
    let guard = 0;
    while (d <= to && guard++ < 1000) {
      const overdue = d < from;
      out.push({ commitmentId: c.id, name: c.name, date: overdue ? from : d, amount: c.amount, direction: c.direction, confirmed: c.direction === "out" || c.confirmed, essential: c.essential, overdue, kind: c.kind });
      if (overdue && guard > 1) break; // only the oldest missed one counts as overdue
      d = nextAfter(d, c.frequency, c.intervalDays);
      if (overdue) { while (d < from) d = nextAfter(d, c.frequency, c.intervalDays); }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.direction === "out" ? -1 : 1));
}

/** Status shown in the calendar. Scheduled items are never "paid" until confirmed — paying moves nextDue forward. */
export function dueStatus(c: Commitment, today: string): "cancelled" | "paused" | "completed" | "overdue" | "due_soon" | "scheduled" {
  if (c.status !== "active") return c.status;
  if (c.nextDue < today) return "overdue";
  if (daysBetween(today, c.nextDue) <= 3) return "due_soon";
  return "scheduled";
}

/** Items to remind about: everything overdue plus anything due within `leadDays`. */
export function remindersDue<T extends { date: string; overdue: boolean }>(items: T[], today: string, leadDays: number): T[] {
  const until = addDays(today, Math.max(0, leadDays));
  return items.filter((x) => x.overdue || (x.date >= today && x.date <= until));
}

export interface ForecastDay { date: string; balance: number; inflow: number; outflow: number }
export interface ForecastInput {
  startBalance: number;
  commitments: Commitment[];
  today: string;
  days: number;
  includeUnconfirmed?: boolean;
  /** Extra one-off outflows such as card dues: [{ date, amount, name }] */
  extraOut?: { date: string; amount: number; name: string }[];
  /** Balance you never want to go below (minimum balances + reserves). */
  floor?: number;
}

/** Day-by-day projected balance, plus dates where it drops below the floor. */
export function forecast(i: ForecastInput) {
  const end = addDays(i.today, i.days);
  const occ = occurrences(i.commitments, i.today, end).filter((o) => o.direction === "out" || o.confirmed || i.includeUnconfirmed);
  const extra = (i.extraOut ?? []).filter((x) => x.date <= end).map((x) => ({ date: x.date < i.today ? i.today : x.date, amount: x.amount, direction: "out" as const }));
  const all = [...occ, ...extra];
  const series: ForecastDay[] = [];
  let bal = i.startBalance;
  for (let k = 0; k <= i.days; k++) {
    const d = addDays(i.today, k);
    let inflow = 0, outflow = 0;
    for (const o of all) if (o.date === d) (o.direction === "in" ? (inflow += o.amount) : (outflow += o.amount));
    bal = r2(bal + inflow - outflow);
    series.push({ date: d, balance: bal, inflow: r2(inflow), outflow: r2(outflow) });
  }
  const floor = i.floor ?? 0;
  const lowest = series.reduce((m, x) => (x.balance < m.balance ? x : m), series[0]!);
  const shortDates = series.filter((x) => x.balance < floor).map((x) => x.date);
  return { series, lowest, shortDates, occurrences: occ };
}

export interface SafeToSpend { amount: number; lowest: number; lowestDate: string; steps: { label: string; amount: number }[] }

/**
 * Safe-to-spend = the lowest projected balance over the period, minus the floor (minimum balances + reserves).
 * Because it walks payments in date order, income arriving after a bill can't be used to pay it.
 */
export function safeToSpend(i: ForecastInput & { reserves?: number; minBalance?: number }): SafeToSpend {
  const floor = (i.reserves ?? 0) + (i.minBalance ?? 0);
  const f = forecast({ ...i, floor });
  const end = addDays(i.today, i.days);
  const outs = f.occurrences.filter((o) => o.direction === "out").reduce((s, o) => s + o.amount, 0) + (i.extraOut ?? []).filter((x) => x.date <= end).reduce((s, x) => s + x.amount, 0);
  const ins = f.occurrences.filter((o) => o.direction === "in").reduce((s, o) => s + o.amount, 0);
  const lowest = Math.min(f.lowest.balance, i.startBalance);
  return {
    amount: Math.max(0, r2(lowest - floor)),
    lowest,
    lowestDate: f.lowest.date,
    steps: [
      { label: "Cleared money in your accounts", amount: r2(i.startBalance) },
      { label: i.includeUnconfirmed ? "Income expected (incl. unconfirmed)" : "Confirmed income expected", amount: r2(ins) },
      { label: "Payments due", amount: -r2(outs) },
      { label: "Lowest point in the period", amount: lowest },
      { label: "Minimum balances", amount: -r2(i.minBalance ?? 0) },
      { label: "Reserves & goals set aside", amount: -r2(i.reserves ?? 0) },
    ],
  };
}

// ---------- Loans ----------
export const LOAN_TYPES = ["home", "vehicle", "personal", "education", "gold", "business", "credit_card_emi", "borrowing", "other"] as const;
export type LoanType = (typeof LOAN_TYPES)[number];
export const LOAN_TYPE_LABEL: Record<LoanType, string> = {
  home: "Home loan", vehicle: "Vehicle loan", personal: "Personal loan", education: "Education loan", gold: "Gold loan", business: "Business loan",
  credit_card_emi: "Card EMI", borrowing: "Personal borrowing", other: "Other loan",
};
export interface Amortization { months: number; totalInterest: number; schedule: { month: number; interest: number; principal: number; balance: number }[]; payable: boolean }

/** Reducing-balance schedule for a fixed EMI. */
export function amortize(principal: number, annualRate: number, emi: number): Amortization {
  const m = annualRate / 1200;
  if (principal <= 0) return { months: 0, totalInterest: 0, schedule: [], payable: true };
  if (emi <= principal * m) return { months: Infinity, totalInterest: Infinity, schedule: [], payable: false };
  let bal = principal, total = 0, n = 0;
  const schedule: Amortization["schedule"] = [];
  while (bal > 0.005 && n < 1200) {
    n++;
    const interest = r2(bal * m);
    const pay = Math.min(emi, bal + interest);
    const principalPart = r2(pay - interest);
    bal = r2(bal - principalPart);
    total += interest;
    schedule.push({ month: n, interest, principal: principalPart, balance: Math.max(0, bal) });
  }
  return { months: n, totalInterest: r2(total), schedule, payable: true };
}

/** EMI needed to clear `principal` in `months`. */
export function emiFor(principal: number, annualRate: number, months: number) {
  const m = annualRate / 1200;
  if (months <= 0) return principal;
  if (m === 0) return r2(principal / months);
  return r2((principal * m * (1 + m) ** months) / ((1 + m) ** months - 1));
}

/** Split of the next EMI: interest on the outstanding balance, the rest repays principal. */
export function emiSplit(principal: number, annualRate: number, emi: number) {
  const interest = r2(Math.max(0, principal) * (annualRate / 1200));
  const principalPart = r2(Math.min(Math.max(0, principal), Math.max(0, emi - interest)));
  return { interest, principal: principalPart, total: r2(interest + principalPart) };
}

/** Projected date of the last EMI. */
export const closureDate = (nextDue: string, months: number) => (Number.isFinite(months) && months > 0 ? addMonths(nextDue, months - 1) : null);

/** Compare paying `extra` today: keep EMI (shorter tenure) vs keep tenure (lower EMI). Charges use the prepayment %. */
export function prepayment(principal: number, annualRate: number, emi: number, extra: number, chargePct = 0) {
  const base = amortize(principal, annualRate, emi);
  const after = amortize(Math.max(0, principal - extra), annualRate, emi);
  const lowerEmi = emiFor(Math.max(0, principal - extra), annualRate, base.months);
  const lowerEmiPlan = amortize(Math.max(0, principal - extra), annualRate, lowerEmi);
  const charge = r2(Math.min(extra, principal) * (chargePct / 100));
  return {
    base,
    charge,
    cashImpact: r2(Math.min(extra, principal) + charge),
    reduceTenure: { monthsSaved: base.months - after.months, interestSaved: r2(base.totalInterest - after.totalInterest), netSaving: r2(base.totalInterest - after.totalInterest - charge), months: after.months },
    reduceEmi: { newEmi: lowerEmi, emiDrop: r2(emi - lowerEmi), interestSaved: r2(base.totalInterest - lowerEmiPlan.totalInterest), netSaving: r2(base.totalInterest - lowerEmiPlan.totalInterest - charge) },
  };
}

/** Cost of closing the loan today: outstanding principal plus foreclosure charges. */
export function foreclosure(principal: number, chargePct = 0) {
  const charge = r2(principal * (chargePct / 100));
  return { charge, total: r2(principal + charge) };
}

// ---------- Goals ----------
export function goalProgress(g: { target: number; saved: number; monthly: number }, today: string) {
  const remaining = Math.max(0, r2(g.target - g.saved));
  const pct = g.target > 0 ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0;
  const months = remaining === 0 ? 0 : g.monthly > 0 ? Math.ceil(remaining / g.monthly) : null;
  return { remaining, pct, months, eta: months === null ? null : addMonths(today, months) };
}

// ---------- Income ----------
interface FlowRow { txnType?: string; amount: number; date: string; category: string; merchant?: string | null; title?: string }

/** Expected vs received income this month, and expected income that is late. */
export function incomeTracking(commitments: Commitment[], txns: FlowRow[], today: string) {
  const start = `${today.slice(0, 7)}-01`, end = monthEnd(today);
  const received = txns.filter((t) => t.txnType === "income" && t.date >= start && t.date <= today);
  const bySource: Record<string, number> = {};
  for (const t of received) bySource[t.category] = r2((bySource[t.category] ?? 0) + t.amount);
  const incomes = commitments.filter((c) => c.direction === "in" && c.status === "active");
  const late = incomes.filter((c) => c.nextDue < today).map((c) => ({ id: c.id, name: c.name, amount: c.amount, due: c.nextDue, daysLate: daysBetween(c.nextDue, today), confirmed: c.confirmed }));
  const upcoming = occurrences(incomes, today, end).filter((o) => !o.overdue);
  return {
    received: r2(received.reduce((s, t) => s + t.amount, 0)),
    bySource,
    expectedRemaining: r2(upcoming.reduce((s, o) => s + o.amount, 0)),
    expectedConfirmed: r2(upcoming.filter((o) => o.confirmed).reduce((s, o) => s + o.amount, 0)),
    upcoming,
    late,
    lateAmount: r2(late.reduce((s, l) => s + l.amount, 0)),
  };
}

// ---------- Subscriptions ----------
export interface SubCandidate { merchant: string; avg: number; last: number; count: number; everyDays: number; lastDate: string; increased: boolean }
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Merchants charged 3+ times at a steady ~weekly/monthly/yearly rhythm look like subscriptions. */
export function detectSubscriptions(list: { merchant: string | null; amount: number; date: string }[]): SubCandidate[] {
  const by = new Map<string, { name: string; rows: { amount: number; date: string }[] }>();
  for (const e of list) {
    if (!e.merchant?.trim()) continue;
    const k = key(e.merchant);
    const g = by.get(k) ?? { name: e.merchant.trim(), rows: [] };
    g.rows.push({ amount: e.amount, date: e.date });
    by.set(k, g);
  }
  const out: SubCandidate[] = [];
  for (const { name, rows } of by.values()) {
    if (rows.length < 3) continue;
    rows.sort((a, b) => a.date.localeCompare(b.date));
    const gaps = rows.slice(1).map((r, i) => daysBetween(rows[i]!.date, r.date));
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const steady = gaps.every((g) => Math.abs(g - avgGap) <= Math.max(4, avgGap * 0.15));
    const rhythm = [7, 30, 91, 365].some((p) => Math.abs(avgGap - p) <= p * 0.15);
    if (!steady || !rhythm) continue;
    const last = rows[rows.length - 1]!;
    out.push({ merchant: name, avg: r2(rows.reduce((a, r) => a + r.amount, 0) / rows.length), last: last.amount, count: rows.length, everyDays: Math.round(avgGap), lastDate: last.date, increased: last.amount > rows[rows.length - 2]!.amount + 0.009 });
  }
  return out.sort((a, b) => b.last - a.last);
}

/** Monthly cost of a recurring commitment. One-off items have no monthly cost. */
export function monthlyCost(c: Pick<Commitment, "amount" | "frequency" | "intervalDays">) {
  const per: Record<Frequency, number> = { once: 0, daily: 30.44, weekly: 4.345, monthly: 1, quarterly: 1 / 3, half_yearly: 1 / 6, yearly: 1 / 12, custom: 30.44 / Math.max(1, c.intervalDays ?? 30) };
  return r2(c.amount * per[c.frequency]);
}

/**
 * Subscription module: totals, upcoming renewals, price rises (latest charge above the one before, or the plan
 * price above the last charge) and possible duplicates (same service name, or same price + frequency + category).
 */
export function subscriptionSummary(commitments: Commitment[], expenses: { merchant: string | null; title?: string; amount: number; date: string }[], today: string, windowDays = 30) {
  const subs = commitments.filter((c) => c.kind === "subscription");
  const active = subs.filter((c) => c.status === "active");
  const monthly = r2(active.reduce((s, c) => s + monthlyCost(c), 0));
  const renewals = active.filter((c) => c.nextDue <= addDays(today, windowDays)).sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  const charges = (c: Commitment) => {
    const k = key(c.name);
    return expenses.filter((e) => { const m = key(e.merchant ?? e.title ?? ""); return !!k && !!m && m.includes(k); }).sort((a, b) => a.date.localeCompare(b.date));
  };
  const increases: { id: string; name: string; from: number; to: number }[] = [];
  for (const c of active) {
    const h = charges(c);
    const last = h.at(-1), before = h.at(-2);
    if (last && before && last.amount > before.amount + 0.009) increases.push({ id: c.id, name: c.name, from: before.amount, to: last.amount });
    else if (last && c.amount > last.amount + 0.009) increases.push({ id: c.id, name: c.name, from: last.amount, to: c.amount });
  }
  const duplicates: { ids: string[]; names: string[]; reason: string }[] = [];
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
    const a = active[i]!, b = active[j]!;
    const ka = key(a.name), kb = key(b.name);
    const sameName = ka === kb || (ka.length >= 4 && kb.length >= 4 && (ka.includes(kb) || kb.includes(ka)));
    const samePlan = Math.abs(a.amount - b.amount) < 0.01 && a.frequency === b.frequency && a.category === b.category;
    if (sameName || samePlan) duplicates.push({ ids: [a.id, b.id], names: [a.name, b.name], reason: sameName ? "Same service name" : "Same price, frequency and category" });
  }
  return {
    counts: { active: active.length, paused: subs.filter((c) => c.status === "paused").length, cancelled: subs.filter((c) => c.status === "cancelled").length },
    monthly, annual: r2(monthly * 12), renewals, increases, duplicates,
  };
}
