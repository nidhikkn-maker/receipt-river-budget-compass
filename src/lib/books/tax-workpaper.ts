/**
 * Accountant tax workpaper: for one FY, each taxpayer (you + each company) with its calculation, the ledger
 * entries behind it and the assumptions used. Pure, read-only: it only rearranges figures already computed by
 * taxcomp / tax-full / from-entities and never fills a missing value.
 */
import type { TaxComputation } from "./taxcomp";
import type { Liability } from "./tax-full";
import type { FromEntityLine } from "./from-entities";
import type { EntityTaxYear } from "./entity-tax-profile";

export interface WpEntry { id: string; date: string; txnType?: string | null | undefined; title: string; category: string; amount: number; accountId?: string | null | undefined }
export interface WpSource { group: string; entries: { id: string; date: string; title: string; account: string; amount: number }[]; total: number }
export interface WpSection {
  key: string; name: string; kind: string;
  heads: [string, number][];
  tax: [string, number][] | null;
  /** Total tax for the year (before credits); null when no tax figure is shown. */
  taxTotal: number | null;
  fromCompanies: FromEntityLine[];
  sources: WpSource[];
  assumptions: string[];
}

export function computationHeads(c: TaxComputation): [string, number][] {
  return [
    ["Salary", c.salary], ["House property", c.houseProperty.net],
    ["Business receipts", c.business.receipts], ["Business expenses", -c.business.expenses], ["Depreciation", -c.business.depreciation], ["Business / profession (net)", c.business.net],
    ["Short-term capital gains", c.capitalGains.short], ["Long-term capital gains", c.capitalGains.long],
    ["Other sources", c.otherSources], ["Gross total income", c.gross], ["Losses set off", -c.lossesSetOff], ["Total income", c.total],
  ];
}

const GROUP: Record<string, string> = { income: "Income received", expense: "Expenses", refund: "Refunds", adjustment: "Adjustments (incl. opening, depreciation)" };

/** Group the in-scope ledger entries for the year; transfers are excluded (they are never income or spending). */
export function sourceGroups(entries: WpEntry[], accountName: (id: string | null | undefined) => string): WpSource[] {
  const by = new Map<string, WpSource>();
  for (const t of entries) {
    const type = t.txnType ?? "expense";
    if (type === "transfer" || type === "card_payment") continue;
    const g = GROUP[type] ?? type.replace(/_/g, " ");
    const s = by.get(g) ?? { group: g, entries: [], total: 0 };
    s.entries.push({ id: t.id, date: t.date, title: t.title, account: accountName(t.accountId), amount: t.amount });
    s.total += t.amount;
    by.set(g, s);
  }
  for (const s of by.values()) { s.entries.sort((a, b) => a.date.localeCompare(b.date)); s.total = Math.round(s.total * 100) / 100; }
  return [...by.values()].sort((a, b) => a.group.localeCompare(b.group));
}

/** Assumptions stated for the accountant: regime, rule source, profile facts and every unknown. */
export function assumptions(x: { fy: string; regime: string | null; ruleCount: number; profile?: EntityTaxYear | undefined; kind: string; notes: string[]; liability: Liability | null; flags: string[] }): string[] {
  const out = [`Financial year ${x.fy}; figures come only from saved ledger entries, assets and approved rules (${x.ruleCount} approved rule version${x.ruleCount === 1 ? "" : "s"}).`];
  out.push(x.regime ? `Tax regime / option used: ${x.regime}.` : "Tax regime / option not chosen — no tax figure is shown.");
  if (x.kind !== "personal") {
    const p = x.profile;
    if (!p) out.push(`No tax profile entered for FY ${x.fy}: ownership share, partner capital and accumulated profits are unknown.`);
    else {
      out.push(p.ownershipPct != null ? `Your ownership share: ${p.ownershipPct}% (entered).` : "Your ownership share: not entered.");
      if (x.kind === "partnership" || x.kind === "llp") out.push(p.capital != null ? `Partner capital ₹${Math.round(p.capital).toLocaleString("en-IN")} used for the 12% interest cap (s.40(b)(iv)).` : "Partner capital not entered — 12% interest cap not checked.");
      if (x.kind === "company") out.push(p.accumulatedProfits != null ? `Accumulated profits ₹${Math.round(p.accumulatedProfits).toLocaleString("en-IN")} used as the deemed-dividend limit (s.2(22)(e)).` : "Accumulated profits not entered — deemed dividend not quantified.");
      if (p.bookProfit != null) out.push(`Book profit ₹${Math.round(p.bookProfit).toLocaleString("en-IN")} (entered) is used for your personal working; this taxpayer's own working above uses its ledger entries.`);
      if (p.notes) out.push(`Owner note: ${p.notes}`);
    }
  }
  for (const f of x.flags) out.push(f);
  for (const n of [...x.notes, ...(x.liability?.notes ?? [])]) if (!out.includes(n)) out.push(n);
  out.push("Working paper only — nothing is filed.");
  return out;
}

/** Flatten sections to CSV rows (one file per kind) for the ZIP. */
export function workpaperCsv(sections: WpSection[]): { computation: (string | number)[][]; sources: (string | number)[][]; assumptions: (string | number)[][] } {
  const computation: (string | number)[][] = [["Taxpayer", "Part", "Line", "Amount (INR)"]];
  const sources: (string | number)[][] = [["Taxpayer", "Group", "Date", "Description", "Account", "Amount (INR)", "Entry id"]];
  const ass: (string | number)[][] = [["Taxpayer", "Assumption"]];
  for (const s of sections) {
    for (const [k, v] of s.heads) computation.push([s.name, "Income", k, Math.round(v)]);
    for (const l of s.fromCompanies) computation.push([s.name, "From companies", `${l.name} · ${l.basis}`, l.head === "flag" ? "" : l.amount]);
    for (const [k, v] of s.tax ?? []) computation.push([s.name, "Tax", k, Math.round(v)]);
    for (const g of s.sources) for (const e of g.entries) sources.push([s.name, g.group, e.date, e.title, e.account, e.amount, e.id]);
    for (const a of s.assumptions) ass.push([s.name, a]);
  }
  return { computation, sources, assumptions: ass };
}
