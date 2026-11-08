// Milestone 2 acceptance with independently authored synthetic documents:
// a broker transaction statement, a demat holding statement, a capital-gains statement,
// and a bank statement with loan EMI debits. The documents are written separately (own
// dates, narrations, numbers) and run through the real readers; nothing is pre-filled.
import { describe, expect, it } from "vitest";
import { parseInvestmentDoc, mergeInvestmentDoc, completeness, netQuantity, type StoredHolding } from "./demat";
import { matchEmiDebit, type EmiTarget } from "../emi-match";

const TXN = [
  "ICICI Securities Ltd - Transaction Statement",
  "DP ID: IN300214 Client ID: 10458821",
  "Client Name: Synthetic Meridian Engineering Ltd",
  "12-Apr-2025 INE002A01018 RELIANCE INDUSTRIES BUY 40 1,250.00 50,000.00",
  "03-Jun-2025 INE009A01021 INFOSYS LTD BUY 30 1,500.00 45,000.00",
  "18-Aug-2025 INE009A01021 INFOSYS LTD Dividend 630.00",
  "20-Jan-2026 INE009A01021 INFOSYS LTD SELL 10 1,800.00 18,000.00",
];
const DEMAT = [
  "NSDL Demat Holding Statement",
  "DP ID: IN300214 Client ID: 10458821",
  "Holding as on 31-Mar-2026",
  "INE002A01018 RELIANCE INDUSTRIES 40 58,400.00",
  "INE009A01021 INFOSYS LTD 20 31,000.00",
  "INE040A01034 HDFC BANK LTD 15 24,750.00",
];
const GAINS = [
  "Capital Gain Statement FY 2025-26",
  "DP ID: IN300214 Client ID: 10458821",
  "INE009A01021 INFOSYS LTD 03-Jun-2025 20-Jan-2026 10 15,000.00 18,000.00 3,000.00",
];

describe("Milestone 2 — independent investment documents through the real reader", () => {
  const txn = parseInvestmentDoc(TXN)!;
  const demat = parseInvestmentDoc(DEMAT)!;
  const gains = parseInvestmentDoc(GAINS)!;

  it("reads each document kind, account identity and every printed row", () => {
    expect([txn.kind, demat.kind, gains.kind]).toEqual(["transactions", "demat", "gains"]);
    expect([demat.dpId, demat.clientId, demat.asOf]).toEqual(["IN300214", "10458821", "2026-03-31"]);
    expect(txn.trades.map((t) => [t.isin, t.side, t.quantity, t.amount])).toEqual([
      ["INE002A01018", "buy", 40, 50000], ["INE009A01021", "buy", 30, 45000], ["INE009A01021", "sell", 10, 18000]]);
    expect(txn.events).toEqual([expect.objectContaining({ kind: "dividend", isin: "INE009A01021", amount: 630, date: "2025-08-18" })]);
    expect(gains.gains[0]).toMatchObject({ cost: 15000, proceeds: 18000, gain: 3000, quantity: 10 });
  });

  it("reconciles holdings to purchase history and flags the security with no purchase record", () => {
    let h: StoredHolding[] = mergeInvestmentDoc([], demat, "doc-demat").holdings;
    h = mergeInvestmentDoc(h, txn, "doc-txn").holdings;
    h = mergeInvestmentDoc(h, gains, "doc-gains").holdings;
    const inf = h.find((x) => x.isin === "INE009A01021")!;
    expect(netQuantity(inf.lots)).toBe(20);
    expect(inf.quantity).toBe(20);
    const c = completeness({ dpId: "IN300214", clientId: "10458821", holdings: h, stored: true });
    // HDFC Bank has 15 units but no purchase in the statement: shown as missing, never invented.
    expect(c.missingHistory).toEqual([{ isin: "INE040A01034", name: expect.any(String), gap: 15 }]);
    expect(c.capitalGains).toBe("ok");
    // No trusted price source: statement values are not treated as prices.
    expect(c.valuation).toBe("needed");
    // Dividend income is kept as source evidence on the holding.
    expect(inf.events?.some((e) => e.kind === "dividend" && e.amount === 630 && e.source === "doc-txn")).toBe(true);
  });

  it("re-uploading the same documents adds nothing", () => {
    let h = mergeInvestmentDoc([], demat, "doc-demat").holdings;
    h = mergeInvestmentDoc(h, txn, "doc-txn").holdings;
    const again = mergeInvestmentDoc(h, txn, "doc-txn");
    expect(again.added.lots).toBe(0);
    expect(again.duplicatesSkipped).toBeGreaterThan(0);
  });

  it("trades for a security not on the holding statement are reported, never created", () => {
    const stray = parseInvestmentDoc([...TXN.slice(0, 3), "05-Feb-2026 INE467B01029 TCS LTD BUY 5 3,900.00 19,500.00"])!;
    const r = mergeInvestmentDoc(mergeInvestmentDoc([], demat, "d").holdings, stray, "s");
    expect(r.unmatched.map((u) => u.isin)).toEqual(["INE467B01029"]);
    expect(r.holdings.some((x) => x.isin === "INE467B01029")).toBe(false);
  });
});

describe("Milestone 2 — independent bank EMI debits against a financed-asset loan", () => {
  const loan: EmiTarget = { loanId: "L1", name: "Vehicle loan — CNC machine", loanAccountId: "LOANAC", payFromAccountId: "BANK",
    emi: 23540, dueDay: 5, refs: ["VL0098812"] };
  const line = (date: string, amount: number, description: string, accountId = "BANK") =>
    ({ date, amount, direction: "debit" as const, accountId, description });

  it("matches on-time EMI debits and a ₹60 rounding gap", () => {
    expect(matchEmiDebit(line("2025-05-05", 23540, "ACH DR VL0098812"), [loan])?.amountDiff).toBe(0);
    expect(matchEmiDebit(line("2025-06-06", 23600, "ACH DR VL0098812 BOUNCE CHG ADJ"), [loan])?.amountDiff).toBe(60);
  });
  it("does not match an unrelated debit of the same amount from another account or a far-off date", () => {
    expect(matchEmiDebit(line("2025-07-05", 23540, "NEFT SUPPLIER", "OTHER"), [loan])).toBeNull();
    expect(matchEmiDebit(line("2025-07-20", 23540, "ACH DR VL0098812"), [loan])).toBeNull();
  });
  it("a short payment outside tolerance stays unmatched for review", () => {
    expect(matchEmiDebit(line("2025-08-05", 20000, "ACH DR"), [loan])).toBeNull();
  });
});
