// Pure presentation rules for the Universal Entry (Version 4.4). They only decide ordering and
// which sections show — never amounts, balances or what gets saved.
import type { Scope } from "./expenses";
import type { TxnType } from "./ledger";

interface Past { date: string; category?: string; accountId?: string | null; createdAt?: string }

/** Distinct values ordered by most recent use, followed by the rest in their original order. */
export function recentFirst<T extends string>(all: readonly T[], history: Past[], pick: (p: Past) => string | null | undefined, limit = 5): { recent: T[]; rest: T[] } {
  const seen: T[] = [];
  const sorted = [...history].sort((a, b) => (b.date + (b.createdAt ?? "")).localeCompare(a.date + (a.createdAt ?? "")));
  for (const p of sorted) {
    const v = pick(p) as T | null | undefined;
    if (v && all.includes(v) && !seen.includes(v)) seen.push(v);
    if (seen.length >= limit) break;
  }
  return { recent: seen, rest: all.filter((x) => !seen.includes(x)) };
}

export interface DetailSections { business: boolean; travel: boolean; people: boolean; fx: boolean; tags: boolean }

/** Which advanced groups are relevant. Hidden groups stay reachable through "More details". */
export function relevantSections(ctx: { txnType: TxnType; scope: Scope; split: boolean; currency: string; baseCurrency: string; onTrip: boolean }): DetailSections {
  const spend = ctx.txnType === "expense" || ctx.txnType === "refund" || ctx.txnType === "reimbursement";
  return {
    business: spend && (ctx.scope === "business" || ctx.scope === "official" || ctx.split),
    travel: ctx.onTrip || ctx.txnType === "advance" || ctx.txnType === "advance_settlement",
    people: ctx.txnType === "expense",
    fx: ctx.currency !== ctx.baseCurrency,
    tags: ctx.txnType !== "transfer",
  };
}

/** Today / Yesterday shortcuts for the compact date field, in local time. */
export function dayShortcut(offset: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
