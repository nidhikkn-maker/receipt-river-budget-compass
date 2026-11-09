// P0-005b reproduction (evidence only; the payment path is NOT changed here).
// Renders the real CardDetails panel (src/components/WealthPanels.tsx) with a recording store and proves:
//  1. the amount comes from window.prompt (no in-app form, label, preview or confirmation of accounts);
//  2. it is saved with the generic save() — no createId/idempotency key and no finance_operation call;
//  3. a retry after a lost response therefore writes a SECOND card payment, and the ledger counts both.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Account } from "@/lib/ledger";
import { accountBalance } from "@/lib/ledger";
import { saveWithRecovery } from "@/lib/statement-pipeline/save-recovery";
import { defaultPreferences } from "@/lib/preferences";

const mocks = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));
vi.mock("@/lib/store", () => ({ useStore: () => mocks.store }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
// Native select in place of Radix so jsdom can choose the paying account.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: React.ReactNode }) => <select aria-label="pay-from" value={value} onChange={(e) => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
}));
import { CardDetails } from "./WealthPanels";

const card: Account = { id: "card-1", name: "HDFC Regalia", kind: "credit_card", openingBalance: 0, archived: false, creditLimit: 100000, dueDay: 5, issuer: "HDFC", lastFour: "4242", statementDay: 20 } as Account;
const bank: Account = { id: "bank-1", name: "HDFC savings", kind: "savings", openingBalance: 50000, archived: false } as Account;
const spend = { id: "s1", title: "Flipkart", amount: 8000, date: "2026-10-25", txnType: "expense", accountId: card.id, toAccountId: null } as never;

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("P0-005b REPRO: card payment entered by window.prompt and saved outside finance_operation", () => {
  it("prompts with window.prompt, then calls save() with no idempotency key and never calls finance_operation", async () => {
    const save = vi.fn(async () => {});
    const operation = vi.fn();
    mocks.store = { updateAccount: vi.fn(), transactions: [spend], loans: [], preferences: defaultPreferences(), accounts: [card, bank], save, financeOperation: operation, recordReimbursement: operation };
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("8000");
    render(<CardDetails a={card} />);
    fireEvent.change(screen.getByLabelText("pay-from"), { target: { value: bank.id } });
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(prompt).toHaveBeenCalledWith("Card payment amount (₹)", expect.any(String)); // browser prompt, not an app form
    const calls = save.mock.calls as unknown as unknown[][];
    expect(calls[0]).toHaveLength(1);                         // save(input) — no opts, so no createId
    expect(calls[0]![0]).toMatchObject({ txnType: "card_payment", amount: 8000, accountId: bank.id, toAccountId: card.id });
    expect(operation).not.toHaveBeenCalled();                  // no finance_operation idempotency record
  });

  it("a lost response is reported as a failure; the person's retry posts the payment twice and both reduce the bank balance", async () => {
    // What store.save does for this call: write, then on error read back by createId — which is absent, so read() returns null.
    const ledger: { id: string; amount: number; txnType: string; accountId: string; toAccountId: string; date: string }[] = [];
    const input = { title: "HDFC Regalia bill payment", merchant: "HDFC", category: "Card payment", scope: "personal", memberId: null, amount: 8000, currency: "INR", date: "2026-11-09", description: "Credit card settlement", paymentMethod: "bank_transfer", txnType: "card_payment", accountId: bank.id, toAccountId: card.id } as never;
    const write = (lose: boolean) => async () => { ledger.push({ id: crypto.randomUUID(), amount: 8000, txnType: "card_payment", accountId: bank.id, toAccountId: card.id, date: "2026-11-09" }); if (lose) throw Error("Network connection was lost"); };
    await expect(saveWithRecovery(write(true), async () => null, input)).rejects.toThrow("Network connection was lost"); // committed, but shown as failed
    await saveWithRecovery(write(false), async () => null, input); // the person taps Record payment again
    expect(ledger).toHaveLength(2);
    expect(new Set(ledger.map((x) => x.id)).size).toBe(2); // two distinct server ids: no shared key to de-duplicate
    expect(accountBalance(bank, ledger as never)).toBe(50000 - 16000); // bank debited twice
    expect(accountBalance(card, [spend, ...ledger] as never)).toBe(8000 - 16000); // card shows ₹8,000 overpaid
  });
});
