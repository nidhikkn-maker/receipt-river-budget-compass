import { describe, expect, it } from "vitest";
import { completeness, mergeInvestmentDoc, parseInvestmentDoc } from "./demat";

const holdingRows = [
  "ICICI Securities Ltd — Demat Holding Statement",
  "DP ID: IN303028 Client ID: 12345678",
  "Holding as on 31-10-2026",
  "INE002A01018 RELIANCE INDUSTRIES LTD 100 2,85,000.00",
  "INE009A01021 INFOSYS LTD 50 75,000.00",
];
const tradeRows = [
  "ICICI Direct Transaction Statement",
  "12-01-2024 INE002A01018 RELIANCE INDUSTRIES BUY 60 2400.00 1,44,000.00",
  "05-03-2024 INE002A01018 RELIANCE INDUSTRIES BUY 40 2500.00 1,00,000.00",
  "05-03-2024 INE002A01018 RELIANCE INDUSTRIES BUY 40 2500.00 1,00,000.00",
  "10-06-2024 INE999Z01011 UNKNOWN CO BUY 10 100.00 1,000.00",
];

describe("demat completeness", () => {
  it("reads a demat statement and flags missing purchase history", () => {
    const doc = parseInvestmentDoc(holdingRows)!;
    expect(doc.kind).toBe("demat");
    expect(doc.broker).toBe("ICICI Direct");
    expect(doc.holdings.map((h) => [h.isin, h.quantity])).toEqual([["INE002A01018", 100], ["INE009A01021", 50]]);
    const m = mergeInvestmentDoc([], doc, "d1");
    const c = completeness({ dpId: doc.dpId, clientId: doc.clientId, holdings: m.holdings, stored: true });
    expect(c.account).toBe("ok");
    expect(c.valuation).toBe("needed");
    expect(c.purchaseHistory).toBe("missing");
    expect(c.needsHistoryUpload).toBe(true);
  });

  it("transaction statement fills history by ISIN without duplicating securities or trades", () => {
    const base = mergeInvestmentDoc([], parseInvestmentDoc(holdingRows)!, "d1").holdings;
    const tx = parseInvestmentDoc(tradeRows)!;
    expect(tx.kind).toBe("transactions");
    const m = mergeInvestmentDoc(base, tx, "t1");
    expect(m.holdings).toHaveLength(2);
    expect(m.added.holdings).toBe(0);
    expect(m.duplicatesSkipped).toBe(1);
    expect(m.unmatched.map((u) => u.isin)).toEqual(["INE999Z01011"]);
    const c = completeness({ dpId: "x", clientId: "", holdings: m.holdings, stored: true });
    expect(c.missingHistory.map((x) => x.isin)).toEqual(["INE009A01021"]);
    // Uploading the same file again adds nothing.
    expect(mergeInvestmentDoc(m.holdings, tx, "t1").added.lots).toBe(0);
  });

  it("capital gains verify only when sells have matching gain lines", () => {
    const base = mergeInvestmentDoc([], parseInvestmentDoc(["Demat holding DP ID: IN303028", "INE009A01021 INFOSYS LTD 50 75,000"])!, "d").holdings;
    const g = parseInvestmentDoc(["Capital Gains Statement", "INE009A01021 INFOSYS 10 01-02-2023 15-07-2025 12000 15000 3000"])!;
    expect(g.kind).toBe("gains");
    const m = mergeInvestmentDoc(base, g, "g");
    const c = completeness({ dpId: "x", clientId: "", holdings: m.holdings, stored: true });
    expect(c.capitalGains).toBe("ok");
    expect(c.purchaseHistory).toBe("missing"); // only 10 of 50 evidenced
  });
});
