// Inline checks for the in-app value dialogs that replaced browser pop-ups (window.prompt). Each mirrors the rule the
// store already enforces on save (same message), so the dialog explains a problem before anything is sent; the store
// still checks on save, and amounts are parsed exactly as the prompt path did (Number of the typed text).
import type { Account } from "@/lib/ledger";
import { duplicateAccount } from "@/lib/master-data";

/** Plan → Edit amount; store.saveCommitment requires amount > 0. */
export function commitmentAmountProblem(value: string): string | null {
  return Number(value) > 0 ? null : "Amount must be greater than zero";
}

/** Rename account; store.updateAccount requires a name and no other live account with the same name. */
export function accountNameProblem(
  value: string,
  account: Pick<Account, "id" | "kind">,
  accounts: Account[],
): string | null {
  if (!value.trim()) return "Name the account";
  return duplicateAccount(accounts, { id: account.id, name: value, kind: account.kind })
    ? "Another account already has that name"
    : null;
}

/** Adjust to statement balance; store.adjustBalance requires a finite number (the prompt path ignored blank input). */
export function statementBalanceProblem(value: string): string | null {
  return value.trim() && Number.isFinite(Number(value))
    ? null
    : "Enter the balance you see at the bank";
}

/** Rename document; store.updateDocument requires a title. */
export function documentTitleProblem(value: string): string | null {
  return value.trim() ? null : "Give the document a title";
}

// Second pass: confirmations and value edits that replaced the remaining browser pop-ups (window.confirm/prompt).

/** Card purchase → EMI; mirrors finance_operation('convert_emi'): integer term 2–60, rate 0–60 %, fee 0–10,00,00,000. */
export function emiProblems(v: { months: string; rate: string; fee: string }): { months: string | null; rate: string | null; fee: string | null } {
  const months = Number(v.months), rate = Number(v.rate), fee = Number(v.fee);
  return {
    months: v.months.trim() && Number.isInteger(months) && months >= 2 && months <= 60 ? null : "Enter a whole number of months from 2 to 60",
    rate: v.rate.trim() && Number.isFinite(rate) && rate >= 0 && rate <= 60 ? null : "Enter an annual rate from 0 to 60 %",
    fee: v.fee.trim() && Number.isFinite(fee) && fee >= 0 && fee <= 100000000 ? null : "Enter the processing fee (0 if none)",
  };
}

/** Goal → Update saved so far; store.saveGoal refuses negative amounts. Blank or not a number is explained, not saved as 0/NaN. */
export function goalSavedProblem(value: string): string | null {
  const n = Number(value);
  if (!value.trim() || !Number.isFinite(n)) return "Enter the amount saved so far (0 if nothing yet)";
  return n < 0 ? "Amounts can't be negative" : null;
}

/** A required name or note (the prompt path ignored an empty answer). */
export const requiredText = (message: string) => (value: string): string | null => (value.trim() ? null : message);

/** Company journal reversal; reverseAccountingJournal requires a reason of at least five characters. */
export function journalReversalReasonProblem(value: string): string | null {
  return value.trim().length >= 5 ? null : "Write the correction reason (at least five characters).";
}

/** Settings → Rename category: a new, unused name (an existing one is merged instead). */
export function categoryRenameProblem(value: string, current: string, names: string[]): string | null {
  const name = value.trim();
  if (!name) return "Name the category";
  if (name !== current && names.includes(name)) return "Use merge for an existing category";
  return null;
}

/** Organisations → Rename: up to 24 characters, not another organisation's name (any letter case). */
export function organisationRenameProblem(value: string, old: string, names: string[]): string | null {
  const n = value.trim().slice(0, 24);
  if (!n) return "Name the organisation";
  return names.some((o) => o.toLowerCase() === n.toLowerCase() && o !== old) ? `“${n}” already exists` : null;
}

/** Lease → Renew: a YYYY-MM-DD date after the current end (the prompt path silently ignored anything else). */
export function leaseRenewProblem(value: string, end: string): string | null {
  const d = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "Enter the new end date as YYYY-MM-DD";
  return d > end ? null : `Choose a date after the current end, ${end}`;
}

/** Typed-confirmation labels for period closing. */
export const periodLabel = (from: string, to: string) => `${from} to ${to}`;
export const fyLabel = (fy: string) => `FY ${fy}`;

/** Audit finding note; setFindingState requires at least three characters. */
export function findingNoteProblem(value: string): string | null {
  return value.trim().length >= 3 ? null : "Add a short note saying why";
}
