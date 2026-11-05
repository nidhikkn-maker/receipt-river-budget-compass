/** Mutual fund statement → holdings proposal [v6 §42, v6.1 §2–4]. Pure; units come only from the statement. */
import type { Holding, Quote } from "./types";
import { quoteKey } from "./market";

export interface FundLineRead { scheme: string; isin: string | null; schemeCode: string | null; units: number | null; nav: number | null; navDate: string | null; cost: number | null; value: number | null }
export interface FundRead { amc: string | null; folioLast4: string | null; asOf: string | null; holdings: FundLineRead[] }
export interface FundProposalLine { holding: Holding | null; existingId: string | null; previousUnits: number | null; quote: Quote | null; missing: string[]; valueCheck: string | null }

const isIso = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isin = (v: string | null) => { const s = (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""); return /^IN[A-Z0-9]{10}$/.test(s) ? s : null; };

/** Same ISIN (else same scheme code, else same scheme name) updates the existing holding — never a second copy. */
export function proposeFundHoldings(read: FundRead, existing: Holding[], newId: (i: number) => string, docTitle: string): FundProposalLine[] {
  return read.holdings.map((l, i) => {
    const missing: string[] = [];
    const id = isin(l.isin);
    if (l.units == null || !(l.units >= 0)) missing.push("units");
    if (!id && !l.schemeCode) missing.push("ISIN or scheme code");
    const nm = l.scheme.trim().toLowerCase();
    const prev = existing.find((h) => h.kind === "mutual_fund" && ((id && h.isin === id) || (!id && l.schemeCode && h.schemeCode === l.schemeCode) || (!id && !l.schemeCode && h.name.trim().toLowerCase() === nm))) ?? null;
    if (missing.includes("units")) return { holding: null, existingId: prev?.id ?? null, previousUnits: prev?.quantity ?? null, quote: null, missing, valueCheck: null };
    const holding: Holding = { ...(prev ?? { sharePct: 100 }), id: prev?.id ?? newId(i), kind: "mutual_fund", name: l.scheme.trim(), isin: id ?? prev?.isin, schemeCode: l.schemeCode ?? prev?.schemeCode, quantity: l.units!, costBasis: l.cost ?? prev?.costBasis, source: `${docTitle}${read.asOf ? ` · as on ${read.asOf}` : ""}` } as Holding;
    const key = quoteKey(holding);
    const date = isIso(l.navDate) ? l.navDate : isIso(read.asOf) ? read.asOf : null;
    const quote: Quote | null = key && l.nav && l.nav > 0 && date ? { key, price: l.nav, at: `${date}T00:00:00+05:30`, provider: read.amc ? `${read.amc} statement` : "Fund statement", freshness: "statement", refreshedAt: `${date}T00:00:00+05:30` } : null;
    // Printed value must agree with units × NAV within ₹1 or 0.1%; a mismatch is shown, never corrected.
    let valueCheck: string | null = null;
    if (l.value != null && l.nav) { const calc = Math.round(l.units! * l.nav * 100) / 100; if (Math.abs(calc - l.value) > Math.max(1, l.value * 0.001)) valueCheck = `Printed value ₹${l.value.toLocaleString("en-IN")} differs from units × NAV ₹${calc.toLocaleString("en-IN")}`; }
    return { holding, existingId: prev?.id ?? null, previousUnits: prev?.quantity ?? null, quote, missing, valueCheck };
  });
}
