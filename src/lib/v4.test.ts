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
