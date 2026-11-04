/**
 * Ledgerline v6 "books" records kept in owner-scoped preferences (finance_preferences.data.books).
 * Everything here is a register or proposal around the one shared ledger — never a second ledger.
 */
import type { DocType } from "../documents";

export type Iso = string; // YYYY-MM-DD

/** A locked accounting period [§34, §57]; entries dated inside cannot be saved, changed or deleted. */
export interface ClosedPeriod { id: string; from: Iso; to: Iso; entityId?: string | undefined; closedOn: Iso; note: string }
export interface PeriodEvent { at: string; action: "closed" | "reopened"; periodId: string; reason: string }

/** One document linked to many records without copying the file [§8]. */
export type LinkKind = "entity" | "asset" | "property" | "lease" | "loan" | "transaction" | "supplier" | "investment" | "insurance" | "fy";
export interface DocLink { docId: string; kind: LinkKind; targetId: string; label: string }

/** A field seen on a document that Ledgerline has no canonical place for [§15]; kept as data, proposed for approval. */
export interface ProposedField { label: string; docType: DocType; seen: number; status: "proposed" | "approved" | "rejected" }

/** Audited prior-year figures for one entity and financial year [§17–20]. */
export const OPENING_HEADS = ["bank", "cash", "investments", "fixedAssets", "accumulatedDepreciation", "capitalReserves", "loans", "receivables", "payables", "taxBalances", "other"] as const;
export type OpeningHead = (typeof OPENING_HEADS)[number];
export const SCHEDULES = ["balanceSheet", "profitLoss", "trialBalance", "cashFlow", "notes", "auditorReport", "fixedAssetRegister", "depreciation", "loanSchedule", "receivables", "payables", "investments", "taxComputation", "gstReconciliation"] as const;
export type Schedule = (typeof SCHEDULES)[number];
export interface FyRecord {
  id: string; entityId: string; fy: string;
  /** Audited closing values as printed (source of truth for comparison). */
  audited: Partial<Record<OpeningHead, number>>;
  /** Totals printed on the balance sheet, used to check the schedule adds up. */
  totalAssets?: number | null | undefined; totalLiabilities?: number | null | undefined;
  schedules: Schedule[];
  qualifications: string[];
  filedReturns: { form: string; ack: string; filedOn: Iso }[];
  lossesCarriedForward: { fromFy: string; kind: "business" | "capital" | "depreciation" | "house"; amount: number }[];
  docIds: string[];
  /** Opening balances the owner confirmed for the next year; never forced to agree. */
  confirmedOpening?: Partial<Record<OpeningHead, number>> | undefined;
  confirmedOn?: Iso | undefined;
}

/** Property directory: Owner → Property → Building → Floor → Unit [§37]. */
export interface Unit { id: string; name: string; areaSqft?: number | undefined }
export interface Floor { id: string; name: string; units: Unit[] }
export interface Building { id: string; name: string; floors: Floor[] }
export interface Property {
  id: string; name: string; ownerEntityId?: string | undefined; address: string;
  /** The asset register row that carries cost and depreciation — valuation lives in one place [§41]. */
  assetId?: string | undefined;
  buildings: Building[];
  valuation?: { value: number; date: Iso; source: string } | undefined;
  docIds: string[];
}
export interface Lease {
  id: string; propertyId: string; unitId?: string | undefined; tenant: string; start: Iso; end: Iso;
  rent: number; dueDay: number; escalationPct: number; escalationEveryMonths: number;
  deposit: number; noticeDays: number; paymentTerms: string; gst: boolean; docId?: string | undefined;
}
export type PropertyCostKind = "maintenance" | "utility" | "propertyTax" | "insurance" | "improvement" | "vendor" | "other";
export interface PropertyCost { id: string; propertyId: string; date: Iso; kind: PropertyCostKind; vendor: string; amount: number; transactionId?: string | undefined; docId?: string | undefined }

/** Asset lifecycle event [§28]. */
export type AssetEventKind = "received" | "capitalised" | "location" | "custodian" | "maintenance" | "transfer" | "verified" | "impairment" | "revaluation" | "disposal";
export interface AssetEvent { id: string; assetId: string; date: Iso; kind: AssetEventKind; note: string; value?: number | undefined; docId?: string | undefined }

