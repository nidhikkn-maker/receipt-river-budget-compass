/**
 * Full income-tax liability [§46] for individuals (both regimes) and non-individuals, from a TaxComputation.
 * Pure rules: slabs, standard deduction, Chapter VI-A caps (old regime, evidence-backed only), special
 * rates on listed-equity gains (s.111A / s.112A), s.87A rebate with marginal relief, surcharge with its
 * caps and marginal relief, and 4% cess. Working only — the accountant confirms before filing.
 */
import type { TaxComputation } from "./taxcomp";
import type { TaxDeduction, TaxProfile } from "./types";
import { decimal, addMoney, subtractMoney } from "../money";

const r0 = (n: number) => decimal(n).toDecimalPlaces(0).toNumber();
// Preserve sub-paise tax intermediates until existing statutory presentation boundaries.
const add = (...values: number[]) => values.reduce((s,v)=>s.plus(v),decimal(0)).toNumber();
const sub = (a:number,b:number) => decimal(a).minus(b).toNumber();
const mul = (a:number,b:number) => decimal(a).mul(b).toNumber();
type Slabs = [number, number][];
interface YearRules { newSlabs: Slabs; oldSlabs: Slabs; newRebate: { limit: number; max: number }; oldRebate: { limit: number; max: number }; stdNew: number; stdOld: number; stcg: number; ltcg: number; ltcgExempt: number }

const Y2425: YearRules = { newSlabs: [[300000, 0], [700000, 0.05], [1000000, 0.1], [1200000, 0.15], [1500000, 0.2], [Infinity, 0.3]], oldSlabs: [[250000, 0], [500000, 0.05], [1000000, 0.2], [Infinity, 0.3]], newRebate: { limit: 700000, max: 25000 }, oldRebate: { limit: 500000, max: 12500 }, stdNew: 75000, stdOld: 50000, stcg: 0.2, ltcg: 0.125, ltcgExempt: 125000 };
const Y2526: YearRules = { ...Y2425, newSlabs: [[400000, 0], [800000, 0.05], [1200000, 0.1], [1600000, 0.15], [2000000, 0.2], [2400000, 0.25], [Infinity, 0.3]], newRebate: { limit: 1200000, max: 60000 } };
/** Latest known year's rules apply to later years until an approved rule says otherwise. */
export function yearRules(fy: string): { rules: YearRules; carried: boolean } {
  if (fy === "2024-25") return { rules: Y2425, carried: false };
  if (fy === "2025-26") return { rules: Y2526, carried: false };
  return { rules: fy < "2024-25" ? Y2425 : Y2526, carried: true };
}

export function slab(income: number, slabs: Slabs): number {
  let tax = decimal(0), prev = 0;
  for (const [upper, rate] of slabs) { if (income > prev) tax = tax.plus(decimal(Math.min(income, upper)).minus(prev).mul(rate)); prev = upper; }
  return tax.toNumber();
}

export const DEDUCTION_CAP: Record<TaxDeduction["section"], number> = { "80C": 150000, "80CCD1B": 50000, "80D": 100000, "80E": Infinity, "80G": Infinity, "80TTA": 10000, other: Infinity };

/** Old-regime Chapter VI-A total: each section capped, only lines with written evidence. */
export function chapterVIA(lines: TaxDeduction[]): { total: number; bySection: Partial<Record<TaxDeduction["section"], number>> } {
  const by: Partial<Record<TaxDeduction["section"], number>> = {};
  for (const l of lines) by[l.section] = add(by[l.section] ?? 0,l.amount);
  for (const k of Object.keys(by) as TaxDeduction["section"][]) by[k] = Math.min(by[k] ?? 0, DEDUCTION_CAP[k]);
  return { total: r0(Object.values(by).reduce((s,v)=>add(s,v ?? 0),0)), bySection: by };
}

/** Surcharge rate on total income; new regime and special-rate gains are capped. */
function surchargeRate(income: number, cap: number): number {
  const r = income > 50000000 ? 0.37 : income > 20000000 ? 0.25 : income > 10000000 ? 0.15 : income > 5000000 ? 0.1 : 0;
  return Math.min(r, cap);
}
const THRESHOLDS = [5000000, 10000000, 20000000, 50000000];

export interface Liability {
  regime: "new" | "old" | "company" | "firm"; taxableIncome: number; normalIncome: number; standardDeduction: number; deductions: number;
  slabTax: number; specialTax: { stcg: number; ltcg: number; ltcgExempt: number }; rebate: number; surcharge: number; marginalRelief: number;
  cess: number; total: number; credits: number; balance: number; lines: [string, number][]; notes: string[];
}

