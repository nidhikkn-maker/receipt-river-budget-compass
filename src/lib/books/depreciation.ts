/**
 * Full depreciation engine [§31–34]: book (useful life/residual, monthly) and tax (block WDV) kept separate,
 * with a book-vs-tax reconciliation and journals prepared for approval. Pure.
 */
import { fyOf, fyRange } from "../entities";
import { TAX_RATES, taxSchedule, type Asset, type AssetKind } from "../assets";
import type { ClosedPeriod, Journal } from "./types";
import { closedPeriodFor } from "./periods";

const r2 = (n: number) => Math.round(n * 100) / 100;
const monthEnd = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
const daysIn = (m: string) => Number(monthEnd(m).slice(8, 10));

export interface BookMonth { month: string; opening: number; depreciation: number; accumulated: number; nbv: number }

/** Monthly book depreciation. SLM with useful life uses (cost − residual)/life; otherwise rate-based; never below residual. */
export function monthlyBook(a: Asset, uptoMonth: string): BookMonth[] {
  if (a.kind === "property" || a.cost <= 0) return [];
  const residual = r2(a.cost * ((a.residualPct ?? 0) / 100));
  const life = a.usefulLifeYears ?? 0;
  const annualSlm = life > 0 ? (a.cost - residual) / life : a.cost * (a.bookRatePct / 100);
  const wdvRate = a.bookMethod === "wdv" ? (life > 0 && a.cost > 0 && residual > 0 ? 1 - (residual / a.cost) ** (1 / life) : a.bookRatePct / 100) : 0;
  const out: BookMonth[] = [];
  let nbv = a.cost, acc = 0;
  let start = a.inUse.slice(0, 7);
  // Imported prior-year written-down value: continue from the start of that year instead of recomputing history [§32].
  const ob = a.openingWdv && a.openingWdv.book >= 0 ? a.openingWdv : null;
  if (ob) { const s0 = fyRange(ob.fy).start.slice(0, 7); if (s0 > start) { start = s0; nbv = ob.book; acc = r2(a.cost - ob.book); } }
  const adj = [...(a.adjustments ?? [])].sort((x, y) => x.date.localeCompare(y.date));
  for (let m = start; m <= uptoMonth && out.length < 600; m = nextMonth(m)) {
    if (a.soldOn && m > a.soldOn.slice(0, 7)) break;
    // Impairment (negative) / revaluation (positive) change the carrying amount from their month onward [§28].
    for (const x of adj) if (x.date.slice(0, 7) === m) nbv = r2(Math.max(residual, nbv + x.amount));
    const from = m === a.inUse.slice(0, 7) ? Number(a.inUse.slice(8, 10)) : 1;
    const to = a.soldOn && m === a.soldOn.slice(0, 7) ? Number(a.soldOn.slice(8, 10)) : daysIn(m);
    const frac = Math.max(0, to - from + 1) / daysIn(m);
    const raw = a.bookMethod === "wdv" ? nbv * wdvRate / 12 * frac : annualSlm / 12 * frac;
    const dep = r2(Math.max(0, Math.min(raw, nbv - residual)));
    acc = r2(acc + dep); out.push({ month: m, opening: r2(nbv), depreciation: dep, accumulated: acc, nbv: r2(nbv - dep) });
    nbv = r2(nbv - dep);
    if (nbv <= residual + 0.005) break;
  }
  return out;
}
export function nextMonth(m: string): string { const y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; }

/** Annual book figures from the monthly engine. */
export function annualBook(a: Asset, fy: string) {
  const { start, end } = fyRange(fy);
  const months = monthlyBook(a, end.slice(0, 7));
  const inYear = months.filter((x) => x.month >= start.slice(0, 7) && x.month <= end.slice(0, 7));
  const last = months.filter((x) => x.month <= end.slice(0, 7)).pop();
  return { fy, depreciation: r2(inYear.reduce((s, x) => s + x.depreciation, 0)), accumulated: last?.accumulated ?? 0, nbv: last?.nbv ?? (a.inUse > end ? 0 : a.cost) };
}

