import { describe, expect, it } from "vitest";
import { buildShares, suggestWorkspace, validateShares, workspaceParts, workspaceTotals } from "./workspaces";
import { closeBlockers, tripFinance, validateBooking, type TravelTrip } from "./travel";
import { totalsByScope, type Expense } from "./expenses";

describe("workspace allocation", () => {
  it("splits ₹60,000 hotel 36k business / 24k family and counts it once", () => {
    const shares = buildShares(60000, "percent", [{ workspace: "business", value: 60 }, { workspace: "family", value: 40 }]);
    expect(shares).toEqual([{ workspace: "business", amount: 36000 }, { workspace: "family", amount: 24000 }]);
    expect(validateShares(shares, 60000)).toBeNull();
    const t = workspaceTotals([{ scope: "business", amount: 60000, originalAmount: 60000, workspaceAllocations: shares }]);
    expect(t.business).toBe(36000); expect(t.family).toBe(24000); expect(t.total).toBe(60000);
  });
  it("rejects shares that don't add up", () => expect(validateShares([{ workspace: "business", amount: 30000 }, { workspace: "family", amount: 20000 }], 60000)).toMatch(/add up/));
  it("equal split absorbs rounding", () => expect(buildShares(100, "equal", [{ workspace: "personal", value: 0 }, { workspace: "family", value: 0 }, { workspace: "business", value: 0 }]).reduce((s, x) => s + x.amount, 0)).toBe(100));
  it("converts foreign-currency shares with the stored rate", () => expect(workspaceParts({ scope: "business", amount: 8300, originalAmount: 100, workspaceAllocations: [{ workspace: "business", amount: 75 }, { workspace: "personal", amount: 25 }] })).toEqual([{ workspace: "business", amount: 6225 }, { workspace: "personal", amount: 2075 }]));
  it("scope totals use allocations without double counting", () => {
    const t = totalsByScope([{ scope: "business", amount: 1000, originalAmount: 1000, workspaceAllocations: [{ workspace: "business", amount: 600 }, { workspace: "personal", amount: 400 }] } as unknown as Expense]);
    expect(t).toMatchObject({ business: 600, personal: 400, total: 1000 });
  });
});

describe("workspace suggestions", () => {
  it("organisation tag suggests business confidently", () => expect(suggestWorkspace({ tags: ["Organisation: MOVAC"] }, []).confidence).toBe("high"));
  it("mixed merchant history asks for review", () => {
    const h = [{ merchant: "Taj", scope: "business" as const }, { merchant: "Taj", scope: "family" as const }, { merchant: "Taj", scope: "business" as const }];
    expect(suggestWorkspace({ merchant: "taj" }, h)).toMatchObject({ workspace: "business", confidence: "review" });
  });
  it("unknown is unclassified", () => expect(suggestWorkspace({ merchant: "New" }, []).confidence).toBe("none"));
});

describe("travel", () => {
  const base: TravelTrip = { id: "t", name: "Dubai", destination: "", start: "2026-12-01", end: "2026-12-05", budget: 100000, currencies: ["INR"] };
  const txn = { id: "e1", date: "2026-12-02", amount: 20000, title: "Hotel", tags: ["Trip: Dubai"], txnType: "expense", scope: "business", currency: "INR", originalAmount: 20000, fxRate: 1 };
  it("unpaid bookings are committed, not spent", () => {
    const f = tripFinance({ ...base, bookings: [{ id: "b", kind: "flight", provider: "Emirates", ref: "X", date: "2026-11-01", amount: 30000, status: "unpaid" }] }, [txn] as never);
    expect(f.total).toBe(20000); expect(f.committed).toBe(30000); expect(f.projected).toBe(50000);
  });
  it("advance compared with business share, not counted as income", () => expect(tripFinance({ ...base, advances: [{ id: "a", date: "2026-11-30", amount: 25000, source: "MOVAC" }] }, [txn] as never).advanceBalance).toBe(5000));
  it("cannot close with unpaid bookings", () => expect(closeBlockers({ ...base, bookings: [{ id: "b", kind: "hotel", provider: "H", ref: "", date: "2026-12-01", amount: 1, status: "unpaid" }] }, []).length).toBe(1));
  it("paid booking must link an entry", () => expect(() => validateBooking({ id: "b", kind: "hotel", provider: "H", ref: "", date: "2026-12-01", amount: 1, status: "paid" })).toThrow());
});

import { bookingMatches, travelCategory, tripReportRows, tripsForDate } from "./travel";
describe("travel intelligence", () => {
  const t: TravelTrip = { id: "t", name: "Goa", destination: "", start: "2026-12-01", end: "2026-12-05", budget: 0, currencies: ["INR"], bookings: [{ id: "b", kind: "hotel", provider: "Taj", ref: "", date: "2026-11-20", amount: 10000, status: "unpaid" }] };
  it("offers a single clear booking match only", () => {
    expect(bookingMatches(t, [{ id: "e", date: "2026-11-22", amount: 10100, txnType: "expense" }] as never)).toEqual([{ bookingId: "b", entryId: "e" }]);
    expect(bookingMatches(t, [{ id: "e", date: "2026-11-22", amount: 10000 }, { id: "f", date: "2026-11-21", amount: 10000 }] as never)).toEqual([]);
  });
  it("suggests trips only for covered dates and open trips", () => { expect(tripsForDate([t], "2026-12-03")).toHaveLength(1); expect(tripsForDate([{ ...t, closedAt: "x" }], "2026-12-03")).toHaveLength(0); });
  it("guesses travel categories", () => { expect(travelCategory("IndiGo 6E")).toBe("Flights"); expect(travelCategory("Random shop")).toBeNull(); });
  it("report separates spent and unpaid booked", () => { const r = tripReportRows(t, []); expect(r.find((x) => x[0] === "Total booked unpaid")![6]).toBe("10000"); expect(r.find((x) => x[0] === "Total spent")![6]).toBe("0"); });
});

import { accountBalance, cashflow, type Account } from "./ledger";
describe("distinct money movement types", () => {
  const bank: Account = { id: "b", name: "Bank", kind: "savings", openingBalance: 100000, archived: false };
  const card: Account = { id: "c", name: "AMEX", kind: "credit_card", openingBalance: 20000, archived: false };
  const inv: Account = { id: "i", name: "MF", kind: "investment", openingBalance: 0, archived: false };
  const t = [
    { id: "1", txnType: "card_payment" as const, amount: 20000, accountId: "b", toAccountId: "c", date: "2026-10-01" },
    { id: "2", txnType: "investment" as const, amount: 10000, accountId: "b", toAccountId: "i", date: "2026-10-02" },
    { id: "3", txnType: "advance" as const, amount: 25000, accountId: "b", date: "2026-10-03" },
    { id: "4", txnType: "advance_settlement" as const, amount: 5000, accountId: "b", date: "2026-10-10" },
  ];
  it("card payment clears the card once and isn't spending", () => { expect(accountBalance(card, t)).toBe(0); expect(cashflow(t).spent).toBe(0); });
  it("investment moves money into the investment account", () => expect(accountBalance(inv, t)).toBe(10000));
  it("advances change the balance but are not income", () => { expect(accountBalance(bank, t)).toBe(90000); expect(cashflow(t).income).toBe(0); });
});
