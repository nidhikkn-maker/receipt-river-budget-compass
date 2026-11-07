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
export interface SmartDefaultsPast { date: string; createdAt?: string | null; accountId?: string | null; scope: Scope; txnType?: TxnType; category?: string | null; merchant?: string | null; paymentMethod?: string | null }
/** Why a field was suggested: how many of the looked-at expenses chose it, and the most recent of them. */
export interface SmartDefaultReason { matches: number; lookedAt: number; examples: { date: string; merchant: string | null }[] }
export interface SmartDefaults { accountId: string | null; scope: Scope | null; category: string | null; paymentMethod: string | null; basis: "merchant" | "habit" | null; merchant?: string; reasons: { category?: SmartDefaultReason; accountId?: SmartDefaultReason; scope?: SmartDefaultReason; paymentMethod?: SmartDefaultReason } }

/**
 * Starting choices for a routine expense. Recent entries count more than old ones (each step back weighs 0.9×,
 * looking at the last 40 expenses), so a habit that changed last week wins over one from last year.
 * When a merchant is given and has history, only that merchant's entries are used. Archived categories and
 * closed accounts are never suggested. These are only starting values — the person can change any of them.
 */
export function smartDefaults(history: SmartDefaultsPast[], liveAccountIds: string[], opts: { categories?: readonly string[]; merchant?: string | null; scopes?: readonly Scope[] } = {}): SmartDefaults {
  const sorted = history.filter((e) => (e.txnType ?? "expense") === "expense").sort((a, b) => (b.date + (b.createdAt ?? "")).localeCompare(a.date + (a.createdAt ?? "")));
  const key = (opts.merchant ?? "").trim().toLowerCase();
  const forMerchant = key ? sorted.filter((e) => (e.merchant ?? "").trim().toLowerCase() === key) : [];
  const pool = (forMerchant.length ? forMerchant : sorted).slice(0, 40);
  const top = <T extends string>(pick: (e: SmartDefaultsPast) => string | null | undefined, ok: (v: string) => boolean): T | null => {
    const score = new Map<string, number>();
    pool.forEach((e, i) => { const v = pick(e); if (v && ok(v)) score.set(v, (score.get(v) ?? 0) + 0.9 ** i); });
    let best: string | null = null; let bestScore = 0;
    for (const [v, n] of score) if (n > bestScore + 1e-9) { best = v; bestScore = n; }
    return best as T | null;
  };
  const merchantName = forMerchant[0]?.merchant?.trim();
  const why = (pick: (e: SmartDefaultsPast) => string | null | undefined, v: string | null): SmartDefaultReason | undefined => {
    if (!v) return undefined;
    const hits = pool.filter((e) => pick(e) === v);
    return { matches: hits.length, lookedAt: pool.length, examples: hits.slice(0, 3).map((e) => ({ date: e.date, merchant: e.merchant?.trim() || null })) };
  };
  const accountId = top((e) => e.accountId, (v) => liveAccountIds.includes(v));
  const scope = top<Scope>((e) => e.scope, (v) => !opts.scopes || (opts.scopes as readonly string[]).includes(v));
  const category = top((e) => e.category, (v) => !opts.categories || opts.categories.includes(v));
  const paymentMethod = top((e) => e.paymentMethod, () => true);
  const reasons: SmartDefaults["reasons"] = {};
  { const r = why((e) => e.category, category); if (r) reasons.category = r; }
  { const r = why((e) => e.accountId, accountId); if (r) reasons.accountId = r; }
  { const r = why((e) => e.scope, scope); if (r) reasons.scope = r; }
  { const r = why((e) => e.paymentMethod, paymentMethod); if (r) reasons.paymentMethod = r; }
  return {
    accountId, scope, category, paymentMethod, reasons,
    basis: pool.length ? (forMerchant.length ? "merchant" : "habit") : null,
    ...(forMerchant.length && merchantName ? { merchant: merchantName } : {}),
  };
}

export const shopKey = (m: string | null | undefined) => (m ?? "").trim().toLowerCase();
export type ShopRuleField = "category" | "accountId" | "paymentMethod" | "scope";
/**
 * Apply your per-shop rule to learned suggestions: "off" removes a suggestion, any other value replaces it.
 * Returns which fields your rule decided so the form can say so.
 */
export function applyShopRule<T extends Partial<Record<ShopRuleField, string | null>>>(d: T, rule: Partial<Record<ShopRuleField, string>> | undefined): { value: T; ruled: ShopRuleField[] } {
  const value = { ...d }; const ruled: ShopRuleField[] = [];
  if (!rule) return { value, ruled };
  for (const f of ["category", "accountId", "paymentMethod", "scope"] as const) {
    const r = rule[f]; if (!r) continue;
    (value as Record<string, string | null>)[f] = r === "off" ? null : r; ruled.push(f);
  }
  return { value, ruled };
}

/** The shop whose rule applies: follows aliases (at most a few hops, so a loop can't hang). */
export function resolveShop(merchant: string | null | undefined, aliases: Record<string, string> | undefined): string {
  let k = shopKey(merchant);
  for (let i = 0; i < 5 && aliases?.[k]; i++) k = aliases[k]!;
  return k;
}
export function shopRuleFor<R>(merchant: string | null | undefined, rules: Record<string, R> | undefined, aliases: Record<string, string> | undefined): R | undefined {
  return rules?.[resolveShop(merchant, aliases)];
}
