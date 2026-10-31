// AI Financial Autopilot: continuously evaluates the recorded position and recommends actions.
// Pure, tested. Every recommendation is derived from the same engines the screens use, carries
// its supporting calculation, and never initiates anything — the user reviews, accepts,
// dismisses or snoozes each one.

import type { PaymentReadiness } from "./readiness";

export type AutopilotPriority = "high" | "medium" | "low";
export interface AutopilotRecommendation {
  /** Stable key so accept/dismiss/snooze survives re-evaluation. */
  key: string;
  title: string;
  detail: string;
  priority: AutopilotPriority;
  /** Estimated ₹ impact of acting, when known. */
  impact: number | null;
  /** Supporting calculation the user can open. */
  steps: { label: string; amount: number }[];
  /** Where to go to act. */
  actionLabel: string;
  to: string;
}

export type AutopilotAction = { status: "accepted" | "dismissed" | "later"; at: string; until?: string };

export interface AutopilotInput {
  today: string;
  readiness: PaymentReadiness[];
  /** Dates the forecast runs short. */
  shortDates: string[];
  lowestProjected: number;
  /** Overdue commitments: [{ name, amount, due }]. */
  overdue: { name: string; amount: number; due: string }[];
  /** Unusual recent transactions: [{ title, amount, reason }]. */
  anomalies: { title: string; amount: number; reason: string }[];
  subscriptions: {
    monthly: number;
    duplicates: { names: string[] }[];
    increases: { name: string; from: number; to: number }[];
  };
  pendingReimbursements: { count: number; amount: number; oldestDays: number };
  /** Categories over budget this month: [{ category, spent, budget }]. */
  overBudget: { category: string; spent: number; budget: number }[];
  lateIncome: { name: string; amount: number; daysLate: number }[];
  /** Cash above what the plan needs (idle money). */
  idleCash: number;
  /** Unreconciled transactions older than a week. */
  unreconciledOld: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Evaluate the recorded position and produce prioritised recommendations. */
export function autopilot(i: AutopilotInput): AutopilotRecommendation[] {
  const out: AutopilotRecommendation[] = [];

  for (const r of i.readiness.filter((x) => x.status === "shortfall")) {
    out.push({
      key: `shortfall:${r.commitmentId}:${r.date}`,
      title: `${r.name} may be short by ${money(r.shortfall)}`,
      detail: `Due ${r.date} from ${r.accountName ?? "an unassigned account"}. Move money or adjust the payment before then.`,
      priority: "high", impact: r.shortfall, steps: r.steps, actionLabel: "Review payment", to: "/plan",
    });
  }
  for (const o of i.overdue) {
    out.push({
      key: `overdue:${o.name}:${o.due}`, title: `${o.name} was due on ${o.due}`,
      detail: `${money(o.amount)} is still unpaid. Pay it or update the due date so the forecast stays honest.`,
      priority: "high", impact: o.amount, steps: [{ label: "Amount due", amount: o.amount }], actionLabel: "Open plan", to: "/plan",
    });
  }
  if (i.shortDates.length) {
    out.push({
      key: `forecast:${i.shortDates[0]}`, title: `Money runs short from ${i.shortDates[0]}`,
      detail: `The lowest projected point is ${money(i.lowestProjected)}. Acting early is cheaper than acting late.`,
      priority: "high", impact: null, steps: [{ label: "Lowest projected balance", amount: i.lowestProjected }], actionLabel: "See forecast", to: "/plan",
    });
  }
  for (const d of i.subscriptions.duplicates) {
    out.push({
      key: `dupsub:${d.names.join("&")}`, title: `Possible duplicate subscriptions: ${d.names.join(" & ")}`,
      detail: "Two plans look like the same service. Cancelling one stops the repeat charge.",
      priority: "medium", impact: null, steps: [], actionLabel: "Review subscriptions", to: "/plan",
    });
  }
  for (const x of i.subscriptions.increases) {
    out.push({
      key: `subrise:${x.name}:${x.to}`, title: `${x.name} went up from ${money(x.from)} to ${money(x.to)}`,
      detail: `That's ${money((x.to - x.from) * 12)} more a year if it stays. Check the plan or cancel.`,
      priority: "medium", impact: r2((x.to - x.from) * 12), steps: [{ label: "Was", amount: x.from }, { label: "Now", amount: x.to }, { label: "Extra per year", amount: r2((x.to - x.from) * 12) }], actionLabel: "Review", to: "/plan",
    });
  }
  if (i.pendingReimbursements.count > 0 && i.pendingReimbursements.oldestDays >= 14) {
    out.push({
      key: `reimb:${i.pendingReimbursements.oldestDays}`, title: `${money(i.pendingReimbursements.amount)} in reimbursements is waiting`,
      detail: `The oldest claim has been pending ${i.pendingReimbursements.oldestDays} days. Following up improves your cash position.`,
      priority: "medium", impact: i.pendingReimbursements.amount, steps: [{ label: "Pending claims", amount: i.pendingReimbursements.count }, { label: "Total waiting", amount: i.pendingReimbursements.amount }], actionLabel: "See claims", to: "/expenses",
    });
  }
  for (const b of i.overBudget) {
    out.push({
      key: `budget:${b.category}:${i.today.slice(0, 7)}`, title: `${b.category} is over budget`,
      detail: `${money(b.spent)} spent against ${money(b.budget)}. Reduce spending or raise the budget deliberately.`,
      priority: "medium", impact: r2(b.spent - b.budget), steps: [{ label: "Spent", amount: b.spent }, { label: "Budget", amount: -b.budget }], actionLabel: "Open budgets", to: "/budgets",
    });
  }
  for (const l of i.lateIncome) {
    out.push({
      key: `income:${l.name}:${l.daysLate}`, title: `${l.name} is ${l.daysLate} day${l.daysLate === 1 ? "" : "s"} late`,
      detail: `${money(l.amount)} was expected. Confirm it or mark it unconfirmed so plans don't count on it.`,
      priority: "medium", impact: l.amount, steps: [{ label: "Expected", amount: l.amount }], actionLabel: "Check income", to: "/plan",
    });
  }
  for (const a of i.anomalies.slice(0, 3)) {
    out.push({
      key: `anomaly:${a.title}:${a.amount}`, title: `Unusual: ${a.title}`,
      detail: `${money(a.amount)} — ${a.reason}. Worth a look if you don't recognise it.`,
      priority: "low", impact: a.amount, steps: [{ label: "Amount", amount: a.amount }], actionLabel: "See transaction", to: "/expenses",
    });
  }
  if (i.unreconciledOld > 0) {
    out.push({
      key: `recon:${i.unreconciledOld}`, title: `${i.unreconciledOld} transaction${i.unreconciledOld === 1 ? "" : "s"} not checked against the bank`,
      detail: "Matching them to a statement keeps every balance trustworthy.",
      priority: "low", impact: null, steps: [], actionLabel: "Reconcile", to: "/reconcile",
    });
  }
  if (i.idleCash > 0) {
    out.push({
      key: `idle:${Math.round(i.idleCash / 1000)}`, title: `${money(i.idleCash)} is sitting idle`,
      detail: "This is above what your commitments and reserves need. Moving it to a goal or investment puts it to work.",
      priority: "low", impact: i.idleCash, steps: [{ label: "Idle cash", amount: i.idleCash }], actionLabel: "Plan allocation", to: "/allocation",
    });
  }

  const rank: Record<AutopilotPriority, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.priority] - rank[b.priority]);
}

/** Apply saved accept/dismiss/snooze choices. Snoozed items return after their `until` date. */
export function applyAutopilotActions(recs: AutopilotRecommendation[], actions: Record<string, AutopilotAction>, today: string) {
  const active: AutopilotRecommendation[] = [];
  const accepted: AutopilotRecommendation[] = [];
  for (const r of recs) {
    const a = actions[r.key];
    if (!a) { active.push(r); continue; }
    if (a.status === "accepted") { accepted.push(r); continue; }
    if (a.status === "dismissed") continue;
    if (a.status === "later" && a.until && a.until > today) continue;
    active.push(r);
  }
  return { active, accepted };
}
