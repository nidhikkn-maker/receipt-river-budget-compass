// Purchase Cooling-Off Assistant: a decision queue for discretionary purchases.
// Pure, tested. A proposal is never an expense — it only becomes one if the user later
// records it themselves. Cancelled and postponed items stay in the decision history.

export type CoolingStatus = "waiting" | "ready" | "purchased" | "postponed" | "cancelled";

export interface CoolingOffItem {
  id: string;
  title: string;
  amount: number;
  category: string;
  proposedDate: string;
  priority: "low" | "medium" | "high";
  reason: string;
  paymentMethod: string | null;
  /** Days to wait before deciding. */
  waitDays: number;
  createdAt: string;
  status: CoolingStatus;
  decidedAt: string | null;
  note?: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

export function validateCoolingItem(x: Pick<CoolingOffItem, "title" | "amount" | "waitDays" | "proposedDate">): void {
  if (!x.title.trim()) throw new Error("Describe the purchase");
  if (!(x.amount > 0)) throw new Error("Enter the estimated amount");
  if (x.amount > 100000000) throw new Error("That amount looks too large — check it");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x.proposedDate)) throw new Error("Pick the proposed date");
  if (!(x.waitDays >= 0 && x.waitDays <= 365)) throw new Error("Waiting period must be 0–365 days");
}

/** Where a waiting item stands: still cooling, or ready to decide. */
export function coolingStatus(item: CoolingOffItem, today: string): { status: CoolingStatus; readyAt: string; daysLeft: number } {
  const readyAt = addDays(item.createdAt.slice(0, 10), item.waitDays);
  if (item.status !== "waiting" && item.status !== "ready") return { status: item.status, readyAt, daysLeft: 0 };
  const daysLeft = Math.max(0, daysBetween(today, readyAt));
  return { status: daysLeft === 0 ? "ready" : "waiting", readyAt, daysLeft };
}

export interface CoolingAffordability {
  verdict: "comfortable" | "tight" | "risky";
  /** Safe-to-spend after buying. */
  afterPurchase: number;
  /** True when upcoming obligations stay covered. */
  obligationsCovered: boolean;
  steps: { label: string; amount: number }[];
}

/** How this purchase would affect liquidity, using the same safe-to-spend figure as Home. */
export function affordability(item: Pick<CoolingOffItem, "amount">, input: { safeToSpend: number; upcomingObligations: number; cash: number }): CoolingAffordability {
  const after = r2(input.safeToSpend - item.amount);
  const obligationsCovered = after >= 0;
  const verdict = after < 0 ? "risky" : after < item.amount ? "tight" : "comfortable";
  return {
    verdict, afterPurchase: after, obligationsCovered,
    steps: [
      { label: "Safe to spend today", amount: input.safeToSpend },
      { label: "This purchase", amount: -item.amount },
      { label: "Left after buying", amount: after },
      { label: "Upcoming obligations already covered", amount: input.upcomingObligations },
    ],
  };
}

/** Decision history: decided items, newest first. Cancelled purchases never touch balances. */
export function decisionHistory(items: CoolingOffItem[]): CoolingOffItem[] {
  return items.filter((i) => i.status === "purchased" || i.status === "postponed" || i.status === "cancelled")
    .sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""));
}

/** What the queue saved: cancelled + postponed amounts. */
export function avoidedSpending(items: CoolingOffItem[]): number {
  return r2(items.filter((i) => i.status === "cancelled" || i.status === "postponed").reduce((s, i) => s + i.amount, 0));
}
