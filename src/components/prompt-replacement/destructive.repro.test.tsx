// Regression (was the reproduction, see docs/evidence/screens/2026-11-10-prompt-replacement-2/repro/): destructive
// financial actions use in-app dialogs, never a browser pop-up (window.confirm/prompt). Each dialog names the record and
// says what happens; the store call is the same as the pop-up path; Cancel and Escape change nothing. Expense removal is
// Withdraw with a reason for unposted entries (RB-LED-01) and Reverse for posted ones; nothing is deleted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Account } from "@/lib/ledger";
import type { Expense } from "@/lib/expenses";
import type { TravelTrip } from "@/lib/travel";
import { defaultPreferences } from "@/lib/preferences";
import { ReversalReasonRequired } from "@/lib/posting";
import { callsOf, harness, reset, spy } from "../records-archive/harness";

const posting = vi.hoisted(() => ({ status: { installed: false, active: false, guest: false, canPost: false } }));
vi.mock("@/lib/store", async () => ({ useStore: (await import("../records-archive/harness")).useStoreMock }));
vi.mock("@tanstack/react-router", async () => (await import("../records-archive/harness")).routerMock);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("@/lib/posting", async (orig) => ({ ...(await orig<typeof import("@/lib/posting")>()), usePostingStatus: () => posting.status }));
import { ExpenseDetail } from "@/components/ExpenseDialog";
import { TripClosureCard } from "@/components/trip/TripSections";

const card: Account = { id: "acc-card", name: "Amex card", kind: "credit_card", openingBalance: 0, archived: false };
const bank: Account = { id: "acc-bank", name: "HDFC savings", kind: "savings", openingBalance: 0, archived: false };
const cash: Account = { id: "acc-cash", name: "Wallet cash", kind: "cash", openingBalance: 0, archived: false };
const lunch = {
  id: "e-1", title: "Team lunch", merchant: "Toit", category: "Food", scope: "personal", memberId: null, amount: 2400,
  originalAmount: 2400, currency: "INR", fxRate: 1, date: "2026-11-02", description: "", paymentMethod: "card",
  txnType: "expense", accountId: "acc-card", receipts: [{ path: "owner/r.jpg", name: "r.jpg", type: "application/pdf" }],
  tags: [], reimbursementStatus: "pending",
} as unknown as Expense;
const trip: TravelTrip = { id: "t-1", name: "Goa offsite", destination: "Goa", start: "2026-12-01", end: "2026-12-04", budget: 50000, currencies: ["INR"], travellers: [], bookings: [], itinerary: [], advances: [] };

const store = (extra: Record<string, unknown> = {}) => reset(defaultPreferences() as unknown as Record<string, unknown>, {
  accounts: [card, bank, cash], memberName: () => "Me", history: async () => [], signedUrl: async () => null,
  remove: spy("remove"), setScope: spy("setScope"), setReimbursement: spy("setReimbursement"),
  recordReimbursement: spy("recordReimbursement"), convertToEmi: spy("convertToEmi"), ...extra,
});
const browser = vi.hoisted(() => ({ confirm: null as unknown, prompt: null as unknown }));
beforeEach(() => {
  posting.status = { installed: false, active: false, guest: false, canPost: false };
  browser.confirm = vi.spyOn(window, "confirm").mockImplementation(() => { throw new Error("window.confirm must not be used"); });
  browser.prompt = vi.spyOn(window, "prompt").mockImplementation(() => { throw new Error("window.prompt must not be used"); });
});
afterEach(() => {
  expect(browser.confirm).not.toHaveBeenCalled();
  expect(browser.prompt).not.toHaveBeenCalled();
  cleanup();
  vi.restoreAllMocks();
});
const dialog = () => screen.getAllByRole("dialog").at(-1)!;
const press = (name: string | RegExp) => fireEvent.click(within(dialog()).getByRole("button", { name }));
const closed = () => waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

