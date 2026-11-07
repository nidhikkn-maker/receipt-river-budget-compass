import type { Holding, Quote } from "./types";

/** Owner-reviewed printed conventions. Dates are explicit; no coupon schedule is guessed. */
export interface BondTerms {
  faceValue: number; couponPct: number; lastCoupon: string; nextCoupon: string; maturity: string;
  dayCount: "ACT/365" | "ACT/360" | "ACT/ACT" | "30E/360";
  couponsPerYear: number; priceBasis: "amount" | "percent"; priceIncludesInterest: boolean;
  currency: string; docId: string; sourceQuote: string;
}
const day = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const value = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0,10) === date ? value : NaN;
};
export function bondProblem(t: BondTerms): string | null {
  if (!(t.faceValue > 0) || !Number.isFinite(t.faceValue) || !(t.couponPct >= 0) || !Number.isFinite(t.couponPct)) return "Enter evidenced face value and coupon rate";
  if (![1,2,4,12].includes(t.couponsPerYear)) return "Choose the printed coupon frequency";
  if (!["ACT/365","ACT/360","ACT/ACT","30E/360"].includes(t.dayCount)) return "Choose the printed day-count convention";
  if (!["amount","percent"].includes(t.priceBasis) || !/^[A-Z]{3}$/.test(t.currency)) return "Confirm price units and currency";
  if (![t.lastCoupon,t.nextCoupon,t.maturity].every(d => Number.isFinite(day(d))) || !(t.lastCoupon < t.nextCoupon) || t.nextCoupon > t.maturity) return "Confirm the coupon dates and maturity";
  if (!t.docId || !t.sourceQuote.trim()) return "Link the original with its printed bond terms";
  return null;
}
export function bondPrice(h: Holding, q: Quote, date: string): { unitPrice: number | null; accrued: number; note: string } {
  const t = h.bond;
  if (!t) return { unitPrice: null, accrued: 0, note: "Bond terms and source document required" };
  const problem = bondProblem(t);
  if (problem) return { unitPrice: null, accrued: 0, note: problem };
  if ((q.currency ?? "INR").toUpperCase() !== t.currency) return { unitPrice: null, accrued: 0, note: "Quote currency differs from bond terms" };
  if (date >= t.maturity) return { unitPrice: null, accrued: 0, note: `Matured ${t.maturity} — confirm redemption or an outstanding receivable; old prices not used` };
  if (date < t.lastCoupon || date >= t.nextCoupon) return { unitPrice: null, accrued: 0, note: "Update the evidenced coupon period before valuing this bond" };
  let days = (day(date) - day(t.lastCoupon)) / 864e5;
  if (t.dayCount === "30E/360") {
    const a = new Date(day(t.lastCoupon)), b = new Date(day(date));
    days = (b.getUTCFullYear()-a.getUTCFullYear())*360 + (b.getUTCMonth()-a.getUTCMonth())*30 + Math.min(30,b.getUTCDate())-Math.min(30,a.getUTCDate());
  }
  const fraction = t.dayCount === "ACT/ACT" ? days / ((day(t.nextCoupon)-day(t.lastCoupon))/864e5) / t.couponsPerYear : days / (t.dayCount === "ACT/365" ? 365 : 360);
  const accrued = t.faceValue * t.couponPct / 100 * fraction;
  const clean = t.priceBasis === "percent" ? q.price * t.faceValue / 100 : q.price;
  return { unitPrice: clean + (t.priceIncludesInterest ? 0 : accrued), accrued, note: `${t.priceIncludesInterest ? "Dirty price (interest included)" : "Clean price + accrued interest"} · ${accrued.toFixed(2)} ${t.currency}/unit · ${t.dayCount} · terms ${t.docId}` };
}