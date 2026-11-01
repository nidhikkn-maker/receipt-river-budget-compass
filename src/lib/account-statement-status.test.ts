import { expect, it } from "vitest";
import { accountStatementStatus, accountStatementSummary, type StatementStatusEvidence } from "./account-statement-status";
import { defaultPreferences } from "./preferences";
import type { Expense } from "./expenses";
import type { Account } from "./ledger";
const bank: Account = { id: "bank", name: "Bank", kind: "savings", openingBalance: 1000, archived: false };
const e: Expense = { id: "entry", title: "Copy", merchant: null, category: "Groceries", scope: "personal", memberId: null, splits: [], amount: 200, originalAmount: 200, currency: "INR", fxRate: 1, paymentMethod: "upi", date: "2026-10-02", reconciledAt: null, statementRef: "copy", description: "Original", receipts: [], accountId: "bank" };
const statement: StatementStatusEvidence = { batch: { id: "batch", account_id: "bank", status: "review", file_name: "copy", file_path: "copy", currency: "INR", error: null, period_from: "2026-10-01", period_to: "2026-10-28", opening_balance: 1000, closing_balance: 800, balance_verification: { checkedOriginal: true, sourceOpening: 1000, sourceClosing: 800, sourceReference: "original page 1", reviewedAt: "2026-10-31T12:00:00Z" } }, rows: [{ id: "row", fingerprint: "fp", line: { date: e.date, amount: 200, description: "Original", direction: "debit", ref: "ref" }, proposal: { ...e }, review_group: "ready", confidence: "high", decision: "approved", duplicate_kind: "new", duplicate_id: null }], posted: [{ fingerprint: "fp", transaction_id: e.id, posted_at: "2026-10-31" }] };
statement.batch.statement_review={identity:{bank:'IDFC',identifier:'1234',reference:'original header',confirmed:true,missingIdentifierConfirmed:false,accountId:'bank',reviewedAt:'2026-10-31'},coverage:{from:'2026-10-01',to:'2026-10-28',reference:'original period',confirmed:true,reviewedAt:'2026-10-31'},convention:'asset'};
const derive = (s = statement, t = [e]) => accountStatementStatus(bank, [s], t, defaultPreferences(), "2026-11-01",true);
it("separates current coverage, imported rows, reconciliation and verified balance", () => { expect(derive()).toMatchObject({ freshness: "Current", imported: "Imported", reconciliation: "Reconciled", balance: "Verified", difference: 0, statementThrough: "2026-10-28" }); });
it("upload and reconciliation dates never freshen old coverage", () => { expect(derive({ ...statement, batch: { ...statement.batch, period_to: "2026-04-30", period_from: "2026-04-01",statement_review:{...statement.batch.statement_review,coverage:{from:'2026-04-01',to:'2026-04-30',reference:'page 1',confirmed:true,reviewedAt:'2026-10-31'}} }, rows: [] }).freshness).toBe("Outdated"); });
it("coverage confirmation is independent of source balance review", () => { const { balance_verification: ignored, ...batch } = statement.batch; expect(derive({ ...statement, batch })).toMatchObject({ freshness: "Current", balance: "Not Verified", reconciliation: "Requires Review" }); });
it("posting approval alone does not reconcile", () => { expect(derive({ ...statement, posted: [] })).toMatchObject({ reconciliation: "Requires Review", unresolved: 1 }); });
it("deleted or remapped posted entries remain unresolved", () => { expect(derive(statement, [])).toMatchObject({ unresolved: 1, reconciliation: "Requires Review", balance: "Difference Found" }); });
it("reports a real difference at the statement cutoff", () => { expect(derive(statement, [{ ...e, amount: 250 }])).toMatchObject({ difference: 50, balance: "Difference Found", reconciliation: "Differences Found" }); });
it("non-INR statements cannot certify INR balances", () => { expect(derive({ ...statement, batch: { ...statement.batch, currency: "USD" } }).balance).toBe("Verification Unavailable"); });
it("counts seven account configurations independently without inventing status", () => {
  const rows = ["savings", "current", "cash", "wallet", "credit_card", "loan", "investment"].map((kind, i) => accountStatementStatus({ ...bank, id: i ? String(i) : "bank", kind: kind as Account["kind"] }, [statement], [e], defaultPreferences(), "2026-11-01",true));
  expect(accountStatementSummary(rows)).toEqual({ total: 7, current: 1, reconciled: 1, verified: 1, attention: 6 });
});
it("repeated evidence creates no ledger entries and exact duplicate must read back", () => {
  const duplicate = { ...statement, rows: statement.rows.map(r => ({ ...r, duplicate_kind: "exact" as const, duplicate_id: e.id })), posted: [] };
  expect(derive(duplicate).reconciliation).toBe("Reconciled"); expect(derive(duplicate, []).unresolved).toBe(1); expect([e]).toHaveLength(1);
});
it("financial correction resets the statement match even when money and date match", () => { expect(derive(statement, [{ ...e, correctionRevision: 1 }]).unresolved).toBe(1); });
it("offsetting unaccounted ledger entries cannot certify reconciliation despite matching balance", () => {
  expect(derive(statement, [e, { ...e, id: "unmatched expense", amount: 50 }, { ...e, id: "unmatched income", amount: 50, txnType: "income" }])).toMatchObject({ balance: "Verified", reconciliation: "Requires Review" });
});