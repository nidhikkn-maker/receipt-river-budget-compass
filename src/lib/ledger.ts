import { decimal, moneyNumber, roundMoney, addMoney, subtractMoney, proportionMoney } from "./money";
// Accounts + ledger rules (pure, tested). Balances are derived from transactions, never stored.

export const ACCOUNT_KINDS = ["savings", "current", "cash", "credit_card", "wallet", "investment", "fixed_deposit", "loan", "other_asset", "other_liability"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];
export const ACCOUNT_LABEL: Record<AccountKind, string> = {
  savings: "Savings", current: "Current", cash: "Cash", credit_card: "Credit card", wallet: "Digital wallet",
  investment: "Investment", fixed_deposit: "Fixed deposit", loan: "Loan", other_asset: "Other asset", other_liability: "Borrowing / other liability",
};
/** Liability accounts: a positive balance means money owed. */
export const LIABILITY_KINDS: AccountKind[] = ["credit_card", "loan", "other_liability"];
export const isLiability = (k: AccountKind) => LIABILITY_KINDS.includes(k);
/** Accounts whose worth is set by valuations (market value) rather than only by recorded flows. */
export const VALUED_KINDS: AccountKind[] = ["investment", "fixed_deposit", "other_asset"];

export const TXN_TYPES = ["expense", "income", "transfer", "refund", "reimbursement", "adjustment", "card_payment", "loan_repayment", "investment", "advance", "advance_settlement"] as const;
export type TxnType = (typeof TXN_TYPES)[number];
export const TXN_LABEL: Record<TxnType, string> = {
  expense: "Expense", income: "Income", transfer: "Transfer", refund: "Refund", reimbursement: "Reimbursement", adjustment: "Adjustment",
  card_payment: "Card payment", loan_repayment: "Loan repayment", investment: "Investment", advance: "Travel advance", advance_settlement: "Advance return",
};

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  openingBalance: number;
  archived: boolean;
  creditLimit?: number | null;
  dueDay?: number | null;
  minBalance?: number;
  issuer?: string;
  lastFour?: string | null;
  statementDay?: number | null;
  interestRate?: number | null;
  /** Counted in "cash available" on Home (savings/current/cash/wallet only). */
  includeInCash?: boolean;
  details?: AccountDetails;
}
export interface AccountDetails { schemeCode?: string; schemeName?: string; units?: number; /** Outside recipient this receivable/borrowing tracks. */ payeeId?: string }

export interface Txn {
  id: string;
  txnType?: TxnType;
  amount: number; // INR, always positive
  accountId?: string | null;
  toAccountId?: string | null;
  date: string;
  /** Adjustments only: +1 raises the balance, -1 lowers it. */
  adjustmentSign?: 1 | -1;
  reconciledAt?: string | null;
  /** Receiving-side evidence of a linked transfer: never counted again. */
  transferCounterpartOf?: string | null;
  /** Manual repayment breakdown is in original currency; legacy repayments without a split remain principal-only. */
  principal?: number | null;
  interest?: number | null;
  originalAmount?: number;
}

export interface Valuation { id?: string; accountId: string; value: number; valuedOn: string; source: string; note?: string }

const r2 = roundMoney;
const type = (t: Txn): TxnType => t.txnType ?? "expense";
/** Types that move money between two of your own accounts (never income or spending). */
export const MOVE_TYPES: TxnType[] = ["transfer", "card_payment", "loan_repayment", "investment"];
export const isMove = (k: TxnType | undefined) => MOVE_TYPES.includes(k ?? "expense");
/** Destination account kinds allowed for each move type. */
export const MOVE_TARGET: Partial<Record<TxnType, AccountKind[]>> = { card_payment: ["credit_card"], loan_repayment: ["loan", "other_liability"], investment: ["investment", "fixed_deposit", "other_asset"] };

/** Stored INR payment apportioned using the saved original-currency split. */
export function repaymentParts(t: Txn) {
  if (type(t) !== "loan_repayment" || t.principal == null || t.interest == null) return { principal: t.amount, interest: 0 };
  const total = t.originalAmount ?? addMoney(t.principal, t.interest);
  const interest = total > 0 ? proportionMoney(t.amount, t.interest, total) : 0;
  return { principal: subtractMoney(t.amount, interest), interest };
}

/**
 * Balance of one account. For asset accounts it's money held; for liabilities it's amount owed.
 * Expense from a card raises what's owed; a transfer into a card (bill payment) lowers it.
 */
