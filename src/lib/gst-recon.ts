/** Business supplier & invoice check (v6 reconciliations). Pure, read-only: never writes records. */
import type { Expense } from "./expenses";
import type { VaultDoc } from "./documents";

const GSTIN = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/;
const isSpend = (e: Expense) => (!e.txnType || e.txnType === "expense") && !e.transferCounterpartOf;

/** Business spending at or above the threshold with no bill attached and no linked document. */
export function missingInvoices(expenses: Expense[], docs: VaultDoc[], threshold = 0): Expense[] {
  const linked = new Set(docs.map((d) => d.transactionId).filter(Boolean));
  return expenses
    .filter((e) => isSpend(e) && e.scope === "business" && e.amount >= threshold && !e.receipts.length && !linked.has(e.id))
    .sort((a, b) => b.amount - a.amount);
}

export interface SupplierRow { key: string; name: string; count: number; total: number; tax: number; withBill: number; gstin: string | null }

/** Business suppliers by shop name, with GST captured from bills and GSTIN read from linked documents. */
export function supplierSummary(expenses: Expense[], docs: VaultDoc[]): SupplierRow[] {
  const byTxn = new Map(docs.filter((d) => d.transactionId).map((d) => [d.transactionId as string, d]));
  const rows = new Map<string, SupplierRow>();
  for (const e of expenses) {
    if (!isSpend(e) || e.scope !== "business") continue;
    const name = (e.merchant || e.title || "Unknown").trim();
    const key = name.toLowerCase();
    const r = rows.get(key) ?? { key, name, count: 0, total: 0, tax: 0, withBill: 0, gstin: null };
    const doc = byTxn.get(e.id);
    r.count++; r.total += e.amount;
    r.tax += (e.receiptDetails?.tax ?? 0) * (e.fxRate || 1);
    if (e.receipts.length || doc) r.withBill++;
    if (!r.gstin && doc) {
      const hay = [...(doc.fields ?? []).map((f) => f.value), doc.text].join(" ").toUpperCase();
      r.gstin = hay.match(GSTIN)?.[0] ?? null;
    }
    rows.set(key, r);
  }
  return [...rows.values()].map((r) => ({ ...r, total: Math.round(r.total * 100) / 100, tax: Math.round(r.tax * 100) / 100 })).sort((a, b) => b.total - a.total);
}