export interface BlockRow { kind: AssetKind; rate: number; opening: number; additionsFull: number; additionsHalf: number; disposals: number; depreciation: number; closing: number }

/**
 * Income-tax block schedule (s.32): opening WDV + additions − disposal proceeds; additions used under 180 days get half rate.
 * Computed from each asset's tax schedule so it agrees with the per-asset view.
 */
export function blockSchedule(assets: Asset[], fy: string): BlockRow[] {
  const { start, end } = fyRange(fy);
  const by = new Map<AssetKind, BlockRow>();
  for (const a of assets) {
    const rate = TAX_RATES[a.kind]; if (!rate) continue;
    const row = by.get(a.kind) ?? { kind: a.kind, rate, opening: 0, additionsFull: 0, additionsHalf: 0, disposals: 0, depreciation: 0, closing: 0 };
    const y = taxSchedule(a, fy).find((s) => s.fy === fy);
    const added = a.inUse >= start && a.inUse <= end;
    if (added) { const half = (Date.parse(end) - Date.parse(a.inUse)) / 864e5 + 1 < 180; if (half) row.additionsHalf += a.cost; else row.additionsFull += a.cost; }
    else if (y) row.opening += y.opening;
    if (a.soldOn && a.soldOn >= start && a.soldOn <= end) row.disposals += a.saleValue ?? 0;
    by.set(a.kind, row);
  }
  // s.32 works on the block: sale proceeds reduce the full-rate part first, then the half-rate additions.
  return [...by.values()].map((r) => {
    const fullBase = r.opening + r.additionsFull - r.disposals;
    const halfBase = Math.max(0, r.additionsHalf + Math.min(0, fullBase));
    const full = Math.max(0, fullBase);
    const dep = r2((full * r.rate) / 100 + (halfBase * r.rate) / 200);
    return { ...r, opening: r2(r.opening), depreciation: dep, closing: r2(full + halfBase - dep) };
  });
}

/** Book vs tax per asset for a year — the two are never assumed equal [§31, §33, test 6]. */
export function bookVsTax(assets: Asset[], fy: string) {
  return assets.filter((a) => a.kind !== "property").map((a) => {
    const book = annualBook(a, fy).depreciation;
    const tax = taxSchedule(a, fy).find((s) => s.fy === fy)?.depreciation ?? 0;
    return { assetId: a.id, name: a.name, book, tax, difference: r2(tax - book) };
  });
}

/** Prepare monthly book journals for open months only; closed months are listed as exceptions [§34]. */
export function prepareJournals(assets: Asset[], month: string, existing: Journal[], closed: ClosedPeriod[], newId: () => string): { journals: Journal[]; exceptions: string[] } {
  const journals: Journal[] = []; const exceptions: string[] = [];
  if (closedPeriodFor(monthEnd(month), closed)) return { journals, exceptions: [`${month} is closed — depreciation not prepared`] };
  for (const a of assets) {
    if (existing.some((j) => j.assetId === a.id && j.period === month)) continue;
    const row = monthlyBook(a, month).find((x) => x.month === month);
    if (!row || row.depreciation <= 0) continue;
    if (!a.usefulLifeYears && !a.bookRatePct) { exceptions.push(`${a.name}: no useful life or rate set`); continue; }
    journals.push({ id: newId(), assetId: a.id, period: month, amount: row.depreciation, kind: "book", status: "prepared" });
  }
  return { journals, exceptions };
}

/** Posting moves prepared journals to posted, refusing any in a closed period. */
export function postJournals(all: Journal[], ids: string[], closed: ClosedPeriod[], today: string): Journal[] {
  return all.map((j) => {
    if (!ids.includes(j.id) || j.status !== "prepared") return j;
    if (closedPeriodFor(monthEnd(j.period), closed)) throw new Error(`${j.period} is closed; reopen it before posting`);
    return { ...j, status: "posted", postedOn: today };
  });
}
export { fyOf };
