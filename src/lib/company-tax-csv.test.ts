// @vitest-environment node
import { describe, expect, it } from "vitest";
import { companyTaxCsv } from "./team-access";

describe("companyTaxCsv", () => {
  it("writes one row per company and tax year with a header", () => {
    const csv = companyTaxCsv([
      { company: "Acme Pvt Ltd", owner: "Nidhi", kind: "company", fy: "2025-26", bookProfit: 1000000, accumulatedProfits: 500000, ownershipPct: 75 },
      { company: "Acme Pvt Ltd", owner: "Nidhi", kind: "company", fy: "2024-25", bookProfit: 800000 },
    ]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Company,Owner,Kind,Tax year,Book profit,Past profits,Owner share %");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("Acme Pvt Ltd,Nidhi,company,2025-26,1000000,500000,75");
    expect(lines[2]).toBe("Acme Pvt Ltd,Nidhi,company,2024-25,800000,,");
  });

  it("leaves unentered figures blank rather than zero", () => {
    const csv = companyTaxCsv([{ company: "Beta LLP", owner: "K", kind: "llp", fy: "2025-26" }]);
    expect(csv.split("\n")[1]).toBe("Beta LLP,K,llp,2025-26,,,");
  });

  it("quotes commas and quotes in names", () => {
    const csv = companyTaxCsv([{ company: 'Rao, "Sons" & Co', owner: "A, B", kind: "partnership", fy: "2025-26", ownershipPct: 50 }]);
    expect(csv.split("\n")[1]).toBe('"Rao, ""Sons"" & Co","A, B",partnership,2025-26,,,50');
  });

  it("never includes personal tax figures", () => {
    const csv = companyTaxCsv([{ company: "Acme", owner: "Nidhi", kind: "company", fy: "2025-26" }]);
    expect(csv).not.toMatch(/personal|salary|87A/i);
  });
});
