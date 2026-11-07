import { describe, expect, it } from "vitest";
import { evaluateRules, validateRule, RULE_TEMPLATES, type FinanceRule, type RuleData } from "./rules-engine";

const today = "2026-10-31";
const rule = (over: Partial<FinanceRule>): FinanceRule => ({
  id: over.id ?? "r1", name: "Rule", trigger: "category_spend", threshold: 1000, category: null, accountId: null,
  frequency: "daily", priority: "medium", notify: true, enabled: true, ...over,
});
const data = (over: Partial<RuleData>): RuleData => ({
  transactions: [], accounts: [], commitments: [], reserves: [], cardUtilisation: [], recurringIncreases: [], readiness: [], today, ...over,
});

describe("evaluateRules", () => {
  it("fires category_spend only when this month's spending passes the limit", () => {
    const txns = [
      { id: "t1", amount: 15000, date: "2026-10-10", category: "Shopping", txnType: "expense" as const },
      { id: "t2", amount: 8000, date: "2026-10-12", category: "Shopping", txnType: "expense" as const },
      { id: "t3", amount: 5000, date: "2026-09-12", category: "Shopping", txnType: "expense" as const },
    ];
    const on = evaluateRules([rule({ threshold: 20000, category: "Shopping" })], data({ transactions: txns }));
    expect(on).toHaveLength(1);
    expect(on[0]!.message).toContain("23,000");
    const off = evaluateRules([rule({ threshold: 25000, category: "Shopping" })], data({ transactions: txns }));
    expect(off).toHaveLength(0);
  });

  it("never fires when the rule is disabled", () => {
    const txns = [{ id: "t1", amount: 50000, date: today, category: "Shopping", txnType: "expense" as const }];
    expect(evaluateRules([rule({ enabled: false, threshold: 1, category: "Shopping" })], data({ transactions: txns }))).toHaveLength(0);
  });

  it("fires large_transaction within the rule's frequency window only", () => {
    const txns = [
      { id: "t1", amount: 30000, date: today, txnType: "expense" as const, title: "TV" },
      { id: "t2", amount: 40000, date: "2026-10-01", txnType: "expense" as const, title: "Old TV" },
    ];
    const daily = evaluateRules([rule({ trigger: "large_transaction", threshold: 25000, frequency: "daily" })], data({ transactions: txns }));
    expect(daily).toHaveLength(1);
    expect(daily[0]!.message).toContain("TV");
    const monthly = evaluateRules([rule({ trigger: "large_transaction", threshold: 25000, frequency: "monthly" })], data({ transactions: txns }));
    expect(monthly).toHaveLength(2);
  });

  it("flags the same merchant paid the same amount twice within the window", () => {
    const txns = [
      { id: "t1", amount: 499, date: "2026-10-29", merchant: "Netflix", txnType: "expense" as const },
      { id: "t2", amount: 499, date: "2026-10-30", merchant: "netflix", txnType: "expense" as const },
    ];
    const on = evaluateRules([rule({ trigger: "duplicate_merchant", threshold: 3 })], data({ transactions: txns }));
    expect(on).toHaveLength(1);
    expect(on[0]!.message).toContain("twice");
  });

  it("fires emergency_below against the reserve target and card_utilisation at the percentage", () => {
    const ev = evaluateRules(
      [rule({ trigger: "emergency_below", threshold: 0 }), rule({ id: "r2", trigger: "card_utilisation", threshold: 30 })],
      data({ reserves: [{ name: "Emergency", target: 100000, saved: 40000 }], cardUtilisation: [{ accountId: "c1", name: "AMEX", pct: 45 }] }),
    );
    expect(ev).toHaveLength(2);
    expect(ev.map((e) => e.ruleId).sort()).toEqual(["r1", "r2"]);
  });

  it("fires payment_shortfall only for payments the monitor marks short", () => {
    const readiness = [
      { commitmentId: "c1", name: "Rent", date: "2026-11-05", amount: 20000, accountId: "a1", accountName: "HDFC", status: "shortfall" as const, projected: 12000, shortfall: 8000, steps: [] },
      { commitmentId: "c2", name: "OTT", date: "2026-11-06", amount: 500, accountId: "a1", accountName: "HDFC", status: "ready" as const, projected: 12000, shortfall: 0, steps: [] },
    ];
    const ev = evaluateRules([rule({ trigger: "payment_shortfall", threshold: 0 })], data({ readiness }));
    expect(ev).toHaveLength(1);
    expect(ev[0]!.message).toContain("Rent");
  });

  it("orders events high priority first", () => {
    const txns = [{ id: "t1", amount: 30000, date: today, txnType: "expense" as const, title: "TV" }];
    const ev = evaluateRules(
      [rule({ id: "low", trigger: "unverified_old", threshold: 7, priority: "low" }), rule({ id: "high", trigger: "large_transaction", threshold: 25000, priority: "high" })],
      data({ transactions: [...txns, { id: "t2", amount: 100, date: "2026-10-01", txnType: "expense" as const }] }),
    );
    expect(ev[0]!.priority).toBe("high");
  });
});

describe("validateRule + templates", () => {
  it("requires a category for category_spend and 1–100 for card utilisation", () => {
    expect(() => validateRule(rule({ trigger: "category_spend", category: null }))).toThrow(/category/);
    expect(() => validateRule(rule({ trigger: "card_utilisation", threshold: 150 }))).toThrow(/1–100/);
    expect(() => validateRule(rule({ trigger: "large_transaction", threshold: 25000 }))).not.toThrow();
  });
  it("ships the document's example rules as valid templates", () => {
    expect(RULE_TEMPLATES.length).toBeGreaterThanOrEqual(8);
    for (const t of RULE_TEMPLATES) expect(() => validateRule(t)).not.toThrow();
  });
});
