import { describe, expect, it } from "vitest";
import { booksHeads, openingBalanceSheet } from "./fy";
import type { Asset } from "../assets";

const a = { id: "a1", name: "Machine", kind: "plant", cost: 120000, inUse: "2024-04-01", sharePct: 100, bookMethod: "slm", bookRatePct: 10, ownerEntityId: "e1" } as unknown as Asset;

describe("opening fixed assets, depreciation and reserves", () => {
  it("register cost and accumulated depreciation feed the opening comparison", () => {
    const h = booksHeads({ accounts: [], txns: [], assets: [a, { ...a, id: "a2", ownerEntityId: "other" }], accountIds: new Set(), entityId: "e1", fyEnd: "2026-03-31", fy: "2025-26" });
    expect(h.fixedAssets).toBe(120000);
    expect(h.accumulatedDepreciation).toBeGreaterThan(0);
    expect(h.accumulatedDepreciation).toBeLessThan(120000);
  });
  it("net fixed assets net off depreciation and reserves are required to balance", () => {
    const rec = { id: "r", entityId: "e1", fy: "2025-26", audited: { bank: 50000, fixedAssets: 120000, accumulatedDepreciation: 24000, capitalReserves: 146000 }, schedules: [], qualifications: [], filedReturns: [], lossesCarriedForward: [], docIds: [] } as never;
    const bs = openingBalanceSheet(rec);
    expect(bs.netFixedAssets).toBe(96000);
    expect(bs.balanced).toBe(true);
    const noReserves = openingBalanceSheet({ ...(rec as object), audited: { bank: 50000, fixedAssets: 120000, accumulatedDepreciation: 24000 } } as never);
    expect(noReserves.balanced).toBe(false);
    expect(noReserves.missing).toContain("capitalReserves");
  });
});
