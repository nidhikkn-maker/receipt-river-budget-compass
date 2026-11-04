/** v6.1 market data, valuation and dynamic net worth. Pure; never creates ledger entries or invents prices. */
import type { AlertSettings, Freshness, GoldRate, Holding, Quote, Snapshot } from "./types";

export const FRESHNESS_LABEL: Record<Freshness, string> = { live: "Live", delayed: "Delayed", eod: "End of day", nav: "Latest NAV", manual: "Entered by you", statement: "From statement" };

/** Instrument key: ISIN first, then exchange+symbol, then fund code — never name alone [v6.1 §3]. */
export function quoteKey(h: Pick<Holding, "isin" | "exchange" | "symbol" | "schemeCode" | "kind">): string | null {
  if (h.isin && /^IN[A-Z0-9]{10}$/.test(h.isin)) return `isin:${h.isin}`;
  if (h.exchange && h.symbol) return `${h.exchange}:${h.symbol.toUpperCase()}`;
  if (h.schemeCode) return `amfi:${h.schemeCode}`;
  return null;
}

/** NSE/BSE regular session, Mon–Fri 09:15–15:30 IST (holidays not modelled; flagged as an assumption). */
export function marketOpen(at: Date): boolean {
  const ist = new Date(at.getTime() + 5.5 * 3600e3);
  const d = ist.getUTCDay(), mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return d >= 1 && d <= 5 && mins >= 555 && mins <= 930;
}

/** Weekdays strictly after `from` up to and including `to` (exchange holidays not modelled). */
export function businessDaysBetween(from: Date, to: Date): number {
  let n = 0; const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  while (d.getTime() < end) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

/** Stale when a refresh failed, or older than allowed for its kind (prices: more than four business days). */
export function isStale(q: Quote, now: Date, kind: Holding["kind"], staleNavDays: number): boolean {
  if (q.failedAt && q.failedAt > q.refreshedAt) return true;
  const ageH = (now.getTime() - Date.parse(q.at)) / 36e5;
  if (kind === "mutual_fund") return ageH > staleNavDays * 24;
  if ((q.freshness === "live" || q.freshness === "delayed") && marketOpen(now)) return ageH > 0.5;
  return businessDaysBetween(new Date(q.at), now) > 4;
}

/** Statement quantity per ISIN summed across every demat account, so two accounts never overwrite each other. */
export function quantityByIsin(accounts: { holdings: { isin: string; quantity: number }[] }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of accounts) for (const h of a.holdings) if (h.isin) out[h.isin] = (out[h.isin] ?? 0) + h.quantity;
  return out;
}

/** A failed refresh keeps the last valid price and marks it stale — never zero [v6.1 §6]. */
export function recordFailure(quotes: Quote[], key: string, at: string): Quote[] {
  return quotes.map((q) => (q.key === key ? { ...q, failedAt: at } : q));
}
export function upsertQuote(quotes: Quote[], q: Quote): Quote[] {
  if (!(q.price > 0)) throw new Error("A price must be above zero");
  const prev = quotes.find((x) => x.key === q.key);
  if (prev && prev.at > q.at) return quotes; // never replace a newer price with an older one
  return [...quotes.filter((x) => x.key !== q.key), q];
}

export interface Valued { holding: Holding; key: string | null; quote: Quote | null; value: number | null; stale: boolean; note: string }

/** Holding value = verified quantity × applicable price × ownership share [v6.1 §4, §8]. */
export function valueHolding(h: Holding, quotes: Quote[], gold: GoldRate | undefined, now: Date, alerts: AlertSettings): Valued {
  const share = h.sharePct / 100;
  if (h.kind === "physical_gold") {
    if (!h.grams || !h.karat) return { holding: h, key: null, quote: null, value: null, stale: false, note: "Needs weight and purity" };
    if (!gold) return { holding: h, key: null, quote: null, value: null, stale: false, note: "Set a gold rate per gram — ETF prices are never used for physical gold" };
    const value = Math.round(h.grams * (h.karat / 24) * gold.perGram24k * share * 100) / 100;
    const ageD = (now.getTime() - Date.parse(gold.date)) / 864e5;
    return { holding: h, key: null, quote: { key: "gold", price: gold.perGram24k, at: gold.date, provider: gold.source, freshness: "manual", refreshedAt: gold.date }, value, stale: ageD > 7, note: `${h.grams} g × ${h.karat}k at ${gold.perGram24k}/g (24k) · ${gold.source}` };
  }
  const key = quoteKey(h);
  const q = key ? quotes.find((x) => x.key === key) ?? null : null;
  if (!key) return { holding: h, key, quote: null, value: null, stale: false, note: "Needs ISIN, exchange symbol or fund code" };
  if (!q) return { holding: h, key, quote: null, value: null, stale: false, note: "Price data required" };
  return { holding: h, key, quote: q, value: Math.round(h.quantity * q.price * share * 100) / 100, stale: isStale(q, now, h.kind, alerts.staleNavDays), note: `${FRESHNESS_LABEL[q.freshness]} · ${q.provider}` };
}

