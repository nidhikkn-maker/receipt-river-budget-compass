/**
 * Statement Desk intake for every non-bank document [§2–4, §6–16, §27, §36, §38].
 * Pure: turns what the document reader returned into a routed, traceable proposal. Nothing here saves.
 */
import type { DocType } from "../documents";
import { fyOf, type EntityKind, type EntityProfile } from "../entities";
import type { Asset, AssetKind } from "../assets";
import { leaseUnknowns, type FyRecord, type Lease, type OpeningHead, type Property, type ProposedField, type Schedule } from "./types";

export const STEPS = ["Upload", "Identify", "Extract", "Validate", "Match", "Classify", "Prepare records", "Confirm", "Save", "Reconcile", "Audit"] as const;
export type Step = (typeof STEPS)[number];
export type StepState = "done" | "active" | "failed" | "waiting" | "skipped";
export interface Trail { step: Step; state: StepState; note?: string | undefined }

/** A step trail; everything after a failed step stays waiting so nothing is half-saved [§3]. */
export function trail(reached: Step, failed?: { step: Step; note: string } | null, skipped: Step[] = []): Trail[] {
  const stop = STEPS.indexOf(failed?.step ?? reached);
  return STEPS.map((step, i) => {
    if (skipped.includes(step)) return { step, state: "skipped" };
    if (failed && step === failed.step) return { step, state: "failed", note: failed.note };
    if (i < stop) return { step, state: "done" };
    if (i === stop && !failed) return { step, state: "active" };
    return { step, state: "waiting" };
  });
}

/** Contexts other pages open Statement Desk with [§4]. */
export const CONTEXTS = { documents: "DocuRepo", investments: "Investments", property: "Property", assets: "Assets", tax: "Tax & audit", entity: "New company", fy: "Past-year accounts", gst: "GST" } as const;
export type IntakeContext = keyof typeof CONTEXTS;
export function parseContext(v: unknown): IntakeContext | undefined {
  return typeof v === "string" && v in CONTEXTS ? (v as IntakeContext) : undefined;
}

/** Where each document type is reviewed; every one is still stored in DocuRepo [§5]. */
export type Route = "statement" | "investment" | "entity" | "fy" | "asset" | "property" | "lease" | "gst" | "loan" | "tax" | "document";
export const ROUTE_OF: Record<DocType, Route> = {
  bank_statement: "statement", card_statement: "statement", loan_statement: "loan",
  demat_statement: "investment", transaction_statement: "investment", capital_gains_statement: "investment", mutual_fund_statement: "investment",
  incorporation: "entity", pan_gst_registration: "entity",
  audited_financials: "fy", trial_balance: "fy", tax_return: "fy", depreciation_schedule: "fy",
  asset_invoice: "asset", warranty: "asset", property_deed: "property", lease_agreement: "lease",
  gst_return: "gst", invoice: "gst", tax_statement: "tax",
  bill: "document", receipt: "document", insurance: "document", loan_agreement: "loan", payment_confirmation: "document", contract: "document", utility_bill: "property", maintenance: "asset", other: "document",
};

