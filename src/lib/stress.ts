// Financial Stress Testing: interactive resilience scenarios. Pure, tested.
// Every scenario runs on a copy of the forecast inputs — real records are never touched.

import { forecast, occurrences, addDays, addMonths, type Commitment } from "./planning";

export const STRESS_SCENARIOS = ["salary_delayed", "rent_delayed", "medical", "emergency_payment", "higher_spend", "income_interrupted", "higher_interest", "combined"] as const;
export type StressKind = (typeof STRESS_SCENARIOS)[number];
export const STRESS_LABEL: Record<StressKind, string> = {
  salary_delayed: "Salary arrives late",
  rent_delayed: "Rental income arrives late",
  medical: "Unexpected medical expense",
  emergency_payment: "Large emergency payment",
  higher_spend: "Monthly spending rises",
  income_interrupted: "Income stops for a while",
  higher_interest: "Loan interest rate rises",
  combined: "Several things go wrong together",
};

export interface StressScenario {
  kind: StressKind;
  /** One-off amount for medical / emergency_payment. */
  amount: number;
  /** Days late for salary_delayed / rent_delayed. */
  delayDays: number;
  /** Months without income for income_interrupted. */
  months: number;
  /** % rise for higher_spend. */
  spendIncreasePct: number;
  /** Percentage-point rise for higher_interest. */
  rateIncrease: number;
}

export const defaultStress = (kind: StressKind): StressScenario => ({ kind, amount: 50000, delayDays: 15, months: 2, spendIncreasePct: 20, rateIncrease: 2 });

export interface StressInput {
  cash: number;
  minBalance: number;
  reserves: number;
  commitments: Commitment[];
  loans: { name: string; principal: number; rate: number; emi: number; nextDue: string }[];
  /** Average monthly spending, used by higher_spend. */
  monthlySpend: number;
  today: string;
  days: number;
}

