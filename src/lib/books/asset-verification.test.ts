import { describe, expect, it } from "vitest";
import type { Asset } from "../assets";
import { matchAssetLabel, physicalCheck } from "./asset-verification";

const asset: Asset = { id: "asset-1", tag: "LAPTOP-001", name: "Office laptop", kind: "computer", cost: 120000, inUse: "2026-04-01", sharePct: 100, bookMethod: "slm", bookRatePct: 20 };
describe("physical asset checks", () => {
  it("resolves existing QR labels and plain barcodes by exact tag or id", () => {
    expect(matchAssetLabel("LEDGERLINE-ASSET:LAPTOP-001", [asset])).toEqual({ ok: true, asset });
    expect(matchAssetLabel(" LAPTOP-001 ", [asset])).toEqual({ ok: true, asset });
    expect(matchAssetLabel("LEDGERLINE-ASSET:asset-1", [asset])).toEqual({ ok: true, asset });
    expect(matchAssetLabel("laptop-001", [asset]).ok).toBe(false);
  });
  it("refuses unknown and ambiguous labels without choosing an asset", () => {
    expect(matchAssetLabel("unknown", [asset]).ok).toBe(false);
    expect(matchAssetLabel("LAPTOP-001", [asset, { ...asset, id: "asset-2" }]).ok).toBe(false);
    expect(matchAssetLabel("", [asset]).ok).toBe(false);
  });
  it("refuses disposed assets both at resolution and confirmation", () => {
    const sold = { ...asset, soldOn: "2026-10-01" };
    expect(matchAssetLabel("LAPTOP-001", [sold]).ok).toBe(false);
    expect(() => physicalCheck(sold, "2026-11-05", "ok", "", "check-1")).toThrow();
  });
  it("records the confirmed date and condition without changing financial fields", () => {
    const r = physicalCheck({ ...asset, condition: "missing" }, "2026-11-05", "ok", " Located in office ", "check-1");
    expect(r.asset).toEqual({ ...asset, lastVerified: "2026-11-05", condition: "ok" });
    expect(r.event).toEqual({ id: "check-1", assetId: "asset-1", date: "2026-11-05", kind: "verified", note: "Located in office", applied: true });
    expect(asset.lastVerified).toBeUndefined();
  });
  it("retains damaged and missing findings on the dated physical check", () => {
    for (const condition of ["damaged", "missing"] as const) {
      const r = physicalCheck(asset, "2026-11-05", condition, "Inspection", "check-2");
      expect(r.asset.condition).toBe(condition);
      expect(r.asset.lastVerified).toBe("2026-11-05");
      expect(r.event.kind).toBe(condition);
    }
  });
  it("refuses impossible calendar dates", () => {
    expect(() => physicalCheck(asset, "2026-02-30", "ok", "", "x")).toThrow();
  });
});