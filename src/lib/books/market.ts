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

/** NSE/BSE trading holidays (exchange circulars). Dates not listed are treated as trading days. */
export const EXCHANGE_HOLIDAYS = new Set<string>([
  "2025-02-26","2025-03-14","2025-03-31","2025-04-10","2025-04-14","2025-04-18","2025-05-01","2025-08-15","2025-08-27","2025-10-02","2025-10-21","2025-10-22","2025-11-05","2025-12-25",
  "2026-01-26","2026-03-03","2026-03-26","2026-03-31","2026-04-03","2026-04-14","2026-05-01","2026-05-28","2026-06-26","2026-09-14","2026-10-02","2026-10-20","2026-11-10","2026-11-24","2026-12-25",
]);
const isHoliday = (d: Date) => EXCHANGE_HOLIDAYS.has(d.toISOString().slice(0, 10));

/** NSE/BSE regular session, Mon–Fri 09:15–15:30 IST, closed on listed exchange holidays. */
export function marketOpen(at: Date): boolean {
  const ist = new Date(at.getTime() + 5.5 * 3600e3);
  const d = ist.getUTCDay(), mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return d >= 1 && d <= 5 && !isHoliday(ist) && mins >= 555 && mins <= 930;
}

/** Trading days strictly after `from` up to and including `to` (weekends and listed exchange holidays skipped). */
export function businessDaysBetween(from: Date, to: Date): number {
  let n = 0; const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  while (d.getTime() < end) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6 && !isHoliday(d)) n++; }
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

/** "5 Nov, 15:30 IST" — the real time a price is for / was fetched [v6.1 §5]. */
export function fmtIst(iso: string): string {
  const t = Date.parse(iso); if (!Number.isFinite(t)) return "unknown";
  const d = new Date(t + 5.5 * 3600e3);
  return `${d.getUTCDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()]} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")} IST`;
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
  // Cash held with a broker is money, not a security: rupee amount × share, never priced [v6.1 §3].
  if (h.kind === "broker_cash") return { holding: h, key: null, quote: null, value: Math.round(h.quantity * share * 100) / 100, stale: false, note: `Broker cash · ${h.source}` };
  const key = quoteKey(h);
  const q = key ? quotes.find((x) => x.key === key) ?? null : null;
  if (!key) return { holding: h, key, quote: null, value: null, stale: false, note: "Needs ISIN, exchange symbol or fund code" };
  if (!q) return { holding: h, key, quote: null, value: null, stale: false, note: "Price data required" };
  // Instrument type must fit the price type: funds use NAVs, exchange-traded securities use exchange prices [v6.1 §3].
  const exchangeQuote = q.freshness === "live" || q.freshness === "delayed" || q.freshness === "eod";
  if ((h.kind === "mutual_fund" && exchangeQuote) || ((h.kind === "etf" || h.kind === "gold_etf" || h.kind === "sgb" || h.kind === "bond") && q.freshness === "nav")) return { holding: h, key, quote: null, value: null, stale: false, note: h.kind === "mutual_fund" ? "Exchange price found but a fund needs its NAV" : "NAV found but this security needs an exchange price" };
  const status = q.tradingStatus ?? h.tradingStatus ?? "active";
  // Delisted or suspended securities are never valued at an old last price as if tradable [v6.1 §4].
  if (status === "delisted") return { holding: h, key, quote: q, value: null, stale: true, note: `Delisted — last price ${q.price} on ${fmtIst(q.at)} is not used; enter a confirmed value` };
  const flag = status === "suspended" ? "Trading suspended · last traded price · " : status === "illiquid" ? "Thinly traded · " : "";
  return { holding: h, key, quote: q, value: Math.round(h.quantity * q.price * share * 100) / 100, stale: status === "suspended" || isStale(q, now, h.kind, alerts.staleNavDays), note: `${flag}${FRESHNESS_LABEL[q.freshness]} · ${q.provider} · price ${fmtIst(q.at)} · fetched ${fmtIst(q.refreshedAt)}` };
}

