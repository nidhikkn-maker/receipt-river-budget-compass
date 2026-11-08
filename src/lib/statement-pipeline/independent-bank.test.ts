// Independent-input acceptance: the bank statement below is written as the bank would print it
// (its own dates, narrations and running balances), not derived from the ledger records under test.
import { describe, expect, it } from "vitest";
import { matchLines, recordsNotMatched, type LedgerRec } from "./match";
import { balanceAddsUp, type StmtLine } from "./line";

const line = (i: number, date: string, amount: number, direction: "debit" | "credit", balance: number, description: string): StmtLine =>
  ({ key: `cub-nov.csv#${i}`, file: "cub-nov.csv", date, amount, direction, balance, description, currency: "INR" });

// Bank side: opening ₹2,00,000.00
const bank: StmtLine[] = [
  line(0, "2026-04-03", 47200, "credit", 247200, "NEFT CR ARUNA TEXTILES INV SI-0412"),
  line(1, "2026-04-05", 18880, "debit", 228320, "IMPS DR KAVERI PACKAGING BILL KP/221"),
  line(2, "2026-04-05", 18880, "debit", 209440, "IMPS DR KAVERI PACKAGING BILL KP/221"), // bank double debit
  line(3, "2026-04-09", 1250.5, "debit", 208189.5, "BANK CHARGES QTR"), // never recorded in books
  line(4, "2026-04-12", 35000, "credit", 243189.5, "NEFT CR MEENA TRADERS PART PMT"), // books expected 36,000
];

// Book side: entered from separate invoices/bills, dated on the documents, not the bank.
const books: LedgerRec[] = [
  { id: "inv-SI-0412", date: "2026-04-02", amount: 47200, kind: "income", name: "Aruna Textiles", description: "SI-0412", currency: "INR", accountId: "cub", toAccountId: null },
  { id: "bill-KP-221", date: "2026-04-04", amount: 18880, kind: "expense", name: "Kaveri Packaging", description: "KP/221", currency: "INR", accountId: "cub", toAccountId: null },
  { id: "inv-SI-0415", date: "2026-04-11", amount: 36000, kind: "income", name: "Meena Traders", description: "SI-0415", currency: "INR", accountId: "cub", toAccountId: null },
  { id: "bill-RN-09", date: "2026-04-20", amount: 9440, kind: "expense", name: "Ravi Electricals", description: "RN-09", currency: "INR", accountId: "cub", toAccountId: null },
];

describe("independent bank statement against separately entered books", () => {
  const out = matchLines(bank, books, 3, "cub");

  it("printed running balance adds up on its own", () => {
    expect(balanceAddsUp(200000, 243189.5, bank).ok).toBe(true);
  });

  it("matches each bank line to the right document entry, one-to-one", () => {
    expect(out[0]!.record?.id).toBe("inv-SI-0412");
    expect(out[0]!.result).toBe("matched");
    expect(out[1]!.record?.id).toBe("bill-KP-221");
  });

  it("a duplicate bank debit cannot reuse the same bill", () => {
    expect(out[2]!.result).toBe("missing");
    expect(out[2]!.record).toBeUndefined();
  });

  it("unrecorded bank charges stay missing instead of being invented", () => {
    expect(out[3]!.result).toBe("missing");
  });

  it("a ₹1,000 short receipt is not silently matched", () => {
    expect(out[4]!.result).toBe("missing");
    expect(recordsNotMatched(books, out).map((r) => r.id).sort()).toEqual(["bill-RN-09", "inv-SI-0415"]);
  });
});