/** Individual / HUF liability for one regime. Gains are treated as listed equity (demat statements). */
export function individualLiability(c: TaxComputation, fy: string, regime: "new" | "old", deductionLines: TaxDeduction[], credits: number): Liability {
  const { rules, carried } = yearRules(fy);
  const notes: string[] = [];
  if (carried) notes.push(`Rates for FY ${fy} are not yet in the register; the latest known year's rates are used until an approved rule replaces them`);
  const std = c.salary > 0 ? Math.min(c.salary, regime === "new" ? rules.stdNew : rules.stdOld) : 0;
  const ded = regime === "old" ? chapterVIA(deductionLines).total : 0;
  if (regime === "new" && deductionLines.length) notes.push("Deductions under Chapter VI-A are not allowed in the new regime and are ignored");
  const special = add(Math.max(0,c.capitalGains.short),Math.max(0,c.capitalGains.long));
  const normalIncome = Math.max(0, r0(sub(sub(sub(c.total,special),std),ded)));
  const stcg = Math.max(0, c.capitalGains.short), ltcgGross = Math.max(0, c.capitalGains.long);
  const ltcgExempt = Math.min(ltcgGross, rules.ltcgExempt);
  const taxable = sub(add(normalIncome,stcg,ltcgGross),ltcgExempt);
  const slabs = regime === "new" ? rules.newSlabs : rules.oldSlabs;
  // Unused basic exemption can absorb special-rate gains for residents.
  const basic = slabs[0]?.[0] ?? 0;
  const unused = Math.max(0, sub(basic,normalIncome));
  const stcgTaxed = Math.max(0, sub(stcg,unused)), ltcgTaxed = Math.max(0, sub(sub(ltcgGross,ltcgExempt),Math.max(0,sub(unused,stcg))));
  const slabTax = slab(normalIncome, slabs);
  const sTax = { stcg: mul(stcgTaxed,rules.stcg), ltcg: mul(ltcgTaxed,rules.ltcg), ltcgExempt };
  // s.87A: rebate on slab tax only (not special-rate gains) with marginal relief just above the limit.
  const rb = regime === "new" ? rules.newRebate : rules.oldRebate;
  let rebate = 0;
  if (taxable <= rb.limit) rebate = Math.min(slabTax, rb.max);
  else if (regime === "new" && normalIncome > rb.limit && slabTax > sub(normalIncome,rb.limit)) rebate = sub(slabTax,sub(normalIncome,rb.limit));
  const base = add(sub(slabTax,rebate),sTax.stcg,sTax.ltcg);
  const capNormal = regime === "new" ? 0.25 : 0.37;
  const rN = surchargeRate(taxable, capNormal), rS = surchargeRate(taxable, 0.15);
  let surcharge = add(mul(sub(slabTax,rebate),rN),mul(add(sTax.stcg,sTax.ltcg),rS));
  // Marginal relief: tax + surcharge may not exceed tax at the threshold plus income above it.
  let relief = 0;
  const th = [...THRESHOLDS].reverse().find((t) => taxable > t);
  if (th && surcharge > 0) {
    const scaled = decimal(th).div(taxable).toNumber();
    const atTh = mul(add(slab(mul(normalIncome,scaled),slabs),mul(add(sTax.stcg,sTax.ltcg),scaled)),add(1,surchargeRate(th,capNormal)));
    const excess = sub(add(base,surcharge),atTh);
    if (excess > sub(taxable,th)) relief = Math.min(surcharge, sub(excess,sub(taxable,th)));
    surcharge = sub(surcharge,relief);
  }
  const cess = mul(add(base,surcharge),0.04);
  const total = r0(add(base,surcharge,cess));
  if (c.capitalGains.short || c.capitalGains.long) notes.push("Capital gains are taxed as listed equity (s.111A 20%, s.112A 12.5% above ₹1,25,000); property or debt gains need the accountant's treatment");
  const lines: [string, number][] = [["Total income (by head)", c.total], ["Standard deduction (salary)", -std], ["Chapter VI-A deductions", -ded], ["Income at slab rates", normalIncome], ["Tax at slab rates", r0(slabTax)], ["Rebate u/s 87A", -r0(rebate)], ["Short-term gains tax (111A)", r0(sTax.stcg)], ["Long-term gains tax (112A)", r0(sTax.ltcg)], ["Surcharge", r0(surcharge)], ["Health & education cess 4%", r0(cess)], ["Total tax", total], ["Taxes already paid", -credits], [subtractMoney(total,credits) >= 0 ? "Balance to pay" : "Refund due", Math.abs(subtractMoney(total,credits))]];
  return { regime, taxableIncome: r0(taxable), normalIncome, standardDeduction: std, deductions: ded, slabTax: r0(slabTax), specialTax: { stcg: r0(sTax.stcg), ltcg: r0(sTax.ltcg), ltcgExempt }, rebate: r0(rebate), surcharge: r0(surcharge), marginalRelief: r0(relief), cess: r0(cess), total, credits, balance: subtractMoney(total,credits), lines, notes };
}