export interface NetWorthPart { label: string; value: number; basis: string; live: boolean; asOf?: string | null }
/** Net worth = recognised assets − recognised liabilities, each with its basis [v6.1 §9–10]. */
export function dynamicNetWorth(parts: { bank: number; bankBasis: string; investments: Valued[]; demat: number; dematBasis: string; otherAssets: number; property: number; propertyBasis: string; liabilities: number; liabilitiesBasis: string; asOf?: { bank?: string | null; investments?: string | null; property?: string | null; liabilities?: string | null } }) {
  const inv = parts.investments.reduce((s, v) => s + (v.value ?? 0), 0);
  const assets: NetWorthPart[] = [
    { label: "Bank & cash", value: parts.bank, basis: parts.bankBasis, live: false, asOf: parts.asOf?.bank ?? null },
    { label: "Investments", value: Math.round((inv + parts.demat) * 100) / 100, basis: [parts.investments.length ? `${parts.investments.filter((v) => v.value != null).length}/${parts.investments.length} priced` : "", parts.dematBasis].filter(Boolean).join(" · "), live: parts.investments.some((v) => v.quote?.freshness === "live" && !v.stale), asOf: [parts.asOf?.investments, ...parts.investments.map((v) => v.quote?.at?.slice(0, 10))].filter(Boolean).sort()[0] ?? null },
    { label: "Property", value: parts.property, basis: parts.propertyBasis, live: false, asOf: parts.asOf?.property ?? null },
    { label: "Other assets", value: parts.otherAssets, basis: "latest recorded value", live: false },
  ];
  const total = assets.reduce((s, a) => s + a.value, 0);
  const missing = parts.investments.filter((v) => v.value == null).length;
  const stale = parts.investments.filter((v) => v.stale).length;
  return {
    assets, liabilities: parts.liabilities, liabilitiesBasis: parts.liabilitiesBasis, liabilitiesAsOf: parts.asOf?.liabilities ?? null,
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
export function valuationAlerts(valued: Valued[], snapshots: Snapshot[], a: AlertSettings, statementQty: Record<string, number>, qtyHoldings: Holding[] = valued.map((v) => v.holding), corporateActions: { name: string; note: string }[] = [], dematMissing: string[] = []): string[] {
  const out: string[] = [];
  if (a.missingPrices) { const m = valued.filter((v) => v.value == null); if (m.length) out.push(`${m.length} holding${m.length > 1 ? "s have" : " has"} no price`); }
  for (const v of valued) if (v.stale && v.holding.kind === "mutual_fund") out.push(`${v.holding.name}: NAV older than ${a.staleNavDays} days`);
  if (snapshots.length >= 2) {
    const [p, c] = snapshots.slice(-2) as [Snapshot, Snapshot];
    // Market move excludes money added or withdrawn between snapshots, so a new purchase is not an "increase" [v6.1 §13].
    const flows = c.invested != null && p.invested != null ? c.invested - p.invested : 0;
    if (p.portfolio > 0) { const pct = ((c.portfolio - p.portfolio - flows) / p.portfolio) * 100; if (Math.abs(pct) >= a.portfolioMovePct) out.push(`Portfolio ${pct >= 0 ? "rose" : "fell"} ${Math.abs(pct).toFixed(1)}% from market movement since ${p.date}${flows ? ` (₹${Math.round(flows).toLocaleString("en-IN")} of new money excluded)` : ""}`); }
  }
  if (a.quantityMismatch) {
    const held = new Map<string, { name: string; qty: number }>();
    for (const h of qtyHoldings) { const k = h.isin; if (k) held.set(k, { name: held.get(k)?.name ?? h.name, qty: (held.get(k)?.qty ?? 0) + h.quantity }); }
    for (const [k, h] of held) if (statementQty[k] != null && Math.abs(statementQty[k]! - h.qty) > 1e-6) out.push(`${h.name}: ${h.qty} held vs ${statementQty[k]} on the latest statement`);
  }
  // Value already carries the ownership share, so compare it with the same share of cost [v6.1 §13].
  if (a.unusualValuationPct > 0) for (const v of valued) { const cost = v.holding.costBasis ? v.holding.costBasis * ((v.holding.sharePct ?? 100) / 100) : 0; if (v.value != null && cost > 0 && Math.abs(v.value / cost - 1) * 100 > a.unusualValuationPct) out.push(`${v.holding.name}: value is ${Math.round((v.value / cost - 1) * 100)}% from cost — check the price`); }
  if (a.corporateActions) for (const c of corporateActions) out.push(`${c.name}: ${c.note} — reconcile quantity and cost before relying on its value`);
  if (a.missingPrices && dematMissing.length) out.push(`${dematMissing.length} demat holding${dematMissing.length > 1 ? "s have" : " has"} no price or statement value`);
  return out;
}

/** Apply a bonus (ratio new:held) or split (old face → new face) to a lot; total cost never changes. */
export function applyCorporateAction(lot: { quantity: number; cost: number }, a: { kind: "bonus" | "split"; ratioNew: number; ratioOld: number }): { quantity: number; cost: number; unitCost: number } {
  if (!(a.ratioNew > 0) || !(a.ratioOld > 0)) throw new Error("Ratio must be positive");
  const quantity = a.kind === "bonus" ? lot.quantity + Math.floor((lot.quantity * a.ratioNew) / a.ratioOld) : Math.round((lot.quantity * a.ratioOld) / a.ratioNew * 1e6) / 1e6;
  return { quantity, cost: lot.cost, unitCost: quantity ? lot.cost / quantity : 0 };
}
