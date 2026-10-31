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

// ---- Repeat / favourites / smart defaults (Version 4.4 additions) ----
interface RepeatSource {
  id: string; date: string; title: string; merchant: string | null; category: string; scope: Scope;
  originalAmount: number; currency: string; accountId?: string | null; paymentInstrumentId?: string | null;
  paymentMethod: string; tags?: string[]; description: string; txnType?: TxnType; tripId?: string | null;
}
interface TripWindow { id: string; name?: string; start: string; end: string }

/** Favourites first (in saved order), then the most recent distinct expenses by merchant/title. */
export function repeatCandidates<E extends RepeatSource>(history: E[], favourites: string[], limit = 6): { favourites: E[]; recent: E[] } {
  const byId = new Map(history.map((e) => [e.id, e]));
  const fav = favourites.map((id) => byId.get(id)).filter((e): e is E => !!e && (e.txnType ?? "expense") === "expense");
  const seen = new Set(fav.map((e) => (e.merchant || e.title).toLowerCase()));
  const recent: E[] = [];
  for (const e of [...history].sort((a, b) => b.date.localeCompare(a.date))) {
    if ((e.txnType ?? "expense") !== "expense") continue;
    const k = (e.merchant || e.title).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k); recent.push(e);
    if (recent.length >= limit) break;
  }
  return { favourites: fav, recent };
}

/** Draft for a NEW entry copied from a past one: today's date, no id, no reimbursement/settlement state,
 *  and the trip link only when that trip still covers today. The amount is a suggestion the user edits. */
export function repeatDraft(e: RepeatSource, trips: TripWindow[], today: string) {
  const trip = e.tripId ? trips.find((t) => t.id === e.tripId && t.start <= today && today <= t.end) : undefined;
  const tags = (e.tags ?? []).filter((t) => !t.startsWith("trip:") || (trip && t.toLowerCase().includes((trip.name ?? "").toLowerCase())));
  return {
    title: e.title, merchant: e.merchant ?? "", category: e.category, scope: e.scope,
    suggestedAmount: e.originalAmount, currency: e.currency, accountId: e.accountId ?? "none",
    instrumentId: e.paymentInstrumentId ?? "none", paymentMethod: e.paymentMethod, tags, description: e.description,
    tripId: trip?.id ?? "none", date: today,
  };
}

/** Last confirmed account and workspace for plain expenses, used only when nothing else has chosen them. */
export function smartDefaults(history: { date: string; accountId?: string | null; scope: Scope; txnType?: TxnType }[], liveAccountIds: string[]) {
  const sorted = history.filter((e) => (e.txnType ?? "expense") === "expense").sort((a, b) => b.date.localeCompare(a.date));
  const acct = sorted.find((e) => e.accountId && liveAccountIds.includes(e.accountId))?.accountId ?? null;
  return { accountId: acct, scope: sorted[0]?.scope ?? null };
}
