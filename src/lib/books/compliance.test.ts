/** Filing calendar, ITC review, tax credits, rule impact, market alerts and audit decisions [v6.0 §45–54, v6.1 §6, §13]. */
import { describe, expect, it } from "vitest";
import type { EntityProfile } from "../entities";
import type { Expense } from "../expenses";
import { creditsFor, dueFor, itcReview, ledgerTaxPayments, obligations, quarterEnd, ruleImpact } from "./compliance";
import { approvalHistory, readinessTiles, setFindingState, withStates, type AuditItem } from "./audit";
import { businessDaysBetween, isStale, quantityByIsin, valuationAlerts } from "./market";
import { DEFAULT_ALERTS, emptyBooks, type GstInvoice, type Holding, type RuleVersion, type TaxProfile } from "./types";

const co: EntityProfile = { id: "e1", name: "KR Enterprises", kind: "company", pan: "AAACK1234C", gstins: ["33AAACK1234C1Z5"], booksFrom: "2020-21" };
const person: EntityProfile = { id: "p1", name: "Krupa", kind: "individual", pan: "ABCPK1234D", gstins: [], booksFrom: "2024-25" };
const regular: TaxProfile = { entityId: "e1", regime: "new", obligations: [], gstScheme: "regular", auditRequired: true };
const base = { fy: "2026-27", today: "2026-11-04", gstFilings: [], fyRecords: [], rules: [] as RuleVersion[] };
const rule = (key: string, value: string, extra: Partial<RuleVersion> = {}): RuleVersion => ({ id: key, area: "due_date", key, title: key, value, sourceUrl: "https://cbic-gst.gov.in/x", publishedOn: "2026-10-01", effectiveFrom: "2026-10-01", appliesTo: [], status: "active", tests: [], ...extra });

describe("filing calendar", () => {
  it("monthly GSTR-3B for September is due on 20 October and is overdue without filing evidence", () => {
    const o = obligations({ ...base, entity: co, profile: regular }).find((x) => x.form === "GSTR-3B" && x.period === "2026-09")!;
    expect(o.due).toBe("2026-10-20");
    expect(o.status).toBe("overdue");
  });
  it("recorded filing evidence marks the return filed", () => {
    const o = obligations({ ...base, entity: co, profile: regular, gstFilings: [{ id: "f", gstin: "33AAACK1234C1Z5", period: "2026-09", form: "GSTR-3B", filedOn: "2026-10-19", arn: "AA330926123456" }] }).find((x) => x.form === "GSTR-3B" && x.period === "2026-09")!;
    expect(o.status).toBe("filed");
    expect(o.evidence).toBe("ARN AA330926123456");
  });
  it("QRMP files quarterly: April–June GSTR-3B is due 22 July", () => {
    const list = obligations({ ...base, entity: co, profile: { ...regular, gstScheme: "qrmp" } }).filter((x) => x.form === "GSTR-3B");
    expect(list.map((x) => x.period)).toEqual(["2026-06", "2026-09"]);
    expect(list[0]!.due).toBe("2026-07-22");
    expect(quarterEnd("2027-02")).toBe("2027-03");
  });
  it("an approved extension moves only its own period", () => {
    const rules = [rule("due.GSTR-3B.2026-09", "2026-10-25")];
    expect(dueFor(rules, "GSTR-3B", "2026-09", "2026-10-20").due).toBe("2026-10-25");
    expect(dueFor(rules, "GSTR-3B", "2026-08", "2026-09-20").due).toBe("2026-09-20");
  });
  it("a proposed (unapproved) extension changes nothing", () => {
    expect(dueFor([rule("due.GSTR-3B.2026-09", "2026-10-25", { status: "proposed" })], "GSTR-3B", "2026-09", "2026-10-20").due).toBe("2026-10-20");
  });
  it("income-tax return: 31 July for a non-audit individual, 31 October for a company", () => {
    const ind = obligations({ ...base, fy: "2025-26", entity: person, profile: { entityId: "p1", regime: "new", obligations: [], gstScheme: "none", auditRequired: false } }).find((x) => x.form === "ITR")!;
    const c = obligations({ ...base, fy: "2025-26", entity: co, profile: regular }).find((x) => x.form === "ITR")!;
    expect(ind.due).toBe("2026-07-31");
    expect(c.due).toBe("2026-10-31");
  });
  it("without a tax profile nothing is assumed", () => {
    expect(obligations({ ...base, entity: co, profile: undefined })).toEqual([]);
  });
});

