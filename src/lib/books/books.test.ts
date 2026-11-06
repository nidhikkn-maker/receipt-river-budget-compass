/** v6.0 §71 mandatory tests and v6.1 §14 tests that are decidable from pure rules. */
import { describe, expect, it } from "vitest";
import type { EntityProfile } from "../entities";
import type { Asset } from "../assets";
import { emptyBooks, cleanBooks, type FyRecord, type GstInvoice, type Holding, type Lease, type Property, type Quote } from "./types";
import { proposeAsset, proposeEntity, proposeFy, proposeLease, proposeProperty, trail, unmappedFields, autoName, type EntityRead } from "./intake";
import { commitIntake } from "./commit";
import { openingProposal, confirmOpening } from "./fy";
import { annualBook, blockSchedule, bookVsTax, monthlyBook, postJournals, prepareJournals } from "./depreciation";
import { tenantLedger, receiptKind, rentFor, occupancy } from "./property";
import { activateRule, proposeRule, ruleOn, formFor } from "./regulatory";
import { closePeriod, periodBlocker, reopenPeriod } from "./periods";
import { gstr3b, gstr1, invoiceProblems, duplicateInvoices } from "./gst";
import { isStale, quoteKey, recordFailure, upsertQuote, valueHolding, dynamicNetWorth, addSnapshot, marketOpen } from "./market";
import { DEFAULT_ALERTS } from "./types";
import { pastRetention } from "./docrepo";
import { taxComputation } from "./taxcomp";
import { eventKindOf } from "../investments/demat";

const ids = () => { let n = 0; return () => `id${++n}`; };
const entityRead: EntityRead = { legalName: "KR Enterprises Private Limited", kind: "company", pan: "AAACK1234C", gstins: ["33AAACK1234C1Z5"], cin: "U12345TN2020PTC123456", incorporatedOn: "2020-06-15", address: "Chennai", people: [{ name: "K Karunanithi", role: "Director" }], shareholding: [], activities: ["Trading"], fyEnd: null };

describe("§71 entity onboarding", () => {
  it("1. incorporation documents generate a draft profile", () => {
    const { profile, matchedBy, missing } = proposeEntity(entityRead, [], "e1", "2026-11-04");
    expect(matchedBy).toBeNull();
    expect(profile).toMatchObject({ name: "KR Enterprises Private Limited", kind: "company", pan: "AAACK1234C", regNo: "U12345TN2020PTC123456", booksFrom: "2020-21", incorporatedOn: "2020-06-15" });
    expect(missing).toEqual([]);
  });
  it("2. re-uploading the same documents creates no duplicate", () => {
    const first = proposeEntity(entityRead, [], "e1", "2026-11-04").profile;
    const again = proposeEntity({ ...entityRead, legalName: "K.R. Enterprises Pvt Ltd" }, [first], "e2", "2026-11-04");
    expect(again.matchedBy).toBe("PAN");
    expect(again.profile.id).toBe("e1");
    const p = commitIntake({ entities: [first], assets: [], books: emptyBooks() }, { route: "entity", profile: again.profile }, { id: "d1", title: "x", docType: "incorporation", fieldLabels: [] }, "2026-11-04", ids());
    expect(p.entities).toHaveLength(1);
  });
});

