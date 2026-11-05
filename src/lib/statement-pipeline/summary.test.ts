import { describe, expect, it } from "vitest";
import { reconSummary, savedBalanceCheck } from "./summary";
import type { AccountPlan } from "./plan";

const base = (over: Partial<AccountPlan>): AccountPlan => ({ file: { name: "f", accountId: "a", hint: null, currency: "INR", opening: 1000, closing: 900, lines: [{ key: "1", file: "f", date: "2026-11-01", amount: 100, direction: "debit", balance: 900, description: "x", currency: "INR" }] }, accountId: "a", name: "A", isNew: false, hint: null, liability: false, appBalance: 1000, gate: { after: 900, difference: 0, ok: true } as never, newerEntries: false, gateHeld: false, matched: [], wrongKind: [], auto: [{} as never], ask: [], later: [], elsewhere: [], unexplained: [], ...over });

describe("Pre-save reconciliation summary", () => {
  it("agrees when balances add up and every line is accounted for", () => {
    expect(reconSummary(base({}))).toMatchObject({ ok: true, statementGap: 0, appGap: 0, unmatchedLines: 0, toSave: 1 });
  });
  it("reports a statement that doesn't add up and an app balance gap", () => {
    const r = reconSummary(base({ file: { ...base({}).file, closing: 850 }, gate: { after: 900, difference: -50, ok: false } as never }));
    expect(r.statementGap).toBe(-50); expect(r.appGap).toBe(-50); expect(r.ok).toBe(false);
  });
  it("counts lines needing a decision, held or elsewhere as unmatched", () => {
    expect(reconSummary(base({ ask: [{} as never], later: [{} as never, {} as never] })).unmatchedLines).toBe(3);
  });
  it("doesn't compare app balance when the app has newer entries", () => {
    expect(reconSummary(base({ newerEntries: true })).appGap).toBeNull();
  });
});

describe("Balance after saving (reconciliation success)", () => {
  const line = (amount: number, direction: "debit" | "credit" = "debit") => ({ amount, direction });
  it("matches when the posted lines bring the app to the printed closing", () => {
    expect(savedBalanceCheck(base({}), [line(100)])).toEqual({ result: "matched", gap: 0 });
  });
  it("differs when an asked line was declined", () => {
    expect(savedBalanceCheck(base({}), [])).toEqual({ result: "differs", gap: -100 });
  });
  it("is not compared without a printed closing or with newer entries", () => {
    expect(savedBalanceCheck(base({ file: { ...base({}).file, closing: null } }), [line(100)]).result).toBe("not_compared");
    expect(savedBalanceCheck(base({ newerEntries: true }), [line(100)]).result).toBe("not_compared");
  });
  it("uses the printed opening for an account created from the statement", () => {
    expect(savedBalanceCheck(base({ isNew: true, appBalance: null, accountId: null }), [line(100)]).result).toBe("matched");
  });
  it("treats card balances as owed (liability sign)", () => {
    const card = base({ liability: true, appBalance: 500, file: { ...base({}).file, opening: 500, closing: 600 } });
    expect(savedBalanceCheck(card, [line(100)]).result).toBe("matched");
  });
});