const inv = (p: Partial<GstInvoice>): GstInvoice => ({ id: Math.random().toString(36), gstin: "33AAACK1234C1Z5", kind: "purchase", number: "A1", date: "2026-10-05", party: "Supplier", partyGstin: "33AAACS1234C1Z9", taxable: 1000, igst: 0, cgst: 90, sgst: 90, cess: 0, ...p });
describe("input tax credit review", () => {
  it("claims a clean purchase and holds one without a supplier GSTIN", () => {
    const r = itcReview([inv({}), inv({ number: "B2", partyGstin: "" })], "33AAACK1234C1Z5", "2026-10");
    expect(r.eligible).toBe(180);
    expect(r.held).toBe(180);
    expect(r.lines[1]!.reasons).toContain("no supplier GSTIN");
  });
  it("holds both copies of a duplicated invoice number", () => {
    const r = itcReview([inv({}), inv({})], "33AAACK1234C1Z5", "2026-10");
    expect(r.eligible).toBe(0);
  });
  it("when GSTR-2B is supplied, only invoices in it are claimable", () => {
    const r = itcReview([inv({}), inv({ number: "C3" })], "33AAACK1234C1Z5", "2026-10", new Set(["33AAACS1234C1Z9|A1"]));
    expect(r.eligible).toBe(180);
    expect(r.lines[1]!.reasons).toContain("not in supplier-filed GSTR-2B");
  });
});

const tx = (id: string, title: string, amount: number, date = "2026-09-14"): Expense => ({ id, date, amount, title, merchant: null, description: "", category: "Taxes", txnType: "expense" } as unknown as Expense);
describe("tax credits", () => {
  it("finds challan 280 advance-tax debits but never GST payments", () => {
    const found = ledgerTaxPayments([tx("a", "ITNS 280 advance tax", 50000), tx("b", "GST challan CPIN", 9000), tx("c", "Groceries", 900)], "2026-27");
    expect(found.map((f) => f.id)).toEqual(["a"]);
    expect(found[0]!.kind).toBe("advance");
  });
  it("a challan confirmed twice counts once", () => {
    const c = creditsFor([{ id: "1", entityId: "p", fy: "2026-27", kind: "advance", amount: 50000, source: "x", transactionId: "a" }, { id: "2", entityId: "p", fy: "2026-27", kind: "advance", amount: 50000, source: "x", transactionId: "a" }, { id: "3", entityId: "p", fy: "2026-27", kind: "tds", amount: 12000, source: "Form 26AS" }], "p", "2026-27");
    expect(c.total).toBe(62000);
    expect(c.tds).toBe(12000);
  });
});

describe("rule impact", () => {
  it("lists affected GST entities and keeps a closed year unchanged", () => {
    const r = rule("gst.rate.x", "18%", { area: "gst", effectiveFrom: "2025-10-01", status: "proposed" });
    const imp = ruleImpact(r, { entities: [co, person], closedPeriods: [{ id: "c", from: "2025-04-01", to: "2026-03-31", closedOn: "2026-06-01", note: "" }], fyRecords: [], gstFilings: [], today: "2026-11-04" });
    expect(imp.entities.map((e) => e.id)).toEqual(["e1"]);
    expect(imp.years).toEqual(["2025-26", "2026-27"]);
    expect(imp.protectedYears.map((y) => y.fy)).toEqual(["2025-26"]);
  });
});

