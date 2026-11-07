import { describe, expect, it } from "vitest";
import { parseForexStatement, reconcileWallet, walletBreaks } from "./forex-statement";
import { findPassThroughPairs } from "./pass-through";

const rows = [
  "Card Type : Mastercard Mcy EUR  Currency : EUR", "Avl. Balance : 616.49",
  "10-08-2026  Online ReLoad  INR  1,000.00  0.00  1,000.00  Approved",
  "16-08-2026  Purchase  Lazio Pizzeria  EUR  0.00  49.00  951.00  Settled",
  "18-08-2026  Purchase  Avolta HEL T2S  EUR  0.00  334.51  616.49  Settled",
  "Currency : USD", "Avl. Balance : 2592.53", "No Records Found",
];

describe("forex statement", () => {
  it("keeps each currency wallet separate with its own balance", () => {
    const w = parseForexStatement(rows);
    expect(w.map((x) => x.currency)).toEqual(["EUR", "USD"]);
    expect(w[0]!.printedBalance).toBe(616.49);
    expect(w[1]!.printedBalance).toBe(2592.53);
    expect(w[0]!.lines[1]).toMatchObject({ merchant: "Lazio Pizzeria", debit: 49, txnCurrency: "EUR" });
    expect(walletBreaks(w[0]!)).toEqual([]);
  });
  it("matches only same-currency spending and flags what is missing", () => {
    const w = parseForexStatement(rows)[0]!;
    const r = reconcileWallet(w, [{ id: "a", date: "2026-08-16", currency: "EUR", originalAmount: 49, title: "Lazio" }, { id: "b", date: "2026-08-18", currency: "USD", originalAmount: 334.51, title: "x" }]);
    expect(r.matched).toHaveLength(1);
    expect(r.missing.map((l) => l.debit)).toEqual([334.51]);
    expect(r.difference).toBe(0);
  });
});

describe("pass-through pairs", () => {
  it("pairs ₹1.25 crore in and out on the same account", () => {
    const p = findPassThroughPairs([
      { id: "i", date: "2026-08-31", amount: 12500000, currency: "INR", accountId: "k", txnType: "income", title: "Allwin" },
      { id: "o", date: "2026-08-31", amount: 12500000, currency: "INR", accountId: "k", txnType: "expense", title: "AK Meridian" },
      { id: "x", date: "2026-08-31", amount: 5000000, currency: "INR", accountId: "z", txnType: "income", title: "other" },
    ]);
    expect(p).toHaveLength(1);
    expect(p[0]!.outgoing.id).toBe("o");
  });
  it("does not pair across different accounts", () => {
    expect(findPassThroughPairs([
      { id: "i", date: "2026-08-31", amount: 200000, currency: "INR", accountId: "a", txnType: "income", title: "" },
      { id: "o", date: "2026-08-31", amount: 200000, currency: "INR", accountId: "b", txnType: "expense", title: "" },
    ])).toEqual([]);
  });
});
