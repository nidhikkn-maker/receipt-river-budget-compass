// Accounts + ledger rules (pure, tested). Balances are derived from transactions, never stored.

export const ACCOUNT_KINDS = ["savings", "current", "cash", "credit_card", "wallet", "investment", "fixed_deposit", "loan", "other_asset", "other_liability"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];
export const ACCOUNT_LABEL: Record<AccountKind, string> = {
  savings: "Savings", current: "Current", cash: "Cash", credit_card: "Credit card", wallet: "Digital wallet",
  investment: "Investment", fixed_deposit: "Fixed deposit", loan: "Loan", other_asset: "Other asset", other_liability: "Other liability",
};
/** Liability accounts: a positive balance means money owed. */
export const LIABILITY_KINDS: AccountKind[] = ["credit_card", "loan", "other_liability"];
export const isLiability = (k: AccountKind) => LIABILITY_KINDS.includes(k);

export const TXN_TYPES = ["expense", "income", "transfer", "refund", "adjustment"] as const;
export type TxnType = (typeof TXN_TYPES)[number];
export const TXN_LABEL: Record<TxnType, string> = { expense: "Expense", income: "Income", transfer: "Transfer", refund: "Refund", adjustment: "Adjustment" };

export interface Account { id: string; name: string; kind: AccountKind; openingBalance: number; archived: boolean }

export interface Txn {
  id: string;
  txnType?: TxnType;
  amount: number; // INR, always positive (adjustment may be negative)
  accountId?: string | null;
  toAccountId?: string | null;
  date: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const type = (t: Txn): TxnType => t.txnType ?? "expense";

/**
 * Balance of one account. For asset accounts it's money held; for liabilities it's amount owed.
 * Expense from a card raises what's owed; a transfer into a card (bill payment) lowers it.
 */
export function accountBalance(a: Account, txns: Txn[]): number {
  const sign = isLiability(a.kind) ? -1 : 1;
  let bal = a.openingBalance;
  for (const t of txns) {
    const k = type(t);
    if (t.accountId === a.id) {
      if (k === "expense") bal -= sign * t.amount;
      else if (k === "income" || k === "refund") bal += sign * t.amount;
      else if (k === "adjustment") bal += t.amount;
      else if (k === "transfer") bal -= sign * t.amount;
    }
    if (k === "transfer" && t.toAccountId === a.id) bal += sign * t.amount;
  }
  return r2(bal);
}

/** Income and spending: transfers (incl. card bill payments) and adjustments never count; refunds reduce spending. */
export function cashflow(txns: Txn[], from?: string, to?: string) {
  let income = 0, spent = 0;
  for (const t of txns) {
    if ((from && t.date < from) || (to && t.date > to)) continue;
    const k = type(t);
    if (k === "income") income += t.amount;
    else if (k === "expense") spent += t.amount;
    else if (k === "refund") spent -= t.amount;
  }
  return { income: r2(income), spent: r2(spent), net: r2(income - spent) };
}

export function netWorth(accounts: Account[], txns: Txn[]) {
  let assets = 0, liabilities = 0;
  for (const a of accounts) {
    const b = accountBalance(a, txns);
    if (isLiability(a.kind)) liabilities += b; else assets += b;
  }
  return { assets: r2(assets), liabilities: r2(liabilities), net: r2(assets - liabilities) };
}

export function validateTransfer(t: Pick<Txn, "accountId" | "toAccountId">) {
  if (!t.accountId || !t.toAccountId) throw new Error("Pick both accounts for a transfer");
  if (t.accountId === t.toAccountId) throw new Error("Choose two different accounts");
}

export interface MerchantMemory { category: string; tags: string[]; accountId: string | null; paymentMethod: string; scope: string }
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Most recent choices used for the same merchant (case/spacing-insensitive). */
export function suggestForMerchant<T extends { merchant: string | null; date: string; category: string; tags?: string[]; accountId?: string | null; paymentMethod: string; scope: string }>(merchant: string, history: T[]): MerchantMemory | null {
  const key = norm(merchant);
  if (!key) return null;
  const hit = history.filter((h) => h.merchant && norm(h.merchant) === key).sort((a, b) => b.date.localeCompare(a.date))[0];
  return hit ? { category: hit.category, tags: hit.tags ?? [], accountId: hit.accountId ?? null, paymentMethod: hit.paymentMethod, scope: hit.scope } : null;
}

/** Distinct merchants, most used first. */
export function frequentMerchants(history: { merchant: string | null }[], limit = 30): string[] {
  const n = new Map<string, number>();
  for (const h of history) if (h.merchant?.trim()) n.set(h.merchant.trim(), (n.get(h.merchant.trim()) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([m]) => m);
}
