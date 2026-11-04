/**
 * Income-tax computation draft by head of income [§46]: uses only saved records and never invents deductions.
 * Rent uses the s.24 standard 30% deduction; losses carried forward come only from filed-return records.
 */
import type { Expense } from "../expenses";
import { fyOf } from "../entities";
import { taxSchedule, type Asset } from "../assets";
import type { FyRecord, Lease } from "./types";
import { receiptKind } from "./property";

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface TaxComputation {
  salary: number; houseProperty: { rent: number; standardDeduction: number; homeLoanInterest: number; net: number };
  business: { receipts: number; expenses: number; depreciation: number; net: number };
  capitalGains: { short: number; long: number }; otherSources: number;
  gross: number; lossesSetOff: number; total: number; notes: string[];
}

export function taxComputation(fy: string, entries: Expense[], assets: Asset[], leases: Lease[], gains: { sellDate: string; buyDate: string | null; gain: number | null }[], records: FyRecord[], entityId?: string, scope?: { accountIds: Set<string> }): TaxComputation {
  // Per entity [§45]: only entries on that entity's mapped accounts and assets it owns.
  const inYear = entries.filter((e) => fyOf(e.date) === fy && !e.transferCounterpartOf && (!scope || (!!e.accountId && scope.accountIds.has(e.accountId))));
  if (scope && entityId) assets = assets.filter((a) => a.ownerEntityId === entityId);
  const income = inYear.filter((e) => e.txnType === "income");
  const text = (e: Expense) => `${e.title} ${e.merchant ?? ""} ${e.description} ${e.category}`;
  const tenants = leases.map((l) => l.tenant.toLowerCase()).filter((t) => t.length >= 3);
  const isRent = (e: Expense) => tenants.some((t) => text(e).toLowerCase().includes(t)) || /\brent\b/i.test(text(e));
  const salary = r2(income.filter((e) => /salary|payroll|stipend/i.test(text(e))).reduce((s, e) => s + e.amount, 0));
  const rent = r2(income.filter((e) => isRent(e) && receiptKind(text(e)) === "rent").reduce((s, e) => s + e.amount, 0));
  const homeLoanInterest = r2(inYear.filter((e) => e.txnType === "loan_repayment" && /home|housing/i.test(text(e))).reduce((s, e) => s + (e.interest ?? 0), 0));
  const hpNet = r2(rent - rent * 0.3 - homeLoanInterest);
  const other = r2(income.filter((e) => /interest|dividend/i.test(text(e))).reduce((s, e) => s + e.amount, 0));
  const used = new Set(income.filter((e) => /salary|payroll|stipend|interest|dividend/i.test(text(e)) || isRent(e)).map((e) => e.id));
  const receipts = r2(income.filter((e) => !used.has(e.id) && e.scope === "business").reduce((s, e) => s + e.amount, 0));
  const expenses = r2(inYear.filter((e) => (e.txnType ?? "expense") === "expense" && e.scope === "business").reduce((s, e) => s + e.amount, 0));
  const depreciation = r2(assets.reduce((s, a) => s + (taxSchedule(a, fy).find((y) => y.fy === fy)?.depreciation ?? 0) * (a.sharePct / 100), 0));
  const bizNet = r2(receipts - expenses - depreciation);
  let short = 0, long = 0;
  for (const g of gains) if (g.gain != null && fyOf(g.sellDate) === fy) { const held = g.buyDate ? (Date.parse(g.sellDate) - Date.parse(g.buyDate)) / 864e5 : null; if (held != null && held > 365) long += g.gain; else short += g.gain; }
  const notes: string[] = [];
  if (gains.some((g) => g.gain != null && !g.buyDate)) notes.push("Some gains have no purchase date; treated as short-term until the transaction statement is uploaded");
  if (homeLoanInterest > 200000) notes.push("Self-occupied home-loan interest is capped at ₹2,00,000; let-out property loss set-off is capped at ₹2,00,000 — confirm with your accountant");
  const gross = r2(salary + Math.max(0, hpNet) + Math.max(0, bizNet) + Math.max(0, short) + Math.max(0, long) + other);
  const cf = records.filter((r) => (!entityId || r.entityId === entityId) && r.fy < fy).flatMap((r) => r.lossesCarriedForward);
  const businessLoss = cf.filter((l) => l.kind === "business" || l.kind === "depreciation").reduce((s, l) => s + l.amount, 0);
  const lossesSetOff = r2(Math.min(businessLoss, Math.max(0, bizNet)));
  if (cf.length) notes.push(`Losses brought forward from filed returns: ₹${cf.reduce((s, l) => s + l.amount, 0).toLocaleString("en-IN")}`);
  notes.push("No deductions under Chapter VI-A are assumed — add only those you have evidence for");
  return { salary, houseProperty: { rent, standardDeduction: r2(rent * 0.3), homeLoanInterest, net: hpNet }, business: { receipts, expenses, depreciation, net: bizNet }, capitalGains: { short: r2(short), long: r2(long) }, otherSources: other, gross, lossesSetOff, total: r2(gross - lossesSetOff), notes };
}