const ent: EntityProfile = { id: "e1", name: "KR Enterprises", kind: "company", pan: "AAACK1234C", gstins: [], booksFrom: "2020-21" };
describe("§71 previous-year records", () => {
  it("3. audited balance sheet prepares opening balances", () => {
    const r = proposeFy({ entity: "KR Enterprises", pan: "AAACK1234C", fy: "2025-26", lines: [{ head: "bank", amount: 500000 }, { head: "fixedAssets", amount: 1500000 }, { head: "capitalReserves", amount: 1200000 }, { head: "loans", amount: 800000 }], totalAssets: 2000000, totalLiabilities: 2000000, schedules: ["balanceSheet", "profitLoss", "notes", "auditorReport", "fixedAssetRegister"], qualifications: [], filedForm: null, ackNo: null, filedOn: null }, [ent], [], "f1", "d1");
    const op = openingProposal(r.record!, { bank: 495000 });
    expect(op.balanced).toBe(true);
    expect(op.lines.find((l) => l.head === "bank")).toMatchObject({ audited: 500000, books: 495000, difference: -5000 });
    expect(confirmOpening(r.record!, "2026-11-04").confirmedOpening).toEqual(r.record!.audited);
  });
  it("4. incomplete audited schedules are flagged, not filled", () => {
    const r = proposeFy({ entity: "KR Enterprises", pan: null, fy: "2025-26", lines: [{ head: "bank", amount: 100 }], totalAssets: null, totalLiabilities: null, schedules: ["balanceSheet"], qualifications: [], filedForm: null, ackNo: null, filedOn: null }, [ent], [], "f1", null);
    expect(r.missingSchedules).toEqual(["profitLoss", "notes", "auditorReport", "fixedAssetRegister"]);
    expect(openingProposal(r.record!, {}).lines.find((l) => l.head === "cash")!.audited).toBeNull();
  });
});

const car: Asset = { id: "a1", name: "Mercedes GLS", kind: "vehicle", cost: 12000000, inUse: "2024-12-05", sharePct: 100, bookMethod: "slm", bookRatePct: 0, usefulLifeYears: 8, residualPct: 5 };
describe("§71 assets & depreciation", () => {
  it("5. asset invoice generates a proposed asset", () => {
    const { asset, missing } = proposeAsset({ name: "Dell laptop", kind: "computer", owner: "KR Enterprises", cost: 150000, purchaseDate: "2026-05-10", supplier: "Dell", warrantyUntil: "2029-05-10", insurance: null, serial: "SN1" }, [ent], "a9", "d1");
    expect(missing).toEqual(["date put to use (confirm)", "useful life", "residual value"]);
    expect(asset).toMatchObject({ name: "Dell laptop", kind: "computer", cost: 150000, inUse: "2026-05-10", ownerEntityId: "e1", docId: "d1", supplier: "Dell", warrantyUntil: "2029-05-10" });
    expect(asset?.usefulLifeYears).toBeUndefined();
  });
  it("6. book and tax depreciation are calculated separately", () => {
    const book = annualBook(car, "2025-26").depreciation;
    const tax = bookVsTax([car], "2025-26")[0]!.tax;
    expect(book).toBeCloseTo((12000000 * 0.95) / 8, -1);
    expect(tax).toBe(1665000); // FY24-25 half rate 7.5% (used <180 days), then 15% on 1,11,00,000 WDV
    expect(book).not.toBe(tax);
    expect(blockSchedule([car], "2025-26")[0]).toMatchObject({ kind: "vehicle", rate: 15, depreciation: 1665000 });
  });
  it("monthly book depreciation never goes below residual", () => {
    const m = monthlyBook({ ...car, usefulLifeYears: 1 }, "2027-12");
    expect(m.at(-1)!.nbv).toBe(600000);
  });
  it("journals are prepared only for open months and refused in closed ones", () => {
    const closed = closePeriod([], [], "2026-04-01", "2026-04-30", "audited", "2026-11-04", "p1").periods;
    expect(prepareJournals([car], "2026-04", [], closed, ids()).journals).toHaveLength(0);
    const j = prepareJournals([car], "2026-05", [], closed, ids()).journals;
    expect(j).toHaveLength(1);
    expect(postJournals(j, [j[0]!.id], closed, "2026-11-04")[0]!.status).toBe("posted");
  });
});