/** What the reader proposes for each kind (all optional; null when not printed). */
export interface EntityRead { legalName: string | null; kind: EntityKind | null; pan: string | null; gstins: string[]; cin: string | null; incorporatedOn: string | null; address: string | null; people: { name: string; role: string }[]; shareholding: { name: string; pct: number }[]; activities: string[]; fyEnd: string | null; related?: { name: string; relation: string; pan: string | null; cin: string | null }[] | undefined }
export interface AssetRead { name: string | null; kind: AssetKind | null; owner: string | null; cost: number | null; purchaseDate: string | null; supplier: string | null; warrantyUntil: string | null; insurance: string | null; serial: string | null }
export interface PropertyRead { name: string | null; owner: string | null; address: string | null; cost: number | null; acquiredOn: string | null; surveyNo: string | null; valuation: number | null; valuationDate: string | null; insurer?: string | null | undefined; utilityConsumerNo?: string | null | undefined; propertyTaxId?: string | null | undefined }
export interface LeaseRead { tenant: string | null; property: string | null; unit: string | null; start: string | null; end: string | null; rent: number | null; dueDay: number | null; escalationPct: number | null; escalationEveryMonths: number | null; deposit: number | null; noticeDays: number | null; paymentTerms: string | null; gst: boolean | null }
export interface AuditedRead { entity: string | null; pan: string | null; fy: string | null; lines: { head: OpeningHead; amount: number }[]; totalAssets: number | null; totalLiabilities: number | null; schedules: Schedule[]; details?: { schedule: Schedule; lines: { label: string; amount: number; page: number | null; quote: string }[] }[] | undefined; losses?: { fromFy: string; kind: "business" | "capital" | "depreciation" | "house"; amount: number }[] | undefined; qualifications: string[]; filedForm: string | null; ackNo: string | null; filedOn: string | null }
export interface GstInvoiceRead { number: string | null; date: string | null; seller: string | null; sellerGstin: string | null; buyer: string | null; buyerGstin: string | null; taxable: number | null; igst: number | null; cgst: number | null; sgst: number | null; cess: number | null }
export interface TaxStatementRead { form: "form16" | "26as" | "ais" | "payslip" | null; fy: string | null; pan: string | null; taxableSalary: number | null; credits: { kind: "tds" | "tcs" | "advance" | "self_assessment"; amount: number; deductor: string | null }[] }
export interface ReadProfiles { entity: EntityRead | null; asset: AssetRead | null; property: PropertyRead | null; lease: LeaseRead | null; audited: AuditedRead | null; gstInvoice?: GstInvoiceRead | null | undefined; taxStatement?: TaxStatementRead | null | undefined }

const iso = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const words = (s: string) => s.toLowerCase().replace(/\b(private|pvt|limited|ltd|llp|the|and|&|co|company)\b/g, " ").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).join(" ");

/** Automatic match only on verified identifiers (PAN, CIN, GSTIN). Several identifier hits are ambiguous and return null [§16]. */
export function matchEntity(list: EntityProfile[], read: { pan?: string | null; cin?: string | null; gstins?: string[]; name?: string | null }): { entity: EntityProfile; by: "PAN" | "CIN" | "GSTIN" } | null {
  const pan = read.pan ? norm(read.pan) : "";
  const cin = read.cin ? norm(read.cin) : "";
  const gst = (read.gstins ?? []).map(norm).filter(Boolean);
  const hits = new Map<string, { entity: EntityProfile; by: "PAN" | "CIN" | "GSTIN" }>();
  for (const e of list) {
    if (pan && e.pan && norm(e.pan) === pan) hits.set(e.id, { entity: e, by: "PAN" });
    else if (cin && e.regNo && norm(e.regNo) === cin) hits.set(e.id, { entity: e, by: "CIN" });
    else if (gst.some((g) => e.gstins.map(norm).includes(g))) hits.set(e.id, { entity: e, by: "GSTIN" });
  }
  return hits.size === 1 ? [...hits.values()][0]! : null;
}
/** A same-name company is only a suggestion the owner must confirm — never an automatic match [§6, §16]. */
export function nameSuggestion(list: EntityProfile[], name: string | null | undefined): EntityProfile | null {
  const n = name ? words(name) : "";
  const found = n ? list.filter((e) => words(e.name) === n) : [];
  return found.length === 1 ? found[0]! : null;
}

