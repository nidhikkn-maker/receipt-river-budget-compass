import { describe, expect, it } from "vitest";
import type { GstInvoice } from "./types";
import { receiptKind, tenantLedger } from "./property";
import { broughtForward, gainTerm } from "./taxcomp";
import { blockSchedule } from "./depreciation";
import type { Lease, FyRecord } from "./types";
import type { Asset } from "../assets";

const lease = { id: "l1", propertyId: "p1", tenant: "Ravi Kumar", start: "2026-01-01", end: "2027-12-31", rent: 10000, deposit: 30000 } as Lease;

describe("v6 accuracy fixes", () => {
  it("an amount equal to the deposit alone is not a deposit", () => {
    expect(receiptKind("NEFT Ravi Kumar", 30000, lease)).toBe("rent");
    expect(receiptKind("Ravi Kumar security deposit", 30000, lease)).toBe("deposit");
  });
  it("tenant arrears carry forward from the lease start", () => {
    const rows = tenantLedger(lease, undefined, [{ id: "r", date: "2026-03-05", amount: 10000, text: "Ravi Kumar rent" }], ["2026-03"]);
    expect(rows[0]!.balance).toBe(20000);
  });
  it("listed shares are long-term after 12 months, property after 24", () => {
    expect(gainTerm("listed_equity", "2024-01-01", "2025-01-02")).toBe("long");
    expect(gainTerm("property", "2024-01-01", "2025-06-01")).toBe("short");
  });
  it("losses come from the latest earlier record only and expire after 8 years", () => {
    const recs = [
      { fy: "2023-24", lossesCarriedForward: [{ fromFy: "2023-24", kind: "business", amount: 100 }] },
      { fy: "2024-25", lossesCarriedForward: [{ fromFy: "2023-24", kind: "business", amount: 60 }, { fromFy: "2010-11", kind: "business", amount: 50 }, { fromFy: "2010-11", kind: "depreciation", amount: 5 }] },
    ] as FyRecord[];
    expect(broughtForward(recs, "2025-26").map((l) => l.amount)).toEqual([60, 5]);
  });
  it("block depreciation is worked out on the block after sales", () => {
    const a = (o: Partial<Asset>) => ({ id: Math.random() + "", name: "c", kind: "computer", cost: 100000, inUse: "2020-04-01", sharePct: 100, bookMethod: "slm", bookRatePct: 0, ...o }) as Asset;
    const [row] = blockSchedule([a({}), a({ soldOn: "2025-06-01", saleValue: 10000 })], "2025-26");
    expect(row!.depreciation).toBeCloseTo(((row!.opening - 10000) * row!.rate) / 100, 0);
  });
});

import { matchGstPayments, gstr9 } from "./gst";
describe("GST payment matching", () => {
  const liab = [{ period: "2026-04", amount: 5000 }];
  it("rejects payments naming another GSTIN or outside the period window", () => {
    const pays = [
      { id: "a", date: "2026-05-15", amount: 5000, text: "GST CPIN 29ABCDE1234F1Z5" },
      { id: "b", date: "2026-09-01", amount: 5000, text: "GST challan" },
    ];
    expect(matchGstPayments(liab, pays, { gstin: "33ABCDE1234F1Z5" })[0]!.paymentId).toBeNull();
    expect(matchGstPayments(liab, [{ id: "c", date: "2026-05-18", amount: 5000, text: "GST CPIN 33ABCDE1234F1Z5" }], { gstin: "33ABCDE1234F1Z5" })[0]!.paymentId).toBe("c");
  });
  it("GSTR-9 working has no differences when no invoices", () => {
    expect(gstr9([], "33ABCDE1234F1Z5", 2026).checks).toEqual([]);
  });
});

import { booksHeads } from "./fy";
describe("per-company opening balances", () => {
  it("counts only the company's linked accounts and leaves unlinked heads empty", () => {
    const accounts = [{ id: "b1", name: "Co bank", kind: "current", openingBalance: 1000 }, { id: "b2", name: "My bank", kind: "savings", openingBalance: 5000 }] as never[];
    const h = booksHeads({ accounts, txns: [], assets: [], accountIds: new Set(["b1"]), entityId: "e1", fyEnd: "2026-03-31", fy: "2025-26" });
    expect(h.bank).toBe(1000);
    expect(h.loans).toBeUndefined();
  });
});

