import { describe, expect, it } from "vitest";
import { advice, categoryBaseline, inflationFor, project, realValue } from "./projection";

const base = { categories: [{ category: "Education", monthly: 1000 }, { category: "Food", monthly: 2000 }], monthlyIncome: 10000, currentSavings: 0, years: 10, generalInflation: 6, incomeGrowth: 5, savingsReturn: 0 };

describe("projection", () => {
  it("compounds each category at its own rate", () => {
    const r = project(base);
    expect(r).toHaveLength(10);
    expect(r[0].byCategory.Education).toBe(12000);
    expect(r[1].byCategory.Education).toBe(13200);
    expect(r[1].byCategory.Food).toBe(25560);
  });
  it("falls back to general inflation and honours overrides", () => {
    expect(inflationFor("Pets", 6)).toBe(6);
    expect(inflationFor("Food", 6, { Food: 3 })).toBe(3);
  });
  it("accumulates savings with returns", () => {
    const r = project({ ...base, years: 2, savingsReturn: 10, categories: [], currentSavings: 1000 });
    expect(r[0].savings).toBe(121100);
    expect(r[1].savings).toBe(259210);
  });
  it("computes real value", () => { expect(realValue(100, 10, 1)).toBe(90.91); });
  it("averages baseline over months", () => {
    expect(categoryBaseline([{ category: "Food", amount: 600, date: "2026-01-05" }, { category: "Food", amount: 300, date: "2026-03-05" }], "2026-01-01", "2026-03-31")).toEqual([{ category: "Food", monthly: 300 }]);
  });
  it("warns when spending overtakes income", () => {
    const a = advice({ ...base, monthlyIncome: 3100, incomeGrowth: 0 }, project({ ...base, monthlyIncome: 3100, incomeGrowth: 0 }));
    expect(a[0].title).toMatch(/year 2/);
  });
});