/** Draft profile to review, merged into a matched profile so re-uploads never duplicate [§14, §16, test 2]. */
export function proposeEntity(read: EntityRead, existing: EntityProfile[], newId: string, today: string): { profile: EntityProfile; matchedBy: string | null; missing: string[] } {
  const m = matchEntity(existing, { pan: read.pan, cin: read.cin, gstins: read.gstins, name: read.legalName });
  const base: EntityProfile = m?.entity ?? { id: newId, name: "", kind: "company", pan: "", gstins: [], booksFrom: fyOf(today) };
  const gstins = [...new Set([...base.gstins, ...read.gstins.map(norm).filter((g) => g.length === 15)])];
  const profile: EntityProfile = {
    ...base,
    name: base.name || read.legalName?.trim() || "",
    kind: m ? base.kind : read.kind ?? base.kind,
    pan: base.pan || (read.pan ? norm(read.pan) : ""),
    gstins,
    ...(read.cin || base.regNo ? { regNo: base.regNo || norm(read.cin ?? "") } : {}),
    booksFrom: m ? base.booksFrom : read.incorporatedOn && iso(read.incorporatedOn) ? fyOf(read.incorporatedOn) : base.booksFrom,
    ...extraOf(base, read),
  };
  const missing = [!profile.name && "legal name", !profile.pan && "PAN", (profile.kind === "company" || profile.kind === "llp") && !profile.regNo && "CIN/LLPIN"].filter((x): x is string => !!x);
  return { profile, matchedBy: m?.by ?? null, missing };
}
function extraOf(base: EntityProfile, r: EntityRead): Partial<EntityProfile> {
  const b = base as EntityProfile & Record<string, unknown>;
  return {
    address: (b["address"] as string) || r.address || undefined,
    incorporatedOn: (b["incorporatedOn"] as string) || iso(r.incorporatedOn) || undefined,
    people: (b["people"] as EntityRead["people"])?.length ? b["people"] : r.people,
    shareholding: (b["shareholding"] as EntityRead["shareholding"])?.length ? b["shareholding"] : r.shareholding,
    activities: (b["activities"] as string[])?.length ? b["activities"] : r.activities,
    fyEnd: (b["fyEnd"] as string) || (r.fyEnd && /^\d{2}-\d{2}$/.test(r.fyEnd) ? r.fyEnd : undefined),
    related: (b["related"] as EntityRead["related"])?.length ? b["related"] : r.related?.filter((x) => x.name.trim()),
  } as Partial<EntityProfile>;
}

/** Asset master record proposal from a purchase invoice [§27, test 5]. Capitalisation still needs confirmation. */
export function proposeAsset(read: AssetRead, entities: EntityProfile[], newId: string, docId: string | null): { asset: Asset | null; missing: string[]; ownerSuggested: boolean; suggestedLife?: number } {
  const missing = [!read.name && "asset name", read.cost == null && "purchase cost", !iso(read.purchaseDate) && "purchase date", "date put to use (confirm)", "useful life", "residual value"].filter((x): x is string => !!x);
  if (!read.name || read.cost == null || !iso(read.purchaseDate)) return { asset: null, missing, ownerSuggested: false };
  const kind: AssetKind = read.kind ?? "other";
  const owner = read.owner ? nameSuggestion(entities, read.owner)?.id : undefined;
  return { missing, ownerSuggested: !!owner, asset: { id: newId, name: read.name.trim(), kind, cost: read.cost, inUse: read.purchaseDate!, sharePct: 100, bookMethod: "slm", bookRatePct: 0, ownerEntityId: owner, docId: docId ?? undefined, tag: read.serial ?? undefined, ...(read.supplier ? { supplier: read.supplier } : {}), ...(read.warrantyUntil ? { warrantyUntil: read.warrantyUntil } : {}), ...(read.insurance ? { insurance: read.insurance } : {}) } as Asset, suggestedLife: DEFAULT_LIFE[kind] };
}
/** Indicative useful lives (Companies Act Schedule II); editable per asset. */
export const DEFAULT_LIFE: Record<AssetKind, number> = { property: 0, building: 30, vehicle: 8, machinery: 15, computer: 3, furniture: 10, other: 5 };

