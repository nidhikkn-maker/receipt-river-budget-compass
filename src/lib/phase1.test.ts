import { describe, expect, it } from "vitest";
import { allocateByPercent, budgetUsage, categoryTotals, validateAllocations, type Expense } from "./expenses";
import { outstandingOf, reimbursementSummary, stageOf, statusColumn, validateReceipt } from "./reimbursements";
import { accountFreshness, discrepancy, inboxCounts, inboxItems } from "./inbox";
import { healthScore } from "./health";
import { monthlyReview, reviewHash } from "./monthly-review";
import { defaultPreferences } from "./preferences";
import type { Account } from "./ledger";

const ex = (o: Partial<Expense>): Expense => ({ id: crypto.randomUUID(), title: "Item", merchant: null, category: "Groceries", scope: "personal", memberId: null, splits: [], amount: 100, currency: "INR", originalAmount: 100, fxRate: 1, paymentMethod: "upi", reconciledAt: null, statementRef: null, date: "2026-10-10", description: "", receipts: [], txnType: "expense", accountId: "a1", ...o });
const bank: Account = { id: "a1", name: "HDFC", kind: "savings", openingBalance: 10000, archived: false };
const prefs = defaultPreferences();

describe("category splits", () => {
  it("₹15,000 split must total exactly ₹15,000", () => {
    expect(() => validateAllocations([{ category: "Groceries", amount: 13000 }, { category: "Gifts", amount: 1000 }], 15000)).toThrow();
    expect(() => validateAllocations([{ category: "Groceries", amount: 13000 }, { category: "Gifts", amount: 2000 }], 15000)).not.toThrow();
  });
  it("percent split keeps the exact total", () => {
    const l = allocateByPercent(1000, [{ category: "A", pct: 33.33 }, { category: "B", pct: 33.33 }, { category: "C", pct: 33.34 }]);
    expect(l.reduce((s, x) => s + x.amount, 0)).toBe(1000);
  });
  it("a split transaction counts once, through its lines", () => {
    const t = categoryTotals([ex({ amount: 15000, category: "Shopping", allocations: [{ category: "Groceries", amount: 13000 }, { category: "Gifts", amount: 2000 }] })]);
    expect(t).toEqual({ Groceries: 13000, Gifts: 2000 });
    expect(budgetUsage([ex({ amount: 15000, category: "Shopping", allocations: [{ category: "Groceries", amount: 13000 }, { category: "Gifts", amount: 2000 }] })], { Groceries: 12000 }, "2026-10").find((b) => b.category === "Groceries")?.spent).toBe(13000);
  });
});

describe("reimbursements", () => {
  it("partial receipts leave the rest outstanding", () => {
    const e = ex({ amount: 5000, reimbursementStatus: "pending", reimbursement: { stage: "submitted", reimbursable: 4000, payer: "VEI", receipts: [{ id: "r1", date: "2026-10-20", amount: 1500 }] } });
    expect(stageOf(e)).toBe("partial");
    expect(outstandingOf(e)).toBe(2500);
    expect(statusColumn(e)).toBe("pending");
    expect(() => validateReceipt(e, 3000)).toThrow();
  });
  it("fully received and written-off claims are not outstanding", () => {
    expect(stageOf(ex({ amount: 1000, reimbursementStatus: "pending", reimbursement: { receipts: [{ id: "x", date: "2026-10-11", amount: 1000 }] } }))).toBe("received");
    const w = ex({ amount: 800, reimbursementStatus: "pending", reimbursement: { stage: "written_off" } });
    expect(outstandingOf(w)).toBe(0);
    expect(statusColumn(w)).toBe("none");
  });
  it("net personal cost excludes what is reimbursable", () => {
    const s = reimbursementSummary([ex({ amount: 5000, reimbursementStatus: "pending", reimbursement: { reimbursable: 4000, payer: "VEI" } })], "2026-10-31");
    expect(s.netPersonalCost).toBe(1000);
    expect(s.byPayer["VEI"]).toBe(4000);
  });
});

describe("freshness and discrepancies", () => {
  it("14-day review and 45-day outdated thresholds", () => {
    const t = [ex({ reconciledAt: "2026-10-01T10:00:00Z" })];
    expect(accountFreshness(bank, t, prefs, "2026-10-10").status).toBe("current");
    expect(accountFreshness(bank, t, prefs, "2026-10-30").status).toBe("needs_review");
    expect(accountFreshness(bank, t, prefs, "2026-12-01").status).toBe("outdated");
  });
  it("shows the difference without creating entries", () => {
    const p = { ...prefs, statementBalances: { a1: { balance: 9500, date: "2026-10-31" } } };
    const d = discrepancy(bank, [ex({ amount: 100 })], p);
    expect(d.recordedBalance).toBe(9900);
    expect(d.difference).toBe(-400);
  });
});

describe("inbox", () => {
  it("flags duplicates once and drops dismissed items", () => {
    const a = ex({ merchant: "Swiggy" }), b = ex({ merchant: "Swiggy" });
    const items = inboxItems({ transactions: [a, b], accounts: [bank], commitments: [], prefs, today: "2026-10-12", pendingCount: 0 });
    const dups = items.filter((x) => x.type === "duplicate");
    expect(dups).toHaveLength(1);
    expect(inboxCounts(items, [dups[0]!.key]).open.some((x) => x.type === "duplicate")).toBe(false);
  });
  it("resolves automatically when the category is fixed", () => {
    const run = (cat: string) => inboxItems({ transactions: [ex({ category: cat })], accounts: [], commitments: [], prefs, today: "2026-10-12", pendingCount: 0 }).filter((x) => x.type === "uncategorised").length;
    expect(run("Miscellaneous")).toBe(1);
    expect(run("Groceries")).toBe(0);
  });
});

describe("health score", () => {
  it("refuses to score with too little data", () => {
    expect(healthScore({ accounts: [], transactions: [], commitments: [], emis: 0, budgets: {}, asOf: "2026-10-31" }).score).toBeNull();
  });
  it("weights components 25/25/20/15/15", () => {
    const tx = ["07", "08", "09"].flatMap((m) => [ex({ txnType: "income", amount: 100000, date: `2026-${m}-01`, category: "Salary" }), ex({ amount: 50000, date: `2026-${m}-05` })]);
    const r = healthScore({ accounts: [{ ...bank, openingBalance: 300000 }], transactions: tx, commitments: [], emis: 10000, budgets: {}, asOf: "2026-10-15" });
    expect(r.components.map((c) => c.weight)).toEqual([25, 25, 20, 15, 15]);
    expect(r.complete).toBe(false);
    expect(r.score).not.toBeNull();
  });
});

describe("monthly review", () => {
  it("totals the month and changes hash when records change", () => {
    const base = { month: "2026-10", accounts: [bank], commitments: [], budgets: {}, goals: [], loans: [], today: "2026-11-02" };
    const r = monthlyReview({ ...base, transactions: [ex({ amount: 300 }), ex({ txnType: "income", amount: 1000, category: "Salary" })] });
    expect(r.income).toBe(1000); expect(r.expenditure).toBe(300); expect(r.netCashFlow).toBe(700);
    const r2 = monthlyReview({ ...base, transactions: [ex({ amount: 350 }), ex({ txnType: "income", amount: 1000, category: "Salary" })] });
    expect(reviewHash(r)).not.toBe(reviewHash(r2));
  });
});
