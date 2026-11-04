/**
 * Filing obligations, ITC review, tax credits and rule impact [v6.0 §45–51]. Pure rules over saved records.
 * Standard due dates are defaults only: an approved rule `due.<form>` in the regulatory register replaces them
 * from its effective date, so extensions and changes flow from one place. Nothing here files anything.
 */
import type { Expense } from "../expenses";
import { fyOf, fyRange, type EntityProfile } from "../entities";
import { closedPeriodFor } from "./periods";
import { ruleOn } from "./regulatory";
import { invoiceProblems, taxOf } from "./gst";
import type { ClosedPeriod, CreditKind, FyRecord, GstFiling, GstInvoice, RuleVersion, TaxCredit, TaxProfile } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, "0");
const ym = (y: number, m: number) => { const d = new Date(Date.UTC(y, m - 1, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };
const day = (period: string, monthsAfter: number, dayOfMonth: number) => { const [y, m] = period.split("-").map(Number) as [number, number]; return `${ym(y, m + monthsAfter)}-${pad(dayOfMonth)}`; };

export interface Obligation { entityId: string; form: string; period: string; due: string; basis: string; status: "filed" | "overdue" | "due" | "upcoming"; evidence: string | null; gstin?: string }

/** Months of a financial year, April to March. */
export const fyMonths = (fy: string) => { const s = Number(fy.slice(0, 4)); return Array.from({ length: 12 }, (_, i) => ym(s, 4 + i)); };
/** Quarter label for a month inside a FY: the quarter's last month, e.g. 2026-06 for Apr–Jun. */
export const quarterEnd = (month: string) => { const [y, m] = month.split("-").map(Number) as [number, number]; return ym(y, Math.ceil(m / 3) * 3); };

/** A due date: the approved register rule when one applies on that date, else the standard default. */
function dueFor(rules: RuleVersion[], form: string, standard: string): { due: string; basis: string } {
  const r = ruleOn(rules, `due.${form}`, standard);
  if (r && /^\d{4}-\d{2}-\d{2}$/.test(r.value.trim())) return { due: r.value.trim(), basis: `Approved rule: ${r.title}` };
  return { due: standard, basis: "Standard due date — record any extension in the rules register" };
}

/**
 * Every filing obligation for one entity and FY, with status from recorded evidence [§45, §47–48].
 * The filing scheme comes from the tax profile; nothing is assumed when a profile is missing.
 */
export function obligations(p: { entity: EntityProfile; profile: TaxProfile | undefined; fy: string; today: string; gstFilings: GstFiling[]; fyRecords: FyRecord[]; rules: RuleVersion[] }): Obligation[] {
  const { entity, profile, fy, today } = p;
  if (!profile) return [];
  const out: Obligation[] = [];
  const status = (due: string, filed: string | null): Obligation["status"] => filed ? "filed" : due < today ? "overdue" : Date.parse(due) - Date.parse(today) <= 15 * 864e5 ? "due" : "upcoming";
  const fyEnd = fyRange(fy).end; const nextYear = Number(fy.slice(0, 4)) + 1;
  // Income-tax return for the AY following this FY: 31 Jul for non-audit, 31 Oct for audited cases and companies.
  if (fyEnd < today || fy === fyOf(today)) {
    const itrStd = profile.auditRequired || entity.kind === "company" ? `${nextYear}-10-31` : `${nextYear}-07-31`;
    const d = dueFor(p.rules, "ITR", itrStd);
    const rec = p.fyRecords.find((r) => r.entityId === entity.id && r.fy === fy)?.filedReturns.find((f) => /^ITR/i.test(f.form));
    out.push({ entityId: entity.id, form: "ITR", period: `FY ${fy}`, ...d, status: status(d.due, rec?.filedOn ?? null), evidence: rec ? `${rec.form} ack ${rec.ack}` : null });
  }
  const months = fyMonths(fy).filter((m) => m < today.slice(0, 7));
  for (const gstin of entity.gstins) {
    const filed = (form: string, period: string) => p.gstFilings.find((f) => f.gstin === gstin && f.form === form && f.period === period) ?? null;
    const add = (form: string, period: string, std: string) => { const d = dueFor(p.rules, form, std); const f = filed(form, period); out.push({ entityId: entity.id, gstin, form, period, ...d, status: status(d.due, f?.filedOn ?? null), evidence: f ? `ARN ${f.arn}` : null }); };
    if (profile.gstScheme === "regular") for (const m of months) { add("GSTR-1", m, day(m, 1, 11)); add("GSTR-3B", m, day(m, 1, 20)); }
    if (profile.gstScheme === "qrmp") for (const q of [...new Set(months.map(quarterEnd))].filter((q) => q < today.slice(0, 7))) { add("GSTR-1", q, day(q, 1, 13)); add("GSTR-3B", q, day(q, 1, 22)); }
    if (profile.gstScheme === "composition") { for (const q of [...new Set(months.map(quarterEnd))].filter((q) => q < today.slice(0, 7))) add("CMP-08", q, day(q, 1, 18)); if (fyEnd < today) add("GSTR-4", `FY ${fy}`, `${nextYear}-04-30`); }
    if ((profile.gstScheme === "regular" || profile.gstScheme === "qrmp") && fyEnd < today) add("GSTR-9", `FY ${fy}`, `${nextYear}-12-31`);
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

export interface ItcLine { invoice: GstInvoice; tax: number; eligible: boolean; reasons: string[] }
/**
 * Input tax credit review [§47]: a purchase is claimable here only with a valid supplier GSTIN, a clean
 * tax split, no duplicate number and — when the supplier-filed GSTR-2B is supplied — presence in it.
 * Anything else is held with its reason, never dropped silently.
 */
export function itcReview(list: GstInvoice[], gstin: string, period: string, in2b?: Set<string>): { lines: ItcLine[]; eligible: number; held: number } {
  const mine = list.filter((i) => i.gstin === gstin && i.kind === "purchase" && i.date.startsWith(period));
  const seen = new Map<string, number>();
  for (const i of mine) { const k = `${i.partyGstin}|${i.number.trim().toUpperCase()}`; seen.set(k, (seen.get(k) ?? 0) + 1); }
  const lines = mine.map((i) => {
    const reasons: string[] = [];
    if (!i.partyGstin) reasons.push("no supplier GSTIN");
    reasons.push(...invoiceProblems(i));
    const k = `${i.partyGstin}|${i.number.trim().toUpperCase()}`;
    if ((seen.get(k) ?? 0) > 1) reasons.push("invoice number entered more than once");
    if (in2b && !in2b.has(k)) reasons.push("not in supplier-filed GSTR-2B");
    return { invoice: i, tax: taxOf(i), eligible: reasons.length === 0, reasons };
  });
  return { lines, eligible: r2(lines.filter((l) => l.eligible).reduce((s, l) => s + l.tax, 0)), held: r2(lines.filter((l) => !l.eligible).reduce((s, l) => s + l.tax, 0)) };
}

export type { CreditKind, TaxCredit };
export const CREDIT_LABEL: Record<CreditKind, string> = { tds: "Tax deducted (TDS)", tcs: "Tax collected (TCS)", advance: "Advance tax", self_assessment: "Self-assessment tax" };

/** Income-tax challan payments found in the ledger: narration must name the challan or tax type, never a guess. */
export function ledgerTaxPayments(entries: Expense[], fy: string): { id: string; date: string; amount: number; kind: CreditKind; text: string }[] {
  return entries.filter((e) => fyOf(e.date) === fy && (e.txnType ?? "expense") === "expense").flatMap((e) => {
    const t = `${e.title} ${e.merchant ?? ""} ${e.description}`;
    if (!/itns\s*280|challan\s*280|advance\s*tax|self[\s-]*assessment\s*tax|\bincome\s*tax\b.*\b(challan|payment)\b/i.test(t) || /\bgst\b/i.test(t)) return [];
    return [{ id: e.id, date: e.date, amount: e.amount, kind: /self[\s-]*assessment|\(300\)|minor\s*head\s*300/i.test(t) ? "self_assessment" as const : "advance" as const, text: t.trim() }];
  });
}

/** Credits for one entity and FY: recorded TDS/TCS from Form 26AS/16/AIS plus confirmed challans; each counted once. */
export function creditsFor(credits: TaxCredit[], entityId: string, fy: string) {
  const mine = credits.filter((c) => c.entityId === entityId && c.fy === fy);
  const uniq = [...new Map(mine.map((c) => [c.transactionId ?? c.id, c])).values()];
  const by = (k: CreditKind) => r2(uniq.filter((c) => c.kind === k).reduce((s, c) => s + c.amount, 0));
  return { tds: by("tds"), tcs: by("tcs"), advance: by("advance"), selfAssessment: by("self_assessment"), total: r2(uniq.reduce((s, c) => s + c.amount, 0)), lines: uniq };
}

/** Which entities a rule touches, by area [§50]. */
export function affectedEntities(r: Pick<RuleVersion, "area" | "appliesTo" | "key">, entities: EntityProfile[]): EntityProfile[] {
  if (r.appliesTo.length) return entities.filter((e) => r.appliesTo.includes(e.id));
  if (r.area === "gst" || (r.area === "due_date" && /gst|cmp/i.test(r.key))) return entities.filter((e) => e.gstins.length > 0);
  if (r.area === "corporate") return entities.filter((e) => e.kind === "company" || e.kind === "llp");
  return entities;
}

/**
 * Impact of a proposed rule [§50]: affected entities and financial years, and which of those years are
 * closed or already filed — those keep their old treatment and are listed so nothing changes silently.
 */
export function ruleImpact(r: RuleVersion, p: { entities: EntityProfile[]; closedPeriods: ClosedPeriod[]; fyRecords: FyRecord[]; gstFilings: GstFiling[]; today: string }) {
  const ents = affectedEntities(r, p.entities);
  const years: string[] = [];
  for (let fy = fyOf(r.effectiveFrom); fy <= fyOf(p.today); fy = `${Number(fy.slice(0, 4)) + 1}-${pad((Number(fy.slice(0, 4)) + 2) % 100)}`) years.push(fy);
  const protectedYears = years.flatMap((fy) => {
    const why: string[] = [];
    const cp = closedPeriodFor(fyRange(fy).end, p.closedPeriods) ?? closedPeriodFor(r.effectiveFrom >= fyRange(fy).start ? r.effectiveFrom : fyRange(fy).start, p.closedPeriods);
    if (cp) why.push(`closed period ${cp.from} to ${cp.to}`);
    const filed = p.fyRecords.filter((x) => x.fy === fy && ents.some((e) => e.id === x.entityId) && x.filedReturns.length);
    if (filed.length) why.push(`${filed.length} filed return${filed.length > 1 ? "s" : ""}`);
    if (r.area === "gst" && p.gstFilings.some((f) => fyOf(`${f.period.slice(0, 7)}-01`) === fy && ents.some((e) => e.gstins.includes(f.gstin)))) why.push("GST returns already filed");
    return why.length ? [{ fy, why }] : [];
  });
  return { entities: ents.map((e) => ({ id: e.id, name: e.name })), years, protectedYears };
}