export function accountBalance(a: Account, txns: Txn[]): number {
  const sign = isLiability(a.kind) ? -1 : 1;
  let bal = decimal(a.openingBalance);
  for (const t of txns) {
    if (t.transferCounterpartOf) continue;
    const k = type(t);
    if (t.accountId === a.id) {
      if (k === "expense") bal = bal.minus(decimal(t.amount).mul(sign));
      else if (k === "income" || k === "refund" || k === "reimbursement") bal = bal.plus(decimal(t.amount).mul(sign));
      else if (k === "adjustment") bal = bal.plus(decimal(t.amount).mul(t.adjustmentSign ?? 1));
      else if (isMove(k)) bal = bal.minus(decimal(t.amount).mul(sign));
      // Advance received: money held, but owed back — not income. Returning it lowers the balance — not spending.
      else if (k === "advance") bal = bal.plus(decimal(t.amount).mul(sign));
      else if (k === "advance_settlement") bal = bal.minus(decimal(t.amount).mul(sign));
    }
    if (isMove(k) && t.toAccountId === a.id) bal = bal.plus(decimal(k === "loan_repayment" ? repaymentParts(t).principal : t.amount).mul(sign));
  }
  return moneyNumber(bal);
}

/** Balance as of the end of a date (inclusive). */
export const balanceAsOf = (a: Account, txns: Txn[], date: string) => accountBalance(a, txns.filter((t) => t.date <= date));

/** Balance counting only entries matched to a bank/card statement — what the bank should show. */
export const reconciledBalance = (a: Account, txns: Txn[]) => accountBalance(a, txns.filter((t) => !!t.reconciledAt));

/** Adjustment needed so the app balance equals the real balance you see at the bank. */
export function adjustmentToMatch(a: Account, txns: Txn[], actual: number): { amount: number; sign: 1 | -1 } | null {
  const diff = subtractMoney(actual, accountBalance(a, txns));
  if (Math.abs(diff) < 0.005) return null;
  return { amount: Math.abs(diff), sign: diff > 0 ? 1 : -1 };
}

/**
 * Worth of an account. Valued accounts (investments, FDs, other assets) use the latest valuation on or
 * before `asOf`, plus money moved in or out after that valuation date. Others use the ledger balance.
 */
export function accountValue(a: Account, txns: Txn[], valuations: Valuation[] = [], asOf?: string): { value: number; valuedOn: string | null; source: string | null } {
  const upto = asOf ? txns.filter((t) => t.date <= asOf) : txns;
  if (!VALUED_KINDS.includes(a.kind)) return { value: accountBalance(a, upto), valuedOn: null, source: null };
  const latest = valuations
    .filter((v) => v.accountId === a.id && (!asOf || v.valuedOn <= asOf))
    .sort((x, y) => y.valuedOn.localeCompare(x.valuedOn))[0];
  if (!latest) return { value: accountBalance(a, upto), valuedOn: null, source: null };
  const after = upto.filter((t) => t.date > latest.valuedOn);
  const flows = accountBalance({ ...a, openingBalance: 0 }, after);
  return { value: addMoney(latest.value, flows), valuedOn: latest.valuedOn, source: latest.source };
}

/**
 * Income and spending: transfers (incl. card bill payments, investment purchases/redemptions, loan principal)
 * and adjustments never count; refunds and reimbursements reduce spending.
 */
export function cashflow(txns: Txn[], from?: string, to?: string) {
  let income = decimal(0), spent = decimal(0);
  for (const t of txns) {
    if (t.transferCounterpartOf || (from && t.date < from) || (to && t.date > to)) continue;
    const k = type(t);
    if (k === "income") income = income.plus(t.amount);
    else if (k === "expense") spent = spent.plus(t.amount);
    else if (k === "loan_repayment") spent = spent.plus(repaymentParts(t).interest);
    else if (k === "refund" || k === "reimbursement") spent = spent.minus(t.amount);
  }
  return { income: moneyNumber(income), spent: moneyNumber(spent), net: moneyNumber(income.minus(spent)) };
}

export function netWorth(accounts: Account[], txns: Txn[], valuations: Valuation[] = [], asOf?: string) {
  let assets = decimal(0), liabilities = decimal(0);
  for (const a of accounts) {
    const v = accountValue(a, txns, valuations, asOf).value;
    if (isLiability(a.kind)) liabilities = liabilities.plus(v); else assets = assets.plus(v);
  }
  return { assets: moneyNumber(assets), liabilities: moneyNumber(liabilities), net: moneyNumber(assets.minus(liabilities)) };
}

export function validateTransfer(t: Pick<Txn, "accountId" | "toAccountId">) {
  if (!t.accountId || !t.toAccountId) throw new Error("Pick both accounts for a transfer");
  if (t.accountId === t.toAccountId) throw new Error("Choose two different accounts");
}

/** What a transfer means in plain words, from the account kinds on each side. */
export function transferMeaning(from: Account | undefined, to: Account | undefined): string {
  if (!from || !to) return "Transfer between your accounts";
  if (to.kind === "credit_card") return "Credit card bill payment";
  if (to.kind === "loan") return "Loan principal repayment";
  if (to.kind === "investment" || to.kind === "fixed_deposit") return "Investment purchase";
  if (from.kind === "investment" || from.kind === "fixed_deposit") return "Investment redemption";
  if (from.kind === "loan") return "Loan disbursement";
  return "Transfer between your accounts";
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