export function proposeProperty(read: PropertyRead, entities: EntityProfile[], newId: string, docId: string | null): { property: Property; missing: string[]; ownerSuggested: boolean } {
  const owner = read.owner ? nameSuggestion(entities, read.owner)?.id : undefined;
  const missing = [!read.name && !read.address && "property name or address", read.cost == null && "acquisition cost", !owner && "legal owner"].filter((x): x is string => !!x);
  const ids = [read.utilityConsumerNo && `Consumer ${read.utilityConsumerNo}`, read.propertyTaxId && `Tax ID ${read.propertyTaxId}`, read.insurer && `Insured with ${read.insurer}`].filter(Boolean).join(" · ");
  return { missing, ownerSuggested: !!owner, property: { id: newId, ...(ids ? { notes: ids } : {}), name: read.name?.trim() || read.address?.split(",")[0]?.trim() || "New property", ownerEntityId: owner, address: read.address ?? "", buildings: [], docIds: docId ? [docId] : [], ...(read.valuation != null && iso(read.valuationDate) ? { valuation: { value: read.valuation, date: read.valuationDate!, source: "Valuation report" } } : {}) } };
}

/** Lease proposal linked to a property/unit by name; missing pieces are asked, never guessed [§38, test 8]. */
export function proposeLease(read: LeaseRead, properties: Property[], newId: string, docId: string | null): { lease: Lease | null; propertyId: string | null; missing: string[]; unknown: string[] } {
  const want = (read.property ?? "").toLowerCase();
  const prop = properties.find((p) => want && (want.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(want) || (p.address && want.includes(p.address.toLowerCase().split(",")[0]!))));
  const unit = prop?.buildings.flatMap((b) => b.floors.flatMap((f) => f.units)).find((u) => read.unit && u.name.toLowerCase() === read.unit.toLowerCase());
  const missing = [!read.tenant && "tenant", read.rent == null && "monthly rent", !iso(read.start) && "lease start", !iso(read.end) && "lease end", !prop && "which property"].filter((x): x is string => !!x);
  if (!read.tenant || read.rent == null || !iso(read.start) || !iso(read.end)) return { lease: null, propertyId: prop?.id ?? null, missing, unknown: [] };
  const lease: Lease = {
    id: newId, propertyId: prop?.id ?? "", unitId: unit?.id, tenant: read.tenant.trim(), start: read.start!, end: read.end!, rent: read.rent,
    dueDay: read.dueDay != null && read.dueDay >= 1 && read.dueDay <= 31 ? Math.round(read.dueDay) : undefined,
    escalationPct: read.escalationPct ?? undefined, escalationEveryMonths: read.escalationEveryMonths ?? undefined,
    deposit: read.deposit ?? undefined, noticeDays: read.noticeDays ?? undefined, paymentTerms: read.paymentTerms ?? "",
    gst: read.gst ?? undefined, docId: docId ?? undefined,
  };
  return { propertyId: prop?.id ?? null, missing, lease, unknown: leaseUnknowns(lease) };
}