describe("destructive financial actions use in-app dialogs", () => {
  // RB-LED-01 (KK 11 Nov): an unposted entry is withdrawn with a reason, never deleted; the dialog says it is kept and restorable.
  it("Expense → Withdraw entry (posting not active): names the entry, says it is kept in history, excluded from totals and restorable; needs a reason; Keep expense and Escape do nothing", async () => {
    store();
    const onClose = vi.fn();
    render(<ExpenseDetail expense={lunch} onClose={onClose} />);
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw entry" }));
    expect(within(dialog()).getByRole("heading").textContent).toBe("Withdraw “Team lunch”?");
    expect(dialog().textContent).toContain("withdrawn, not deleted: it is kept in history with who, when and your reason, excluded from totals, and can be restored");
    expect(dialog().textContent).toContain("₹2,400.00 on 2026-11-02 · Amex card is left out of balances, reports and every total");
    expect(dialog().textContent).toContain("1 receipt file is kept with it");
    expect(dialog().textContent).not.toMatch(/can't be undone|is deleted/);
    expect(dialog().className).toContain("native-sheet");
    const withdraw = within(dialog()).getByRole("button", { name: "Withdraw entry" }) as HTMLButtonElement;
    expect(withdraw.className).toContain("bg-destructive");
    press("Keep expense");
    await closed();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw entry" }));
    fireEvent.keyDown(dialog(), { key: "Escape" });
    await closed();
    expect(callsOf("remove")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Withdraw entry" }));
    press("Withdraw entry"); // no reason yet: nothing is sent
    expect(callsOf("remove")).toHaveLength(0);
    fireEvent.change(within(dialog()).getByLabelText("Reason for withdrawing"), { target: { value: "Entered twice by mistake" } });
    press("Withdraw entry");
    await closed();
    expect(callsOf("remove").map((c) => c.args)).toEqual([[lunch, { reason: "Entered twice by mistake" }]]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Expense → Withdraw: if the server says the entry is posted, nothing is changed and the reversal dialog opens", async () => {
    store({ remove: vi.fn(async () => { throw new ReversalReasonRequired(); }) });
    render(<ExpenseDetail expense={lunch} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Withdraw entry" }));
    fireEvent.change(within(dialog()).getByLabelText("Reason for withdrawing"), { target: { value: "Entered twice by mistake" } });
    press("Withdraw entry");
    expect(await screen.findByRole("heading", { name: "Reverse this posted entry?" })).toBeTruthy();
  });

  it("Expense → Withdraw: another failure keeps the dialog open with the reason", async () => {
    store({ remove: vi.fn(async () => { throw new Error("Network connection was lost"); }) });
    render(<ExpenseDetail expense={lunch} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Withdraw entry" }));
    fireEvent.change(within(dialog()).getByLabelText("Reason for withdrawing"), { target: { value: "Entered twice by mistake" } });
    press("Withdraw entry");
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent("Network connection was lost");
  });

  it("Expense matched to a statement line: Withdraw is not offered (correction instead); a withdrawn entry offers Restore with a reason", async () => {
    store({ restoreWithdrawn: spy("restoreWithdrawn") });
    const { unmount } = render(<ExpenseDetail expense={{ ...lunch, reconciledAt: "2026-11-03T00:00:00Z", statementRef: "Statement line · 2026-11-02 · debit 2400.00 · TOIT · account acc-card" }} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "Withdraw entry" })).toBeNull();
    expect(screen.getByText(/correct it with Edit instead of withdrawing it/)).toBeTruthy();
    unmount();
    const w = { state: "withdrawn" as const, at: "2026-11-10T10:00:00.000Z", by: "u1", reason: "Entered twice by mistake", history: [] };
    render(<ExpenseDetail expense={{ ...lunch, withdrawnAt: w.at, withdrawal: w }} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.getByText("Reason: Entered twice by mistake")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restore entry" }));
    fireEvent.change(within(dialog()).getByLabelText("Reason for restoring"), { target: { value: "Withdrawn by mistake" } });
    press("Restore entry");
    await closed();
    expect(callsOf("restoreWithdrawn").map((c) => c.args[1])).toEqual(["Withdrawn by mistake"]);
  });

  it("Expense → Reverse entry (posting active) still opens the existing reversal dialog with a required reason", () => {
    posting.status = { installed: true, active: true, guest: false, canPost: true };
    store();
    render(<ExpenseDetail expense={lunch} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Reverse entry" }));
    expect(within(dialog()).getByRole("heading").textContent).toBe("Reverse this posted entry?");
    expect((within(dialog()).getByRole("button", { name: "Reverse entry" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Expense → Record reimbursement: choose a cash or bank account (no typing names); records the same operation dated today", async () => {
    store();
    render(<ExpenseDetail expense={lunch} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Record reimbursement" }));
    const confirm = within(dialog()).getByRole("button", { name: "Record reimbursement" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(within(dialog()).getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual(["HDFC savings", "Wallet cash"]);
    fireEvent.click(within(dialog()).getByRole("radio", { name: "Wallet cash" }));
    press("Record reimbursement");
    await closed();
    expect(callsOf("recordReimbursement").map((c) => c.args)).toEqual([[["e-1"], "acc-cash", new Date().toLocaleDateString("en-CA")]]);
  });

  it("Expense → Convert to EMI: one dialog with the three fields prefilled (6, 12, 0); the server's limits explained inline; same convertToEmi call", async () => {
    store();
    render(<ExpenseDetail expense={lunch} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Convert to EMI" }));
    const field = (l: string) => within(dialog()).getByLabelText(l) as HTMLInputElement;
    expect([field("EMI term in months (2–60)").value, field("Annual EMI interest %").value, field("Processing fee (₹)").value]).toEqual(["6", "12", "0"]);
    fireEvent.change(field("EMI term in months (2–60)"), { target: { value: "61" } });
    expect(dialog().textContent).toContain("Enter a whole number of months from 2 to 60");
    expect((within(dialog()).getByRole("button", { name: "Convert to EMI" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field("EMI term in months (2–60)"), { target: { value: "9" } });
    fireEvent.change(field("Processing fee (₹)"), { target: { value: "199" } });
    press("Convert to EMI");
    await closed();
    expect(callsOf("convertToEmi").map((c) => c.args)).toEqual([[lunch, { months: 9, rate: 12, fee: 199 }]]);
  });

  it("Trip → Cancel trip: names the trip, says records stay and it can be undone; Keep trip does nothing; Cancel trip saves cancelledAt", async () => {
    store({ transactions: [] });
    harness.store = { ...harness.store, preferences: { ...(harness.store["preferences"] as object), trips: [trip] } };
    render(<TripClosureCard trip={trip} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel trip" }));
    expect(within(dialog()).getByRole("heading").textContent).toBe("Cancel “Goa offsite”?");
    expect(dialog().textContent).toContain("Records stay");
    press("Keep trip");
    await closed();
    expect(harness.saves).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel trip" }));
    press("Cancel trip");
    await closed();
    expect(harness.saves).toBe(1);
    const saved = (harness.stored as { trips?: TravelTrip[] }).trips?.[0];
    expect(saved?.cancelledAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect({ ...saved, cancelledAt: undefined }).toMatchObject({ ...trip, cancelledAt: undefined });
  });
});
