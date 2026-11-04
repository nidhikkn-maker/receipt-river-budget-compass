/**
 * Income-tax computation draft by head of income [§46]: uses only saved records and never invents deductions.
 * Rent uses the s.24 standard 30% deduction; losses carried forward come only from filed-return records.
 */
import type { Expense } from "../expenses";
import { fyOf } from "../entities";
import { taxSchedule, type Asset } from "../assets";
import type { FyRecord, Lease } from "./types";
import { receiptKind } from "./property";
import { calcValue } from "./regulatory";

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface TaxComputation {
  salary: number; houseProperty: { rent: number; standardDeduction: number; homeLoanInterest: number; net: number };
  business: { receipts: number; expenses: number; depreciation: number; net: number };
  capitalGains: { short: number; long: number }; otherSources: number;
  gross: number; lossesSetOff: number; total: number; notes: string[];
}

export function taxComputation(fy: string, entries: Expense[], assets: Asset[], leases: Lease[], gains: { sellDate: string; buyDate: string | null; gain: number | null; kind?: GainKind }[], records: FyRecord[], entityId?: string, scope?: { accountIds: Set<string> }, exclude?: { accountIds: Set<string> }, salaryEvidence?: number | null, rules?: import("./types").RuleVersion[]): TaxComputation {
  const fyEndDate = `${Number(fy.slice(0, 4)) + 1}-03-31`;
  const HP_CAP = calcValue(rules, "tax.hp_interest_cap", fyEndDate, HP_LOSS_CAP);
  const months = { equity: calcValue(rules, "cg.equity_months", fyEndDate, 12), other: calcValue(rules, "cg.other_months", fyEndDate, 24) };
  // Per entity [§45]: only entries on that entity's mapped accounts and assets it owns.
  const inYear = entries.filter((e) => fyOf(e.date) === fy && !e.transferCounterpartOf && (!scope || (!!e.accountId && scope.accountIds.has(e.accountId))) && !(exclude && e.accountId && exclude.accountIds.has(e.accountId)));
  if (scope && entityId) assets = assets.filter((a) => a.ownerEntityId === entityId);
  // Personal working never includes company-owned records [§45].
  else if (!entityId) assets = assets.filter((a) => !a.ownerEntityId);
  const income = inYear.filter((e) => e.txnType === "income");
  const text = (e: Expense) => `${e.title} ${e.merchant ?? ""} ${e.description} ${e.category}`;
  const tenants = leases.map((l) => l.tenant.toLowerCase()).filter((t) => t.length >= 3);
  const isRent = (e: Expense) => tenants.some((t) => text(e).toLowerCase().includes(t)) || /\brent\b/i.test(text(e));
  // Taxable salary comes from Form 16 / payslips when uploaded; bank credits are only a fallback estimate [§46].
  const bankSalary = r2(income.filter((e) => /salary|payroll|stipend/i.test(text(e))).reduce((s, e) => s + e.amount, 0));
  const salary = salaryEvidence != null ? r2(salaryEvidence) : bankSalary;
  const rent = r2(income.filter((e) => isRent(e) && receiptKind(text(e)) === "rent").reduce((s, e) => s + e.amount, 0));
  const homeLoanInterest = r2(inYear.filter((e) => e.txnType === "loan_repayment" && /home|housing/i.test(text(e))).reduce((s, e) => s + (e.interest ?? 0), 0));
  // s.24(b): interest deduction and house-property loss set-off are both capped at ₹2,00,000.
  const hpNet = r2(Math.max(-HP_CAP, rent - rent * 0.3 - (rent > 0 ? homeLoanInterest : Math.min(homeLoanInterest, HP_CAP))));
  const other = r2(income.filter((e) => /interest|dividend/i.test(text(e))).reduce((s, e) => s + e.amount, 0));
  const used = new Set(income.filter((e) => /salary|payroll|stipend|interest|dividend/i.test(text(e)) || isRent(e)).map((e) => e.id));
  const receipts = r2(income.filter((e) => !used.has(e.id) && e.scope === "business").reduce((s, e) => s + e.amount, 0));
  const expenses = r2(inYear.filter((e) => (e.txnType ?? "expense") === "expense" && e.scope === "business").reduce((s, e) => s + e.amount, 0));
  const depreciation = r2(assets.reduce((s, a) => s + (taxSchedule(a, fy).find((y) => y.fy === fy)?.depreciation ?? 0) * (a.sharePct / 100), 0));
  const bizNet = r2(receipts - expenses - depreciation);
  let short = 0, long = 0;
  let unknown = 0;
  for (const g of gains) if (g.gain != null && fyOf(g.sellDate) === fy) {
    if (!g.buyDate) { unknown += g.gain; continue; }
    if (gainTerm(g.kind ?? "listed_equity", g.buyDate, g.sellDate, months) === "long") long += g.gain; else short += g.gain;
  }
  const notes: string[] = [];
  if (salaryEvidence == null && bankSalary > 0) notes.push("Salary is estimated from bank credits (net pay). Upload Form 16 or payslips for the taxable figure");
  if (unknown) notes.push(`Gains of ₹${r2(unknown).toLocaleString("en-IN")} have no purchase date and are left out until the transaction statement is uploaded`);
  if (homeLoanInterest > HP_CAP) notes.push("Home-loan interest above ₹2,00,000 is not deducted (s.24(b) cap)");
  if (hpNet < 0) notes.push("House-property loss is set off against other income up to ₹2,00,000; any excess is carried forward");
  const gross = r2(salary + hpNet + Math.max(0, bizNet) + Math.max(0, short) + Math.max(0, long) + other);
  const cf = broughtForward(records.filter((r) => !entityId || r.entityId === entityId), fy, calcValue(rules, "loss.carry_years", fyEndDate, 8));
  const businessLoss = cf.filter((l) => l.kind === "business" || l.kind === "depreciation").reduce((s, l) => s + l.amount, 0);
  const lossesSetOff = r2(Math.min(businessLoss, Math.max(0, bizNet)));
  if (cf.length) notes.push(`Losses brought forward from filed returns: ₹${cf.reduce((s, l) => s + l.amount, 0).toLocaleString("en-IN")}`);
  notes.push("No deductions under Chapter VI-A are assumed — add only those you have evidence for");
  return { salary, houseProperty: { rent, standardDeduction: r2(rent * 0.3), homeLoanInterest, net: hpNet }, business: { receipts, expenses, depreciation, net: bizNet }, capitalGains: { short: r2(short), long: r2(long) }, otherSources: other, gross, lossesSetOff, total: r2(gross - lossesSetOff), notes };
}

