/** Draft income-tax and GST working figures per financial year. Read-only; never a filing. */
import type { Expense } from "./expenses";
import { fyOf } from "./entities";
import { taxSchedule, type Asset } from "./assets";
import { decimal, moneyNumber, sumMoney, subtractMoney } from "./money";

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

export function taxDraft(fy: string, entries: Expense[], assets: Asset[]): TaxDraft {
  const inYear = entries.filter((e) => fyOf(e.date) === fy && !e.transferCounterpartOf);
  const income = sumMoney(inYear.filter((e) => e.txnType === "income").map(e => e.amount));
  const biz = inYear.filter((e) => (!e.txnType || e.txnType === "expense") && e.scope === "business");
  const businessSpend = sumMoney(biz.map(e => e.amount));
  const gstInput = moneyNumber(biz.reduce((s, e) => s.plus(decimal(e.receiptDetails?.tax ?? 0).mul(e.fxRate || 1)), decimal(0)));
  const depreciation = moneyNumber(assets.reduce((s, a) => s.plus(decimal(taxSchedule(a, fy).find((y) => y.fy === fy)?.depreciation ?? 0).mul(a.sharePct).div(100)), decimal(0)));
  return { fy, income, businessSpend, gstInput, depreciation, workingProfit: subtractMoney(subtractMoney(income, businessSpend), depreciation), billsMissing: biz.filter((e) => !e.receipts.length).length };
}
