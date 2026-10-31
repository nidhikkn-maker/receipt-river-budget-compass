// Version 4.9 Financial Setup Status. Pure: every status is derived from saved records,
// never hardcoded, and features the user doesn't use are reported as optional, not missing.
import type { Account } from "./ledger";
import type { Expense } from "./expenses";
import type { FinancePreferences } from "./preferences";

export type SetupState = "not_configured" | "partial" | "ready" | "attention" | "optional";
export interface SetupItem { key: string; label: string; state: SetupState; detail: string; action: string; to: string; hash?: string; essential: boolean }

export const SETUP_LABEL: Record<SetupState, string> = {
  not_configured: "Not configured", partial: "Partially configured", ready: "Ready", attention: "Requires attention", optional: "Optional setup",
};

const USABLE = new Set(["savings", "current", "cash", "credit_card", "wallet"]);

export function setupStatus(input: { accounts: Account[]; expenses: Expense[]; preferences: FinancePreferences }): SetupItem[] {
  const { accounts, expenses, preferences: p } = input;
  const live = accounts.filter((a) => !a.archived);
  const usable = live.filter((a) => USABLE.has(a.kind));
  const cards = live.filter((a) => a.kind === "credit_card");
  const cardsMissing = cards.filter((c) => !c.creditLimit || !c.dueDay);
  const instruments = (p.paymentInstruments ?? []).filter((i) => !(i as { archived?: boolean }).archived);
  const brokenMethods = instruments.filter((i) => !live.some((a) => a.id === i.accountId));
  const activeCats = (p.categories ?? []).filter((c) => !c.archived);
  const usesBusiness = expenses.some((e) => e.scope === "business" || e.scope === "official" || (e.workspaceAllocations ?? []).some((w) => w.workspace === "business" || w.workspace === "official"));
  const orgTags = (p.tags ?? []).filter((t) => t.group === "Organisation");
  const usesReimb = expenses.some((e) => e.reimbursementStatus && e.reimbursementStatus !== "none");
  const items: SetupItem[] = [];

  items.push(usable.length === 0
    ? { key: "accounts", label: "Financial accounts", state: "not_configured", detail: "Add a bank, cash, card or wallet account to pay from.", action: "Configure accounts", to: "/wealth", essential: true }
    : cardsMissing.length
      ? { key: "accounts", label: "Financial accounts", state: "attention", detail: `${cardsMissing.length} credit card${cardsMissing.length > 1 ? "s need" : " needs"} a limit and due day.`, action: "Review cards", to: "/wealth", essential: true }
      : { key: "accounts", label: "Financial accounts", state: "ready", detail: `${usable.length} usable account${usable.length > 1 ? "s" : ""}.`, action: "Manage accounts", to: "/wealth", essential: true });

  const needsMethods = live.some((a) => a.kind === "savings" || a.kind === "current" || a.kind === "credit_card");
  items.push(brokenMethods.length
    ? { key: "methods", label: "Payment methods", state: "attention", detail: `${brokenMethods.length} method${brokenMethods.length > 1 ? "s are" : " is"} linked to a closed or missing account.`, action: "Fix payment methods", to: "/payment-methods", essential: false }
    : instruments.length
      ? { key: "methods", label: "Payment methods", state: "ready", detail: `${instruments.length} saved method${instruments.length > 1 ? "s" : ""}.`, action: "Manage methods", to: "/payment-methods", essential: false }
      : needsMethods
        ? { key: "methods", label: "Payment methods", state: "partial", detail: "Add UPI or card methods linked to your accounts for faster entry.", action: "Configure methods", to: "/payment-methods", essential: false }
        : { key: "methods", label: "Payment methods", state: "optional", detail: "Add UPI or cards once you have bank accounts.", action: "Configure methods", to: "/payment-methods", essential: false });

  items.push({ key: "workspaces", label: "Workspaces", state: "ready", detail: usesBusiness ? "Personal plus business/official in use." : "Personal workspace in use.", action: "Manage workspaces", to: "/settings", hash: "finance", essential: true });

  items.push(!usesBusiness
    ? { key: "organisations", label: "Organisations", state: "optional", detail: "Only needed for business or official expenses.", action: "Add organisations", to: "/settings", hash: "finance", essential: false }
    : orgTags.length
      ? { key: "organisations", label: "Organisations", state: "ready", detail: `${orgTags.length} organisation${orgTags.length > 1 ? "s" : ""}.`, action: "Manage organisations", to: "/settings", hash: "finance", essential: false }
      : { key: "organisations", label: "Organisations", state: "partial", detail: "You record business/official expenses but have no organisations yet.", action: "Add organisations", to: "/settings", hash: "finance", essential: false });

  items.push(activeCats.length
    ? { key: "categories", label: "Categories", state: "ready", detail: `${activeCats.length} active categories.`, action: "Manage categories", to: "/settings", hash: "finance", essential: true }
    : { key: "categories", label: "Categories", state: "not_configured", detail: "No active categories — entries can't be classified.", action: "Add categories", to: "/settings", hash: "finance", essential: true });

  items.push((p.tags ?? []).length
    ? { key: "tags", label: "Tags", state: "ready", detail: `${p.tags.length} grouped tags.`, action: "Manage tags", to: "/settings", hash: "finance", essential: false }
    : { key: "tags", label: "Tags", state: "optional", detail: "Optional labels for people, purposes and projects.", action: "Add tags", to: "/settings", hash: "finance", essential: false });

  items.push(p.defaultCurrency
    ? { key: "entry", label: "Expense entry preferences", state: "ready", detail: `New entries default to ${p.defaultCurrency}.`, action: "Edit preferences", to: "/settings", hash: "finance", essential: true }
    : { key: "entry", label: "Expense entry preferences", state: "not_configured", detail: "Choose a default currency.", action: "Set currency", to: "/settings", hash: "finance", essential: true });

  items.push(usesReimb
    ? { key: "reimbursements", label: "Reimbursements", state: "ready", detail: "Reimbursable expenses are being tracked.", action: "Open claims", to: "/claim-submission", essential: false }
    : { key: "reimbursements", label: "Reimbursements", state: "optional", detail: "Mark an expense as reimbursable to start tracking claims.", action: "Learn more", to: "/claim-submission", essential: false });

  items.push({ key: "reports", label: "Report preferences", state: "optional", detail: "Report formats are remembered as you use them.", action: "Open Reports Centre", to: "/report-centre", essential: false });
  return items;
}

/** True when the minimum needed to record expenses is in place. */
export const essentialsReady = (items: SetupItem[]) => items.filter((i) => i.essential).every((i) => i.state === "ready" || i.state === "attention");
