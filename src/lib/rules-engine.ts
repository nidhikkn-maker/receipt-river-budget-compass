// Financial Rules Builder: user-configurable monitoring rules, no programming needed.
// Pure, tested. Rules are evaluated against recorded data and produce derived alerts —
// nothing is stored per evaluation, so alerts clear themselves when the records are fixed.

import type { Commitment } from "./planning";
import type { Account, Txn } from "./ledger";
import type { PaymentReadiness } from "./readiness";

export const RULE_TRIGGERS = [
  "category_spend", "large_transaction", "duplicate_merchant", "emergency_below",
  "card_utilisation", "unverified_old", "recurring_increase", "payment_shortfall",
] as const;
export type RuleTrigger = (typeof RULE_TRIGGERS)[number];

export const TRIGGER_LABEL: Record<RuleTrigger, string> = {
  category_spend: "Category spending passes a limit",
  large_transaction: "A single transaction is above an amount",
  duplicate_merchant: "Same merchant paid twice within days",
  emergency_below: "Emergency reserve falls below its target",
  card_utilisation: "Credit card use passes a percentage",
  unverified_old: "Transactions stay unverified too long",
  recurring_increase: "A recurring payment's price rises",
  payment_shortfall: "A scheduled payment may lack funds",
};

export type RuleFrequency = "daily" | "weekly" | "monthly";
export type RulePriority = "high" | "medium" | "low";

export interface FinanceRule {
  id: string;
  name: string;
  trigger: RuleTrigger;
  /** Meaning depends on the trigger: ₹ amount, %, or days. */
  threshold: number;
  category: string | null;
  accountId: string | null;
  frequency: RuleFrequency;
  priority: RulePriority;
  notify: boolean;
  enabled: boolean;
}

/** Ready-made rules the user can add with one tap. */
export const RULE_TEMPLATES: Omit<FinanceRule, "id">[] = [
  { name: "Shopping over ₹20,000 this month", trigger: "category_spend", threshold: 20000, category: "Shopping", accountId: null, frequency: "daily", priority: "medium", notify: true, enabled: true },
  { name: "Any transaction above ₹25,000", trigger: "large_transaction", threshold: 25000, category: null, accountId: null, frequency: "daily", priority: "high", notify: true, enabled: true },
  { name: "Duplicate merchant payment", trigger: "duplicate_merchant", threshold: 3, category: null, accountId: null, frequency: "daily", priority: "medium", notify: true, enabled: true },
  { name: "Emergency reserve below target", trigger: "emergency_below", threshold: 0, category: null, accountId: null, frequency: "weekly", priority: "high", notify: true, enabled: true },
  { name: "Card use above 30%", trigger: "card_utilisation", threshold: 30, category: null, accountId: null, frequency: "daily", priority: "medium", notify: true, enabled: true },
  { name: "Unverified transactions older than 7 days", trigger: "unverified_old", threshold: 7, category: null, accountId: null, frequency: "daily", priority: "low", notify: true, enabled: true },
  { name: "Recurring payment price rise", trigger: "recurring_increase", threshold: 0, category: null, accountId: null, frequency: "weekly", priority: "medium", notify: true, enabled: true },
  { name: "Scheduled payment may lack funds", trigger: "payment_shortfall", threshold: 0, category: null, accountId: null, frequency: "daily", priority: "high", notify: true, enabled: true },
];

export interface RuleEvent {
  ruleId: string;
  ruleName: string;
  priority: RulePriority;
  message: string;
  detail?: string;
  /** Where to go in the app to look at it. */
  to: string;
}

interface RuleTxn extends Txn { merchant?: string | null; category?: string; title?: string }

