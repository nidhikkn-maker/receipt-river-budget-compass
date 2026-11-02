import type { Expense } from "./expenses";
import type { InboxItem } from "./inbox";

export interface DuplicatePair { key: string; left: Expense; right: Expense }

/** Pairs behind "Possible duplicate" inbox items, skipping pairs the owner marked as separate. */
export function duplicatePairsFromItems(items: InboxItem[], transactions: Expense[], separate: string[]): DuplicatePair[] {
  const byId = new Map(transactions.map(t => [t.id, t]));
  const skip = new Set(separate);
  const out: DuplicatePair[] = [];
  for (const i of items) {
    if (i.type !== "duplicate" || skip.has(i.key)) continue;
    const [, a, b] = i.key.split(":");
    const left = a ? byId.get(a) : undefined, right = b ? byId.get(b) : undefined;
    if (left && right) out.push({ key: i.key, left, right });
  }
  return out;
}

export const COMPARE_FIELDS = [
  ["date", "Date"], ["amount", "Amount"], ["merchant", "Payee"], ["title", "Title"], ["accountId", "Account"],
  ["category", "Category"], ["txnType", "Type"], ["description", "Notes / narration"], ["receipts", "Receipts"], ["statementRef", "Source statement"],
] as const;
export type CompareField = typeof COMPARE_FIELDS[number][0];

export function compareValue(e: Expense, f: CompareField): string {
  if (f === "amount") return `${e.currency ?? "INR"} ${(e.originalAmount ?? e.amount).toFixed(2)}`;
  if (f === "receipts") return String(e.receipts?.length ?? 0);
  if (f === "txnType") return e.txnType ?? "expense";
  const v = (e as unknown as Record<string, unknown>)[f];
  return v == null ? "" : String(v).trim();
}

/** Fields whose values differ between the two entries. */
export function differingFields(a: Expense, b: Expense): CompareField[] {
  return COMPARE_FIELDS.map(([f]) => f).filter(f => compareValue(a, f).toLowerCase() !== compareValue(b, f).toLowerCase());
}

/** Adds the pair to the remembered "separate transactions" list without duplicating it. */
export function markSeparate(dismissed: string[], key: string): string[] {
  return dismissed.includes(key) ? dismissed : [...dismissed, key];
}
