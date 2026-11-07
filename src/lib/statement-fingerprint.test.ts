import { describe, expect, it } from "vitest";
import { filePattern, fingerprintLines, splitNewLines } from "./statement-fingerprint";
import type { StatementLine } from "./expenses";

const l = (ref: string, date: string, description: string, amount: number): StatementLine => ({ ref, date, description, amount, direction: "debit" });

describe("statement fingerprints", () => {
  it("second overlapping upload brings in only the new lines", () => {
    const first = [l("1", "2026-01-20", "SWIGGY", 300), l("2", "2026-01-21", "AMAZON", 999)];
    const known = new Set(fingerprintLines(first, "acc"));
    const second = [l("a", "2026-01-20", "SWIGGY", 300), l("b", "2026-01-21", "AMAZON", 999), l("c", "2026-01-22", "ZEPTO", 450)];
    const r = splitNewLines(second, "acc", known, "2026-01-21");
    expect(r.fresh.map((x) => x.description)).toEqual(["ZEPTO"]);
    expect(r.alreadyImported).toHaveLength(2);
    expect(r.olderUnseen).toHaveLength(0);
  });
  it("keeps two identical same-day payments", () => {
    const known = new Set(fingerprintLines([l("1", "2026-01-21", "TEA STALL", 20)], "acc"));
    const r = splitNewLines([l("a", "2026-01-21", "TEA STALL", 20), l("b", "2026-01-21", "TEA STALL", 20)], "acc", known, "2026-01-21");
    expect(r.fresh).toHaveLength(1);
  });
  it("matches by bank reference even when narration changes", () => {
    const known = new Set(fingerprintLines([l("1", "2026-01-21", "UPI/601234567890/Shop", 50)], "acc"));
    const r = splitNewLines([l("a", "2026-01-21", "UPI-601234567890-SHOP NAME", 50)], "acc", known, null);
    expect(r.fresh).toHaveLength(0);
  });
  it("different accounts do not collide", () => {
    const known = new Set(fingerprintLines([l("1", "2026-01-21", "SWIGGY", 300)], "a1"));
    expect(splitNewLines([l("a", "2026-01-21", "SWIGGY", 300)], "a2", known, null).fresh).toHaveLength(1);
  });
  it("flags unseen lines older than the last import", () => {
    const r = splitNewLines([l("a", "2026-01-10", "LATE POST", 10)], "acc", new Set(), "2026-01-21");
    expect(r.olderUnseen).toHaveLength(1);
  });
  it("same bank files share a pattern", () => {
    expect(filePattern("HDFC_Statement_21012026.csv")).toBe(filePattern("HDFC_Statement_22012026.xlsx"));
  });
});
