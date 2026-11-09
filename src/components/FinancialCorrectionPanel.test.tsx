import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { Expense } from "@/lib/expenses";
import type { FinancialReview } from "@/lib/financial-review";
import type { CorrectionPreview } from "@/lib/financial-corrections";
const mocks = vi.hoisted(() => ({ store: {} as Record<string, unknown>, apply: vi.fn(), undo: vi.fn(), history: vi.fn() }));
vi.mock("@/lib/store", () => ({ useStore: () => mocks.store }));
import { FinancialCorrectionPanel } from "./FinancialCorrectionPanel";
afterEach(cleanup);
beforeAll(() => { Element.prototype.scrollIntoView = vi.fn(); });
it("controlled copy: cancel makes no change; confirm applies reviewed effects and undo restores with confirmation", async () => {
  const e: Expense = { id: "controlled", title: "Settlement", merchant: null, category: "Miscellaneous", scope: "personal", memberId: null, splits: [], amount: 1000, originalAmount: 1000, currency: "INR", fxRate: 1, paymentMethod: "bank_transfer", reconciledAt: null, statementRef: "Original", date: "2026-10-20", description: "Untouched", receipts: [], accountId: "bank", txnType: "expense" };
  const row: FinancialReview = { transaction: e, issues: [], group: "type", confidence: "medium", evidence: [], targetAccountIds: [], status: "Suggested Correction" };
  const accounts = [{ id: "bank", name: "Bank", kind: "savings", openingBalance: 10000, archived: false }, { id: "card", name: "Card", kind: "credit_card", openingBalance: 1000, archived: false }];
  let history: unknown[] = [];
  mocks.history.mockImplementation(async () => history);
  mocks.apply.mockImplementation(async (p: CorrectionPreview) => { mocks.store['transactions'] = p.after; history = [{ id: "batch", count: 1, createdAt: "2026-11-01", entries: [{ before: { id: e.id, title: e.title, amount: 1000, txn_type: "expense", account_id: "bank", to_account_id: null }, after: { txn_type: "card_payment", account_id: "bank", to_account_id: "card" } }] }]; });
  mocks.undo.mockImplementation(async () => { mocks.store['transactions'] = [e]; history = []; });
  mocks.store = { transactions: [e], accounts, correctFinancialEntries: mocks.apply, undoFinancialCorrection: mocks.undo, financialCorrectionHistory: mocks.history };
  const saved = vi.fn();
  render(<FinancialCorrectionPanel rows={[row]} onSaved={saved} />);
  fireEvent.click(screen.getByRole("combobox", { name: "Correction transaction type" })); fireEvent.click(await screen.findByRole("option", { name: "Card payment" }));
  fireEvent.click(screen.getByRole("combobox", { name: "Receiving account" })); fireEvent.click(await screen.findByRole("option", { name: "Card" }));
  fireEvent.click(screen.getByRole("button", { name: "Preview account & type changes" }));
  expect(mocks.apply).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Cancel" })); expect(mocks.apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Preview account & type changes" })); fireEvent.click(screen.getByRole("button", { name: "Confirm financial changes" }));
  await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
  expect(mocks.apply.mock.calls[0]?.[0]).toMatchObject({ spendingChange: -1000, incomeChange: 0 });
  expect((mocks.store['transactions'] as Expense[])[0]?.txnType).toBe("card_payment");
  fireEvent.click(await screen.findByRole("button", { name: "Review undo" })); expect(mocks.undo).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm restoration" })); await waitFor(() => expect(mocks.undo).toHaveBeenCalledWith("batch"));
  expect((mocks.store['transactions'] as Expense[])[0]?.txnType).toBe("expense"); expect(e.description).toBe("Untouched");
  expect(saved).toHaveBeenCalledTimes(2);
});
it("type switches preserve applicable source and repayment values but clear incompatible draft values without saving", async () => {
  const e: Expense = { id: "draft-copy", title: "Payment", merchant: "External supplier", category: "Miscellaneous", scope: "personal", memberId: null, splits: [], amount: 1000, originalAmount: 1000, currency: "INR", fxRate: 1, paymentMethod: "bank_transfer", reconciledAt: null, statementRef: "Original", date: "2026-10-20", description: "Source", receipts: [], accountId: "bank", txnType: "expense" };
  const row: FinancialReview = { transaction: e, issues: [], group: "type", confidence: "medium", evidence: [], targetAccountIds: [], status: "Suggested Correction" };
  mocks.apply.mockReset(); mocks.history.mockResolvedValue([]);
  mocks.store = { transactions: [e], accounts: [
    { id: "bank", name: "Bank", kind: "savings", openingBalance: 0, archived: false },
    { id: "other", name: "Other bank", kind: "savings", openingBalance: 0, archived: false },
    { id: "loan", name: "Loan", kind: "loan", openingBalance: 0, archived: false },
  ], correctFinancialEntries: mocks.apply, financialCorrectionHistory: mocks.history };
  render(<FinancialCorrectionPanel rows={[row]} onSaved={() => {}} />);
  const choose = async (label: string, option: string) => { fireEvent.click(screen.getByRole("combobox", { name: label })); fireEvent.click(await screen.findByRole("option", { name: option })); };
  await choose("Payment account/card", "Other bank");
  await choose("Correction transaction type", "Loan repayment");
  await choose("Receiving account", "Loan");
  fireEvent.change(screen.getByRole("spinbutton", { name: "Correction principal" }), { target: { value: "800" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Correction interest" }), { target: { value: "200" } });
  await choose("Correction transaction type", "Type · keep existing");
  await choose("Correction transaction type", "Loan repayment");
  expect((screen.getByRole("spinbutton", { name: "Correction principal" }) as HTMLInputElement).value).toBe("");
  expect((screen.getByRole("spinbutton", { name: "Correction interest" }) as HTMLInputElement).value).toBe("");
  await choose("Correction transaction type", "Expense");
  fireEvent.click(screen.getByRole("button", { name: "Preview account & type changes" }));
  expect(screen.getByRole("dialog").textContent).toContain("Bank → Other bank");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(e).toMatchObject({ accountId: "bank", txnType: "expense", merchant: "External supplier", statementRef: "Original" });
}, 20_000); // many sequential form interactions; the default 5 s limit is too tight when several suites run in parallel