/** Depreciation journal prepared for approval [§34]. */
export interface Journal { id: string; assetId: string; period: string; amount: number; kind: "book"; status: "prepared" | "posted"; postedOn?: Iso | undefined }

/** Investments beyond demat equities [§42, v6.1 §8]. */
export type HoldingKind = "mutual_fund" | "etf" | "gold_etf" | "sgb" | "physical_gold" | "bond" | "other";
export interface Holding {
  id: string; kind: HoldingKind; name: string; isin?: string | undefined; symbol?: string | undefined; exchange?: "NSE" | "BSE" | undefined; schemeCode?: string | undefined;
  quantity: number; ownerEntityId?: string | undefined; sharePct: number;
  /** Physical gold: grams and purity in karat. */
  grams?: number | undefined; karat?: number | undefined;
  costBasis?: number | undefined; source: string;
}
/** v6.1 §5 — a price as delivered, never relabelled. */
export type Freshness = "live" | "delayed" | "eod" | "nav" | "manual" | "statement";
export interface Quote { key: string; price: number; at: string; provider: string; freshness: Freshness; refreshedAt: string; failedAt?: string | undefined }
export interface Snapshot { date: Iso; netWorth: number; portfolio: number; liquid: number; liabilities: number; allocation: Record<string, number> }
export interface AlertSettings { portfolioMovePct: number; staleNavDays: number; missingPrices: boolean; corporateActions: boolean; quantityMismatch: boolean; unusualValuationPct: number }
export interface GoldRate { perGram24k: number; date: Iso; source: string }

/** Tax & GST [§45–48]. */
export interface TaxProfile { entityId: string; regime: "new" | "old"; obligations: string[]; gstScheme: "regular" | "composition" | "qrmp" | "none"; auditRequired: boolean }
export interface GstInvoice {
  id: string; gstin: string; kind: "sales" | "purchase"; number: string; date: Iso; party: string; partyGstin: string;
  taxable: number; igst: number; cgst: number; sgst: number; cess: number; docId?: string | undefined; transactionId?: string | undefined;
}
export interface GstFiling { id: string; gstin: string; period: string; form: string; filedOn: Iso; arn: string; docId?: string | undefined }

/** Regulatory intelligence [§49–51]. */
export type RuleArea = "income_tax" | "gst" | "corporate" | "depreciation" | "return_format" | "due_date" | "property";
export interface RuleVersion {
  id: string; area: RuleArea; key: string; title: string; value: string;
  sourceUrl: string; publishedOn: Iso; effectiveFrom: Iso; effectiveTo?: Iso | undefined;
  appliesTo: string[]; status: "proposed" | "active" | "rejected" | "superseded";
  ambiguity?: string | undefined; approvedOn?: Iso | undefined; tests: { name: string; passed: boolean }[];
}

export interface BooksData {
  closedPeriods: ClosedPeriod[]; periodLog: PeriodEvent[];
  docLinks: DocLink[]; proposedFields: ProposedField[]; retentionYears: Partial<Record<DocType, number>>;
  fyRecords: FyRecord[];
  properties: Property[]; leases: Lease[]; propertyCosts: PropertyCost[];
  assetEvents: AssetEvent[]; journals: Journal[];
  holdings: Holding[]; quotes: Quote[]; snapshots: Snapshot[]; alerts: AlertSettings; goldRate?: GoldRate | undefined;
  taxProfiles: TaxProfile[]; gstInvoices: GstInvoice[]; gstFilings: GstFiling[];
  rules: RuleVersion[];
}

export const DEFAULT_ALERTS: AlertSettings = { portfolioMovePct: 5, staleNavDays: 3, missingPrices: true, corporateActions: true, quantityMismatch: true, unusualValuationPct: 20 };

export function emptyBooks(): BooksData {
  return { closedPeriods: [], periodLog: [], docLinks: [], proposedFields: [], retentionYears: {}, fyRecords: [], properties: [], leases: [], propertyCosts: [], assetEvents: [], journals: [], holdings: [], quotes: [], snapshots: [], alerts: { ...DEFAULT_ALERTS }, taxProfiles: [], gstInvoices: [], gstFilings: [], rules: [] };
}