export interface NetWorthPart { label: string; value: number; basis: string; live: boolean }
/** Net worth = recognised assets − recognised liabilities, each with its basis [v6.1 §9–10]. */
export function dynamicNetWorth(parts: { bank: number; bankBasis: string; investments: Valued[]; demat: number; dematBasis: string; otherAssets: number; property: number; propertyBasis: string; liabilities: number; liabilitiesBasis: string }) {
  const inv = parts.investments.reduce((s, v) => s + (v.value ?? 0), 0);
  const assets: NetWorthPart[] = [
    { label: "Bank & cash", value: parts.bank, basis: parts.bankBasis, live: false },
    { label: "Investments", value: Math.round((inv + parts.demat) * 100) / 100, basis: [parts.investments.length ? `${parts.investments.filter((v) => v.value != null).length}/${parts.investments.length} priced` : "", parts.dematBasis].filter(Boolean).join(" · "), live: parts.investments.some((v) => v.quote?.freshness === "live" && !v.stale) },
    { label: "Property", value: parts.property, basis: parts.propertyBasis, live: false },
    { label: "Other assets", value: parts.otherAssets, basis: "latest recorded value", live: false },
  ];
  const total = assets.reduce((s, a) => s + a.value, 0);
  const missing = parts.investments.filter((v) => v.value == null).length;
  const stale = parts.investments.filter((v) => v.stale).length;
  return {
    assets, liabilities: parts.liabilities, liabilitiesBasis: parts.liabilitiesBasis,
    net: Math.round((total - parts.liabilities) * 100) / 100,
    /** Overall is never "live" while bank, property or loans are statement-based [v6.1 §10]. */
    label: "As of latest records" as const,
    quality: [missing && `${missing} holding${missing > 1 ? "s" : ""} without a price (left out, not zero)`, stale && `${stale} stale price${stale > 1 ? "s" : ""}`].filter(Boolean) as string[],
  };
}

/** One dated snapshot per day; saving one never touches the ledger [v6.1 §12]. */
export function addSnapshot(list: Snapshot[], s: Snapshot): Snapshot[] {
  return [...list.filter((x) => x.date !== s.date), s].sort((a, b) => a.date.localeCompare(b.date)).slice(-1500);
}

/** Configurable valuation alerts [v6.1 §13]. */
export function valuationAlerts(valued: Valued[], snapshots: Snapshot[], a: AlertSettings, statementQty: Record<string, number>, qtyHoldings: Holding[] = valued.map((v) => v.holding)): string[] {
  const out: string[] = [];
  if (a.missingPrices) { const m = valued.filter((v) => v.value == null); if (m.length) out.push(`${m.length} holding${m.length > 1 ? "s have" : " has"} no price`); }
  for (const v of valued) if (v.stale && v.holding.kind === "mutual_fund") out.push(`${v.holding.name}: NAV older than ${a.staleNavDays} days`);
  if (snapshots.length >= 2) {
    const [p, c] = snapshots.slice(-2) as [Snapshot, Snapshot];
    if (p.portfolio > 0) { const pct = ((c.portfolio - p.portfolio) / p.portfolio) * 100; if (Math.abs(pct) >= a.portfolioMovePct) out.push(`Portfolio moved ${pct.toFixed(1)}% since ${p.date}`); }
  }
  if (a.quantityMismatch) {
    const held = new Map<string, { name: string; qty: number }>();
    for (const h of qtyHoldings) { const k = h.isin; if (k) held.set(k, { name: held.get(k)?.name ?? h.name, qty: (held.get(k)?.qty ?? 0) + h.quantity }); }
    for (const [k, h] of held) if (statementQty[k] != null && Math.abs(statementQty[k]! - h.qty) > 1e-6) out.push(`${h.name}: ${h.qty} held vs ${statementQty[k]} on the latest statement`);
  }
  if (a.unusualValuationPct > 0) for (const v of valued) if (v.value != null && v.holding.costBasis && Math.abs(v.value / v.holding.costBasis - 1) * 100 > a.unusualValuationPct) out.push(`${v.holding.name}: value is ${Math.round((v.value / v.holding.costBasis - 1) * 100)}% from cost — check the price`);
  return out;
}