/** Prior-year record from audited statements; flags missing schedules instead of filling them [§18, §20, test 3–4]. */
export function proposeFy(read: AuditedRead, entities: EntityProfile[], existing: FyRecord[], newId: string, docId: string | null): { record: FyRecord | null; entityId: string | null; missingSchedules: Schedule[]; missing: string[]; ownerSuggested: boolean } {
  const byId = matchEntity(entities, { pan: read.pan });
  const ent = byId?.entity ?? nameSuggestion(entities, read.entity) ?? undefined;
  const ownerSuggested = !byId && !!ent;
  const fy = read.fy && /^\d{4}-\d{2}$/.test(read.fy) ? read.fy : null;
  const missing = [!ent && "which company", !fy && "financial year"].filter((x): x is string => !!x);
  const present = new Set([...read.schedules, ...(read.details ?? []).filter((d) => d.lines.length).map((d) => d.schedule)]);
  const missingSchedules = REQUIRED_SCHEDULES.filter((s) => !present.has(s));
  if (!ent || !fy) return { record: null, entityId: ent?.id ?? null, missingSchedules, missing, ownerSuggested };
  const prev = existing.find((r) => r.entityId === ent.id && r.fy === fy);
  const audited = { ...(prev?.audited ?? {}) };
  for (const l of read.lines) audited[l.head] = l.amount;
  return {
    entityId: ent.id, missingSchedules, missing, ownerSuggested,
    record: {
      id: prev?.id ?? newId, entityId: ent.id, fy, audited,
      totalAssets: read.totalAssets ?? prev?.totalAssets ?? null, totalLiabilities: read.totalLiabilities ?? prev?.totalLiabilities ?? null,
      schedules: [...new Set([...(prev?.schedules ?? []), ...present])],
      qualifications: [...new Set([...(prev?.qualifications ?? []), ...read.qualifications])],
      filedReturns: [...(prev?.filedReturns ?? []), ...(read.filedForm && read.ackNo && iso(read.filedOn) && !(prev?.filedReturns ?? []).some((f) => f.ack === read.ackNo) ? [{ form: read.filedForm, ack: read.ackNo, filedOn: read.filedOn! }] : [])],
      lossesCarriedForward: read.losses?.length ? read.losses.filter((l) => l.amount > 0 && /^\d{4}-\d{2}$/.test(l.fromFy)) : prev?.lossesCarriedForward ?? [],
      docIds: [...new Set([...(prev?.docIds ?? []), ...(docId ? [docId] : [])])],
      ...(prev?.confirmedOpening ? { confirmedOpening: prev.confirmedOpening, confirmedOn: prev.confirmedOn } : {}),
      ...(prev && JSON.stringify(prev.audited) !== JSON.stringify(audited) ? { versions: [...(prev.versions ?? []), { at: new Date().toISOString(), reason: "replaced by a later upload", audited: prev.audited }] } : prev?.versions ? { versions: prev.versions } : {}),
      ...(read.details?.length || prev?.details ? { details: mergeDetails(prev?.details ?? [], (read.details ?? []).filter((d) => d.lines.length).map((d) => ({ schedule: d.schedule, lines: d.lines, ...(docId ? { docId } : {}) }))) } : {}),
      ...(prev?.accountMap ? { accountMap: prev.accountMap } : {}),
    },
  };
}
function mergeDetails(a: NonNullable<FyRecord["details"]>, b: NonNullable<FyRecord["details"]>) {
  const out = [...a];
  for (const d of b) { const i = out.findIndex((x) => x.schedule === d.schedule); if (i >= 0) out[i] = d; else out.push(d); }
  return out;
}
export const REQUIRED_SCHEDULES: Schedule[] = ["balanceSheet", "profitLoss", "notes", "auditorReport", "fixedAssetRegister"];

/** Descriptive name "Entity / FY / Type / Identifier"; the original filename is always kept separately [§9]. */
export function autoName(p: { entity?: string | null | undefined; date?: string | null | undefined; typeLabel: string; identifier?: string | null | undefined }): string {
  return [p.entity?.trim() || "Personal", p.date ? `FY ${fyOf(p.date)}` : null, p.typeLabel, p.identifier?.trim() || null].filter(Boolean).join(" / ");
}

