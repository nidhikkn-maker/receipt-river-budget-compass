// Financial inbox, data-freshness and balance-discrepancy rules. Pure and derived: items disappear when fixed.
import { accountBalance, type Account } from "./ledger";
import { dueStatus, type Commitment } from "./planning";
import type { Expense } from "./expenses";
import type { FinancePreferences } from "./preferences";
import { outstandingOf } from "./reimbursements";
import { statementRefOrigin } from "./statement-fingerprint";

const r2 = (n: number) => Math.round(n * 100) / 100;
const daysBetween = (a: string, b: string) => Math.floor((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);
const maxDate = (...d: (string | null | undefined)[]) => d.filter(Boolean).map((x) => x!.slice(0, 10)).sort().at(-1) ?? null;

export type Freshness = "current" | "needs_review" | "outdated";
export const FRESHNESS_LABEL: Record<Freshness, string> = { current: "Current", needs_review: "Needs review", outdated: "Outdated" };

export interface AccountFreshness {
  accountId: string; name: string; lastTransaction: string | null; lastStatementImport: string | null; lastReconciliation: string | null;
  lastBalanceConfirmation: string | null; confirmedBalance: number | null; source: "statement" | "manual" | "none"; status: Freshness; daysSinceVerified: number | null;
}

/** Status comes from the latest verification (reconciliation, statement import or balance confirmation), never from the latest entry. */
export function accountFreshness(a: Account, txns: Expense[], prefs: Pick<FinancePreferences, "freshness" | "statementBalances">, today: string): AccountFreshness {
  const mine = txns.filter((t) => t.accountId === a.id || t.toAccountId === a.id);
  const lastTransaction = maxDate(...mine.map((t) => t.date));
  const lastStatementImport = maxDate(...mine.filter((t) => t.statementRef).map((t) => t.reconciledAt));
  const lastReconciliation = maxDate(...mine.map((t) => t.reconciledAt));
  const stmt = prefs.statementBalances[a.id];
  const lastAdj = maxDate(...mine.filter((t) => t.txnType === "adjustment").map((t) => t.date));
  const lastBalanceConfirmation = maxDate(stmt?.date, lastAdj);
  const verified = maxDate(lastReconciliation, lastBalanceConfirmation);
  const t = prefs.freshness.perAccount[a.id] ?? prefs.freshness;
  const since = verified ? daysBetween(verified, today) : null;
  const status: Freshness = since == null ? (mine.length ? "outdated" : "needs_review") : since <= t.reviewDays ? "current" : since <= t.outdatedDays ? "needs_review" : "outdated";
  return { accountId: a.id, name: a.name, lastTransaction, lastStatementImport, lastReconciliation, lastBalanceConfirmation, confirmedBalance: stmt?.balance ?? null,
    source: lastStatementImport ? "statement" : verified ? "manual" : "none", status, daysSinceVerified: since };
}

export function freshnessSummary(accounts: Account[], txns: Expense[], prefs: Pick<FinancePreferences, "freshness" | "statementBalances">, today: string) {
  const rows = accounts.filter((a) => !a.archived).map((a) => accountFreshness(a, txns, prefs, today));
  const current = rows.filter((r) => r.status === "current").length;
  // Cash-type accounts drive affordability; if any is outdated, recommendations are low confidence.
  const cashIds = new Set(accounts.filter((a) => ["savings", "current", "cash", "wallet", "credit_card"].includes(a.kind)).map((a) => a.id));
  const outdatedCritical = rows.filter((r) => r.status === "outdated" && cashIds.has(r.accountId)).map((r) => r.name);
  return { rows, current, total: rows.length, label: `${current} of ${rows.length} accounts verified`, outdatedCritical, lowConfidence: outdatedCritical.length > 0 };
}

export interface Discrepancy {
  accountId: string; name: string; lastReconciled: string | null; recordedBalance: number; statementBalance: number | null; statementDate: string | null;
  difference: number | null; unmatched: Expense[]; duplicates: [Expense, Expense][]; action: string;
}

/** Possible duplicate pairs: same type, account, date and amount, with similar merchant/title. */
export function duplicatePairs(txns: Expense[]): [Expense, Expense][] {
  const out: [Expense, Expense][] = [], seen = new Map<string, Expense[]>();
  for (const t of txns) {
    if (t.txnType && t.txnType !== "expense" && t.txnType !== "income" && t.txnType !== "refund" && t.txnType !== "reimbursement") continue;
    const k = `${t.txnType ?? "expense"}|${t.accountId ?? ""}|${t.date}|${t.amount.toFixed(2)}`;
    const prev = seen.get(k) ?? [];
    const name = (x: Expense) => (x.merchant || x.title).toLowerCase().replace(/[^a-z]/g, "").slice(0, 6);
    for (const p of prev) if (name(p) === name(t) && !(p.statementRef && t.statementRef && p.statementRef !== t.statementRef)) out.push([p, t]);
    seen.set(k, [...prev, t]);
  }
  return out;
}

/** Compares the recorded ledger balance with the last statement balance the user entered. Never creates entries. */
export function discrepancy(a: Account, txns: Expense[], prefs: Pick<FinancePreferences, "statementBalances">): Discrepancy {
  const mine = txns.filter((t) => t.accountId === a.id || t.toAccountId === a.id);
  const stmt = prefs.statementBalances[a.id] ?? null;
  const asOf = stmt?.date ?? null;
  const recorded = r2(accountBalance(a, asOf ? mine.filter((t) => t.date <= asOf) : mine));
  const difference = stmt ? r2(stmt.balance - recorded) : null;
  const lastReconciled = maxDate(...mine.map((t) => t.reconciledAt));
  const unmatched = mine.filter((t) => !t.reconciledAt && (!asOf || t.date <= asOf)).sort((x, y) => y.date.localeCompare(x.date));
  const duplicates = duplicatePairs(mine);
  let action = "Enter the latest statement balance to check this account.";
  if (difference != null) {
    if (Math.abs(difference) < 1) action = "Balances agree — nothing to fix.";
    else if (duplicates.length) action = "Review the possible duplicates first; deleting one may close the gap.";
    else if (difference < 0) action = `Statement is ${Math.abs(difference).toLocaleString("en-IN")} lower: look for unrecorded spending or charges, then import or add them.`;
    else action = `Statement is ${difference.toLocaleString("en-IN")} higher: look for unrecorded income, refunds or transfers in.`;
  }
  return { accountId: a.id, name: a.name, lastReconciled, recordedBalance: recorded, statementBalance: stmt?.balance ?? null, statementDate: asOf, difference, unmatched, duplicates, action };
}

export type InboxType = "uncategorised" | "unverified_import" | "duplicate" | "unreconciled_account" | "missing_details" | "pending_reimbursement" | "pending_sync" | "commitment" | "inconsistency" | "audit";
export const INBOX_LABEL: Record<InboxType, string> = {
  uncategorised: "Needs a category", unverified_import: "Imported — please check", duplicate: "Might be counted twice", unreconciled_account: "Balance not checked yet",
  missing_details: "Missing a detail", pending_reimbursement: "Waiting to be paid back", pending_sync: "Waiting to sync", commitment: "Did this payment happen?", inconsistency: "Figures don't agree", audit: "Check needed",
};
export type Priority = "high" | "medium" | "low";
export interface InboxItem {
  key: string; type: InboxType; title: string; description: string; amount: number | null; accountName: string | null; date: string | null;
  priority: Priority; action: string; transactionId?: string; accountId?: string; commitmentId?: string; destination?: string;
}

export interface InboxInput {
  transactions: Expense[]; accounts: Account[]; commitments: Commitment[]; prefs: FinancePreferences; today: string; pendingCount: number;
}

export function inboxItems(i: InboxInput): InboxItem[] {
  const items: InboxItem[] = [];
  const acc = (id?: string | null) => i.accounts.find((a) => a.id === id)?.name ?? null;
  const active = new Set(i.prefs.categories.filter((c) => !c.archived).map((c) => c.name));
  // Historical review is not aged out: April imports and older unresolved issues remain visible.
  const recent = i.transactions.filter((t) => t.date <= i.today);
  for (const t of recent) {
    const base = { amount: t.amount, accountName: acc(t.accountId), date: t.date, transactionId: t.id };
    const kind = t.txnType ?? "expense";
    if (kind === "expense" && !t.allocations?.length && (t.category === "Miscellaneous" || !active.has(t.category)))
      items.push({ ...base, key: `uncategorised:${t.id}`, type: "uncategorised", title: t.title, description: t.category === "Miscellaneous" ? "Filed under Miscellaneous" : `"${t.category}" is not an active category`, priority: "medium", action: "Categorise" });
    if (t.statementRef && !t.reconciledAt)
      items.push({ ...base, key: `unverified:${t.id}`, type: "unverified_import", title: t.title, description: `Imported from ${statementRefOrigin(t.statementRef)} but not confirmed`, priority: "medium", action: "Review and confirm" });
    if (kind === "expense" && !t.accountId)
      items.push({ ...base, key: `missing:${t.id}`, type: "missing_details", title: t.title, description: "No account recorded, so balances can't include it", priority: "low", action: "Edit to add the account" });
    if (["transfer", "card_payment", "loan_repayment", "investment"].includes(kind) && (!t.accountId || !t.toAccountId || !i.accounts.some(a => a.id === t.accountId && !a.archived) || !i.accounts.some(a => a.id === t.toAccountId && !a.archived)))
      items.push({ ...base, key: `moveaccount:${t.id}`, type: "missing_details", title: t.title, description: "A source or receiving account is missing or archived", priority: "high", action: "Confirm both accounts" });
    if (t.allocations?.length && Math.round(t.allocations.reduce((s, a) => s + a.amount, 0) * 100) !== Math.round(t.amount * 100))
      items.push({ ...base, key: `alloc:${t.id}`, type: "inconsistency", title: t.title, description: "Category split lines don't add up to the amount", priority: "high", action: "Fix the split" });
    if (kind === "transfer" && t.accountId && t.accountId === t.toAccountId)
      items.push({ ...base, key: `selftransfer:${t.id}`, type: "inconsistency", title: t.title, description: "Transfer goes from and to the same account", priority: "high", action: "Edit the transfer" });
    const out = outstandingOf(t);
    if (kind === "expense" && t.reimbursementStatus === "pending" && out > 0)
      items.push({ ...base, amount: out, key: `reimb:${t.id}`, type: "pending_reimbursement", title: t.title, description: `${t.reimbursement?.payer || "Payer not set"} · ${daysBetween(t.reimbursement?.submittedOn || t.date, i.today)} days`, priority: daysBetween(t.date, i.today) > 60 ? "high" : "low", action: "Track or record receipt" });
  }
  const separate = new Set(i.prefs.inboxDismissed ?? []);
  for (const [a, b] of duplicatePairs(recent)) if (!separate.has(`dup:${[a.id, b.id].sort().join(":")}`))
    items.push({ key: `dup:${[a.id, b.id].sort().join(":")}`, type: "duplicate", title: a.title, description: `Same amount, date and account as "${b.title}"`, amount: a.amount, accountName: acc(a.accountId), date: a.date, priority: "high", action: "Delete one or dismiss", transactionId: b.id });
  for (const f of freshnessSummary(i.accounts, i.transactions, i.prefs, i.today).rows) if (f.status !== "current") {
    const d = discrepancy(i.accounts.find((a) => a.id === f.accountId)!, i.transactions, i.prefs);
    items.push({ key: `stale:${f.accountId}:${f.lastReconciliation ?? "never"}:${f.lastBalanceConfirmation ?? "never"}`, type: "unreconciled_account", title: f.name, description: f.daysSinceVerified == null ? "Never reconciled" : `Not verified for ${f.daysSinceVerified} days`, amount: d.difference, accountName: f.name, date: f.lastReconciliation, priority: f.status === "outdated" ? "high" : "medium", action: "Reconcile or confirm balance", accountId: f.accountId });
  }
  for (const a of i.accounts.filter(a=>!a.archived)) {
    const d=discrepancy(a,i.transactions,i.prefs);
    if(d.difference!=null&&Math.abs(d.difference)>=1)items.push({key:`balance:${a.id}:${d.statementDate}`,type:'inconsistency',title:a.name,description:d.action,amount:d.difference,accountName:a.name,date:d.statementDate,priority:'high',action:'Check statement',destination:'/account-reconciliation'});
  }
  for (const c of i.commitments) {
    const s = dueStatus(c, i.today);
    if (s === "overdue" || s === "due_soon")
      items.push({ key: `commit:${c.id}:${c.nextDue}`, type: "commitment", title: c.name, description: s === "overdue" ? `Was due ${c.nextDue}` : `Due ${c.nextDue}`, amount: c.amount, accountName: acc(c.accountId), date: c.nextDue, priority: s === "overdue" ? "high" : "medium", action: "Confirm payment", commitmentId: c.id });
  }
  if (i.pendingCount > 0)
    items.push({ key: `sync:${i.pendingCount}`, type: "pending_sync", title: `${i.pendingCount} offline ${i.pendingCount === 1 ? "entry" : "entries"}`, description: "Saved on this device and not yet uploaded", amount: null, accountName: null, date: null, priority: "medium", action: "Reconnect to sync" });
  const order: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  const unique = [...new Map(items.map((x) => [x.key, x])).values()];
  return unique.sort((a, b) => order[a.priority] - order[b.priority] || (b.date ?? "").localeCompare(a.date ?? ""));
}

export function inboxCounts(all: InboxItem[], dismissed: string[]) {
  const d = new Set(dismissed);
  // Dismissal is not evidence that a saved financial record has been corrected.
  const open = all.filter((x) => !!x.transactionId || !d.has(x.key));
  return { open, pending: open.length, high: open.filter((x) => x.priority === "high").length, dismissed: all.length - open.length };
}
