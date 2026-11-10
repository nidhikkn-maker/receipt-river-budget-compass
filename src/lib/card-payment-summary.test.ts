// Home "Card payment" (KK decision, 10 Nov 2026): statement amount due, minimum due (only if recorded), total
// outstanding and payment status are separate; "Overdue" only when the latest statement's due date has passed AND
// that statement still has an amount due after payments recorded up to today. Hand-calculated cases (a)–(e).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cardCycle, cardPaymentStatus, cardPaymentSummary, type CardTxn } from "./cards";
import type { Account } from "./ledger";

// Statement on the 18th, due on the 7th: the 18 Oct statement (₹30,000) is due 7 Nov; ₹15,679 spent after it.
const card: Account = { id: "c", name: "HDFC Regalia card", kind: "credit_card", openingBalance: 0, archived: false, creditLimit: 500000, statementDay: 18, dueDay: 7 };
const buy = (id: string, date: string, amount: number, accountId = "c"): CardTxn => ({ id, date, amount, accountId, txnType: "expense", category: "Shopping" });
const pay = (id: string, date: string, amount: number, to = "c"): CardTxn => ({ id, date, amount, accountId: "b", toAccountId: to, txnType: "transfer" });
const txns = [buy("billed", "2026-10-10", 30000), buy("unbilled", "2026-10-25", 15679)];
const status = (extra: CardTxn[] = [], today = "2026-11-10", acc = card) => cardPaymentStatus(cardCycle(acc, [...txns, ...extra], [], today));

describe("card payment status (one card)", () => {
  it("(a) ₹30,000 due 7 Nov, nothing paid, today 10 Nov → overdue since 7 Nov, ₹30,000 due, ₹45,679 outstanding", () => {
    expect(status()).toEqual({ state: "overdue", amountDue: 30000, paidTowardsStatement: 0, outstanding: 45679, dueDate: "2026-11-07", minimumDue: null });
  });
  it("(b) ₹30,000 paid on 6 Nov → paid, ₹15,679 outstanding, not overdue", () => {
    expect(status([pay("p", "2026-11-06", 30000)])).toEqual({ state: "paid", amountDue: 0, paidTowardsStatement: 30000, outstanding: 15679, dueDate: "2026-11-07", minimumDue: null });
  });
  it("(c) ₹10,000 paid → partly paid, ₹20,000 still due, still overdue since 7 Nov", () => {
    expect(status([pay("p", "2026-11-06", 10000)])).toEqual({ state: "overdue", amountDue: 20000, paidTowardsStatement: 10000, outstanding: 35679, dueDate: "2026-11-07", minimumDue: null });
    expect(cardPaymentSummary([cardCycle(card, [...txns, pay("p", "2026-11-06", 10000)], [], "2026-11-10")])).toMatchObject({ state: "overdue", partlyPaid: true, amountDue: 20000, outstanding: 35679, dueDate: "2026-11-07" });
  });
  it("(d) statement due 20 Nov (today 10 Nov) → due 20 Nov, not overdue", () => {
    const later: Account = { ...card, statementDay: 1, dueDay: 20 };
    expect(status([], "2026-11-10", later)).toMatchObject({ state: "due", amountDue: 45679, dueDate: "2026-11-20" });
    // Same card, statement 1 Nov holds both purchases (10 Oct and 25 Oct): the whole ₹45,679 is on that statement.
  });
  it("(e) no statement recorded → not recorded; nothing inferred, outstanding still shown", () => {
    const noStatement: Account = { ...card, statementDay: null, dueDay: 7 };
    expect(status([], "2026-11-10", noStatement)).toEqual({ state: "not_recorded", amountDue: 0, paidTowardsStatement: 0, outstanding: 45679, dueDate: null, minimumDue: null });
    expect(cardPaymentSummary([cardCycle(noStatement, txns, [], "2026-11-10")])).toMatchObject({ state: "not_recorded", amountDue: 0, outstanding: 45679 });
  });
  it("a past due date alone is never overdue: a paid statement stays paid after its due date", () => {
    // Today 17 Nov: the 18 Oct statement (due 7 Nov) was paid on 30 Oct, so it stays paid though 7 Nov has passed.
    expect(status([pay("p", "2026-10-30", 30000)], "2026-11-17")).toMatchObject({ state: "paid", amountDue: 0, outstanding: 15679 });
  });
});

describe("Home summary across cards", () => {
  it("the most urgent status leads; amounts due and outstanding are summed separately", () => {
    const other: Account = { ...card, id: "d", statementDay: 1, dueDay: 20 };
    const cycles = [cardCycle(other, [buy("o", "2026-10-20", 5000, "d")], [], "2026-11-10"), cardCycle(card, txns, [], "2026-11-10")];
    expect(cardPaymentSummary(cycles)).toEqual({ state: "overdue", amountDue: 35000, outstanding: 50679, dueDate: "2026-11-07", partlyPaid: false, notRecorded: 0, minimumDue: null });
  });
  it("counts cards without a statement separately, and ignores them when nothing is outstanding", () => {
    const noStatement: Account = { ...card, id: "n", statementDay: null };
    expect(cardPaymentSummary([cardCycle(noStatement, [buy("x", "2026-11-01", 900, "n")], [], "2026-11-10"), cardCycle(card, txns, [], "2026-11-10")])).toMatchObject({ state: "overdue", notRecorded: 1, outstanding: 46579, amountDue: 30000 });
    expect(cardPaymentSummary([cardCycle(noStatement, [], [], "2026-11-10")])).toMatchObject({ state: "no_cards", outstanding: 0 });
  });
  it("Home renders these facts separately, labelling the total as outstanding", () => {
    const src = readFileSync("src/components/shell/pages/HomePage.tsx", "utf8");
    expect(src).toContain("cardPaymentSummary(pos.cards.map((c) => c.cycle))");
    expect(src).toContain("Overdue since ${shortDate(cardPay.dueDate, false)}");
    expect(src).toContain("outstanding`");
    expect(src).toContain('"Statement not recorded"');
    expect(src).not.toContain("c.due");
  });
});
