import { describe, expect, it } from "vitest";
import { applyFilters, autoMatch, matchScore, budgetUsage, convert, parseStatementCsv, totalsByScope, validateBudget, validateExpense, type Expense } from "./expenses";

const exp = (o: Partial<Expense> = {}): Expense => ({
  id: "x", title: "t", merchant: null, category: "Groceries", scope: "personal", memberId: null, splits: [], amount: 100,
  currency: "INR", originalAmount: 100, fxRate: 1, paymentMethod: "upi", reconciledAt: null, statementRef: null,
  date: "2026-10-01", description: "", receipts: [], ...o,
});

describe("business vs personal", () => {
  it("totals are kept separate", () => {
    expect(totalsByScope([exp({ amount: 100 }), exp({ amount: 250, scope: "business" })])).toEqual({ personal: 100, business: 250, total: 350 });
  });
  it("filters to business only", () => {
    expect(applyFilters([exp({ id: "a" }), exp({ id: "b", scope: "business" })], { scope: "business" }).map((e) => e.id)).toEqual(["b"]);
  });
  it("filters by family member, and 'me' means no member", () => {
    const list = [exp({ id: "a" }), exp({ id: "b", memberId: "kid" })];
    expect(applyFilters(list, { memberId: "kid" }).map((e) => e.id)).toEqual(["b"]);
    expect(applyFilters(list, { memberId: "me" }).map((e) => e.id)).toEqual(["a"]);
  });
  it("requires a positive amount", () =>
    expect(() => validateExpense({ title: "a", merchant: null, category: "Dining", scope: "personal", memberId: null, amount: 0, currency: "INR", paymentMethod: "cash", date: "2026-01-01", description: "" })).toThrow());
});

describe("budgets", () => {
  it("counts only this month's spend against the monthly budget", () => {
    const u = budgetUsage([exp({ amount: 300 }), exp({ amount: 999, date: "2026-09-30" })], { Groceries: 5000 }, "2026-10");
    expect(u).toEqual([{ category: "Groceries", spent: 300, budget: 5000 }]);
  });
  it("budgets cannot be negative", () => expect(() => validateBudget(-1)).toThrow());
});

describe("currency & reconciliation", () => {
  const line = { ref:"1", date:"2026-10-01", description:"BANK", amount:100 };
  it("leaves indistinguishable same-amount entries for manual review",()=>expect(autoMatch([line],[exp({id:"a"}),exp({id:"b"})],"INR")[0]?.expense).toBeNull());
  it("does not guess between duplicate statement rows",()=>expect(autoMatch([line,{...line,ref:"2"}],[exp()],"INR").every(m=>m.expense===null)).toBe(true));
  it("keeps a clearly stronger merchant match",()=>expect(autoMatch([{...line,description:"UBER"}],[exp({id:"uber",merchant:"Uber"}),exp({id:"other"})],"INR")[0]?.expense?.id).toBe("uber"));
  it("matches transfer credits only to the destination account",()=>{
    const transfer=exp({txnType:"transfer",accountId:"source",toAccountId:"dest"});
    expect(matchScore({...line,direction:"credit"},transfer,"INR","source")).toBe(0);
    expect(matchScore({...line,direction:"credit"},transfer,"INR","dest")).toBe(0.8);
    expect(matchScore(line,transfer,"INR","source")).toBe(0.8);
    expect(matchScore(line,transfer,"INR")).toBe(0);
  });
  it("includes bank credits only when requested and never matches them to expenses",()=>{
    const lines=parseStatementCsv("Date,Narration,Debit,Credit\n31/10/2026,SALARY,,50000",true);
    expect(lines[0]).toEqual({ref:"L1",date:"2026-10-31",description:"SALARY",amount:50000,direction:"credit"});
    expect(autoMatch(lines,[exp({amount:50000,date:"2026-10-31"})],"INR")[0]?.expense).toBeNull();
  });
  const usd = exp({ currency: "USD", originalAmount: 12, fxRate: 88.5, amount: 1062, merchant: "Uber" });
  it("converts with the day's rate, to paise", () => expect(convert(12, 88.5)).toBe(1062));
  it("parses DD/MM/YYYY bank CSVs with a debit column, skipping credits", () => {
    const l = parseStatementCsv("Date,Narration,Debit,Credit\n01/10/2026,UPI-UBER INDIA,1062.00,\n02/10/2026,SALARY,,50000");
    expect(l).toEqual([{ ref: "L1", date: "2026-10-01", description: "UPI-UBER INDIA", amount: 1062 }]);
  });
  it("matches a home-currency statement line to a foreign bill via its converted amount", () => {
    const [m] = autoMatch([{ ref: "L1", date: "2026-10-02", description: "UBER", amount: 1070 }], [usd], "INR");
    expect(m!.expense?.id).toBe("x");
  });
  it("does not match when the amount is off by more than 3%", () => {
    const [m] = autoMatch([{ ref: "L1", date: "2026-10-01", description: "UBER", amount: 1200 }], [usd], "INR");
    expect(m!.expense).toBeNull();
  });
});

import { splitEvenly as _se, validateSplits as _vs, memberShares as _ms, totalsByMember as _tm } from "./expenses";
describe("expense splits", () => {
  it("splits 100 three ways summing exactly", () => {
    expect(_se(100, [null, "a", "b"]).map((x) => x.amount)).toEqual([33.34, 33.33, 33.33]);
  });
  it("rejects shares that don't add up to the bill", () => {
    expect(() => _vs([{ memberId: null, amount: 40 }, { memberId: "a", amount: 50 }], 100)).toThrow();
  });
  it("rejects a split with only one person", () => {
    expect(() => _vs([{ memberId: null, amount: 100 }], 100)).toThrow();
  });
  it("converts shares to INR with the bill rate and credits each person", () => {
    const e = { memberId: null, splits: [{ memberId: null, amount: 6 }, { memberId: "a", amount: 4 }], amount: 900, originalAmount: 10 };
    expect(_ms(e)).toEqual([{ memberId: null, amount: 540 }, { memberId: "a", amount: 360 }]);
    expect(_tm([e as never])).toEqual({ me: 540, a: 360 });
  });
});
