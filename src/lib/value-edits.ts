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