const flat: Property = { id: "p1", name: "Anna Nagar flat", address: "Anna Nagar, Chennai", buildings: [{ id: "b1", name: "Tower A", floors: [{ id: "f1", name: "2", units: [{ id: "u1", name: "2A" }, { id: "u2", name: "2B" }] }] }], docIds: [] };
const lease: Lease = { id: "l1", propertyId: "p1", unitId: "u1", tenant: "Ramesh Kumar", start: "2026-01-01", end: "2026-12-31", rent: 30000, dueDay: 5, escalationPct: 5, escalationEveryMonths: 6, deposit: 100000, noticeDays: 60, paymentTerms: "", gst: false };
describe("§71 property", () => {
  it("7. property deed generates a proposed property", () => {
    const { property } = proposeProperty({ name: "Anna Nagar flat", owner: "KR Enterprises", address: "Anna Nagar, Chennai", cost: 9000000, acquiredOn: "2021-03-01", surveyNo: "123/4", valuation: null, valuationDate: null }, [ent], "p1", "d1");
    expect(property).toMatchObject({ name: "Anna Nagar flat", ownerEntityId: "e1", docIds: ["d1"] });
  });
  it("8. lease extracts tenant, rent, deposit and escalation", () => {
    const { lease: l, missing } = proposeLease({ tenant: "Ramesh Kumar", property: "Anna Nagar flat", unit: "2A", start: "2026-01-01", end: "2026-12-31", rent: 30000, dueDay: 5, escalationPct: 5, escalationEveryMonths: 6, deposit: 100000, noticeDays: 60, paymentTerms: "Bank transfer", gst: false }, [flat], "l1", "d2");
    expect(missing).toEqual([]);
    expect(l).toMatchObject({ propertyId: "p1", unitId: "u1", rent: 30000, deposit: 100000, escalationPct: 5, noticeDays: 60 });
    expect(rentFor(l!, "2026-07")).toBe(31500);
  });
  it("9–10. rental receipts are matched and deposits are not rent", () => {
    const income = [{ id: "i1", date: "2026-01-04", amount: 100000, text: "NEFT Ramesh Kumar security deposit" }, { id: "i2", date: "2026-01-06", amount: 30000, text: "NEFT Ramesh Kumar rent" }, { id: "i3", date: "2026-02-07", amount: 20000, text: "Ramesh Kumar" }];
    const led = tenantLedger(lease, flat, income, ["2026-01", "2026-02"]);
    expect(led[0]).toMatchObject({ rent: 30000, deposit: 100000, status: "paid" });
    expect(led[1]).toMatchObject({ rent: 20000, balance: 10000, status: "partial" });
    expect(receiptKind("refundable security deposit")).toBe("deposit");
    expect(occupancy([flat], [lease], "2026-06-01")[0]).toMatchObject({ occupied: 1, total: 2 });
  });
});

describe("§71 regulatory intelligence", () => {
  const base = [{ id: "r1", area: "gst" as const, key: "gstr3b.due", title: "GSTR-3B due", value: "20th", sourceUrl: "https://cbic-gst.gov.in/x", publishedOn: "2017-07-01", effectiveFrom: "2017-07-01", appliesTo: [], status: "active" as const, tests: [] }];
  it("13. a new applicable rule is detected as a proposal", () => {
    const r = proposeRule(base, { id: "r2", area: "gst", key: "gstr3b.due", title: "GSTR-3B due", value: "22nd", sourceUrl: "https://cbic-gst.gov.in/y", publishedOn: "2026-10-01", effectiveFrom: "2026-11-01", appliesTo: [] });
    expect(r.previous?.value).toBe("20th");
    expect(r.rules.find((x) => x.id === "r2")!.status).toBe("proposed");
    expect(ruleOn(r.rules, "gstr3b.due", "2026-12-01")!.value).toBe("20th");
  });
  it("14. historical calculations keep the previous rule", () => {
    const r = proposeRule(base, { id: "r2", area: "gst", key: "gstr3b.due", title: "GSTR-3B due", value: "22nd", sourceUrl: "https://cbic-gst.gov.in/y", publishedOn: "2026-10-01", effectiveFrom: "2026-11-01", appliesTo: [] });
    const active = activateRule(r.rules, "r2", "2026-11-04");
    expect(ruleOn(active, "gstr3b.due", "2026-10-15")!.value).toBe("20th");
    expect(ruleOn(active, "gstr3b.due", "2026-11-15")!.value).toBe("22nd");
  });
  it("rules without an official source cannot be activated", () => {
    const r = proposeRule([], { id: "x", area: "gst", key: "k", title: "t", value: "v", sourceUrl: "https://example.com", publishedOn: "2026-01-01", effectiveFrom: "2026-01-01", appliesTo: [] });
    expect(() => activateRule(r.rules, "x", "2026-11-04")).toThrow();
  });
  it("15. period-specific form draft", () => {
    expect(formFor("company", true, "2024-25").version?.assessmentYear).toBe("2025-26");
    expect(formFor("company", true, "2030-31").version).toBeNull();
  });
});

