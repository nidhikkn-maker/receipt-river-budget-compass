// KK decision (11 Nov 2026): decimal-safe money on the shared reimbursement and claim paths, plus
// receipt-reading precision. Each "fails on 000ac2d2" case below produced a real wrong figure with
// binary floating point (Math.round(n * 100) / 100 or raw `+=`); the guards pin results that were
// already right for exact-paise input so the decimal conversion cannot change them.
import { describe, expect, it } from "vitest";
import { outstandingOf, receivedOf, reimbursableOf, reimbursementSummary, stageOf } from "./reimbursements";
import { applyAdvance, buildClaim, type Claim } from "./expense-claim";
import { claimCategoryTotals } from "./claim-pdf";
import { buildStatement } from "./expenditure-statement";
import { emptyReimbursementSettings, organisationStatement } from "./reimbursement-profiles";
import { travelReport } from "./travel-reports";
import type { Expense } from "./expenses";
import type { TravelTrip } from "./travel";

const claimEntry = (id: string, amount: number, reimbursement: Expense["reimbursement"] = {}, x: Partial<Expense> = {}) =>
  ({ id, title: id, amount, date: "2026-11-01", reimbursementStatus: "pending", reimbursement: { stage: "submitted", ...reimbursement }, ...x }) as Expense;

describe("reimbursements.ts: one half-up rounding at the paise boundary", () => {
  it("fails on 000ac2d2: a ₹1234.245 claimable amount rounds half-up to 1234.25, not 1234.24", () => {
    expect(reimbursableOf(claimEntry("a", 2000, { reimbursable: 1234.245 }))).toBe(1234.25);
  });
  it("fails on 000ac2d2: a ₹1.005 claimable amount is 1.01, not 1.00", () => {
    expect(reimbursableOf(claimEntry("a", 5, { reimbursable: 1.005 }))).toBe(1.01);
  });
  it("fails on 000ac2d2: outstanding after a partial receipt carries the correct paise", () => {
    expect(outstandingOf(claimEntry("a", 2000, { reimbursable: 1234.245, receipts: [{ id: "r", date: "2026-11-02", amount: 1000 }] }))).toBe(234.25);
  });
  it("guard: ₹1234.565 already rounded to 1234.57 under binary floating point (no failing case on this value)", () => {
    expect(reimbursableOf(claimEntry("a", 2000, { reimbursable: 1234.565 }))).toBe(1234.57);
  });
  it("guard: ₹1234.56, ₹1234.50 and exact-paise partial receipts stay exact", () => {
    const e = claimEntry("a", 1234.56, { receipts: [{ id: "r1", date: "2026-11-02", amount: 0.1 }, { id: "r2", date: "2026-11-03", amount: 0.2 }] });
    expect(reimbursableOf(e)).toBe(1234.56);
    expect(receivedOf(e)).toBe(0.3);
    expect(outstandingOf(e)).toBe(1234.26);
    expect(stageOf(e)).toBe("partial");
    expect(reimbursableOf(claimEntry("b", 1234.5))).toBe(1234.5);
  });
  it("guard: partial receipts of 0.1 + 0.2 fully settle a ₹0.30 claim", () => {
    expect(stageOf(claimEntry("a", 0.3, { receipts: [{ id: "r1", date: "2026-11-02", amount: 0.1 }, { id: "r2", date: "2026-11-03", amount: 0.2 }] }))).toBe("received");
  });
  it("guard: a summary over many small exact-paise claims (100 × ₹0.10, 3 × ₹33.33) is exact", () => {
    const list = [...Array.from({ length: 100 }, (_, i) => claimEntry(`s${i}`, 0.1, { payer: "AET" })), ...[1, 2, 3].map((i) => claimEntry(`t${i}`, 33.33, { payer: "MOVAC" }))];
    const s = reimbursementSummary(list, "2026-11-11");
    expect(s).toMatchObject({ count: 103, gross: 109.99, reimbursable: 109.99, outstanding: 109.99, received: 0, netPersonalCost: 0 });
    expect(s.byPayer).toEqual({ AET: 10, MOVAC: 99.99 });
  });
});

