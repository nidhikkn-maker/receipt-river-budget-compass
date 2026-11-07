// C-0735: an account reconciled through Statement Desk must not keep asking for an upload.
import { expect, it } from "vitest";
import { accountStatementStatus, withStatementDeskEvidence } from "./account-statement-status";
import { statementCoverage } from "./statement-pipeline/coverage";
import { defaultPreferences } from "./preferences";
import type { Account } from "./ledger";
import type { Expense } from "./expenses";

const acct: Account = { id: "bank", name: "Demo Savings", kind: "savings", openingBalance: 0, archived: false };
const t = (id: string, date: string, matched: boolean): Expense => ({ id, date, amount: 100, originalAmount: 100, currency: "INR", fxRate: 1, title: id, merchant: null, category: "Shopping", scope: "personal", memberId: null, splits: [], paymentMethod: "upi", description: "", receipts: [], accountId: "bank", reconciledAt: matched ? date : null, statementRef: matched ? `document:d · ${id}` : null } as Expense);
const policy = { reviewDays: 14, outdatedDays: 45 };
const status = (txns: Expense[], today: string) => {
  const row = accountStatementStatus(acct, [], txns, defaultPreferences(), today);
  return withStatementDeskEvidence(row, statementCoverage([acct], txns, today).find(c => c.accountId === "bank"), policy);
};

it("without any statement the account still asks for an upload", () => {
  expect(status([t("a", "2026-11-02", false)], "2026-11-07").nextStep).toBe("Upload a statement for this account");
});

it("after a Statement Desk save the account shows the statement date, is current and no longer asks for an upload", () => {
  const r = status([t("a", "2026-11-02", true), t("b", "2026-11-04", true)], "2026-11-07");
  expect(r).toMatchObject({ source: "statement-desk", statementThrough: "2026-11-04", freshness: "Current", reconciliation: "Statement-matched", nextStep: null });
});

it("months with entries but no statement keep the account in progress and name the months", () => {
  const r = status([t("a", "2026-10-10", false), t("b", "2026-11-04", true)], "2026-11-07");
  expect(r.reconciliation).toBe("In Progress");
  expect(r.nextStep).toBe("Upload statements for 2026-10 in Statement Desk");
});

it("Statement Desk evidence never marks the balance verified", () => {
  expect(status([t("b", "2026-11-04", true)], "2026-11-07").balance).toBe("Not Verified");
});

it("an old statement becomes outdated", () => {
  expect(status([t("b", "2026-08-01", true)], "2026-11-07").freshness).toBe("Outdated");
});