describe("§71 ledger integrity", () => {
  it("16. a bank debit with no invoice still counts in tax working", () => {
    const c = taxComputation("2026-27", [{ id: "x", date: "2026-05-01", amount: 5000, txnType: "expense", scope: "business", title: "Courier", merchant: null, description: "", category: "Office & Supplies", receipts: [] } as never], [], [], [], []);
    expect(c.business.expenses).toBe(5000);
  });
  it("closed periods block entries; reopening needs a reason", () => {
    const { periods, log } = closePeriod([], [], "2025-04-01", "2026-03-31", "Filed", "2026-11-04", "p1");
    expect(periodBlocker(periods, "2025-12-01")).toMatch(/closed period/);
    expect(periodBlocker(periods, "2026-05-01", "2026-03-30")).toMatch(/closed period/);
    expect(periodBlocker(periods, "2026-05-01")).toBeNull();
    expect(() => reopenPeriod(periods, log, "p1", "", "2026-11-04")).toThrow();
    expect(() => closePeriod(periods, log, "2026-01-01", "2026-06-30", "", "2026-11-04", "p2")).toThrow(/overlaps/);
  });
  it("21. a failed intake commit leaves records unchanged", () => {
    const before = { entities: [], assets: [], books: emptyBooks() };
    expect(() => commitIntake(before, { route: "lease", lease: { ...lease, propertyId: "" } }, { id: "d", title: "t", docType: "lease_agreement", fieldLabels: [] }, "2026-11-04", ids())).toThrow();
    expect(before.books.leases).toHaveLength(0);
    expect(trail("Save", { step: "Save", note: "x" }).find((s) => s.step === "Audit")!.state).toBe("waiting");
  });
  it("unknown fields become proposals, never columns", () => {
    const f = unmappedFields(["PAN", "Udyam number", "Udyam number"], "incorporation", []);
    expect(f).toEqual([{ label: "Udyam number", docType: "incorporation", seen: 2, status: "proposed" }]);
    expect(autoName({ entity: "KR", date: "2025-06-01", typeLabel: "Invoice", identifier: "INV-9" })).toBe("KR / FY 2025-26 / Invoice / INV-9");
  });
  it("cleanBooks drops corrupt rows", () => {
    expect(cleanBooks({ leases: [{ id: 1 }], quotes: [{ key: "k", price: 0 }] })).toMatchObject({ leases: [], quotes: [] });
  });
});