const claimOf = (items: { category: string; eligible: number; reimbursed: number; claimed: number }[]): Claim =>
  ({ items: items.map((x, i) => ({ ...x, claimNo: i + 1, billRef: "-", inr: x.eligible })), totals: { eligible: 0, received: 0, claimed: 0 } }) as unknown as Claim;

describe("expense-claim.ts and claim-pdf.ts", () => {
  it("fails on 000ac2d2: Summary + Bills category totals are exact (0.1 + 0.2 = 0.30, 0.7 + 0.1 = 0.80)", () => {
    const totals = claimCategoryTotals(claimOf([
      { category: "Meals", eligible: 0.1, reimbursed: 0.7, claimed: 0.1 }, { category: "Meals", eligible: 0.2, reimbursed: 0.1, claimed: 0.2 },
    ]));
    expect(totals).toEqual([{ category: "Meals", count: 2, eligible: 0.3, received: 0.8, claimed: 0.3, bills: [] }]);
  });
  it("guard: 3 × ₹33.33 shares total 99.99 in the category summary", () => {
    expect(claimCategoryTotals(claimOf([1, 2, 3].map(() => ({ category: "Hotels", eligible: 33.33, reimbursed: 0, claimed: 33.33 }))))[0]).toMatchObject({ claimed: 99.99, eligible: 99.99 });
  });
  it("fails on 000ac2d2: an advance of ₹1.005 applies as 1.01 (half-up), leaving 9.00 payable", () => {
    const c = { totals: { eligible: 10.01, received: 0, claimed: 10.01 } } as Claim;
    expect(applyAdvance(c, 1.005, 100).totals).toMatchObject({ advanceApplied: 1.01, payable: 9 });
  });
  it("guard: exact-paise advances and caps are unchanged", () => {
    const c = { totals: { eligible: 0.3, received: 0, claimed: 0.3 } } as Claim;
    expect(applyAdvance(c, 0.1, 0.2).totals).toMatchObject({ advanceApplied: 0.1, payable: 0.2 });
    expect(() => applyAdvance(c, 0.31, 1)).toThrow(/cannot exceed the amount claimed/);
    expect(() => applyAdvance(c, 0.21, 0.2)).toThrow(/advance still unapplied/);
  });
});

const base = { title: "Item", merchant: "Shop", category: "Hotels", scope: "business", memberId: null, splits: [], currency: "INR", fxRate: 1, paymentMethod: "upi", accountId: "bank", reconciledAt: null, statementRef: null, description: "", receipts: [], tags: [], date: "2026-10-10" } as const;
const entry = (id: string, amount: number, x: Partial<Expense> = {}) => ({ ...base, id, amount, originalAmount: amount, ...x }) as Expense;
const statement = (entries: Expense[]) => buildStatement({ subject: { kind: "entries", ids: entries.map((e) => e.id) }, subjectName: "Test", entries, trips: [], accounts: [{ id: "bank", name: "Bank", kind: "savings", archived: false, openingBalance: 0 }], instruments: [], memberName: () => "You", today: "2026-11-11", reference: "LL-DES-TEST" });

