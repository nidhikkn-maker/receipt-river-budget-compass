import { describe, expect, it } from "vitest";
import { detectInvestmentDoc, mergeInvestmentDoc, parseInvestmentDoc, type StoredHolding } from "./demat";

// Representative investment/demat statement fixtures [§3, §13]: identification of the document kind,
// extraction of expected fields, missing-field handling with no invented values, and a reviewed merge
// that links every touched holding to its source document.

const DEMAT_ROWS = [
  "ICICI Direct Demat Account Statement",
  "DP ID: IN300183  Client ID: 12345678",
  "Account Holder: KRUPANIDHI KARUNANITHI",
  "Holdings as on 30-09-2026",
  "INE002A01018 RELIANCE INDUSTRIES 25 68450.00",
  "INE040A01034 HDFC BANK 10 17200.50",
];

const TRADE_ROWS = [
  "ICICI Securities Trade Book",
  "INE002A01018 RELIANCE INDUSTRIES BUY 5 2738.00 15-08-2026 13690.00",
  "INE002A01018 RELIANCE INDUSTRIES SELL 2 2810.50 20-09-2026 5621.00",
];

const GAIN_ROWS = [
  "Capital Gains Statement",
  "INE040A01034 HDFC BANK 4 01-02-2024 15-09-2026 4800.00 6900.00 2100.00",
];

describe("investment statement identification", () => {
  it("detects demat, transaction and capital-gains statements, and rejects non-investment text", () => {
    expect(detectInvestmentDoc(DEMAT_ROWS)).toBe("demat");
    expect(detectInvestmentDoc(TRADE_ROWS)).toBe("transactions");
    expect(detectInvestmentDoc(GAIN_ROWS)).toBe("gains");
    expect(detectInvestmentDoc(["Rent receipt for September", "Amount paid: 75000"])).toBeNull();
    expect(detectInvestmentDoc(["INE002A01018 mentioned with no other context"])).toBeNull();
  });
});

describe("demat statement fixture", () => {
  it("extracts account identity, holder, as-on date and holdings", () => {
    const doc = parseInvestmentDoc(DEMAT_ROWS)!;
    expect(doc.kind).toBe("demat");
    expect(doc.broker).toBe("ICICI Direct");
    expect(doc.dpId).toBe("IN300183");
    expect(doc.clientId).toBe("12345678");
    expect(doc.holder).toMatch(/KRUPANIDHI/);
    expect(doc.asOf).toBe("2026-09-30");
    expect(doc.holdings).toHaveLength(2);
    expect(doc.holdings[0]).toMatchObject({ isin: "INE002A01018", quantity: 25, value: 68450 });
  });

  it("skips rows without a quantity instead of inventing one", () => {
    const doc = parseInvestmentDoc([...DEMAT_ROWS, "INE009A01021 INFOSYS LTD"])!;
    expect(doc.holdings.find((h) => h.isin === "INE009A01021")).toBeUndefined();
  });

  it("a reviewed merge adds new holdings linked to the source document and updates existing ones", () => {
    const doc = parseInvestmentDoc(DEMAT_ROWS)!;
    const existing: StoredHolding[] = [{ isin: "INE002A01018", name: "RELIANCE INDUSTRIES", quantity: 20, asOf: null, statementValue: null, lots: [], gains: [], sources: ["older.pdf"] }];
    const m = mergeInvestmentDoc(existing, doc, "doc-dem-1");
    expect(m.added.holdings).toBe(1);
    const rel = m.holdings.find((h) => h.isin === "INE002A01018")!;
    expect(rel.quantity).toBe(25); // statement quantity replaces, history preserved in lots
    expect(rel.sources).toEqual(["older.pdf", "doc-dem-1"]);
    const hdfc = m.holdings.find((h) => h.isin === "INE040A01034")!;
    expect(hdfc.sources).toEqual(["doc-dem-1"]);
  });
});

describe("transaction statement fixture", () => {
  it("extracts dated buy/sell trades with quantity and price", () => {
    const doc = parseInvestmentDoc(TRADE_ROWS)!;
    expect(doc.kind).toBe("transactions");
    expect(doc.trades).toHaveLength(2);
    expect(doc.trades[0]).toMatchObject({ isin: "INE002A01018", side: "buy", quantity: 5, price: 2738 });
    expect(doc.trades[1]).toMatchObject({ side: "sell", quantity: 2 });
  });

  it("never attaches a trade to a security the statement does not hold, and never duplicates a re-uploaded lot", () => {
    const doc = parseInvestmentDoc(TRADE_ROWS)!;
    const existing: StoredHolding[] = [{ isin: "INE002A01018", name: "RELIANCE INDUSTRIES", quantity: 25, asOf: null, statementValue: null, lots: [], gains: [], sources: [] }];
    const once = mergeInvestmentDoc(existing, doc, "doc-tr-1");
    expect(once.added.lots).toBe(2);
    expect(once.holdings[0]!.lots.every((l) => l.source === "doc-tr-1")).toBe(true);
    const twice = mergeInvestmentDoc(once.holdings, doc, "doc-tr-1");
    expect(twice.added.lots).toBe(0);
    expect(twice.duplicatesSkipped).toBe(2);
    // A trade for an unknown ISIN is reported as unmatched, not created from thin air.
    const stray = parseInvestmentDoc([...TRADE_ROWS, "INE009A01021 INFOSYS LTD BUY 3 1500.00 01-10-2026 4500.00"])!;
    const m = mergeInvestmentDoc(existing, stray, "doc-tr-2");
    expect(m.unmatched).toEqual([{ isin: "INE009A01021", name: expect.stringMatching(/INFOSYS/) }]);
  });
});

describe("capital gains statement fixture", () => {
  it("extracts buy/sell dates, cost, proceeds and gain, and the merge evidences both sides of the trade", () => {
    const doc = parseInvestmentDoc(GAIN_ROWS)!;
    expect(doc.kind).toBe("gains");
    expect(doc.gains).toHaveLength(1);
    expect(doc.gains[0]).toMatchObject({ isin: "INE040A01034", quantity: 4, cost: 4800, proceeds: 6900, gain: 2100 });
    const existing: StoredHolding[] = [{ isin: "INE040A01034", name: "HDFC BANK", quantity: 10, asOf: null, statementValue: null, lots: [], gains: [], sources: [] }];
    const m = mergeInvestmentDoc(existing, doc, "doc-cg-1");
    expect(m.added.gains).toBe(1);
    const h = m.holdings[0]!;
    expect(h.gains[0]!.source).toBe("doc-cg-1");
    expect(h.lots.some((l) => l.side === "buy" && l.date === "2024-02-01")).toBe(true);
    expect(h.lots.some((l) => l.side === "sell" && l.date === "2026-09-15")).toBe(true);
  });
});
