import { describe, expect, it } from "vitest";
import { cardCycle, cardDues, dueDateFor, emiUnbilled, lastStatementDate, nextEmiInstalment, statementShift, type CardEmi, type CardTxn } from "./cards";
import type { Account } from "./ledger";

const card: Account = { id: "c", name: "AMEX", kind: "credit_card", openingBalance: 0, archived: false, creditLimit: 100000, statementDay: 20, dueDay: 8 };
const bank: Account = { id: "b", name: "HDFC", kind: "savings", openingBalance: 200000, archived: false };
const buy = (id: string, date: string, amount: number, extra: Partial<CardTxn> = {}): CardTxn => ({ id, date, amount, accountId: "c", txnType: "expense", category: "Shopping", ...extra });
const pay = (id: string, date: string, amount: number): CardTxn => ({ id, date, amount, accountId: "b", toAccountId: "c", txnType: "transfer" });

describe("statement dates", () => {
  it("finds the latest statement on or before today, clamped to short months", () => {
    expect(lastStatementDate("2026-10-31", 20)).toBe("2026-10-20");
    expect(lastStatementDate("2026-10-05", 20)).toBe("2026-09-20");
    expect(lastStatementDate("2026-03-01", 31)).toBe("2026-02-28");
    expect(statementShift("2026-01-31", 31, 1)).toBe("2026-02-28");
  });
  it("due date is the first due day after the statement", () => {
    expect(dueDateFor("2026-10-20", 8)).toBe("2026-11-08");
    expect(dueDateFor("2026-10-05", 25)).toBe("2026-10-25");
  });
});

describe("card cycle", () => {
  const txns = [buy("p1", "2026-10-02", 10000), buy("p2", "2026-10-15", 5000), buy("p3", "2026-10-25", 3000)];
  it("separates statement amount from unbilled purchases", () => {
    const c = cardCycle(card, txns, [], "2026-10-31");
    expect(c.lastStatement).toBe("2026-10-20");
    expect(c.statementBalance).toBe(15000);
    expect(c.unbilled).toBe(3000);
    expect(c.owed).toBe(18000);
    expect(c.dueDate).toBe("2026-11-08");
    expect(c.status).toBe("pending");
  });
  it("tracks partial and full payments against the statement", () => {
    expect(cardCycle(card, [...txns, pay("x", "2026-10-28", 5000)], [], "2026-10-31")).toMatchObject({ status: "partly_paid", remainingDue: 10000, paymentsSinceStatement: 5000 });
    expect(cardCycle(card, [...txns, pay("x", "2026-10-28", 15000)], [], "2026-10-31")).toMatchObject({ status: "paid", remainingDue: 0 });
  });
  it("marks an unpaid statement overdue after the due date", () => {
    expect(cardCycle(card, txns, [], "2026-11-12").status).toBe("pending"); // new statement on 11-20 not yet, still Oct cycle until due passes
    expect(cardCycle(card, txns, [], "2026-11-09").status).toBe("overdue");
  });
  it("refunds reduce unbilled and interest is reported separately", () => {
    const c = cardCycle(card, [...txns, { id: "r", date: "2026-10-26", amount: 1000, accountId: "c", txnType: "refund" }, buy("i", "2026-10-27", 450, { category: "Financial charges" })], [], "2026-10-31");
    expect(c.unbilled).toBe(2000);
    expect(c.refundsSinceStatement).toBe(1000);
    expect(c.interestSinceStatement).toBe(450);
  });
  it("flags utilisation at or above the alert level", () => {
    const c = cardCycle(card, [buy("big", "2026-10-25", 35000)], [], "2026-10-31", 30);
    expect(c.utilisation).toBe(35);
    expect(c.highUtilisation).toBe(true);
    expect(c.available).toBe(65000);
  });
});

describe("EMI conversion", () => {
  const phone = buy("phone", "2026-09-25", 60000);
  const emi: CardEmi = { id: "e", name: "Phone EMI", accountId: "c", sourceTransactionId: "phone", original: 60000, startDate: "2026-09-26", emi: 10350, rate: 12, payments: [{ date: "2026-10-20", principal: 9750, interest: 600, total: 10350 }] };
  it("keeps converted purchases out of the statement except billed instalments", () => {
    const c = cardCycle(card, [phone, buy("i1", "2026-10-20", 600, { category: "Financial charges" })], [emi], "2026-10-31");
    // owed on 20 Oct = 60,000 + 600 interest; unbilled EMI principal = 50,250
    expect(c.statementBalance).toBe(10350);
    expect(c.emiOutstanding).toBe(50250);
    expect(c.unbilled).toBe(0);
  });
  it("computes unbilled principal and the next instalment split", () => {
    expect(emiUnbilled([emi], "2026-10-01")).toBe(60000);
    expect(emiUnbilled([emi], "2026-10-20")).toBe(50250);
    expect(nextEmiInstalment(emi, "2026-10-31")).toEqual({ principal: 9847.5, interest: 502.5, total: 10350, left: 50250 });
  });
});

describe("card dues for the forecast", () => {
  it("expects the remaining statement due and the next bill so far", () => {
    const txns = [buy("p1", "2026-10-02", 10000), buy("p3", "2026-10-25", 3000)];
    const c = cardCycle(card, txns, [], "2026-10-31");
    expect(cardDues(card, c, "2026-10-31")).toEqual([
      { date: "2026-11-08", amount: 10000, name: "AMEX bill" },
      { date: "2026-12-08", amount: 3000, name: "AMEX next bill (so far)" },
    ]);
  });
  it("ignores bank-side transfers for other accounts", () => {
    const c = cardCycle(card, [{ id: "t", date: "2026-10-25", amount: 500, accountId: "b", toAccountId: "x", txnType: "transfer" }], [], "2026-10-31");
    expect(c.paymentsSinceStatement).toBe(0);
    expect(bank.kind).toBe("savings");
  });
});
