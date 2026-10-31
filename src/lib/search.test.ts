import { describe, expect, it } from "vitest";
import { parseQuery, searchAll, type SearchData } from "./search";

const today = "2026-10-31";
const data = (over: Partial<SearchData>): SearchData => ({
  transactions: [], accounts: [], commitments: [], loans: [], documents: [], goals: [], ...over,
});

describe("parseQuery", () => {
  it("reads amounts, ranges and payment methods from natural language", () => {
    const p = parseQuery("Find payments above ₹25,000 using AMEX", today);
    expect(p.minAmount).toBe(25000);
    expect(p.paymentMethod).toBe("credit_card");
  });
  it("reads 'last six months' as a date range ending today", () => {
    const p = parseQuery("Show all hotel expenses from the last six months", today);
    expect(p.dateTo).toBe(today);
    expect(p.dateFrom).toBe("2026-05-03");
    expect(p.text).toContain("hotel");
  });
  it("reads tags and pending status", () => {
    const p = parseQuery("Show expenses tagged MOVAC", today);
    expect(p.tag).toBe("movac");
    const p2 = parseQuery("Find all pending reimbursements", today);
    expect(p2.status).toBe("pending");
    expect(p2.kinds).toContain("reimbursement");
  });
});

describe("searchAll", () => {
  const txns = [
    { id: "t1", title: "Taj Hotel stay", merchant: "Taj", category: "Travel", amount: 30000, date: "2026-08-10", txnType: "expense" as const, paymentMethod: "credit_card", tags: ["Organisation: MOVAC"] },
    { id: "t2", title: "Swiggy dinner", merchant: "Swiggy", category: "Food", amount: 800, date: "2026-10-20", txnType: "expense" as const, paymentMethod: "upi", tags: [] },
    { id: "t3", title: "Flight claim", merchant: "IndiGo", category: "Travel", amount: 12000, date: "2026-09-05", txnType: "expense" as const, paymentMethod: "credit_card", tags: [], reimbursementStatus: "pending" },
  ];

  it("finds hotel expenses from the last six months", () => {
    const hits = searchAll("Show all hotel expenses from the last six months", data({ transactions: txns }), today);
    expect(hits.map((h) => h.id)).toEqual(["t1"]);
  });

  it("finds payments above ₹25,000 using AMEX", () => {
    const hits = searchAll("Find payments above ₹25,000 using AMEX", data({ transactions: txns }), today);
    expect(hits.map((h) => h.id)).toEqual(["t1"]);
  });

  it("finds expenses tagged MOVAC", () => {
    const hits = searchAll("Show expenses tagged MOVAC", data({ transactions: txns }), today);
    expect(hits.map((h) => h.id)).toEqual(["t1"]);
  });

  it("finds pending reimbursements only", () => {
    const hits = searchAll("Find all pending reimbursements", data({ transactions: txns }), today);
    expect(hits.map((h) => h.id)).toEqual(["t3"]);
  });

  it("finds payments to a particular merchant", () => {
    const hits = searchAll("Show all payments made to Swiggy", data({ transactions: txns }), today);
    expect(hits.map((h) => h.id)).toEqual(["t2"]);
  });

  it("searches documents by recognised text", () => {
    const docs = [{ id: "d1", title: "Health insurance policy", docType: "insurance", merchant: "Star Health", amount: 24000, docDate: "2026-01-15", text: "Policy number SH-123 sum insured 500000 premium due annually" }];
    const hits = searchAll("Find my insurance documents", data({ documents: docs }), today);
    expect(hits.map((h) => h.id)).toEqual(["d1"]);
    const byText = searchAll("Find document SH-123", data({ documents: docs }), today);
    expect(byText.map((h) => h.id)).toEqual(["d1"]);
  });

  it("finds recurring payments due next month", () => {
    const commitments = [
      { id: "c1", name: "Netflix", kind: "subscription" as const, direction: "out" as const, amount: 649, frequency: "monthly" as const, intervalDays: null, nextDue: "2026-11-15", accountId: null, category: "Entertainment", confirmed: true, essential: false, status: "active" as const },
      { id: "c2", name: "Gym", kind: "subscription" as const, direction: "out" as const, amount: 2000, frequency: "monthly" as const, intervalDays: null, nextDue: "2026-12-01", accountId: null, category: "Health", confirmed: true, essential: false, status: "active" as const },
    ];
    const hits = searchAll("Show recurring payments due next month", data({ commitments }), today);
    expect(hits.map((h) => h.id)).toEqual(["c1"]);
  });

  it("returns nothing for an empty query and caps results", () => {
    expect(searchAll("", data({ transactions: txns }), today)).toEqual([]);
  });
});
