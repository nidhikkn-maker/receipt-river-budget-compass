/** Long-range (multi-year) inflation projections. Pure, tested; illustrative not advice. */
export interface CategoryBase { category: string; monthly: number }
export interface ProjectionInput { categories: CategoryBase[]; monthlyIncome: number; currentSavings: number; years: number; generalInflation: number; incomeGrowth: number; savingsReturn: number; overrides?: Record<string, number> }

/** Long-run Indian category inflation assumptions (% per year). Editable by the user. */
export const CATEGORY_INFLATION: Record<string, number> = {
  Education: 10, Health: 9, Medical: 9, Healthcare: 9, Housing: 7, Rent: 7, Food: 6.5, Groceries: 6.5, Dining: 6.5,
  Travel: 6, Transport: 5.5, Fuel: 5.5, Utilities: 5, Insurance: 7, Shopping: 4.5, Entertainment: 5, Subscriptions: 4, Electronics: 2,
};
export const inflationFor = (cat: string, general: number, overrides: Record<string, number> = {}) =>
  overrides[cat] ?? CATEGORY_INFLATION[cat] ?? general;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Average monthly spend per category across the given months of expense rows. */
export function categoryBaseline(rows: { category: string; amount: number; date: string }[], from: string, to: string): CategoryBase[] {
  const months = Math.max(1, (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1);
  const sums = new Map<string, number>();
  for (const r of rows) if (r.date >= from && r.date <= to) sums.set(r.category, (sums.get(r.category) ?? 0) + r.amount);
  return [...sums].map(([category, s]) => ({ category, monthly: r2(s / months) })).filter(c => c.monthly > 0).sort((a, b) => b.monthly - a.monthly);
}

export interface YearRow { year: number; spend: number; income: number; saved: number; savings: number; savingsFlat: number; byCategory: Record<string, number> }

export function project(i: ProjectionInput): YearRow[] {
  const rows: YearRow[] = [];
  let savings = i.currentSavings, flat = i.currentSavings;
  for (let y = 1; y <= i.years; y++) {
    const byCategory: Record<string, number> = {};
    let spend = 0;
    for (const c of i.categories) { const v = c.monthly * 12 * (1 + inflationFor(c.category, i.generalInflation, i.overrides) / 100) ** (y - 1); byCategory[c.category] = r2(v); spend += v; }
    const income = i.monthlyIncome * 12 * (1 + i.incomeGrowth / 100) ** (y - 1);
    const saved = income - spend;
    savings = savings * (1 + i.savingsReturn / 100) + saved;
    flat = flat + saved;
    rows.push({ year: y, spend: r2(spend), income: r2(income), saved: r2(saved), savings: r2(savings), savingsFlat: r2(flat), byCategory });
  }
  return rows;
}

/** What ₹amount today buys after `years` of inflation. */
export const realValue = (amount: number, inflation: number, years: number) => r2(amount / (1 + inflation / 100) ** years);

export interface Advice { title: string; why: string }
export function advice(i: ProjectionInput, rows: YearRow[]): Advice[] {
  const out: Advice[] = []; const last = rows[rows.length - 1]; if (!last) return out;
  const first = rows[0];
  const shortYear = rows.find(r => r.saved < 0);
  if (shortYear) out.push({ title: `Spending overtakes income in year ${shortYear.year}`, why: `Expenses grow faster than your assumed ${i.incomeGrowth}% income growth. Raise income growth or cut the fastest-rising categories before then.` });
  const growth = i.categories.map(c => ({ c: c.category, mult: (last.byCategory[c.category] ?? 0) / Math.max(1, c.monthly * 12), add: (last.byCategory[c.category] ?? 0) - c.monthly * 12 })).sort((a, b) => b.add - a.add);
  if (growth[0]) out.push({ title: `${growth[0].c} is your biggest future cost`, why: `It grows ${growth[0].mult.toFixed(1)}× to ₹${Math.round(last.byCategory[growth[0].c]).toLocaleString("en-IN")}/year. Start a dedicated fund or lock prices (e.g. insurance, prepaid fees) now.` });
  if (i.savingsReturn <= i.generalInflation) out.push({ title: "Your savings lose value", why: `A ${i.savingsReturn}% return is below ${i.generalInflation}% inflation, so money shrinks in real terms. Consider investments that historically beat inflation, matched to your risk.` });
  const rate = first.income > 0 ? first.saved / first.income : 0;
  if (rate < 0.2) out.push({ title: "Aim to save at least 20% of income", why: `You currently save about ${Math.round(rate * 100)}%. Each extra ₹1,000/month invested at ${i.savingsReturn}% grows to about ₹${Math.round(fv(12000, i.savingsReturn, i.years)).toLocaleString("en-IN")} in ${i.years} years.` });
  out.push({ title: "Build an inflation-adjusted emergency fund", why: `Six months of year-${i.years} expenses is ₹${Math.round(last.spend / 2).toLocaleString("en-IN")}, versus ₹${Math.round(first.spend / 2).toLocaleString("en-IN")} today.` });
  return out;
}
const fv = (annual: number, rate: number, years: number) => { let s = 0; for (let y = 0; y < years; y++) s = s * (1 + rate / 100) + annual; return s; };