import { proposeGstInvoice, proposeTaxStatement } from "./intake";
import { commitIntake } from "./commit";
import { emptyBooks } from "./types";
describe("invoice and tax statement intake", () => {
  const read = { number: "INV-7", date: "2026-05-02", seller: "Acme", sellerGstin: "29ABCDE1234F1Z5", buyer: "KR", buyerGstin: "33ABCDE1234F1Z5", taxable: 1000, igst: 180, cgst: 0, sgst: 0, cess: 0 };
  it("an uploaded invoice becomes a purchase draft for the owner's GSTIN", () => {
    const p = proposeGstInvoice(read, ["33ABCDE1234F1Z5"], "g1", null);
    expect(p.invoice).toMatchObject({ kind: "purchase", gstin: "33ABCDE1234F1Z5", partyGstin: "29ABCDE1234F1Z5", taxable: 1000, igst: 180 });
  });
  it("an invoice for nobody's GSTIN is not guessed", () => {
    expect(proposeGstInvoice(read, ["27ZZZZZ1234F1Z5"], "g1", null).invoice).toBeNull();
  });
  it("re-uploading the same invoice updates, never duplicates", () => {
    const inv = proposeGstInvoice(read, ["33ABCDE1234F1Z5"], "g1", null).invoice!;
    const doc = { id: "d1", title: "x", docType: "invoice" as const, fieldLabels: [] };
    const once = commitIntake({ entities: [], assets: [], books: emptyBooks() }, { route: "gst", invoice: inv }, doc, "2026-05-03", () => "n");
    const twice = commitIntake(once, { route: "gst", invoice: { ...inv, id: "g2" } }, doc, "2026-05-03", () => "n");
    expect(twice.books.gstInvoices).toHaveLength(1);
  });
  it("tax statement credits are recorded once per document", () => {
    const doc = { id: "d2", title: "26AS", docType: "tax_statement" as const, fieldLabels: [] };
    const c = { route: "tax" as const, entityId: "personal", fy: "2025-26", salary: 900000, credits: [{ kind: "tds" as const, amount: 50000, source: "26AS" }] };
    let n = 0;
    const once = commitIntake({ entities: [], assets: [], books: emptyBooks() }, c, doc, "2026-05-03", () => `t${n++}`);
    const twice = commitIntake(once, c, doc, "2026-05-03", () => `t${n++}`);
    expect(twice.books.taxCredits).toHaveLength(1);
    expect(twice.books.salaryEvidence).toEqual([{ entityId: "personal", fy: "2025-26", amount: 900000, docId: "d2" }]);
    expect(proposeTaxStatement({ form: "26as", fy: "2025-26", pan: null, taxableSalary: null, credits: [] }, []).missing).toContain("PAN");
  });
});

import { suggestLinks } from "./intake";
describe("account and loan link suggestions", () => {
  it("links only on a unique masked account number", () => {
    const accs = [{ id: "a", lastFour: "4321" }, { id: "b", lastFour: "9999" }];
    expect(suggestLinks("Statement for A/c XXXX4321", accs, []).accountId).toBe("a");
    expect(suggestLinks("Total 4321 paid", accs, []).accountId).toBeNull();
    expect(suggestLinks("Mercedes GLS loan EMI", [], [{ id: "l", name: "Mercedes GLS" }]).loanId).toBe("l");
  });
});

import { calcValue, validateRule } from "./regulatory";
import type { RuleVersion } from "./types";
describe("approved rules feed calculations", () => {
  const rule = (value: string, status: RuleVersion["status"] = "active") => ({ id: "r", key: "cg.equity_months", area: "income_tax", value, effectiveFrom: "2024-07-23", publishedOn: "2024-07-23", sourceUrl: "https://incometaxindia.gov.in/x", status, tests: [] }) as unknown as RuleVersion;
  it("uses the approved value from its effective date, default before", () => {
    expect(calcValue([rule("24")], "cg.equity_months", "2026-03-31", 12)).toBe(24);
    expect(calcValue([rule("24")], "cg.equity_months", "2024-03-31", 12)).toBe(12);
  });
  it("a calculation rule with a non-numeric value fails validation", () => {
    expect(validateRule(rule("one year", "proposed")).some((t) => !t.passed)).toBe(true);
    expect(validateRule(rule("12", "proposed")).find((t) => t.name.startsWith("Calculation check"))?.passed).toBe(true);
  });
});

import { gstr1Json, gstr3bJson, validateGstJson } from "./gst";
describe("GST return files", () => {
  const inv = [{ id: "s", gstin: "33ABCDE1234F1Z5", kind: "sales", number: "S/1", date: "2026-05-04", party: "B", partyGstin: "29ABCDE1234F1Z5", taxable: 1000, igst: 180, cgst: 0, sgst: 0, cess: 0 }] as GstInvoice[];
  it("GSTR-1 file has the offline-tool layout and passes format checks", () => {
    const j = gstr1Json(inv, "33ABCDE1234F1Z5", "2026-05");
    expect(j.fp).toBe("052026");
    expect(j.b2b[0]!.inv[0]).toMatchObject({ inum: "S/1", idt: "04-05-2026", val: 1180, pos: "29" });
    expect(validateGstJson("GSTR-1", j as never)).toEqual([]);
  });
  it("GSTR-3B file carries outward tax", () => {
    const j = gstr3bJson(inv, "33ABCDE1234F1Z5", "2026-05");
    expect(j.sup_details.osup_det.iamt).toBe(180);
    expect(validateGstJson("GSTR-3B", { ...j, gstin: "bad" } as never)).toContain("gstin is not a valid GSTIN");
  });
});

import { parseDocQuery } from "./docrepo";
describe("plain-language document search", () => {
  it("reads type, company, amount and year", () => {
    const f = parseDocQuery("Krupa invoices above 1 lakh last year", [{ id: "k", name: "Krupa Traders" } as never], "2026-06-10");
    expect(f.types).toContain("invoice"); expect(f.entityId).toBe("k"); expect(f.min).toBe(100000);
    expect(f.from).toBe("2025-04-01"); expect(f.to).toBe("2026-03-31"); expect(f.words).toEqual([]);
  });
});