/** Labels Ledgerline already stores somewhere; anything else becomes a proposed field, never a new column [§15]. */
const CANONICAL = /^(pan|gstin|cin|llpin|tan|name|legal name|date|amount|total|tax|cgst|sgst|igst|cess|address|registered address|director|partner|trustee|tenant|rent|monthly rent|deposit|security deposit|lease start|lease end|notice period|escalation|cost|purchase cost|supplier|vendor|warranty|policy number|account number|ifsc|isin|quantity|survey number|owner|owner share|interest rate|emi|due date|period|financial year|assessment year|invoice number|place of supply|hsn|sac|depreciation rate|useful life)\b/i;
/** Common printed spellings mapped to an existing canonical field before anything is proposed [§15]. */
export const SYNONYMS: Record<string, string> = {
  "permanent account number": "pan", "pan no": "pan", "gst number": "gstin", "gstn": "gstin", "gst registration number": "gstin",
  "corporate identity number": "cin", "company identification number": "cin", "llp identification number": "llpin",
  "date of incorporation": "date", "invoice no": "invoice number", "bill no": "invoice number", "bill number": "invoice number", "invoice date": "date",
  "taxable value": "amount", "grand total": "total", "net amount": "total", "amount payable": "total", "lessee": "tenant", "licensee": "tenant",
  "lessor": "owner", "licensor": "owner", "monthly license fee": "monthly rent", "licence fee": "rent", "refundable deposit": "security deposit",
  "lock-in period": "notice period", "commencement date": "lease start", "expiry date": "lease end", "vendor name": "supplier", "seller": "supplier",
  "serial no": "invoice number", "registered office": "registered address", "a/c no": "account number", "ifsc code": "ifsc",
};
export function canonicalField(label: string, approved: Record<string, string> = {}): string | null {
  const k = label.trim().toLowerCase().replace(/[.:]+$/, "").replace(/\s+/g, " ");
  if (approved[k]) return approved[k]!;
  if (SYNONYMS[k]) return SYNONYMS[k]!;
  const m = CANONICAL.exec(k);
  return m ? m[1]!.toLowerCase() : null;
}
export function unmappedFields(labels: string[], docType: DocType, known: ProposedField[], approved: Record<string, string> = {}): ProposedField[] {
  const out = [...known];
  for (const l of labels) {
    const label = l.trim().slice(0, 60);
    if (!label || canonicalField(label, approved)) continue;
    const at = out.findIndex((f) => f.label.toLowerCase() === label.toLowerCase() && f.docType === docType);
    if (at >= 0) out[at] = { ...out[at]!, seen: out[at]!.seen + 1 };
    else out.push({ label, docType, seen: 1, status: "proposed" });
  }
  return out.slice(-300);
}

/**
 * Before asking the owner, fill unknown lease terms from trusted sources, in order [§59]:
 * 1) an existing lease for the same tenant and property, 2) fields printed on related documents
 * (same property), mapped through canonical field names. Each filled value records where it came from.
 */
export function fillLeaseFromTrusted(
  lease: Lease,
  existing: Lease[],
  related: { title: string; fields: { label: string; value: string }[] }[],
  approved: Record<string, string> = {},
): { lease: Lease; sources: Record<string, string> } {
  const out: Lease = { ...lease };
  const sources: Record<string, string> = {};
  const prior = existing.find((l) => l.id !== lease.id && l.propertyId === lease.propertyId && l.tenant.trim().toLowerCase() === lease.tenant.trim().toLowerCase());
  const numKeys = ["dueDay", "escalationPct", "escalationEveryMonths", "deposit", "noticeDays"] as const;
  for (const k of numKeys) if (out[k] === undefined && prior?.[k] !== undefined) { out[k] = prior[k]; sources[k] = "earlier lease for this tenant"; }
  if (out.gst === undefined && prior?.gst !== undefined) { out.gst = prior.gst; sources["gst"] = "earlier lease for this tenant"; }
  const want: Record<string, (typeof numKeys)[number]> = { "security deposit": "deposit", deposit: "deposit", "notice period": "noticeDays", escalation: "escalationPct" };
  for (const d of related) for (const f of d.fields) {
    const c = canonicalField(f.label, approved);
    const k = c ? want[c] : undefined;
    if (!k || out[k] !== undefined) continue;
    const n = Number(f.value.replace(/[^\d.]/g, ""));
    if (Number.isFinite(n) && n > 0) { out[k] = n; sources[k] = d.title; }
  }
  return { lease: out, sources };
}

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
/**
 * GST invoice draft from an uploaded tax invoice [§58]: sales when the seller GSTIN is one of the owner's,
 * purchase when the buyer GSTIN is. Unknown direction or missing tax facts stay as "missing" for review.
 */