describe("GST drafts", () => {
  const inv = (x: Partial<GstInvoice>): GstInvoice => ({ id: Math.random().toString(), gstin: "33AAACK1234C1Z5", kind: "sales", number: "1", date: "2026-10-05", party: "A", partyGstin: "", taxable: 1000, igst: 0, cgst: 90, sgst: 90, cess: 0, ...x });
  it("GSTR-1/3B use only that GSTIN and month", () => {
    const list = [inv({ number: "1" }), inv({ number: "2", partyGstin: "29AAACB1234C1Z5", cgst: 0, sgst: 0, igst: 180 }), inv({ kind: "purchase", number: "P1", partyGstin: "33AAACC1234C1Z5", cgst: 50, sgst: 50 }), inv({ number: "3", date: "2026-09-05" })];
    expect(gstr1(list, "33AAACK1234C1Z5", "2026-10")).toMatchObject({ b2b: { count: 1, igst: 180 }, b2c: { count: 1 } });
    expect(gstr3b(list, "33AAACK1234C1Z5", "2026-10")).toMatchObject({ outputTax: 360, itcClaimed: 100, netPayable: 260 });
    expect(gstr3b(list, "33AAACK1234C1Z5", "2026-10", new Set())).toMatchObject({ itcClaimed: 0, itcHeld: 100 });
    expect(invoiceProblems(inv({ partyGstin: "29AAACB1234C1Z5" }))).toContain("inter-state invoice should carry IGST, not CGST/SGST");
    expect(duplicateInvoices([inv({}), inv({})])).toEqual(["1"]);
  });
});

describe("v6.1 market data", () => {
  const h: Holding = { id: "h1", kind: "etf", name: "Nifty BeES", isin: "INF204KB14I2", quantity: 10, sharePct: 50, source: "x" };
  const q: Quote = { key: "isin:INF204KB14I2", price: 250, at: "2026-11-04T09:00:00Z", provider: "statement", freshness: "eod", refreshedAt: "2026-11-04T09:00:00Z" };
  it("1. ISIN is matched before names", () => { expect(quoteKey({ ...h, symbol: "NIFTYBEES", exchange: "NSE" })).toBe("isin:INF204KB14I2"); expect(quoteKey({ kind: "etf", exchange: "BSE", symbol: "abc" })).toBe("BSE:ABC"); });
  it("3–4. market hours are IST and labels are not upgraded to live", () => {
    expect(marketOpen(new Date("2026-11-04T05:00:00Z"))).toBe(true);
    expect(marketOpen(new Date("2026-11-04T11:00:00Z"))).toBe(false);
    expect(valueHolding(h, [q], undefined, new Date("2026-11-04T10:00:00Z"), DEFAULT_ALERTS).note).toMatch(/End of day/);
  });
  it("6–7. feed failure keeps the last price and marks it stale; never zero", () => {
    const failed = recordFailure([q], q.key, "2026-11-04T10:00:00Z");
    const v = valueHolding(h, failed, undefined, new Date("2026-11-04T10:05:00Z"), DEFAULT_ALERTS);
    expect(v.value).toBe(1250); expect(v.stale).toBe(true);
    expect(() => upsertQuote([q], { ...q, price: 0 })).toThrow();
    expect(valueHolding({ ...h, isin: "INE000000000" }, [], undefined, new Date(), DEFAULT_ALERTS).value).toBeNull();
  });
  it("5. NAVs go stale after the configured days", () => {
    expect(isStale({ ...q, freshness: "nav", at: "2026-10-28" }, new Date("2026-11-04"), "mutual_fund", 3)).toBe(true);
  });
  it("physical gold uses weight × purity × rate, never ETF price", () => {
    const g: Holding = { id: "g", kind: "physical_gold", name: "Coins", quantity: 1, grams: 10, karat: 22, sharePct: 100, source: "x" };
    expect(valueHolding(g, [q], undefined, new Date(), DEFAULT_ALERTS).value).toBeNull();
    expect(valueHolding(g, [q], { perGram24k: 7200, date: "2026-11-04", source: "x" }, new Date("2026-11-04"), DEFAULT_ALERTS).value).toBe(66000);
  });
  it("10–12. ownership-aware net worth, unpriced holdings left out, snapshots one per day", () => {
    const v = [valueHolding(h, [q], undefined, new Date("2026-11-04T10:00:00Z"), DEFAULT_ALERTS), valueHolding({ ...h, id: "h2", isin: "INE111111111" }, [], undefined, new Date(), DEFAULT_ALERTS)];
    const nw = dynamicNetWorth({ bank: 1000, bankBasis: "", investments: v, demat: 0, dematBasis: "", otherAssets: 0, property: 0, propertyBasis: "", liabilities: 250, liabilitiesBasis: "" });
    expect(nw.net).toBe(2000);
    expect(nw.quality[0]).toMatch(/without a price/);
    const s = addSnapshot(addSnapshot([], { date: "2026-11-04", netWorth: 1, portfolio: 1, liquid: 1, liabilities: 0, allocation: {} }), { date: "2026-11-04", netWorth: 2, portfolio: 1, liquid: 1, liabilities: 0, allocation: {} });
    expect(s).toHaveLength(1); expect(s[0]!.netWorth).toBe(2);
  });
});

