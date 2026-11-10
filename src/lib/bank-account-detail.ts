/**
 * C03 Bank account detail (read-only): masked identifiers, owner, statement freshness, running balance, recent entries
 * and reconciliation state for one account. Pure rules on the existing ledger (ledger.ts) and freshness/discrepancy
 * checks (inbox.ts); balances are derived from entries, never stored, and nothing here posts or changes a record.
 */
import { accountBalance, reconciledBalance, type Account } from "./ledger";
import type { Expense } from "./expenses";
import type { FinancePreferences } from "./preferences";
import type { VaultDoc } from "./documents";
import type { EntityProfile } from "./entities";
import { accountFreshness, discrepancy, FRESHNESS_LABEL } from "./inbox";
import { addMoney } from "./money";

export const BANK_ACCOUNT_KINDS = ["savings", "current", "cash", "wallet"] as const;
export const isBankAccount = (a: Pick<Account, "kind">) => (BANK_ACCOUNT_KINDS as readonly string[]).includes(a.kind);

/** Only the last four digits are ever shown. */
export const maskedNumber = (lastFour: string | null | undefined) => (lastFour && /^\d{4}$/.test(lastFour) ? `•••• ${lastFour}` : "Not recorded");

export interface LedgerRow { entry: Expense; effect: number; balanceAfter: number; reconciled: boolean }
/** Every entry that moves this account, oldest first, with its effect and the running balance after it. */
export function runningBalance(a: Account, txns: Expense[]): LedgerRow[] {
  const mine = txns.filter((t) => (t.accountId === a.id || t.toAccountId === a.id) && !t.transferCounterpartOf)
    .sort((x, y) => x.date.localeCompare(y.date) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  let bal = accountBalance(a, []);
  const zero = { ...a, openingBalance: 0 };
  return mine.map((entry) => { const effect = accountBalance(zero, [entry]); bal = addMoney(bal, effect); return { entry, effect, balanceAfter: bal, reconciled: !!entry.reconciledAt }; });
}

export interface BankAccountDetail {
  account: Account; masked: string; institution: string; owner: string;
  balance: number; reconciledBalance: number; freshness: { label: string; status: string; lastVerified: string | null; lastImport: string | null; lastEntry: string | null };
  reconciliation: { matched: number; total: number; statementBalance: number | null; statementDate: string | null; difference: number | null; action: string };
  statements: { id: string; title: string; date: string | null }[]; recent: LedgerRow[]; totalEntries: number;
}

export function bankAccountDetail(a: Account, i: { transactions: Expense[]; preferences: FinancePreferences; documents: VaultDoc[]; entities: EntityProfile[]; entityAccounts: Record<string, string[]>; today: string; recent?: number }): BankAccountDetail {
  const rows = runningBalance(a, i.transactions);
  const f = accountFreshness(a, i.transactions, i.preferences, i.today);
  const d = discrepancy(a, i.transactions, i.preferences);
  const ent = Object.entries(i.entityAccounts).find(([, ids]) => ids.includes(a.id))?.[0];
  return {
    account: a, masked: maskedNumber(a.lastFour), institution: a.issuer?.trim() || "Not recorded",
    owner: i.entities.find((e) => e.id === ent)?.name ?? "You (personal)",
    balance: rows.at(-1)?.balanceAfter ?? accountBalance(a, []), reconciledBalance: reconciledBalance(a, i.transactions),
    freshness: { label: FRESHNESS_LABEL[f.status], status: f.status, lastVerified: f.lastReconciliation && f.lastBalanceConfirmation ? (f.lastReconciliation > f.lastBalanceConfirmation ? f.lastReconciliation : f.lastBalanceConfirmation) : f.lastReconciliation ?? f.lastBalanceConfirmation, lastImport: f.lastStatementImport, lastEntry: f.lastTransaction },
    reconciliation: { matched: rows.filter((r) => r.reconciled).length, total: rows.length, statementBalance: d.statementBalance, statementDate: d.statementDate, difference: d.difference, action: d.action },
    statements: i.documents.filter((x) => x.accountId === a.id && x.docType === "bank_statement").sort((x, y) => (y.docDate ?? "").localeCompare(x.docDate ?? "")).map((x) => ({ id: x.id, title: x.title, date: x.docDate })),
    recent: rows.slice(-(i.recent ?? 25)).reverse(), totalEntries: rows.length,
  };
}