/** Domestic company / firm liability for the chosen option. No option recorded → null (never assumed). */
export function entityLiability(c: TaxComputation, kind: "company" | "firm", option: TaxProfile["companyOption"], credits: number): Liability | null {
  const income = Math.max(0, r0(c.total));
  let rate: number, sur: number;
  if (kind === "firm") { rate = 0.3; sur = income > 10000000 ? 0.12 : 0; }
  else if (option === "115BAA") { rate = 0.22; sur = 0.1; }
  else if (option === "115BAB") { rate = 0.15; sur = 0.1; }
  else if (option === "normal25" || option === "normal30") { rate = option === "normal25" ? 0.25 : 0.3; sur = income > 100000000 ? 0.12 : income > 10000000 ? 0.07 : 0; }
  else return null;
  const base = mul(income,rate), surcharge = mul(base,sur), cess = mul(add(base,surcharge),0.04), total = r0(add(base,surcharge,cess));
  const label = kind === "firm" ? "Firm / LLP 30%" : option === "115BAA" ? "Section 115BAA 22%" : option === "115BAB" ? "Section 115BAB 15%" : option === "normal25" ? "Normal 25% (turnover ≤ ₹400 crore)" : "Normal 30%";
  const notes = kind === "company" && (option === "normal25" || option === "normal30") ? ["Minimum alternate tax (s.115JB) is not worked out — the accountant checks book profit"] : [];
  return { regime: kind, taxableIncome: income, normalIncome: income, standardDeduction: 0, deductions: 0, slabTax: r0(base), specialTax: { stcg: 0, ltcg: 0, ltcgExempt: 0 }, rebate: 0, surcharge: r0(surcharge), marginalRelief: 0, cess: r0(cess), total, credits, balance: subtractMoney(total,credits),
    lines: [["Total income", income], [`Tax at ${label}`, r0(base)], ["Surcharge", r0(surcharge)], ["Cess 4%", r0(cess)], ["Total tax", total], ["Taxes already paid", -credits], [subtractMoney(total,credits) >= 0 ? "Balance to pay" : "Refund due", Math.abs(subtractMoney(total,credits))]], notes };
}

/**
 * ITR computation in the return's own part names (Part B-TI / Part B-TTI) as a structured JSON
 * working file. It is a draft for the accountant, not an uploadable return.
 */
export function itrComputationJson(p: { fy: string; pan: string | null; name: string; form: string; c: TaxComputation; l: Liability }) {
  const ay = `${Number(p.fy.slice(0, 4)) + 1}-${String((Number(p.fy.slice(0, 4)) + 2) % 100).padStart(2, "0")}`;
  return {
    _note: "Ledgerline working file in ITR part layout — not an official upload file. Review with your accountant.",
    AssessmentYear: ay, Form: p.form, PAN: p.pan, Name: p.name, Regime: p.l.regime === "old" ? "Old" : p.l.regime === "new" ? "New (115BAC)" : p.l.regime,
    "PartB-TI": { Salaries: p.c.salary, IncomeFromHP: p.c.houseProperty.net, ProfBusGain: p.c.business.net, CapGain: { ShortTerm111A: p.c.capitalGains.short, LongTerm112A: p.c.capitalGains.long }, IncFromOS: p.c.otherSources, GrossTotalIncome: p.c.gross, BFLossSetOff: p.c.lossesSetOff, DeductionsUnderScheduleVIA: p.l.deductions, TotalIncome: p.l.taxableIncome },
    "PartB-TTI": { TaxAtNormalRates: p.l.slabTax, TaxAtSpecialRates: addMoney(p.l.specialTax.stcg,p.l.specialTax.ltcg), Rebate87A: p.l.rebate, Surcharge: p.l.surcharge, MarginalRelief: p.l.marginalRelief, EducationCess: p.l.cess, GrossTaxLiability: p.l.total, TaxesPaid: p.l.credits, BalTaxPayable: Math.max(0, p.l.balance), RefundDue: Math.max(0, -p.l.balance) },
  };
}

/** Suggested ITR form from income heads and entity kind [§46]. */
export function suggestItrForm(kind: string, c: TaxComputation): string {
  if (kind === "company") return "ITR-6";
  if (kind === "partnership" || kind === "llp") return "ITR-5";
  if (kind === "trust") return "ITR-7";
  if (c.business.receipts > 0 || c.business.net !== 0) return "ITR-3";
  if (c.capitalGains.short || c.capitalGains.long || c.total > 5000000 || c.houseProperty.net < 0) return "ITR-2";
  return "ITR-1";
}
