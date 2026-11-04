/** Fixed assets, property ownership and depreciation (v6). Pure rules; saved in owner preferences. */
import { fyOf, fyRange } from "./entities";

export const ASSET_KINDS = { property: "Property / land", building: "Building", vehicle: "Vehicle", machinery: "Plant & machinery", computer: "Computer", furniture: "Furniture", other: "Other" } as const;
export type AssetKind = keyof typeof ASSET_KINDS;

/** Default income-tax block rates (WDV) per kind; land is never depreciated. */
export const TAX_RATES: Record<AssetKind, number> = { property: 0, building: 10, vehicle: 15, machinery: 15, computer: 40, furniture: 10, other: 15 };

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  cost: number;
  /** Date first put to use (YYYY-MM-DD). */
  inUse: string;
  ownerEntityId?: string | undefined;
  /** Ownership share in percent (joint property). */
  sharePct: number;
  bookMethod: "slm" | "wdv";
  bookRatePct: number;
  /** Optional linked DocuRepo deed/invoice. */
  docId?: string | undefined;
  soldOn?: string | undefined;
  /** Rent expected per month for leased-out property. */
  monthlyRent?: number | undefined;
  /** Physical check details [§30]. */
  tag?: string | undefined;
  location?: string | undefined;
  custodian?: string | undefined;
  lastVerified?: string | undefined;
  condition?: "ok" | "damaged" | "missing" | undefined;
  /** Tenant lease [§38]. */
  tenant?: string | undefined;
  leaseEnd?: string | undefined;
  deposit?: number | undefined;
  /** Book policy inputs [§32]: useful life (years) and residual value (% of cost). */
  usefulLifeYears?: number | undefined;
  residualPct?: number | undefined;
  /** Sale proceeds for the tax block on disposal. */
  saleValue?: number | undefined;
  department?: string | undefined;
  supplier?: string | undefined;
  warrantyUntil?: string | undefined;
  insurance?: string | undefined;
  /** Kept separate from put-to-use [§32]: invoice date and the date it entered the books. */
  purchaseDate?: string | undefined;
  capitalisedOn?: string | undefined;
  /** Written-down value carried in from an imported prior year [§32]: book value at the start of `openingFy`. */
  openingWdv?: { fy: string; book: number; tax?: number | undefined } | undefined;
  /** Impairment / revaluation adjustments to book value from a date onward [§28]. */
  adjustments?: { date: string; amount: number; kind: "impairment" | "revaluation"; note: string }[] | undefined;
  /** Supporting documents beyond the invoice: maintenance, photos, disposal papers, valuation reports [§29]. */
  docIds?: string[] | undefined;
  /** Ledger asset account whose book value depreciation reduces (an "other asset" account) [§21, §26]. */
  accountId?: string | undefined;
  /** Bank entry that paid for the asset, when matched [§27]. */
  paymentId?: string | undefined;
}