export function proposeGstInvoice(read: GstInvoiceRead, ownGstins: string[], newId: string, docId: string | null): { invoice: import("./types").GstInvoice | null; missing: string[] } {
  const own = new Set(ownGstins.map((g) => norm(g)));
  const seller = read.sellerGstin ? norm(read.sellerGstin) : "", buyer = read.buyerGstin ? norm(read.buyerGstin) : "";
  const kind = own.has(seller) ? "sales" : own.has(buyer) ? "purchase" : null;
  const missing = [!read.number && "invoice number", !iso(read.date) && "invoice date", read.taxable == null && "taxable value", !kind && "which of your GSTINs this invoice belongs to"].filter((x): x is string => !!x);
  if (missing.length || !kind) return { invoice: null, missing };
  const party = kind === "sales" ? { n: read.buyer, g: buyer } : { n: read.seller, g: seller };
  if (party.g && !GSTIN.test(party.g)) missing.push("party GSTIN looks invalid");
  return { missing, invoice: { id: newId, gstin: kind === "sales" ? seller : buyer, kind, number: read.number!.trim(), date: read.date!, party: party.n?.trim() ?? "", partyGstin: party.g, taxable: read.taxable!, igst: read.igst ?? 0, cgst: read.cgst ?? 0, sgst: read.sgst ?? 0, cess: read.cess ?? 0, docId: docId ?? undefined } };
}

/** Tax credits and taxable salary from Form 16 / 26AS / AIS / payslip, for confirmation [§46]. Entity is matched by PAN only. */
export function proposeTaxStatement(read: TaxStatementRead, entities: EntityProfile[]): { fy: string | null; entityId: string | null; salary: number | null; credits: TaxStatementRead["credits"]; missing: string[] } {
  const ent = read.pan ? entities.find((e) => e.pan && norm(e.pan) === norm(read.pan!)) : undefined;
  const fy = read.fy && /^\d{4}-\d{2}$/.test(read.fy) ? read.fy : null;
  const missing = [!fy && "financial year", !read.pan && "PAN"].filter((x): x is string => !!x);
  return { fy, entityId: ent?.id ?? (read.pan ? null : null), salary: read.taxableSalary, credits: read.credits.filter((c) => c.amount > 0), missing };
}

/**
 * Suggest which owned account / loan a document belongs to [§6]: an account only when its last four digits
 * appear after a masked or account-number marker and exactly one account matches; a loan only when its
 * name or a saved reference is printed. Suggestions are shown preselected and can be changed in review.
 */
export function suggestLinks(text: string, accounts: { id: string; lastFour?: string | null | undefined; archived?: boolean }[], loans: { id: string; name: string; refs?: string[] | undefined }[]): { accountId: string | null; loanId: string | null } {
  const t = text.toUpperCase();
  const accHits = accounts.filter((a) => !a.archived && a.lastFour && /^\d{4}$/.test(a.lastFour) && new RegExp(`(?:X{2,}|\\*{2,}|A/C(?:\\s*NO\\.?)?\\s*[:\\-]?\\s*\\d*|ACCOUNT\\s*(?:NO\\.?|NUMBER)?\\s*[:\\-]?\\s*\\d*|CARD\\s*(?:NO\\.?)?\\s*[:\\-]?\\s*[X*\\d\\s]*)${a.lastFour}\\b`).test(t));
  const loanHits = loans.filter((l) => (l.name.trim().length >= 4 && t.includes(l.name.trim().toUpperCase())) || (l.refs ?? []).some((r) => r.trim().length >= 4 && t.includes(r.trim().toUpperCase())));
  return { accountId: accHits.length === 1 ? accHits[0]!.id : null, loanId: loanHits.length === 1 ? loanHits[0]!.id : null };
}