export interface StressResult {
  kind: StressKind;
  label: string;
  lowest: number;
  lowestDate: string;
  /** Biggest dip below the protected floor (minimum balances + reserves). 0 means never short. */
  shortfall: number;
  /** First date the projected balance drops below the floor. */
  shortFrom: string | null;
  /** Days from today until liquidity is insufficient; null when it stays sufficient. */
  daysUntilShort: number | null;
  /** How much of the emergency reserve the scenario would consume. */
  reserveUsed: number;
  /** Commitments falling due on or after the first short date. */
  affected: { name: string; date: string; amount: number }[];
  corrective: string[];
  endBalance: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const shift = (c: Commitment, days: number): Commitment => ({ ...c, nextDue: addDays(c.nextDue, days) });

/** Run one stress scenario against a copy of the forecast inputs. */
export function stressTest(i: StressInput, s: StressScenario): StressResult {
  let commitments = i.commitments.map((c) => ({ ...c }));
  let extraOut: { date: string; amount: number; name: string }[] = [];
  const notes: string[] = [];

  const delayIncome = (pred: (c: Commitment) => boolean, days: number) => { commitments = commitments.map((c) => (c.direction === "in" && pred(c) ? shift(c, days) : c)); };
  const cutIncome = (months: number) => {
    const until = addMonths(i.today, months);
    commitments = commitments.map((c) => (c.direction === "in" && c.nextDue <= until ? { ...c, nextDue: addDays(until, 1) } : c));
  };
  const addSpend = (pct: number) => {
    const extra = r2(i.monthlySpend * (pct / 100));
    if (extra > 0) commitments = [...commitments, { id: "stress-spend", name: `Higher spending (+${pct}%)`, kind: "other", direction: "out", amount: extra, frequency: "monthly", intervalDays: null, nextDue: addDays(i.today, 7), accountId: null, category: "Miscellaneous", confirmed: true, essential: false, status: "active" }];
  };
  const raiseInterest = (pp: number) => {
    for (const l of i.loans) {
      if (!(l.principal > 0)) continue;
      const oldInterest = r2(l.principal * (l.rate / 1200));
      const newInterest = r2(l.principal * ((l.rate + pp) / 1200));
      const delta = r2(Math.max(0, newInterest - oldInterest));
      if (delta > 0) commitments = [...commitments, { id: `stress-rate-${l.name}`, name: `${l.name} extra interest`, kind: "emi", direction: "out", amount: delta, frequency: "monthly", intervalDays: null, nextDue: l.nextDue, accountId: null, category: "Financial charges", confirmed: true, essential: true, status: "active" }];
    }
  };

  switch (s.kind) {
    case "salary_delayed": delayIncome((c) => /salary|payroll|stipend/i.test(c.name + c.category), s.delayDays); break;
    case "rent_delayed": delayIncome((c) => /rent/i.test(c.name + c.category), s.delayDays); break;
    case "medical": extraOut = [{ date: addDays(i.today, 2), amount: s.amount, name: "Simulated medical expense" }]; break;
    case "emergency_payment": extraOut = [{ date: addDays(i.today, 2), amount: s.amount, name: "Simulated emergency payment" }]; break;
    case "higher_spend": addSpend(s.spendIncreasePct); break;
    case "income_interrupted": cutIncome(s.months); break;
    case "higher_interest": raiseInterest(s.rateIncrease); break;
    case "combined":
      delayIncome((c) => /salary|payroll|stipend/i.test(c.name + c.category), s.delayDays);
      extraOut = [{ date: addDays(i.today, 2), amount: s.amount, name: "Simulated emergency payment" }];
      addSpend(s.spendIncreasePct);
      notes.push("Salary late + emergency payment + higher spending, together.");
      break;
  }

  const floor = r2(i.minBalance + i.reserves);
  const f = forecast({ startBalance: i.cash, commitments, today: i.today, days: i.days, extraOut, floor });
  const shortFrom = f.shortDates[0] ?? null;
  const daysUntilShort = shortFrom ? Math.round((Date.parse(shortFrom) - Date.parse(i.today)) / 864e5) : null;
  const shortfall = r2(Math.max(0, floor - f.lowest.balance));
  const reserveUsed = r2(Math.min(i.reserves, Math.max(0, i.minBalance + i.reserves - f.lowest.balance) - i.minBalance > 0 ? Math.max(0, f.lowest.balance < i.minBalance + i.reserves ? i.minBalance + i.reserves - f.lowest.balance : 0) : 0));
  const affected = occurrences(commitments, i.today, addDays(i.today, i.days))
    .filter((o) => o.direction === "out" && shortFrom && o.date >= shortFrom)
    .slice(0, 8)
    .map((o) => ({ name: o.name, date: o.date, amount: o.amount }));

  const corrective: string[] = [];
  if (shortfall > 0) {
    corrective.push(`Keep at least ₹${Math.ceil(shortfall).toLocaleString("en-IN")} extra aside before ${shortFrom}.`);
    const discretionary = occurrences(commitments, i.today, addDays(i.today, i.days)).filter((o) => o.direction === "out" && !o.essential);
    const discTotal = r2(discretionary.reduce((sum, o) => sum + o.amount, 0));
    if (discTotal > 0) corrective.push(`Postponing non-essential payments (${discretionary.slice(0, 3).map((d) => d.name).join(", ")}) frees up to ₹${Math.round(discTotal).toLocaleString("en-IN")}.`);
    if (i.reserves > 0 && reserveUsed > 0) corrective.push(`Your emergency reserve would absorb ₹${Math.round(reserveUsed).toLocaleString("en-IN")} — plan to rebuild it afterwards.`);
  } else {
    corrective.push("Your plan holds in this scenario — no corrective action needed.");
  }

  return {
    kind: s.kind, label: STRESS_LABEL[s.kind], lowest: f.lowest.balance, lowestDate: f.lowest.date,
    shortfall, shortFrom, daysUntilShort, reserveUsed: r2(Math.max(0, reserveUsed)), affected, corrective: [...notes, ...corrective],
    endBalance: f.series.at(-1)?.balance ?? i.cash,
  };
}

/** Run several scenarios for side-by-side comparison. */
export function compareScenarios(i: StressInput, scenarios: StressScenario[]): StressResult[] {
  return scenarios.map((s) => stressTest(i, s));
}
