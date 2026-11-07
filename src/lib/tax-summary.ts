/** Draft income-tax and GST working figures per financial year. Read-only; never a filing. */
import type { Expense } from "./expenses";
import { fyOf } from "./entities";
import { taxSchedule, type Asset } from "./assets";

export interface TaxDraft {
  fy: string;
  income: number;
  businessSpend: number;
  gstInput: number;
  depreciation: number;
  /** Income less business spending and tax depreciation; a working number only. */
  workingProfit: number;
  billsMissing: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function taxDraft(fy: string, entries: Expense[], assets: Asset[]): TaxDraft {
  const inYear = entries.filter((e) => fyOf(e.date) === fy && !e.transferCounterpartOf);
  const income = inYear.filter((e) => e.txnType === "income").reduce((s, e) => s + e.amount, 0);
  const biz = inYear.filter((e) => (!e.txnType || e.txnType === "expense") && e.scope === "business");
  const businessSpend = biz.reduce((s, e) => s + e.amount, 0);
  const gstInput = biz.reduce((s, e) => s + (e.receiptDetails?.tax ?? 0) * (e.fxRate || 1), 0);
  const depreciation = assets.reduce((s, a) => s + (taxSchedule(a, fy).find((y) => y.fy === fy)?.depreciation ?? 0) * (a.sharePct / 100), 0);
  return { fy, income: r2(income), businessSpend: r2(businessSpend), gstInput: r2(gstInput), depreciation: r2(depreciation), workingProfit: r2(income - businessSpend - depreciation), billsMissing: biz.filter((e) => !e.receipts.length).length };
}
