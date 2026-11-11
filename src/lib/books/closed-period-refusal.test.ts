import { describe, expect, it } from "vitest";
import type { Asset } from "@/lib/assets";
import { assetRegisterStart, closedAssetRefusalMessage, closedPeriodRefusalMessage, isClosedPeriodRefusal, overlappingClosedPeriod } from "./closed-period-refusal";

const DB = "assets financial facts overlap a closed period; reopen it first";
const closed = [
  { id: "b", from: "2026-04-01", to: "2026-09-30", closedOn: "2026-10-05", note: "" },
  { id: "a", from: "2025-04-01", to: "2026-03-31", closedOn: "2026-05-01", note: "" },
];
const asset = (id: string, d: Partial<Asset>): Asset => ({ id, name: id, kind: "other", cost: 1000, inUse: "2026-10-10", sharePct: 100, bookMethod: "slm", bookRatePct: 0, ...d } as Asset);

describe("0069 closed-period refusal wording (R-E-I17)", () => {
  it("recognises only the 0069 register refusal (Error, PostgREST-like object or text)", () => {
    expect(isClosedPeriodRefusal(new Error(DB))).toBe(true);
    expect(isClosedPeriodRefusal({ message: "leases financial facts overlap a closed period; reopen it first", code: "23514" })).toBe(true);
    expect(isClosedPeriodRefusal("Closed period definition cannot be changed; reopen it first")).toBe(false);
    expect(isClosedPeriodRefusal(new Error("Network error"))).toBe(false);
    expect(isClosedPeriodRefusal(null)).toBe(false);
  });
  it("uses 0069's start date (purchaseDate, then capitalisedOn, then inUse) and its overlap rule", () => {
    expect(assetRegisterStart({ inUse: "2026-10-10", purchaseDate: undefined, capitalisedOn: "2026-05-01" })).toBe("2026-05-01");
    expect(assetRegisterStart({ inUse: "2026-10-10", purchaseDate: "2025-12-01" })).toBe("2025-12-01");
    // an open-ended asset record reaches every period ending on or after its start: the earliest one is named
    expect(overlappingClosedPeriod(closed, "2025-12-01")?.id).toBe("a");
    expect(overlappingClosedPeriod(closed, "2026-10-01")).toBeNull();
    expect(overlappingClosedPeriod(closed, "2024-01-01", "2024-12-31")).toBeNull();
    expect(overlappingClosedPeriod(closed, "2026-03-01", "2026-05-01")?.id).toBe("a");
  });
  it("names the period reached by the new or changed asset, or says closed period without one", () => {
    const before = [asset("old", { purchaseDate: "2025-06-01" })];
    const after = [...before, asset("new", { purchaseDate: "2026-07-01" })];
    expect(closedAssetRefusalMessage(new Error(DB), closed, before, after)).toBe("This date is in a closed period (2026-04-01 to 2026-09-30); an authorised accounting adjustment is needed, or the period reopened with a written reason. The record was not saved.");
    expect(closedPeriodRefusalMessage(new Error(DB), [], "2026-07-01")).toBe("This date is in a closed period; an authorised accounting adjustment is needed, or the period reopened with a written reason. The record was not saved.");
    expect(closedAssetRefusalMessage(new Error("timeout"), closed, before, after)).toBeNull();
  });
});