describe("expenditure-statement.ts", () => {
  it("fails on 000ac2d2: a ₹1234.245 claimable amount reaches the statement as 1234.25 eligible", () => {
    const s = statement([entry("a", 2000, { reimbursementStatus: "pending", reimbursement: { reimbursable: 1234.245 } })]);
    expect(s.rows[0]).toMatchObject({ eligible: 1234.25, outstanding: 1234.25 });
    expect(s.summary.eligible).toBe(1234.25);
  });
  it("fails on 000ac2d2: line items 0.40 short of a USD 150.40 bill are not shown as reconciling", () => {
    const s = statement([entry("usd", 12500, { currency: "USD", originalAmount: 150.4, fxRate: 83.11, receiptDetails: { items: [{ name: "Room", quantity: 1, amount: 100 }, { name: "Dinner", quantity: 1, amount: 50 }] } })]);
    expect(s.rows[0]!.itemsReconcile).toBe(false);
    expect(s.rows[0]!.original).toBe(150.4);
  });
  it("guard: exact items, refunds (partial) and many small amounts total exactly", () => {
    const s = statement([
      entry("hotel", 1234.56, { receiptDetails: { items: [{ name: "Room", quantity: 1, amount: 1000 }, { name: "Food", quantity: 1, amount: 234.56 }] } }),
      entry("refund", 234.56, { txnType: "refund" }),
      ...Array.from({ length: 10 }, (_, i) => entry(`m${i}`, 0.1)),
    ]);
    expect(s.rows[0]!.itemsReconcile).toBe(true);
    expect(s.summary.total).toBe(1001);
    expect(s.sources).toEqual([{ source: "Bank", total: 1001 }]);
    expect(s.workspaces).toEqual([{ workspace: "Business", total: 1001 }]);
  });
});

describe("reimbursement-profiles.ts organisation apportionment", () => {
  it("fails on 000ac2d2: ₹2.01 shared equally gives the first organisation 1.01 (half-up) and the remainder 1.00", () => {
    const e = entry("e", 4.02, { reimbursementStatus: "pending", reimbursement: { reimbursable: 2.01 } });
    const s = { ...emptyReimbursementSettings(), responsibilities: [{ entryId: "e", shares: [{ organisation: "AET", amount: 2.01 }, { organisation: "MOVAC", amount: 2.01 }] }] };
    const [aet, movac] = ["AET", "MOVAC"].map((o) => organisationStatement(statement([e]), [e], s, o).rows[0]!);
    expect([aet!.eligible, movac!.eligible]).toEqual([1.01, 1]);
    expect(buildClaim(organisationStatement(statement([e]), [e], s, "AET"), {} as never).totals.claimed).toBe(1.01);
  });
  it("guard: 3 × ₹33.33 organisation shares reconcile to the entry", () => {
    const e = entry("e", 99.99, { reimbursementStatus: "pending", reimbursement: {} });
    const s = { ...emptyReimbursementSettings(), responsibilities: [{ entryId: "e", shares: ["A", "B", "C"].map((organisation) => ({ organisation, amount: 33.33 })) }] };
    expect(["A", "B", "C"].map((o) => organisationStatement(statement([e]), [e], s, o).rows[0]!.eligible)).toEqual([33.33, 33.33, 33.33]);
  });
});

describe("travel-reports.ts traveller shares (multi-currency)", () => {
  const trip: TravelTrip = { id: "t", name: "Dubai", destination: "Dubai", start: "2026-11-01", end: "2026-11-03", budget: 0, currencies: ["USD"] };
  const opts = { memberName: (id: string | null) => id ?? "Me", accountName: () => "Card" };
  it("fails on 000ac2d2: a USD 2.00 bill posted at ₹2.01 splits 1.01 / 1.00 (half-up first share, remainder last)", () => {
    const row = { id: "e", date: "2026-11-02", amount: 2.01, originalAmount: 2, currency: "USD", fxRate: 1.005, category: "Meals", title: "Tea", tags: ["Trip: Dubai"], splits: [{ memberId: null, amount: 1 }, { memberId: "Asha", amount: 1 }] };
    const r = travelReport("traveller", [trip], [row] as never, opts);
    expect(r.rows.slice(0, 2)).toEqual([["Me", "1.01", "50.25"], ["Asha", "1.00", "49.75"]]);
    expect(r.rows.at(-1)).toEqual(["Total", "2.01", "100.00"]);
  });
  it("guard: planned totals over fractional budgets stay exact", () => {
    const planned = travelReport("planned", [{ ...trip, budget: 0.1, contingency: 0.2 }], [], opts);
    expect(planned.rows.at(-1)?.[1]).toBe("0.30");
  });
});