describe("misc", () => {
  it("investment events are recognised", () => { expect(eventKindOf("12-08-2026 INE002A01018 RELIANCE Dividend 1500")).toBe("dividend"); expect(eventKindOf("Bonus 1:1")).toBe("bonus"); });
  it("retention lists, never deletes", () => {
    const d = { id: "d", title: "t", docType: "invoice", filePath: "", fileName: "", mimeType: "", size: 1, docDate: "2010-05-01", amount: null, currency: "INR", merchant: null, notes: "", text: "", transactionId: null, accountId: null, loanId: null, expiresOn: null, createdAt: "2010-05-01" } as const;
    expect(pastRetention([d], "2026-11-04", {})).toHaveLength(1);
    expect(pastRetention([{ ...d, docType: "property_deed" }], "2026-11-04", {})).toHaveLength(0);
  });
  it("records keep their sources: FY record merges re-uploads", () => {
    const first = proposeFy({ entity: "KR Enterprises", pan: null, fy: "2025-26", lines: [{ head: "bank", amount: 1 }], totalAssets: null, totalLiabilities: null, schedules: ["balanceSheet"], qualifications: ["Q1"], filedForm: "ITR-6", ackNo: "A1", filedOn: "2026-10-30" }, [ent], [], "f1", "d1").record as FyRecord;
    const again = proposeFy({ entity: "KR Enterprises", pan: null, fy: "2025-26", lines: [], totalAssets: null, totalLiabilities: null, schedules: ["profitLoss"], qualifications: ["Q1"], filedForm: "ITR-6", ackNo: "A1", filedOn: "2026-10-30" }, [ent], [first], "f2", "d2").record!;
    expect(again.id).toBe("f1"); expect(again.schedules).toEqual(["balanceSheet", "profitLoss"]); expect(again.filedReturns).toHaveLength(1); expect(again.docIds).toEqual(["d1", "d2"]);
  });
});

