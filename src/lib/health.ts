// Financial Health Score (0–100): an internal wellness indicator, NOT a credit-bureau (CIBIL) score.
// Each component is computed from recorded data; missing data makes the component unavailable, never guessed.
import { accountBalance, cashflow, type Account } from "./ledger";
import { dueStatus, type Commitment } from "./planning";
import { budgetUsage, type Budgets, type Expense } from "./expenses";

const r0 = (n: number) => Math.round(n);
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const monthOf = (d: string, back: number) => { const [y, m] = d.split("-").map(Number); const t = new Date(Date.UTC(y!, m! - 1 - back, 1)); return t.toISOString().slice(0, 7); };
const lastDay = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10); };

export const HEALTH_WEIGHTS = { liquidity: 25, debt: 25, spending: 20, savings: 15, payments: 15 } as const;
export type HealthKey = keyof typeof HEALTH_WEIGHTS;
export const HEALTH_LABEL: Record<HealthKey, string> = { liquidity: "Liquidity and cash reserves", debt: "Debt and repayment burden", spending: "Spending discipline", savings: "Savings performance", payments: "Payment discipline" };
export const HEALTH_METHOD: Record<HealthKey, string> = {
  liquidity: "Cash in bank/cash/wallet accounts ÷ average monthly spending (last 3 full months). 6+ months = 100, 0 = 0.",
  debt: "Monthly EMIs ÷ average monthly income (last 3 full months). 10% or less = 100, 50% or more = 0. Credit-card balance over 30% of limit reduces it.",
  spending: "Share of budgeted categories that stayed within budget last month.",
  savings: "(Income − spending) ÷ income over the last 3 full months. 30% or more = 100, 0% or less = 0.",
  payments: "Recurring payments currently overdue: none = 100, each overdue payment −25.",
};

export interface HealthComponent { key: HealthKey; label: string; weight: number; score: number | null; detail: string; method: string }
export interface HealthResult { score: number | null; complete: boolean; components: HealthComponent[]; improving: string[]; reducing: string[]; recommendations: string[]; asOf: string }

export interface HealthInput { accounts: Account[]; transactions: Expense[]; commitments: Commitment[]; emis: number; budgets: Budgets; asOf: string }

export function healthScore(i: HealthInput): HealthResult {
  const tx = i.transactions.filter((t) => t.date <= i.asOf);
  const months = [1, 2, 3].map((b) => monthOf(i.asOf, b));
  const flows = months.map((m) => cashflow(tx, `${m}-01`, lastDay(m)));
  const hasHistory = tx.some((t) => t.date <= lastDay(months[0]!) && t.date >= `${months[2]}-01`);
  const avgSpend = flows.reduce((s, f) => s + f.spent, 0) / 3, avgIncome = flows.reduce((s, f) => s + f.income, 0) / 3;
  const cashAcc = i.accounts.filter((a) => !a.archived && ["savings", "current", "cash", "wallet"].includes(a.kind));
  const cash = cashAcc.reduce((s, a) => s + accountBalance(a, tx), 0);
  const cards = i.accounts.filter((a) => !a.archived && a.kind === "credit_card" && (a.creditLimit ?? 0) > 0);
  const util = cards.length ? cards.reduce((s, a) => s + Math.max(0, accountBalance(a, tx)), 0) / cards.reduce((s, a) => s + (a.creditLimit ?? 0), 0) : 0;

  const c: Record<HealthKey, { score: number | null; detail: string }> = {
    liquidity: !cashAcc.length || !hasHistory || avgSpend <= 0 ? { score: null, detail: !cashAcc.length ? "Add a bank or cash account." : "Needs 3 months of recorded spending." }
      : { score: r0(clamp((cash / avgSpend / 6) * 100)), detail: `${(cash / avgSpend).toFixed(1)} months of spending in cash` },
    debt: !hasHistory || avgIncome <= 0 ? { score: null, detail: "Record income for the last 3 months." }
      : (() => { const ratio = i.emis / avgIncome; let s = clamp(((0.5 - ratio) / 0.4) * 100); if (util > 0.3) s = clamp(s - (util - 0.3) * 100); return { score: r0(s), detail: `EMIs are ${(ratio * 100).toFixed(0)}% of income${cards.length ? `, cards ${(util * 100).toFixed(0)}% used` : ""}` }; })(),
    spending: (() => { const u = budgetUsage(tx.filter((t) => (t.txnType ?? "expense") === "expense"), i.budgets, months[0]!).filter((b) => b.budget > 0); if (!u.length) return { score: null, detail: "Set at least one monthly budget." };
      const ok = u.filter((b) => b.spent <= b.budget).length; return { score: r0((ok / u.length) * 100), detail: `${ok} of ${u.length} budgets kept last month` }; })(),
    savings: !hasHistory || avgIncome <= 0 ? { score: null, detail: "Record income for the last 3 months." }
      : (() => { const rate = (avgIncome - avgSpend) / avgIncome; return { score: r0(clamp((rate / 0.3) * 100)), detail: `Saving ${(rate * 100).toFixed(0)}% of income` }; })(),
    payments: !i.commitments.length ? { score: null, detail: "Add recurring bills or EMIs in Plan." }
      : (() => { const overdue = i.commitments.filter((x) => dueStatus(x, i.asOf) === "overdue").length; return { score: clamp(100 - overdue * 25), detail: overdue ? `${overdue} payment${overdue > 1 ? "s" : ""} overdue` : "No overdue payments" }; })(),
  };
  const components = (Object.keys(HEALTH_WEIGHTS) as HealthKey[]).map((key) => ({ key, label: HEALTH_LABEL[key], weight: HEALTH_WEIGHTS[key], score: c[key].score, detail: c[key].detail, method: HEALTH_METHOD[key] }));
  const avail = components.filter((x) => x.score != null);
  const w = avail.reduce((s, x) => s + x.weight, 0);
  // Fewer than 3 measurable components (or under 60% of the weight) is too thin to score honestly.
  const score = avail.length >= 3 && w >= 60 ? r0(avail.reduce((s, x) => s + x.score! * x.weight, 0) / w) : null;
  const improving = avail.filter((x) => x.score! >= 70).map((x) => `${x.label}: ${x.detail}`);
  const reducing = avail.filter((x) => x.score! < 50).map((x) => `${x.label}: ${x.detail}`);
  const tips: Record<HealthKey, string> = {
    liquidity: "Build cash reserves towards 6 months of spending before new discretionary purchases.",
    debt: "Prepay the costliest loan or keep card usage under 30% of the limit.",
    spending: "Review the categories that went over budget and adjust the budget or the habit.",
    savings: "Set up an automatic transfer to savings on salary day.",
    payments: "Clear overdue payments and turn on reminders in Settings.",
  };
  const recommendations = [...avail.filter((x) => x.score! < 70).sort((a, b) => a.score! - b.score!).map((x) => tips[x.key]),
    ...components.filter((x) => x.score == null).map((x) => `To measure ${x.label.toLowerCase()}: ${x.detail}`)];
  return { score, complete: avail.length === components.length, components, improving, reducing, recommendations, asOf: i.asOf };
}

/** Score at the end of each of the last n months, from data recorded up to that date. */
export function healthHistory(i: Omit<HealthInput, "asOf">, today: string, n = 6) {
  return Array.from({ length: n }, (_, k) => monthOf(today, n - 1 - k)).map((m) => {
    const asOf = m === today.slice(0, 7) ? today : lastDay(m);
    return { month: m, score: healthScore({ ...i, asOf }).score };
  });
}