const arr = <T,>(v: unknown, ok: (x: any) => boolean, max: number): T[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object" && ok(x)) as T[]).slice(-max) : []);
const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const fin = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** Sanitise stored books data so a bad write can never break the app. */
export function cleanBooks(raw: unknown): BooksData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = emptyBooks();
  return {
    closedPeriods: arr<ClosedPeriod>(r["closedPeriods"], (x) => typeof x.id === "string" && isDate(x.from) && isDate(x.to) && x.from <= x.to, 200),
    periodLog: arr<PeriodEvent>(r["periodLog"], (x) => typeof x.periodId === "string" && (x.action === "closed" || x.action === "reopened"), 500),
    docLinks: arr<DocLink>(r["docLinks"], (x) => typeof x.docId === "string" && typeof x.targetId === "string" && typeof x.kind === "string", 3000),
    proposedFields: arr<ProposedField>(r["proposedFields"], (x) => typeof x.label === "string", 300),
    retentionYears: r["retentionYears"] && typeof r["retentionYears"] === "object" ? Object.fromEntries(Object.entries(r["retentionYears"] as object).filter(([, v]) => fin(v) && v >= 0 && v <= 100)) : {},
    fyRecords: arr<FyRecord>(r["fyRecords"], (x) => typeof x.id === "string" && typeof x.fy === "string", 200).map((x) => ({ ...x, audited: x.audited ?? {}, schedules: x.schedules ?? [], qualifications: x.qualifications ?? [], filedReturns: x.filedReturns ?? [], lossesCarriedForward: x.lossesCarriedForward ?? [], docIds: x.docIds ?? [] })),
    properties: arr<Property>(r["properties"], (x) => typeof x.id === "string" && typeof x.name === "string", 200).map((x) => ({ ...x, address: x.address ?? "", buildings: Array.isArray(x.buildings) ? x.buildings : [], docIds: x.docIds ?? [] })),
    leases: arr<Lease>(r["leases"], (x) => typeof x.id === "string" && isDate(x.start) && isDate(x.end) && fin(x.rent), 500),
    propertyCosts: arr<PropertyCost>(r["propertyCosts"], (x) => typeof x.id === "string" && isDate(x.date) && fin(x.amount), 3000),
    assetEvents: arr<AssetEvent>(r["assetEvents"], (x) => typeof x.id === "string" && isDate(x.date), 3000),
    journals: arr<Journal>(r["journals"], (x) => typeof x.id === "string" && fin(x.amount), 5000),
    holdings: arr<Holding>(r["holdings"], (x) => typeof x.id === "string" && fin(x.quantity), 500).map((x) => ({ ...x, sharePct: fin(x.sharePct) ? Math.min(100, Math.max(0, x.sharePct)) : 100, source: x.source ?? "entered by you" })),
    quotes: arr<Quote>(r["quotes"], (x) => typeof x.key === "string" && fin(x.price) && x.price > 0, 1000),
    snapshots: arr<Snapshot>(r["snapshots"], (x) => isDate(x.date) && fin(x.netWorth), 1500),
    alerts: { ...d.alerts, ...(r["alerts"] && typeof r["alerts"] === "object" ? (r["alerts"] as AlertSettings) : {}) },
    ...(r["goldRate"] && fin((r["goldRate"] as GoldRate).perGram24k) ? { goldRate: r["goldRate"] as GoldRate } : {}),
    taxProfiles: arr<TaxProfile>(r["taxProfiles"], (x) => typeof x.entityId === "string", 100),
    gstInvoices: arr<GstInvoice>(r["gstInvoices"], (x) => typeof x.id === "string" && isDate(x.date) && fin(x.taxable), 10000),
    gstFilings: arr<GstFiling>(r["gstFilings"], (x) => typeof x.id === "string", 2000),
    rules: arr<RuleVersion>(r["rules"], (x) => typeof x.id === "string" && isDate(x.effectiveFrom), 1000),
  };
}