export interface RuleData {
  transactions: RuleTxn[];
  accounts: Account[];
  commitments: Commitment[];
  /** Emergency reserve goals: [{ name, target, saved }]. */
  reserves: { name: string; target: number; saved: number }[];
  /** Card utilisation percentages by account id. */
  cardUtilisation: { accountId: string; name: string; pct: number }[];
  /** Recurring payments whose price rose: [{ name, from, to }]. */
  recurringIncreases: { name: string; from: number; to: number }[];
  readiness: PaymentReadiness[];
  today: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const days = (f: RuleFrequency) => (f === "daily" ? 1 : f === "weekly" ? 7 : 30);
const since = (today: string, n: number) => { const d = new Date(today + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Evaluate every enabled rule. A rule fires only when its defined condition is actually met. */
export function evaluateRules(rules: FinanceRule[], d: RuleData): RuleEvent[] {
  const out: RuleEvent[] = [];
  const month = d.today.slice(0, 7);
  const spend = d.transactions.filter((t) => (t.txnType ?? "expense") === "expense");

  for (const r of rules) {
    if (!r.enabled) continue;
    const windowStart = since(d.today, days(r.frequency));
    switch (r.trigger) {
      case "category_spend": {
        if (!r.category) break;
        const total = r2(spend.filter((t) => t.category === r.category && t.date.startsWith(month)).reduce((s, t) => s + t.amount, 0));
        if (total > r.threshold) out.push({ ruleId: r.id, ruleName: r.name, priority: r.priority, message: `${r.category} spending is ${money(total)} this month — over your ${money(r.threshold)} limit`, to: "/expenses" });
        break;
      }
      case "large_transaction": {
        const hits = spend.filter((t) => t.amount >= r.threshold && t.date >= windowStart && (!r.accountId || t.accountId === r.accountId));
        for (const t of hits.slice(0, 5)) out.push({ ruleId: r.id, ruleName: r.name, priority: r.priority, message: `${t.title ?? t.merchant ?? "A transaction"}: ${money(t.amount)} on ${t.date}`, to: "/expenses" });
        break;
      }
      case "duplicate_merchant": {
        const recent = spend.filter((t) => t.merchant?.trim() && t.date >= since(d.today, Math.max(2, r.threshold)));
        const seen = new Map<string, RuleTxn>();
        for (const t of recent) {
          const k = `${t.merchant!.trim().toLowerCase()}|${t.amount}`;
          const prev = seen.get(k);
          if (prev) { out.push({ ruleId: r.id, ruleName: r.name, priority: r.priority, message: `${t.merchant} paid ${money(t.amount)} twice — ${prev.date} and ${t.date}`, to: "/expenses" }); break; }
          seen.set(k, t);
        }
        break;
      }
      case "emergency_below": {
        for (const g of d.reserves) if (g.target > 0 && g.saved < (r.threshold > 0 ? r.threshold : g.target)) out.push({ ruleId: r.id, ruleName: r.name, priority: r.priority, message: `${g.name} reserve is ${money(g.saved)} of its ${money(g.target)} target`, to: "/wealth" });
        break;
      }
      case "card_utilisation": {
        for (const c of d.cardUtilisation) if (c.pct >= r.threshold && (!r.accountId || c.accountId === r.accountId)) out.push({ ruleId: r.id, ruleName: r.name, priority: r.priority, message: `${c.name} is ${c.pct}% used (limit set at ${r.threshold}%)`, to: "/wealth" });
        break;
      }
      case "unverified_old": {
        const cutoff = since(d.today, Math.max(1, r.threshold));
        const old = d.transactions.filter((t) => !t.reconciledAt && t.date <= cutoff && (t.txnType ?? "expense") !== "transfer");
        if (old.length) out.push({ ruleId: r.id, ruleName: r.name, priority: r.priority, message: `${old.length} transaction${old.length === 1 ? "" : "s"} older than ${r.threshold} days not yet verified against the bank`, to: "/reconcile" });
        break;
      }
      case "recurring_increase": {
        for (const x of d.recurringIncreases) out.push({ ruleId: r.id, ruleName: r.name, priority: r.priority, message: `${x.name} went up from ${money(x.from)} to ${money(x.to)}`, to: "/plan" });
        break;
      }
      case "payment_shortfall": {
        for (const p of d.readiness.filter((x) => x.status === "shortfall")) out.push({ ruleId: r.id, ruleName: r.name, priority: r.priority, message: `${p.name} on ${p.date} may be short by ${money(p.shortfall)}`, to: "/plan" });
        break;
      }
    }
  }
  const rank: Record<RulePriority, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.priority] - rank[b.priority]);
}

export function validateRule(r: Omit<FinanceRule, "id">): void {
  if (!r.name.trim()) throw new Error("Give the rule a name");
  if (!RULE_TRIGGERS.includes(r.trigger)) throw new Error("Pick a condition");
  if (!(r.threshold >= 0)) throw new Error("Threshold can't be negative");
  if (r.trigger === "category_spend" && !r.category) throw new Error("Pick the category to watch");
  if (r.trigger === "card_utilisation" && (r.threshold < 1 || r.threshold > 100)) throw new Error("Card percentage must be 1–100");
}
