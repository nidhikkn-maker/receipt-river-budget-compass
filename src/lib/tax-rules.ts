/** Versioned income-tax rules (new regime, individuals) by financial year. Estimates only. */
export interface TaxRuleSet { fy: string; source: string; slabs: [number, number][]; rebateLimit: number; cess: number }

/** slabs: [upper limit, rate]; last upper is Infinity. */
export const TAX_RULES: TaxRuleSet[] = [
  { fy: "2024-25", source: "Finance Act 2024 (new regime)", slabs: [[300000, 0], [700000, 0.05], [1000000, 0.1], [1200000, 0.15], [1500000, 0.2], [Infinity, 0.3]], rebateLimit: 700000, cess: 0.04 },
  { fy: "2025-26", source: "Finance Act 2025 (new regime)", slabs: [[400000, 0], [800000, 0.05], [1200000, 0.1], [1600000, 0.15], [2000000, 0.2], [2400000, 0.25], [Infinity, 0.3]], rebateLimit: 1200000, cess: 0.04 },
];

/** Latest rule set on or before the year; later years reuse it and say so. */
export function rulesFor(fy: string): { rules: TaxRuleSet; carriedForward: boolean } {
  const sorted = [...TAX_RULES].sort((a, b) => a.fy.localeCompare(b.fy));
  const exact = sorted.find((r) => r.fy === fy);
  if (exact) return { rules: exact, carriedForward: false };
  const before = sorted.filter((r) => r.fy < fy).pop();
  return { rules: (before ?? sorted[0])!, carriedForward: true };
}

/** Slab tax + rebate + cess; surcharge not included. */
export function estimateTax(income: number, rules: TaxRuleSet): number {
  if (income <= 0 || income <= rules.rebateLimit) return 0;
  let tax = 0, prev = 0;
  for (const [upper, rate] of rules.slabs) {
    if (income > prev) tax += (Math.min(income, upper) - prev) * rate;
    prev = upper;
  }
  return Math.round(tax * (1 + rules.cess));
}
