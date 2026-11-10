// P0-005b regression (was the reproduction; fixed in Phase 3 completion). The card payment is entered in an
// in-app form (no window.prompt) and recorded through ONE idempotent action: record_card_payment where the
// database has it, else save() with createId = the payment id. The payment id is created once per form, so a
// lost response followed by the person's retry records the payment ONCE and the ledger counts it once.
// The database side (same id -> one entry, one posting) is proven in src/lib/phase3-completion-sql.test.ts.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Account } from "@/lib/ledger";
import { accountBalance } from "@/lib/ledger";
import { recordCardPayment, type CardPaymentInput } from "@/lib/posting";
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
type Row = { id: string; amount: number; txnType: string; accountId: string; toAccountId: string; date: string };

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("P0-005b fixed: card payment through an in-app form and one idempotent action", () => {
  it("uses an in-app form (amount, date, account, preview) and never window.prompt; retries reuse the same payment id", async () => {
    const calls: CardPaymentInput[] = [];
    let lose = true;
    const payCard = vi.fn(async (p: CardPaymentInput) => { calls.push(p); if (lose) { lose = false; throw Error("Network connection was lost"); } return { id: p.requestId, amount: p.amount, replayed: true, via: "database" as const }; });
    mocks.store = { updateAccount: vi.fn(), transactions: [spend], loans: [], preferences: defaultPreferences(), accounts: [card, bank], payCard };
    const prompt = vi.spyOn(window, "prompt");
    render(<CardDetails a={card} />);
    fireEvent.change(screen.getByLabelText("pay-from"), { target: { value: bank.id } });
    fireEvent.change(screen.getByLabelText("Amount (₹)"), { target: { value: "8000" } });
    expect(screen.getByRole("status").textContent).toMatch(/from HDFC savings to HDFC Regalia/); // preview before saving
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    await waitFor(() => expect(payCard).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Record payment" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Record payment" })); // the person retries after the error
    await waitFor(() => expect(payCard).toHaveBeenCalledTimes(2));
    expect(prompt).not.toHaveBeenCalled();
    expect(calls[0]).toMatchObject({ fromAccountId: bank.id, cardAccountId: card.id, amount: 8000 });
    expect(calls[1]!.requestId).toBe(calls[0]!.requestId); // same id on retry: recorded once
    await waitFor(() => expect(screen.getByRole("button", { name: "Record payment" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Record payment" })); // after a confirmed save, a NEW payment gets a new id
    await waitFor(() => expect(payCard).toHaveBeenCalledTimes(3));
    expect(calls[2]!.requestId).not.toBe(calls[0]!.requestId);
  });

  it("database action: a lost response + retry with the same id records ONE payment; the bank is debited once", async () => {
    const ledger = new Map<string, Row>();
    let lose = true;
    const rpc = async (name: string, args?: Record<string, unknown>) => {
      expect(name).toBe("record_card_payment");
      const id = String(args?.["_request"]);
      const replayed = ledger.has(id);
      if (!replayed) ledger.set(id, { id, amount: Number(args?.["_amount"]), txnType: "card_payment", accountId: String(args?.["_from"]), toAccountId: String(args?.["_card"]), date: String(args?.["_on"]) });
      if (lose) { lose = false; return { data: null, error: { message: "Network connection was lost" } }; } // committed, response lost
      return { data: { id, amount: Number(args?.["_amount"]), replayed }, error: null };
    };
    const p: CardPaymentInput = { requestId: crypto.randomUUID(), fromAccountId: bank.id, cardAccountId: card.id, amount: 8000, date: "2026-10-30" };
    await expect(recordCardPayment(p, rpc)).rejects.toThrow("Network connection was lost");
    const retry = await recordCardPayment(p, rpc);
    expect(retry).toMatchObject({ replayed: true, via: "database" });
    expect(ledger.size).toBe(1);
    expect(accountBalance(bank, [...ledger.values()] as never)).toBe(50000 - 8000);
    expect(accountBalance(card, [spend, ...ledger.values()] as never)).toBe(0); // settled, not overpaid
  });

  it("production schema (no database action): falls back to save() with createId = payment id, so the retry upserts the same entry", async () => {
    const ledger = new Map<string, Row>();
    let lose = true;
    const missing = async () => ({ data: null, error: { message: "Could not find the function public.record_card_payment", code: "PGRST202" } });
    const save = async (createId: string) => { ledger.set(createId, { id: createId, amount: 8000, txnType: "card_payment", accountId: bank.id, toAccountId: card.id, date: "2026-10-30" }); if (lose) { lose = false; throw Error("Network connection was lost"); } };
    const p: CardPaymentInput = { requestId: crypto.randomUUID(), fromAccountId: bank.id, cardAccountId: card.id, amount: 8000, date: "2026-10-30" };
    await expect(recordCardPayment(p, missing, save)).rejects.toThrow("Network connection was lost");
    expect(await recordCardPayment(p, missing, save)).toMatchObject({ via: "fallback" });
    expect(ledger.size).toBe(1);
    expect(accountBalance(bank, [...ledger.values()] as never)).toBe(42000);
  });

  it("refuses invalid payments before any write", async () => {
    const rpc = vi.fn();
    const base: CardPaymentInput = { requestId: crypto.randomUUID(), fromAccountId: bank.id, cardAccountId: card.id, amount: 8000, date: "2026-10-30" };
    await expect(recordCardPayment({ ...base, amount: 0 }, rpc)).rejects.toThrow(/positive amount/);
    await expect(recordCardPayment({ ...base, amount: 10.001 }, rpc)).rejects.toThrow(/two decimal places/);
    await expect(recordCardPayment({ ...base, cardAccountId: bank.id }, rpc)).rejects.toThrow(/card you paid/);
    await expect(recordCardPayment({ ...base, requestId: "retry-1" }, rpc)).rejects.toThrow(/identifier/);
    await expect(recordCardPayment({ ...base, date: "2099-01-01" }, rpc)).rejects.toThrow(/future/);
    expect(rpc).not.toHaveBeenCalled();
  });
});
