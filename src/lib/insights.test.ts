import { describe, expect, it } from "vitest";
import { anomalies, budgetRecommendations, lastMonthCompare, lastMonths, monthToDateCompare, monthlySeries, netWorthSeries, savingsIdeas, spendBy, weeklySpend } from "./insights";
import type { Account } from "./ledger";

type R = Parameters<typeof spendBy>[0][number];
let n = 0;
const e = (date: string, amount: number, category = "Groceries", extra: Partial<R> = {}): R => ({ id: `t${String(++n).padStart(3, "0")}`, date, amount, category, merchant: extra.merchant ?? "Shop", title: "x", txnType: "expense", ...extra });

describe("trends", () => {
  it("lists months oldest first across a year boundary", () => {
    expect(lastMonths("2026-02-10", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
  it("monthly income vs spending excludes transfers and nets refunds", () => {
    const rows = [e("2026-09-03", 1000), { ...e("2026-09-05", 50000), txnType: "income" as const, category: "Salary" }, { ...e("2026-09-06", 20000), txnType: "transfer" as const }, { ...e("2026-09-07", 200), txnType: "refund" as const }];
    const s = monthlySeries(rows, "2026-10-15", 2);
    expect(s[0]).toMatchObject({ month: "2026-09", income: 50000, spent: 800, net: 49200, savingsRate: 98, cumulative: 49200 });
    expect(s[1]).toMatchObject({ month: "2026-10", spent: 0 });
  });
  it("weekly spend groups by Monday-start weeks", () => {
    const w = weeklySpend([e("2026-10-26", 100), e("2026-10-31", 50), e("2026-10-25", 70)], "2026-10-31", 2);
    expect(w).toEqual([{ week: "2026-10-19", label: "19/10", spent: 70 }, { week: "2026-10-26", label: "26/10", spent: 150 }]);
  });
  it("ranks merchants by spend", () => {
    expect(spendBy([e("2026-10-01", 10, "A", { merchant: "X" }), e("2026-10-02", 30, "A", { merchant: "Y" }), e("2026-10-03", 5, "A", { merchant: "X" })], (t) => t.merchant ?? "")).toEqual([{ name: "Y", amount: 30 }, { name: "X", amount: 15 }]);
  });
});

describe("comparisons explain increases", () => {
  const rows = [e("2026-09-02", 4000, "Dining"), e("2026-09-20", 1000, "Groceries"), e("2026-10-02", 9000, "Dining"), e("2026-10-03", 800, "Groceries")];
  it("compares last full month with the month before", () => {
    const c = lastMonthCompare(rows, "2026-11-05");
    expect(c.months).toEqual(["2026-09", "2026-10"]);
    expect(c.rows[0]).toEqual({ category: "Dining", now: 9000, before: 4000, delta: 5000 });
    expect(c.total).toEqual({ now: 9800, before: 5000, delta: 4800 });
  });
  it("compares month-to-date with the same days last month", () => {
    const c = monthToDateCompare(rows, "2026-10-05");
    expect(c.total).toEqual({ now: 9800, before: 4000, delta: 5800 });
  });
});

describe("anomalies", () => {
  it("flags a charge far above the usual category amount", () => {
    const history = ["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-09-15"].map((d) => e(d, 1000, "Fuel & Transport"));
    const big = e("2026-10-20", 6000, "Fuel & Transport");
    const a = anomalies([...history, big], "2026-10-31");
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ id: big.id, typical: 1000 });
  });
  it("flags the same merchant charging the same amount twice within two days", () => {
    const a = anomalies([e("2026-10-20", 499, "Entertainment", { merchant: "Netflix" }), e("2026-10-21", 499, "Entertainment", { merchant: "netflix" })], "2026-10-31");
    expect(a.map((x) => x.reason)[0]).toContain("possible double charge");
  });
  it("needs enough history before calling something unusual", () => {
    expect(anomalies([e("2026-09-01", 100, "Health"), e("2026-10-20", 9000, "Health")], "2026-10-31")).toEqual([]);
  });
});

describe("budget suggestions and savings ideas", () => {
  it("suggests the 3-month average rounded up to ₹500", () => {
    const rows = [e("2026-07-10", 9000, "Dining"), e("2026-08-10", 10000, "Dining"), e("2026-09-10", 11000, "Dining"), e("2026-10-10", 50000, "Dining")];
    expect(budgetRecommendations(rows, { Dining: 8000 }, "2026-10-31")[0]).toEqual({ category: "Dining", average: 10000, suggested: 10000, current: 8000, note: "Budget is below what you usually spend" });
  });
  it("savings ideas cite the verified increase and subscription total", () => {
    const rows = [e("2026-08-10", 5000, "Shopping"), e("2026-09-10", 9000, "Shopping")];
    const ideas = savingsIdeas(rows, "2026-10-05", 1499);
    expect(ideas[0]!.amount).toBe(4000);
    expect(ideas.at(-1)).toEqual({ idea: "Review active subscriptions — total monthly cost", amount: 1499 });
  });
});

describe("net worth trend", () => {
  it("uses month-end balances and valuations", () => {
    const acc: Account[] = [
      { id: "b", name: "Bank", kind: "savings", openingBalance: 10000, archived: false },
      { id: "mf", name: "Index fund", kind: "investment", openingBalance: 0, archived: false },
      { id: "cc", name: "Card", kind: "credit_card", openingBalance: 0, archived: false },
    ];
    const txns = [{ id: "1", date: "2026-09-10", amount: 5000, accountId: "b", toAccountId: "mf", txnType: "transfer" as const }, { id: "2", date: "2026-10-03", amount: 2000, accountId: "cc", txnType: "expense" as const }];
    const s = netWorthSeries(acc, txns, [{ accountId: "mf", value: 5600, valuedOn: "2026-10-15", source: "manual" }], "2026-10-20", 2);
    expect(s.map((x) => x.net)).toEqual([10000, 8600]);
  });
});