const h = (p: Partial<Holding>): Holding => ({ id: "h", kind: "etf", name: "Nifty ETF", quantity: 10, sharePct: 100, source: "you", isin: "INF000000001", ...p });
describe("market alerts and freshness", () => {
  it("a 25% gap from cost alerts at the configured 20% (not five times it)", () => {
    const v = [{ holding: h({ costBasis: 1000 }), key: "k", quote: null, value: 1250, stale: false, note: "" }];
    expect(valuationAlerts(v, [], DEFAULT_ALERTS, {}).some((a) => a.includes("25% from cost"))).toBe(true);
  });
  it("a 50%-owned holding at cost raises no false value-vs-cost alert", () => {
    const v = [{ holding: h({ costBasis: 1000, sharePct: 50 }), key: "k", quote: null, value: 500, stale: false, note: "" }];
    expect(valuationAlerts(v, [], DEFAULT_ALERTS, {}).some((a) => a.includes("from cost"))).toBe(false);
  });
  it("demat holdings without any price are flagged, not valued at zero", () => {
    expect(valuationAlerts([], [], DEFAULT_ALERTS, {}, [], [], ["TCS"]).some((a) => a.includes("1 demat holding has no price"))).toBe(true);
  });
  it("statement quantity adds up across demat accounts", () => {
    expect(quantityByIsin([{ holdings: [{ isin: "INE1", quantity: 10 }] }, { holdings: [{ isin: "INE1", quantity: 5 }] }])).toEqual({ INE1: 15 });
  });
  it("your quantity is compared with the demat total", () => {
    const out = valuationAlerts([], [], DEFAULT_ALERTS, { INF000000001: 15 }, [h({ quantity: 10 })]);
    expect(out[0]).toContain("10 held vs 15");
  });
  it("an end-of-day price is stale only after more than four business days", () => {
    const q = { key: "k", price: 1, at: "2026-10-30T10:00:00Z", provider: "NSE", freshness: "eod" as const, refreshedAt: "2026-10-30T13:30:00Z" };
    expect(businessDaysBetween(new Date("2026-10-30"), new Date("2026-11-05"))).toBe(4);
    expect(isStale(q, new Date("2026-11-05T12:00:00Z"), "etf", 3)).toBe(false);
    expect(isStale(q, new Date("2026-11-06T12:00:00Z"), "etf", 3)).toBe(true);
  });
});

const item: AuditItem = { key: "k1", type: "GST", entity: "KR", account: null, fy: "2026-27", risk: "high", text: "x", evidence: "e", to: "/tax" };
describe("audit decisions", () => {
  it("a finding needs a note to be marked fixed, then leaves the open list", () => {
    expect(() => setFindingState([], "k1", "resolved", "", "2026-11-04T00:00:00Z")).toThrow();
    const s = setFindingState([], "k1", "resolved", "Filed on portal", "2026-11-04T00:00:00Z");
    const r = withStates([item], s);
    expect(r.open).toHaveLength(0);
    expect(r.reviewed[0]!.state.note).toBe("Filed on portal");
    expect(withStates([item], setFindingState(s, "k1", "open", "", "2026-11-05T00:00:00Z")).open).toHaveLength(1);
  });
  it("readiness counts drafts and pending tax work from real obligations only", () => {
    const obs = obligations({ ...base, entity: co, profile: regular });
    const tiles = readinessTiles({ accounts: [], entries: [], items: [], books: emptyBooks(), docsMissing: 0, today: base.today, obligations: obs, entitiesWithoutProfile: 1 });
    const overdue = obs.filter((o) => o.status === "overdue").length;
    expect(tiles.find((t) => t.label === "Pending tax preparation")!.value).toBe(String(1 + overdue));
    const none = readinessTiles({ accounts: [], entries: [], items: [], books: emptyBooks(), docsMissing: 0, today: base.today, obligations: [], entitiesWithoutProfile: 0 });
    expect(none.find((t) => t.label === "Draft reports")!.value).toBe("0 saved · 0 needed");
    expect(none.find((t) => t.label === "Pending tax preparation")!.value).toBe("0");
  });
  it("approval history lists period closures and rule approvals, newest first", () => {
    const b = { ...emptyBooks(), periodLog: [{ at: "2026-06-01", action: "closed" as const, periodId: "c", reason: "FY filed" }], rules: [rule("due.ITR", "15", { approvedOn: "2026-10-02" })] };
    expect(approvalHistory(b).map((e) => e.what)).toEqual(["Rule approved", "Period closed"]);
  });
});