const HP_LOSS_CAP = 200000;
export type GainKind = "listed_equity" | "equity_fund" | "property" | "other";

/** Holding period for long-term treatment: 12 months for listed shares/equity funds, 24 months otherwise. */
export function gainTerm(kind: GainKind, buy: string, sell: string, m: { equity: number; other: number } = { equity: 12, other: 24 }): "long" | "short" {
  const months = kind === "listed_equity" || kind === "equity_fund" ? m.equity : m.other;
  const b = new Date(buy + "T00:00:00Z"); b.setUTCMonth(b.getUTCMonth() + months);
  return Date.parse(sell + "T00:00:00Z") > b.getTime() ? "long" : "short";
}

const fyStart = (fy: string) => Number(fy.slice(0, 4));
/** Losses available this year: only the latest earlier filed record (each record restates what is still carried), dropping expired ones (8 years; unabsorbed depreciation never expires). */
export function broughtForward(records: FyRecord[], fy: string, years = 8): FyRecord["lossesCarriedForward"] {
  const prior = records.filter((r) => r.fy < fy).sort((a, b) => (a.fy < b.fy ? 1 : -1))[0];
  if (!prior) return [];
  return prior.lossesCarriedForward.filter((l) => l.amount > 0 && (l.kind === "depreciation" || fyStart(fy) - fyStart(l.fromFy) <= years));
}
