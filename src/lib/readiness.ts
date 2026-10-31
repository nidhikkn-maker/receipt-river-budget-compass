// Payment Readiness Monitor: for every upcoming payment, will the money be there?
// Pure, tested. Walks each account's projected balance in date order — income arriving
// after a bill can't pay it, earlier obligations and minimum balances are protected,
// and nothing is marked paid until it is confirmed.

import { accountBalance, type Account, type Txn } from "./ledger";
import { occurrences, type Commitment, type Occurrence } from "./planning";

export type ReadinessStatus = "ready" | "shortfall" | "unknown" | "overdue" | "paid";

export const READINESS_LABEL: Record<ReadinessStatus, string> = {
  ready: "Payment ready", shortfall: "Potential shortfall", unknown: "Not enough information", overdue: "Overdue", paid: "Paid",
};

export interface PaymentReadiness {
  commitmentId: string;
  name: string;
  date: string;
  amount: number;
  accountId: string | null;
  accountName: string | null;
  status: ReadinessStatus;
  /** Projected available funds in the paying account just before this payment. */
  projected: number | null;
  shortfall: number;
  /** The full calculation, shown when the user opens the detail. */
  steps: { label: string; amount: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface ReadinessInput {
  commitments: Commitment[];
  accounts: Account[];
  transactions: Txn[];
  today: string;
  horizonDays?: number;
}

/**
 * Readiness for every scheduled outgoing payment in the horizon.
 * An occurrence with no designated account is "unknown" unless there is exactly one
 * cash account, which is then assumed. Income counts only when confirmed and landing
 * in the paying account (or unassigned income into the default cash account).
 */
export function paymentReadiness(i: ReadinessInput): PaymentReadiness[] {
  const horizon = Math.max(1, i.horizonDays ?? 45);
  const end = addDays(i.today, horizon);
  const cashAccounts = i.accounts.filter((a) => !a.archived && ["savings", "current", "cash", "wallet"].includes(a.kind) && a.includeInCash !== false);
  const defaultAccount = cashAccounts[0] ?? null;
  const occ = occurrences(i.commitments, i.today, end);
  const outs = occ.filter((o) => o.direction === "out");
  const ins = occ.filter((o) => o.direction === "in" && o.confirmed);

  const accountFor = (o: Occurrence): Account | null => {
    const c = i.commitments.find((x) => x.id === o.commitmentId);
    const id = c?.accountId ?? null;
    if (id) return i.accounts.find((a) => a.id === id) ?? null;
    return cashAccounts.length === 1 ? defaultAccount : null;
  };

  const results: PaymentReadiness[] = [];
  for (const o of outs) {
    const c = i.commitments.find((x) => x.id === o.commitmentId);
    const account = accountFor(o);
    const base = { commitmentId: o.commitmentId, name: o.name, date: o.date, amount: o.amount, accountId: account?.id ?? null, accountName: account?.name ?? null };

    if (c?.status === "completed") { results.push({ ...base, status: "paid", projected: null, shortfall: 0, steps: [] }); continue; }
    if (o.overdue) { results.push({ ...base, status: "overdue", projected: null, shortfall: 0, steps: [{ label: `Was due on ${c?.nextDue ?? o.date}`, amount: -o.amount }] }); continue; }
    if (!account) {
      results.push({ ...base, status: "unknown", projected: null, shortfall: 0, steps: [{ label: "No paying account chosen — pick one on the Plan page", amount: 0 }] });
      continue;
    }

    const balance = accountBalance(account, i.transactions);
    const incomeBefore = ins.filter((x) => x.date <= o.date && (x.commitmentId ? (i.commitments.find((y) => y.id === x.commitmentId)?.accountId ?? (account.id === defaultAccount?.id ? account.id : null)) === account.id : account.id === defaultAccount?.id));
    const income = r2(incomeBefore.reduce((s, x) => s + x.amount, 0));
    const earlier = outs.filter((x) => x !== o && x.date < o.date && accountFor(x)?.id === account.id);
    const earlierTotal = r2(earlier.reduce((s, x) => s + x.amount, 0));
    const minBalance = account.minBalance ?? 0;
    const projected = r2(balance + income - earlierTotal - minBalance);
    const shortfall = r2(Math.max(0, o.amount - projected));
    results.push({
      ...base,
      status: shortfall > 0.004 ? "shortfall" : "ready",
      projected,
      shortfall,
      steps: [
        { label: `Latest balance in ${account.name}`, amount: balance },
        { label: "Confirmed income before the due date", amount: income },
        { label: "Earlier payments from this account", amount: -earlierTotal },
        { label: "Minimum balance protected", amount: -minBalance },
        { label: "Projected available", amount: projected },
        { label: `This payment`, amount: -o.amount },
      ],
    });
  }
  return results.sort((a, b) => a.date.localeCompare(b.date));
}

/** Counts for the Home summary strip. */
export function readinessSummary(list: PaymentReadiness[]) {
  return {
    ready: list.filter((r) => r.status === "ready").length,
    shortfall: list.filter((r) => r.status === "shortfall").length,
    unknown: list.filter((r) => r.status === "unknown").length,
    overdue: list.filter((r) => r.status === "overdue").length,
    shortfallAmount: r2(list.reduce((s, r) => s + r.shortfall, 0)),
  };
}

function addDays(s: string, n: number) {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
