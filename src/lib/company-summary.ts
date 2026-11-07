/** Spending per company vs personal (pure). Transfers between your own accounts are counted separately, never as spending. */
import { effectiveEntity, ownerOf, type EntityAccounts } from "./books/entity-accounts";

export interface SumEntry { id: string; date: string; amount: number; category: string; txnType?: string | null; accountId?: string | null; toAccountId?: string | null; entityId?: string | null; entitySource?: "account" | "manual" }
export interface CompanyRow { key: string; spent: number; count: number; categories: { name: string; amount: number }[]; months: Record<string, number>; interCompany: number }

export const PERSONAL = "personal";

export function companySummary(entries: SumEntry[], map: EntityAccounts, from: string, to: string): CompanyRow[] {
  const rows = new Map<string, CompanyRow & { cat: Map<string, number> }>();
  const row = (k: string) => { let r = rows.get(k); if (!r) { r = { key: k, spent: 0, count: 0, categories: [], months: {}, interCompany: 0, cat: new Map() }; rows.set(k, r); } return r; };
  for (const e of entries) {
    if (e.date < from || e.date > to) continue;
    const t = e.txnType ?? "expense";
    const k = effectiveEntity(e, map) ?? PERSONAL;
    if (t === "transfer") {
      const dest = e.toAccountId ? ownerOf(map, e.toAccountId) ?? PERSONAL : null;
      if (dest && dest !== k) row(k).interCompany += e.amount;
      continue;
    }
    if (t !== "expense") continue;
    const r = row(k); r.spent += e.amount; r.count++;
    r.cat.set(e.category, (r.cat.get(e.category) ?? 0) + e.amount);
    const m = e.date.slice(0, 7); r.months[m] = (r.months[m] ?? 0) + e.amount;
  }
  return [...rows.values()].map(({ cat, ...r }) => ({ ...r, spent: Math.round(r.spent * 100) / 100, categories: [...cat].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5) })).sort((a, b) => b.spent - a.spent);
}
