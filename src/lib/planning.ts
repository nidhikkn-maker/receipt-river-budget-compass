// Commitments, forecast, safe-to-spend, loans, goals and subscription detection (pure, tested).
// All money in INR. Dates are YYYY-MM-DD strings.

export const FREQUENCIES = ["daily", "weekly", "monthly", "quarterly", "half_yearly", "yearly", "custom"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const FREQ_LABEL: Record<Frequency, string> = {
  daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", half_yearly: "Half-yearly", yearly: "Yearly", custom: "Custom",
};
export const COMMITMENT_KINDS = ["bill", "subscription", "emi", "insurance", "school_fee", "rent", "income", "other"] as const;
export type CommitmentKind = (typeof COMMITMENT_KINDS)[number];
export const KIND_LABEL: Record<CommitmentKind, string> = {
  bill: "Bill", subscription: "Subscription", emi: "EMI", insurance: "Insurance", school_fee: "School fee", rent: "Rent", income: "Income", other: "Other",
};
export type CommitmentStatus = "active" | "paused" | "cancelled";

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
export const addDays = (s: string, n: number) => { const d = toD(s); d.setUTCDate(d.getUTCDate() + n); return fromD(d); };
function addMonths(s: string, n: number) {
  const d = toD(s); const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return fromD(d);
}
export const daysBetween = (a: string, b: string) => Math.round((toD(b).getTime() - toD(a).getTime()) / 86400000);

/** The due date after `date` for this frequency. */
export function nextAfter(date: string, f: Frequency, intervalDays: number | null = null): string {
  switch (f) {
    case "daily": return addDays(date, 1);
    case "weekly": return addDays(date, 7);
    case "monthly": return addMonths(date, 1);
    case "quarterly": return addMonths(date, 3);
    case "half_yearly": return addMonths(date, 6);
    case "yearly": return addMonths(date, 12);
    case "custom": return addDays(date, Math.max(1, intervalDays ?? 30));
  }
}

export interface Occurrence { commitmentId: string; name: string; date: string; amount: number; direction: "in" | "out"; confirmed: boolean; essential: boolean; overdue: boolean }

/** Scheduled occurrences from `from` through `to` (inclusive). Overdue unpaid ones are placed on `from`. */
export function occurrences(list: Commitment[], from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const c of list) {
    if (c.status !== "active" || !(c.amount > 0)) continue;
    let d = c.nextDue;
    let guard = 0;
    while (d <= to && guard++ < 1000) {
      const overdue = d < from;
      out.push({ commitmentId: c.id, name: c.name, date: overdue ? from : d, amount: c.amount, direction: c.direction, confirmed: c.direction === "out" || c.confirmed, essential: c.essential, overdue });
      if (overdue && guard > 1) break; // only the oldest missed one counts as overdue
      d = nextAfter(d, c.frequency, c.intervalDays);
      if (overdue) { while (d < from) d = nextAfter(d, c.frequency, c.intervalDays); }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.direction === "out" ? -1 : 1));
}

/** Status shown in the calendar. Scheduled items are never "paid" until confirmed — paying moves nextDue forward. */
export function dueStatus(c: Commitment, today: string): "cancelled" | "paused" | "overdue" | "due_soon" | "scheduled" {
  if (c.status !== "active") return c.status;
  if (c.nextDue < today) return "overdue";
  if (daysBetween(today, c.nextDue) <= 3) return "due_soon";
  return "scheduled";
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
  const extra = (i.extraOut ?? []).map((x) => ({ date: x.date < i.today ? i.today : x.date, amount: x.amount, direction: "out" as const }));
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
  const outs = f.occurrences.filter((o) => o.direction === "out").reduce((s, o) => s + o.amount, 0) + (i.extraOut ?? []).reduce((s, x) => s + x.amount, 0);
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

/** Compare paying `extra` today: keep EMI (shorter tenure) vs keep tenure (lower EMI). */
export function prepayment(principal: number, annualRate: number, emi: number, extra: number) {
  const base = amortize(principal, annualRate, emi);
  const after = amortize(Math.max(0, principal - extra), annualRate, emi);
  const lowerEmi = emiFor(Math.max(0, principal - extra), annualRate, base.months);
  const lowerEmiPlan = amortize(Math.max(0, principal - extra), annualRate, lowerEmi);
  return {
    base,
    reduceTenure: { monthsSaved: base.months - after.months, interestSaved: r2(base.totalInterest - after.totalInterest), months: after.months },
    reduceEmi: { newEmi: lowerEmi, emiDrop: r2(emi - lowerEmi), interestSaved: r2(base.totalInterest - lowerEmiPlan.totalInterest) },
  };
}

// ---------- Goals ----------
export function goalProgress(g: { target: number; saved: number; monthly: number }, today: string) {
  const remaining = Math.max(0, r2(g.target - g.saved));
  const pct = g.target > 0 ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0;
  const months = remaining === 0 ? 0 : g.monthly > 0 ? Math.ceil(remaining / g.monthly) : null;
  return { remaining, pct, months, eta: months === null ? null : addMonths(today, months) };
}

// ---------- Subscriptions ----------
export interface SubCandidate { merchant: string; avg: number; last: number; count: number; everyDays: number; lastDate: string; increased: boolean }

/** Merchants charged 3+ times at a steady ~weekly/monthly/yearly rhythm look like subscriptions. */
export function detectSubscriptions(list: { merchant: string | null; amount: number; date: string }[]): SubCandidate[] {
  const by = new Map<string, { name: string; rows: { amount: number; date: string }[] }>();
  for (const e of list) {
    if (!e.merchant?.trim()) continue;
    const k = e.merchant.toLowerCase().replace(/[^a-z0-9]/g, "");
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

/** Monthly cost of a recurring commitment. */
export function monthlyCost(c: Pick<Commitment, "amount" | "frequency" | "intervalDays">) {
  const per: Record<Frequency, number> = { daily: 30.44, weekly: 4.345, monthly: 1, quarterly: 1 / 3, half_yearly: 1 / 6, yearly: 1 / 12, custom: 30.44 / Math.max(1, c.intervalDays ?? 30) };
  return r2(c.amount * per[c.frequency]);
}