/** Physical-check and lease follow-ups; pure, never changes the asset. */
export function assetFollowUps(a: Asset, today: string): string[] {
  if (a.soldOn) return [];
  const out: string[] = [];
  const days = (d: string) => Math.round((Date.parse(today) - Date.parse(d)) / 86400000);
  if (a.condition === "missing") out.push("reported missing");
  else if (a.condition === "damaged") out.push("reported damaged");
  if (a.kind !== "property" && (!a.lastVerified || days(a.lastVerified) > 365)) out.push(a.lastVerified ? "not physically checked in over a year" : "never physically checked");
  if (a.leaseEnd) { const left = -days(a.leaseEnd); if (left < 0) out.push(`lease ended ${a.leaseEnd}`); else if (left <= 60) out.push(`lease ends in ${left} days`); }
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

export interface DepYear { fy: string; opening: number; depreciation: number; closing: number }

/** Book depreciation schedule, pro-rated by days in use in the first year; stops at sale or zero. */
export function bookSchedule(a: Asset, uptoFy: string): DepYear[] {
  const out: DepYear[] = [];
  if (a.kind === "property" || a.cost <= 0) return out;
  let wdv = a.cost;
  for (let s = Number(fyOf(a.inUse).slice(0, 4)); s <= Number(uptoFy.slice(0, 4)) && out.length < 60; s++) {
    const fy = `${s}-${String((s + 1) % 100).padStart(2, "0")}`;
    const { start, end } = fyRange(fy);
    const from = a.inUse > start ? a.inUse : start;
    const to = a.soldOn && a.soldOn < end ? a.soldOn : end;
    if (to < from) break;
    const frac = Math.min(1, daysBetween(from, to) / daysBetween(start, end));
    const base = a.bookMethod === "slm" ? a.cost : wdv;
    const dep = r2(Math.min(wdv, base * (a.bookRatePct / 100) * frac));
    out.push({ fy, opening: r2(wdv), depreciation: dep, closing: r2(wdv - dep) });
    wdv -= dep;
    if (wdv <= 0.005 || (a.soldOn && a.soldOn <= end)) break;
  }
  return out;
}

/** Income-tax WDV: half rate when put to use for under 180 days in the first year (s.32 proviso). */
export function taxSchedule(a: Asset, uptoFy: string): DepYear[] {
  const rate = TAX_RATES[a.kind];
  const out: DepYear[] = [];
  if (!rate || a.cost <= 0) return out;
  let wdv = a.cost;
  const first = fyOf(a.inUse);
  for (let s = Number(first.slice(0, 4)); s <= Number(uptoFy.slice(0, 4)) && out.length < 60; s++) {
    const fy = `${s}-${String((s + 1) % 100).padStart(2, "0")}`;
    if (a.soldOn && fyOf(a.soldOn) <= fy && fy !== first && a.soldOn < fyRange(fy).start) break;
    const half = fy === first && daysBetween(a.inUse, fyRange(fy).end) < 180;
    const dep = r2(wdv * (rate / 100) * (half ? 0.5 : 1));
    out.push({ fy, opening: r2(wdv), depreciation: dep, closing: r2(wdv - dep) });
    wdv -= dep;
    if (a.soldOn && fyOf(a.soldOn) === fy) break;
  }
  return out;
}

/** Owner's share of an asset's current book value. */
export function shareValue(a: Asset, fy: string): number {
  const sched = bookSchedule(a, fy);
  const value = a.kind === "property" ? a.cost : sched.length ? sched[sched.length - 1]!.closing : a.cost;
  return r2(value * (a.sharePct / 100));
}

export type RentStatus = "paid" | "partial" | "unpaid" | "advance";
export interface RentMonth {
  month: string; expected: number; received: number;
  /** Rent still owed after this month (arrears), or prepaid when negative. */
  balance: number; status: RentStatus;
  /** Deposit receipts this month — never counted as rent [§39]. */
  deposits: number;
}
/**
 * Compare expected rent with income naming the property or tenant [§39].
 * Receipts saying "deposit" are kept apart; over/under payments carry forward
 * so arrears and advance rent are visible. Read-only — never posts entries.
 */
export function rentCheck(a: Asset, income: { date: string; amount: number; text: string }[], months: string[]): RentMonth[] {
  if (!a.monthlyRent) return [];
  const keys = [a.name, a.tenant].map((k) => k?.trim().toLowerCase()).filter((k): k is string => !!k);
  const mine = income.filter((i) => keys.some((k) => i.text.toLowerCase().includes(k)));
  let owed = 0;
  return months.map((m) => {
    const inMonth = mine.filter((i) => i.date.startsWith(m));
    const deposits = r2(inMonth.filter((i) => /deposit|advance\s*security/i.test(i.text)).reduce((s, i) => s + i.amount, 0));
    const received = r2(inMonth.filter((i) => !/deposit|advance\s*security/i.test(i.text)).reduce((s, i) => s + i.amount, 0));
    owed = r2(owed + a.monthlyRent! - received);
    const status: RentStatus = owed < 0 ? "advance" : owed === 0 ? "paid" : received > 0 ? "partial" : "unpaid";
    return { month: m, expected: a.monthlyRent!, received, balance: owed, status, deposits };
  });
}

export function cleanAssets(raw: unknown): Asset[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is Asset => !!x && typeof x.id === "string" && typeof x.name === "string" && x.kind in ASSET_KINDS && Number.isFinite(x.cost) && /^\d{4}-\d{2}-\d{2}$/.test(x.inUse))
    .map((x) => ({ ...x, sharePct: Math.min(100, Math.max(0, Number(x.sharePct) || 100)), bookMethod: (x.bookMethod === "wdv" ? "wdv" : "slm") as Asset["bookMethod"], bookRatePct: Math.min(100, Math.max(0, Number(x.bookRatePct) || 0)) }))
    .slice(0, 200);
}
