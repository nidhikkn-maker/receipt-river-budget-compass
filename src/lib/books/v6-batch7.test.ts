import { describe, expect, it } from "vitest";
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
