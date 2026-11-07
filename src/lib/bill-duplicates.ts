import type { Expense } from "./expenses";

export interface BillIdentity { merchant: string; date: string; amount: number; currency: string }
const merchantKey = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
/** Match original bill currency/amount, never converted INR or filename alone. */
export function duplicateBills(bill: BillIdentity, entries: Expense[], excludeId?: string): Expense[] {
  const key = merchantKey(bill.merchant);
  if (!key || !Number.isFinite(bill.amount) || bill.amount <= 0 || !bill.date) return [];
  return entries.filter(e => e.id !== excludeId && (e.txnType ?? "expense") === "expense" &&
    merchantKey(e.merchant ?? "") === key && e.date === bill.date &&
    e.currency.toUpperCase() === bill.currency.toUpperCase() &&
    Math.round(e.originalAmount * 100) === Math.round(bill.amount * 100));
}