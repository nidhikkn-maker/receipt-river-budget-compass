import { describe, it, expect } from "vitest";
import { panProblem, gstinProblem, gstinCheckChar, fyOf, yearsSince, yearStatuses } from "./entities";

describe("entities", () => {
  it("checks PAN shape and holder type", () => {
    expect(panProblem("ABCPE1234F", "individual")).toBeNull();
    expect(panProblem("ABCPE1234F", "company")).toMatch(/4th letter/);
    expect(panProblem("ABC1234", "individual")).toMatch(/ABCDE1234F/);
  });
  it("checks GSTIN carries the PAN and a valid check character", () => {
    const base = "33ABCPE1234F1Z";
    const good = base + gstinCheckChar(base);
    expect(gstinProblem(good, "ABCPE1234F")).toBeNull();
    expect(gstinProblem(good, "ZZZPE1234F")).toMatch(/PAN/);
    const bad = base + (good[14] === "0" ? "1" : "0");
    expect(gstinProblem(bad, "ABCPE1234F")).toMatch(/typo/);
  });
  it("uses April–March financial years", () => {
    expect(fyOf("2026-03-31")).toBe("2025-26");
    expect(fyOf("2026-04-01")).toBe("2026-27");
    expect(yearsSince("2024-25", "2026-11-04")).toEqual(["2024-25", "2025-26", "2026-27"]);
  });
  it("marks a year covered only with both entries and a statement", () => {
    const s = yearStatuses("2025-26", "2026-11-04", ["2025-05-01", "2026-06-01"], ["2026-07-01"], []);
    expect(s.map((x) => x.state)).toEqual(["started", "covered"]);
  });
});
