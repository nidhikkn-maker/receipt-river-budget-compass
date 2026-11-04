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
export const CONTEXTS = { investments: "Investments", property: "Property", assets: "Assets", tax: "Tax & audit", entity: "New company", fy: "Past-year accounts", gst: "GST" } as const;
export type IntakeContext = keyof typeof CONTEXTS;
export function parseContext(v: unknown): IntakeContext | undefined {
  return typeof v === "string" && v in CONTEXTS ? (v as IntakeContext) : undefined;
}

/** Where each document type is reviewed; every one is still stored in DocuRepo [§5]. */
export type Route = "statement" | "investment" | "entity" | "fy" | "asset" | "property" | "lease" | "gst" | "loan" | "document";
export const ROUTE_OF: Record<DocType, Route> = {
  bank_statement: "statement", card_statement: "statement", loan_statement: "loan",
  demat_statement: "investment", transaction_statement: "investment", capital_gains_statement: "investment", mutual_fund_statement: "investment",
  incorporation: "entity", pan_gst_registration: "entity",
  audited_financials: "fy", trial_balance: "fy", tax_return: "fy", depreciation_schedule: "fy",
  asset_invoice: "asset", warranty: "asset", property_deed: "property", lease_agreement: "lease",
  gst_return: "gst", invoice: "gst",
  bill: "document", receipt: "document", insurance: "document", loan_agreement: "loan", payment_confirmation: "document", contract: "document", utility_bill: "property", maintenance: "asset", other: "document",
};

/** What the reader proposes for each kind (all optional; null when not printed). */
export interface EntityRead { legalName: string | null; kind: EntityKind | null; pan: string | null; gstins: string[]; cin: string | null; incorporatedOn: string | null; address: string | null; people: { name: string; role: string }[]; shareholding: { name: string; pct: number }[]; activities: string[]; fyEnd: string | null }
export interface AssetRead { name: string | null; kind: AssetKind | null; owner: string | null; cost: number | null; purchaseDate: string | null; supplier: string | null; warrantyUntil: string | null; insurance: string | null; serial: string | null }
export interface PropertyRead { name: string | null; owner: string | null; address: string | null; cost: number | null; acquiredOn: string | null; surveyNo: string | null; valuation: number | null; valuationDate: string | null }
export interface LeaseRead { tenant: string | null; property: string | null; unit: string | null; start: string | null; end: string | null; rent: number | null; dueDay: number | null; escalationPct: number | null; escalationEveryMonths: number | null; deposit: number | null; noticeDays: number | null; paymentTerms: string | null; gst: boolean | null }
export interface AuditedRead { entity: string | null; pan: string | null; fy: string | null; lines: { head: OpeningHead; amount: number }[]; totalAssets: number | null; totalLiabilities: number | null; schedules: Schedule[]; qualifications: string[]; filedForm: string | null; ackNo: string | null; filedOn: string | null }
export interface ReadProfiles { entity: EntityRead | null; asset: AssetRead | null; property: PropertyRead | null; lease: LeaseRead | null; audited: AuditedRead | null }

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
  } as Partial<EntityProfile>;
}

/** Asset master record proposal from a purchase invoice [§27, test 5]. Capitalisation still needs confirmation. */
export function proposeAsset(read: AssetRead, entities: EntityProfile[], newId: string, docId: string | null): { asset: Asset | null; missing: string[] } {
  const missing = [!read.name && "asset name", read.cost == null && "purchase cost", !iso(read.purchaseDate) && "purchase date"].filter((x): x is string => !!x);
  if (!read.name || read.cost == null || !iso(read.purchaseDate)) return { asset: null, missing };
  const kind: AssetKind = read.kind ?? "other";
  const owner = read.owner ? matchEntity(entities, { name: read.owner })?.entity.id : undefined;
  return { missing, asset: { id: newId, name: read.name.trim(), kind, cost: read.cost, inUse: read.purchaseDate!, sharePct: 100, bookMethod: "slm", bookRatePct: 0, ownerEntityId: owner, docId: docId ?? undefined, tag: read.serial ?? undefined, usefulLifeYears: DEFAULT_LIFE[kind], residualPct: kind === "property" ? 0 : 5 } as Asset };
}
/** Indicative useful lives (Companies Act Schedule II); editable per asset. */
export const DEFAULT_LIFE: Record<AssetKind, number> = { property: 0, building: 30, vehicle: 8, machinery: 15, computer: 3, furniture: 10, other: 5 };

export function proposeProperty(read: PropertyRead, entities: EntityProfile[], newId: string, docId: string | null): { property: Property; missing: string[] } {
  const owner = read.owner ? matchEntity(entities, { name: read.owner })?.entity.id : undefined;
  const missing = [!read.name && !read.address && "property name or address", read.cost == null && "acquisition cost", !owner && "legal owner"].filter((x): x is string => !!x);
  return { missing, property: { id: newId, name: read.name?.trim() || read.address?.split(",")[0]?.trim() || "New property", ownerEntityId: owner, address: read.address ?? "", buildings: [], docIds: docId ? [docId] : [], ...(read.valuation != null && iso(read.valuationDate) ? { valuation: { value: read.valuation, date: read.valuationDate!, source: "Valuation report" } } : {}) } };
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
export function proposeFy(read: AuditedRead, entities: EntityProfile[], existing: FyRecord[], newId: string, docId: string | null): { record: FyRecord | null; entityId: string | null; missingSchedules: Schedule[]; missing: string[] } {
  const ent = matchEntity(entities, { pan: read.pan, name: read.entity })?.entity;
  const fy = read.fy && /^\d{4}-\d{2}$/.test(read.fy) ? read.fy : null;
  const missing = [!ent && "which company", !fy && "financial year"].filter((x): x is string => !!x);
  const missingSchedules = REQUIRED_SCHEDULES.filter((s) => !read.schedules.includes(s));
  if (!ent || !fy) return { record: null, entityId: ent?.id ?? null, missingSchedules, missing };
  const prev = existing.find((r) => r.entityId === ent.id && r.fy === fy);
  const audited = { ...(prev?.audited ?? {}) };
  for (const l of read.lines) audited[l.head] = l.amount;
  return {
    entityId: ent.id, missingSchedules, missing,
    record: {
      id: prev?.id ?? newId, entityId: ent.id, fy, audited,
      totalAssets: read.totalAssets ?? prev?.totalAssets ?? null, totalLiabilities: read.totalLiabilities ?? prev?.totalLiabilities ?? null,
      schedules: [...new Set([...(prev?.schedules ?? []), ...read.schedules])],
      qualifications: [...new Set([...(prev?.qualifications ?? []), ...read.qualifications])],
      filedReturns: [...(prev?.filedReturns ?? []), ...(read.filedForm && read.ackNo && iso(read.filedOn) && !(prev?.filedReturns ?? []).some((f) => f.ack === read.ackNo) ? [{ form: read.filedForm, ack: read.ackNo, filedOn: read.filedOn! }] : [])],
      lossesCarriedForward: prev?.lossesCarriedForward ?? [],
      docIds: [...new Set([...(prev?.docIds ?? []), ...(docId ? [docId] : [])])],
      ...(prev?.confirmedOpening ? { confirmedOpening: prev.confirmedOpening, confirmedOn: prev.confirmedOn } : {}),
    },
  };
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
