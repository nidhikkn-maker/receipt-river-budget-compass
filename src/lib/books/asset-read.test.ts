import { describe, expect, it } from "vitest";
import { proposeAsset } from "./intake";

const base = { name: "Laptop", kind: "computer" as const, owner: null, cost: 120000, purchaseDate: "2026-04-10", supplier: null, warrantyUntil: null, insurance: null, serial: null };

describe("asset documents fill printed depreciation facts", () => {
  it("uses printed put-to-use date, life and residual and stops asking for them", () => {
    const p = proposeAsset({ ...base, putToUseOn: "2026-04-15", usefulLifeYears: 3, residualPct: 5, method: "wdv" }, [], "a1", null);
    expect(p.asset?.inUse).toBe("2026-04-15");
    expect(p.asset?.usefulLifeYears).toBe(3);
    expect(p.asset?.residualPct).toBe(5);
    expect(p.missing).not.toContain("useful life");
  });
  it("still asks when they are not printed", () => {
    const p = proposeAsset(base, [], "a1", null);
    expect(p.missing).toEqual(expect.arrayContaining(["date put to use (confirm)", "useful life", "residual value"]));
  });
});
