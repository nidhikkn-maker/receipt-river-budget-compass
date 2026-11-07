/**
 * What each of the owner's businesses adds to their personal income-tax computation (Income-tax Act, 1961).
 * - Proprietorship: its business profit is the owner's own business income (same PAN).
 * - Firm / LLP: profit share is exempt (s.10(2A)); partner remuneration and capital interest are business
 *   income (s.28(v)) only to the extent the firm may deduct them under s.40(b) (interest ≤ 12% simple;
 *   remuneration ≤ higher of ₹3,00,000 / 90% of first ₹6,00,000 book profit, plus 60% of the rest).
 * - Company: profit is never the shareholder's income. Salary → Salaries; dividend → Other sources;
 *   loans/advances to a ≥10% shareholder → deemed dividend s.2(22)(e) up to accumulated profits.
 * Pure: missing facts are flagged, never assumed.
 */
import type { EntityKind, EntityProfile } from "../entities";
import type { TaxComputation } from "./taxcomp";

export interface EntityFacts {
  entity: EntityProfile;
  /** Business profit (book profit for firms) from that entity's own computation. */
  profit: number;
  /** Payments from the business to the owner in the year, from personal-account entries. */
  paid: { salary: number; remuneration: number; capitalInterest: number; dividend: number; loans: number; rent: number; interest: number };
  /** Partner's capital (for the 12% cap) and the owner's share % of remuneration, when known. */
  capital?: number | null;
  /** Owner's beneficial holding % (company) — from the shareholding list when the owner's name appears. */
  holdingPct?: number | null;
  /** Accumulated profits available for s.2(22)(e); unknown → deemed dividend is flagged, not added. */
  accumulatedProfits?: number | null;
}

export interface FromEntityLine { entityId: string; name: string; head: "business" | "salary" | "otherSources" | "exempt" | "flag"; amount: number; basis: string }

const isFirm = (k: EntityKind) => k === "partnership" || k === "llp";
const r0 = (n: number) => Math.round(n);

/** s.40(b)(v) remuneration ceiling on book profit (FY 2024-25 onwards). */
export function remunerationCap(bookProfit: number): number {
  if (bookProfit <= 0) return 300000;
  const first = Math.min(bookProfit, 600000);
  return Math.max(300000, first * 0.9) + Math.max(0, bookProfit - 600000) * 0.6;
}

export function fromEntities(facts: EntityFacts[]): FromEntityLine[] {
  const out: FromEntityLine[] = [];
  for (const f of facts) {
    const { entity: e, paid: p } = f;
    const L = (head: FromEntityLine["head"], amount: number, basis: string) => { if (amount || head === "flag") out.push({ entityId: e.id, name: e.name, head, amount: r0(amount), basis }); };
    if (e.kind === "proprietorship") { L("business", f.profit, "Proprietorship profit is your own business income"); continue; }
    if (isFirm(e.kind)) {
      const intCap = f.capital != null ? f.capital * 0.12 : null;
      const interest = intCap == null ? p.capitalInterest : Math.min(p.capitalInterest, intCap);
      if (intCap == null && p.capitalInterest) L("flag", 0, "Capital not recorded — 12% interest cap (s.40(b)(iv)) not checked");
      const rem = Math.min(p.remuneration, remunerationCap(f.profit));
      L("business", interest, "Interest on capital (s.28(v))");
      L("business", rem, "Partner remuneration within s.40(b) limit (s.28(v))");
      L("exempt", Math.max(0, f.profit), "Share of firm profit is exempt (s.10(2A)) — shown for disclosure");
      continue;
    }
    if (e.kind === "company") {
      L("salary", p.salary, "Salary from the company");
      L("otherSources", p.dividend, "Dividend (taxable in your hands)");
      L("otherSources", p.interest, "Interest paid to you by the company");
      if (p.rent) L("flag", 0, `Rent of ₹${r0(p.rent).toLocaleString("en-IN")} from the company goes under house property`);
      if (p.loans > 0) {
        if (f.holdingPct == null) L("flag", 0, "Loan from company: your shareholding % is not recorded — deemed dividend (s.2(22)(e)) not checked");
        else if (f.holdingPct >= 10) {
          if (f.accumulatedProfits == null) L("flag", 0, "Loan from company may be deemed dividend (s.2(22)(e)); accumulated profits not recorded");
          else L("otherSources", Math.min(p.loans, Math.max(0, f.accumulatedProfits)), "Deemed dividend s.2(22)(e) — loan to ≥10% shareholder, up to accumulated profits");
        }
      }
      continue;
    }
    // HUF / trust / individual profiles are separate taxpayers; nothing flows in.
  }
  return out;
}

/** Add the lines to a personal computation, keeping every other head as computed. */
export function withEntityIncome(c: TaxComputation, lines: FromEntityLine[]): TaxComputation {
  const sum = (h: FromEntityLine["head"]) => lines.filter((l) => l.head === h).reduce((s, l) => s + l.amount, 0);
  const b = sum("business"), s = sum("salary"), o = sum("otherSources");
  if (!b && !s && !o) return c;
  const business = { ...c.business, net: c.business.net + b };
  return { ...c, salary: c.salary + s, otherSources: c.otherSources + o, business, gross: c.gross + b + s + o, total: c.total + b + s + o, notes: [...c.notes, "Includes income from your businesses (see From your companies)"] };
}

const has = (t: string, ...w: string[]) => w.some((x) => t.includes(x));
/** Classify personal-side entries that came from a business account into payment kinds. */
export function classifyPayment(text: string, txnType: string): keyof EntityFacts["paid"] | null {
  const t = text.toLowerCase();
  if (has(t, "dividend")) return "dividend";
  if (has(t, "salary", "payroll")) return "salary";
  if (has(t, "remuneration")) return "remuneration";
  if (has(t, "interest on capital", "capital interest")) return "capitalInterest";
  if (has(t, "rent")) return "rent";
  if (has(t, "interest")) return "interest";
  if (txnType === "transfer" || has(t, "loan", "advance")) return "loans";
  return null;
}
