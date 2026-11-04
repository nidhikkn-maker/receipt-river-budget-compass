import { describe, expect, it } from "vitest";
import { reconSummary } from "./summary";
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
