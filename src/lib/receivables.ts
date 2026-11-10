/** Money customers owe: invoices kept in owner preferences, paid status derived from income entries. */
import type { Expense } from "./expenses";
import type { ArchiveState } from "./archive";

/** Archive fields (P0-007) ride on the record; cleanReceivables keeps every stored field. */
export interface Receivable extends ArchiveState { id: string; customer: string; invoiceNo?: string; date: string; dueDate?: string; amount: number; /** GST charged on the invoice (included in amount). */ gst?: number }
export type ReceivableStatus = { r: Receivable; paidBy: Expense | undefined; overdueDays: number };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function cleanReceivables(v: unknown): Receivable[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Receivable => !!x && typeof x.id === "string" && typeof x.customer === "string" && typeof x.date === "string" && Number.isFinite(x.amount) && x.amount > 0);
}

/** Each income entry pays at most one invoice: same amount (±₹1), on/after invoice date, customer name in shop or note. */
export function receivableStatus(list: Receivable[], entries: Expense[], today: string): ReceivableStatus[] {
  const used = new Set<string>();
  const income = entries.filter((e) => e.txnType === "income").sort((a, b) => a.date.localeCompare(b.date));
  return [...list].sort((a, b) => a.date.localeCompare(b.date)).map((r) => {
    const key = norm(r.customer);
    const paidBy = income.find((e) => !used.has(e.id) && e.date >= r.date && Math.abs(e.amount - r.amount) <= 1 && key.length > 0 && norm(`${e.merchant ?? ""} ${e.description ?? ""}`).includes(key));
    if (paidBy) used.add(paidBy.id);
    const due = r.dueDate ?? r.date;
    const overdueDays = paidBy ? 0 : Math.max(0, Math.round((Date.parse(today) - Date.parse(due)) / 86400000));
    return { r, paidBy, overdueDays };
  });
}

export interface GstMonth { month: string; outputGst: number; inputGst: number; net: number; invoices: number }

/** GSTR-3B style working per month: GST on your invoices less GST on business bills. Draft only. */
export function gstMonths(list: Receivable[], entries: Expense[], months: string[]): GstMonth[] {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return months.map((m) => {
    const inv = list.filter((r) => r.date.startsWith(m));
    const outputGst = inv.reduce((s, r) => s + (r.gst ?? 0), 0);
    const inputGst = entries.filter((e) => e.date.startsWith(m) && e.scope === "business" && (!e.txnType || e.txnType === "expense") && !e.transferCounterpartOf)
      .reduce((s, e) => s + (e.receiptDetails?.tax ?? 0) * (e.fxRate || 1), 0);
    return { month: m, outputGst: r2(outputGst), inputGst: r2(inputGst), net: r2(outputGst - inputGst), invoices: inv.length };
  });
}