describe("§71 investments, transfers and traceability", () => {
  it("11. ICICI Direct holdings import through the statement reader", async () => {
    const { parseInvestmentDoc } = await import("../investments/demat");
    const doc = parseInvestmentDoc(["ICICI Securities Ltd — Demat Holding Statement", "DP ID: IN303028 Client ID: 12345678", "Holding as on 31-10-2026", "INE002A01018 RELIANCE INDUSTRIES LTD 100 2,85,000.00"])!;
    expect(doc.kind).toBe("demat");
    expect(doc.broker).toBe("ICICI Direct");
    expect(doc.holdings[0]).toMatchObject({ isin: "INE002A01018", quantity: 100 });
  });
  it("12. re-importing the same statement never duplicates a holding", async () => {
    const { parseInvestmentDoc, mergeInvestmentDoc } = await import("../investments/demat");
    const rows = ["ICICI Securities Ltd — Demat Holding Statement", "DP ID: IN303028 Client ID: 12345678", "Holding as on 31-10-2026", "INE002A01018 RELIANCE INDUSTRIES LTD 100 2,85,000.00"];
    const once = mergeInvestmentDoc([], parseInvestmentDoc(rows)!, "d1").holdings;
    const twice = mergeInvestmentDoc(once, parseInvestmentDoc(rows)!, "d2");
    expect(twice.holdings).toHaveLength(1);
    const { investmentRecon } = await import("./recon");
    expect(investmentRecon([{ isin: "INE002A01018", name: "RELIANCE", quantity: 100, lots: [{ side: "buy", quantity: 100 }] }])).toEqual([]);
  });
  it("17. an internal transfer pairs without income or spending", async () => {
    const { suggestTransfers } = await import("../transfer-match");
    const { cashflow } = await import("../ledger");
    const A = { id: "a", name: "IDFC", kind: "savings" as const, openingBalance: 0, archived: false };
    const B = { id: "b", name: "SBI", kind: "savings" as const, openingBalance: 0, archived: false };
    const debit = { id: "d", title: "t", merchant: null, category: "Other", amount: 50000, currency: "INR", originalAmount: 50000, fxRate: 1, date: "2026-10-01", description: "IMPS 612345678901 TO SBI", receipts: [], splits: [], scope: "personal", txnType: "expense" as const, accountId: "a", reconciledAt: null, statementRef: null } as never;
    const credit = { ...(debit as object), id: "c", txnType: "income", accountId: "b", description: "IMPS 612345678901 FROM IDFC" } as never;
    const s = suggestTransfers([debit, credit], [A, B], []);
    expect(s[0]?.strength).toBe("strong");
    expect(cashflow([{ ...(debit as object), txnType: "transfer", toAccountId: "b" } as never]).income).toBe(0);
  });
  it("18. a card settlement lowers the card owed without new spending", async () => {
    const { cardLedger } = await import("../card-balance");
    const { cashflow } = await import("../ledger");
    const card = { id: "amex", name: "AMEX", kind: "credit_card" as const, openingBalance: 0, archived: false };
    const spend = { id: "s1", txnType: "expense" as const, amount: 75000, accountId: "amex", date: "2026-10-01", reconciledAt: "x" };
    const pay = { id: "p1", txnType: "card_payment" as const, amount: 50000, accountId: "idfc", toAccountId: "amex", date: "2026-10-10", reconciledAt: null };
    expect(cardLedger(card, [spend, pay]).outstanding).toBe(25000);
    expect(cashflow([pay as never]).spent).toBe(0);
  });
  it("19. an account maps to at most one company and unlinking is complete", async () => {
    const { linkAccounts, ownerOf, unlinkAccount } = await import("./entity-accounts");
    let map = linkAccounts({}, "e1", ["a1", "a2"]);
    map = linkAccounts(map, "e2", ["a2"]);
    expect(ownerOf(map, "a1")).toBe("e1");
    expect(ownerOf(map, "a2")).toBe("e2");
    expect(ownerOf(unlinkAccount(map, "a1"), "a1")).toBeNull();
  });
  it("20. every material figure traces to its source document and printed value", async () => {
    const { recordProvenance } = await import("./docrepo");
    const docs = [{ id: "d1", title: "Lease deed", docType: "lease_agreement", fields: [{ label: "Monthly rent", value: "30000", originalValue: "28000", page: 2, status: "corrected", confidence: "high" }] }];
    const out = recordProvenance("l1", [{ docId: "d1", kind: "lease", targetId: "l1", label: "t" }], docs as never);
    expect(out[0]?.fields[0]).toMatchObject({ label: "Monthly rent", value: "30000", printed: "28000", where: "page 2" });
  });
  it("22. the established ledger integrity invariants hold", async () => {
    const { cashflow, accountBalance } = await import("../ledger");
    const acc = { id: "a", name: "A", kind: "savings" as const, openingBalance: 1000, archived: false };
    const reimbursement = { id: "r", txnType: "reimbursement" as const, amount: 200, accountId: "a", date: "2026-10-01" };
    expect(cashflow([reimbursement as never]).income).toBe(0);
    expect(accountBalance(acc, [reimbursement as never])).toBe(1200);
  });
});
