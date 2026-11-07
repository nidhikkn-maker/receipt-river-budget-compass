import { describe, expect, it } from "vitest";
import { assistantFacts, nextDayOfMonth, position } from "./position";

const base = {
  accounts: [
    { id: "b", name: "HDFC", kind: "savings" as const, openingBalance: 100000, archived: false, minBalance: 10000 },
    { id: "c", name: "AMEX", kind: "credit_card" as const, openingBalance: 0, archived: false, creditLimit: 100000, dueDay: 5 },
  ],
  transactions: [
    { id: "1", txnType: "expense" as const, amount: 30000, accountId: "c", date: "2026-11-01", merchant: "Croma", category: "Shopping", paymentMethod: "credit_card", title: "TV" },
  ],
  commitments: [], goals: [{ name: "Emergency", target: 100000, saved: 20000, monthly: 5000, reserve: true }], loans: [],
  today: "2026-11-02", days: 30,
};

describe("financial position", () => {
  it('Home position and assistant facts agree on decimal balances, reserves and distinct merchant totals',()=>{
    const source=base.transactions[0]; if(!source) throw Error("Missing fixture entry");
    const input={...base,accounts:[{id:'b',name:'Bank',kind:'savings' as const,openingBalance:1.005,archived:false,minBalance:0.1},{id:'b2',name:'Bank2',kind:'savings' as const,openingBalance:0.2,archived:false,minBalance:0.2}],goals:[{name:'Reserve',target:1,saved:0.1,monthly:0,reserve:true},{name:'Reserve2',target:1,saved:0.2,monthly:0,reserve:true}],transactions:[{...source,id:'a',accountId:'b',amount:0.1,merchant:'Shop'},{...source,id:'b',accountId:'b2',amount:0.2,merchant:'Shop'}]};
    const p=position(input);const facts=assistantFacts(input);
    expect(p.cash).toBe(0.91);expect(p.minBalance).toBe(0.3);expect(p.reserves).toBe(0.3);
    expect(facts.actual.cashInAccounts).toBe(0.91);expect(facts.actual.thisMonth.byCategory['Shopping']).toBe(0.3);
    expect(facts.actual.last6Months.topMerchants).toEqual([['Shop',0.3]]);
  });
  it("card due date rolls to next month when passed", () => {
    expect(nextDayOfMonth("2026-11-10", 5)).toBe("2026-12-05");
    expect(nextDayOfMonth("2026-11-02", 5)).toBe("2026-11-05");
  });
  it("safe-to-spend holds back the card bill, minimum balance and reserves", () => {
    const p = position(base);
    expect(p.cash).toBe(100000);
    expect(p.cards[0]!.utilisation).toBe(30);
    expect(p.safe.amount).toBe(100000 - 30000 - 10000 - 20000);
  });
  it("AI facts carry the same numbers as the engine", () => {
    const f = assistantFacts(base);
    expect(f.estimated.safeToSpend).toBe(position(base).safe.amount);
    expect(f.actual.thisMonth.spent).toBe(30000);
    expect(f.missing).toContain("No expected income recorded.");
  });
});
