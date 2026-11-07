import type { StoredHolding } from "../investments/demat";

/** Alerts come only from retained statement events, not inferred prices or share ratios. */
export function statementActionAlerts(accounts: { id: string; holdings: StoredHolding[] }[]): { name: string; note: string; source: string }[] {
  const seen = new Set<string>();
  return accounts.flatMap((account) => account.holdings.flatMap((holding) => (holding.events ?? []).flatMap((event) => {
    if (!["bonus", "split", "rights", "merger", "dividend"].includes(event.kind)) return [];
    const key = `${account.id}|${holding.isin}|${event.date}|${event.kind}|${event.quantity}|${event.amount}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ name: holding.name || event.name || holding.isin, note: `${event.date} · ${event.kind}${event.quantity != null ? ` · ${event.quantity} units` : ""}${event.amount != null ? ` · ₹${event.amount.toLocaleString("en-IN")}` : ""}`, source: event.source }];
  })));
}