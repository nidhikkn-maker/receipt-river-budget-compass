// Batch B1d item 6: the REAL review (NewExpense) inside the REAL Intelligent Canvas. Only the edges are replaced:
// the store (which records saves), receipt reading (a stand-in returning what the reader returns for the sample
// Blue Tokai bill: "Paid: Credit card ****1006"), drafts/offline storage, and router links. Every flow must end
// in exactly one save, with the same draft id, the source document attached and the owner's decisions recorded.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPreferences } from "@/lib/preferences";
import type { Expense, ExpenseInput } from "@/lib/expenses";
import type { Account } from "@/lib/ledger";

const h = vi.hoisted(() => ({
  saves: [] as { input: ExpenseInput; opts: { id?: string; createId?: string; files?: File[] } }[],
  drafts: [] as { id: string; data: Record<string, unknown> }[],
  stored: null as null | { id: string; data: Record<string, unknown>; receipts: { name: string; type: string; path: string }[]; status: string },
  transactions: [] as Expense[],
  reads: 0,
  read: {} as Record<string, unknown>,
  failNextSave: false,
  pending: null as null | File[],
}));

const accounts: Account[] = [
  { id: "sav", name: "HDFC Savings", kind: "savings", openingBalance: 0, archived: false, lastFour: "4821" },
  { id: "amex", name: "Amex Platinum Travel", kind: "credit_card", openingBalance: 0, archived: false, issuer: "American Express", lastFour: "1006" },
  { id: "cash", name: "Cash wallet", kind: "cash", openingBalance: 0, archived: false },
];
const prefs = defaultPreferences();
vi.mock("@/lib/store", () => ({
  useStore: () => ({
    userId: "owner-1", transactions: h.transactions, members: [], accounts, loans: [], preferences: prefs, documents: [],
    savePreferences: async () => {}, addDocument: async () => {}, removeDocument: async () => {}, signedUrl: async () => "", addAccount: async () => "",
    save: async (input: ExpenseInput, opts: { id?: string; createId?: string; files?: File[] }) => {
      h.saves.push({ input, opts });
      if (h.failNextSave) { h.failNextSave = false; throw new Error("timeout"); }
    },
  }),
}));
vi.mock("@tanstack/react-router", async () => {
  const { MockLink } = await import("@/components/shell/test-router-mock");
  return { Link: MockLink, useNavigate: () => () => {}, useRouter: () => ({ history: { back: () => {} } }), useSearch: () => ({}), createFileRoute: () => (o: unknown) => o };
});
vi.mock("@tanstack/react-start", () => ({ useServerFn: <T,>(fn: T) => fn, createServerFn: () => { const b = { middleware: () => b, inputValidator: () => b, handler: () => async () => ({ ok: false }) }; return b; } }));
vi.mock("@/lib/receipt-extract.functions", () => ({ extractReceipt: async () => { h.reads++; return { ok: true, result: h.read }; } }));
vi.mock("@/lib/pending-scan", () => ({ takePendingScan: () => { const f = h.pending; h.pending = null; return f; } }));
vi.mock("@/lib/fx.functions", () => ({ getFxRate: async () => ({ ok: true, rate: 1, date: "2026-11-09" }) }));
vi.mock("@/lib/assistant.functions", () => ({ parseSpokenEntry: async () => ({ ok: false, error: "not in this test" }) }));
vi.mock("@/lib/offline", () => ({ fileToLocal: async () => ({}), localDrafts: async () => [], localToFile: () => { throw new Error("none"); }, putLocalDraft: async () => {}, removeLocalDraft: async () => {} }));
vi.mock("@/lib/drafts", async (orig) => ({
  ...(await orig<typeof import("@/lib/drafts")>()),
  getDraft: async (id: string) => (h.stored && h.stored.id === id ? { ...h.stored, transactionId: null, createdAt: "", updatedAt: "" } : null),
  upsertDraft: async (id: string, _owner: string, data: Record<string, unknown>) => { h.drafts.push({ id, data }); },
  uploadDraftReceipt: async (_owner: string, id: string, f: File) => `owner-1/drafts/${id}/${f.name}`,
  draftReceiptFile: async (r: { name: string; type: string }) => new File(["receipt-bytes"], r.name, { type: r.type }),
  completeDraft: async () => {},
}));
vi.mock("@/components/SourcePreview", () => ({
  SourcePreview: ({ file }: { file: File }) => <p>Preview of {file.name}</p>,
  sourceKind: (f: File) => (f.type.startsWith("image/") ? "image" : "other"),
}));
vi.mock("@/components/ReceiptZoomViewer", () => ({ ReceiptZoomViewer: () => null }));
vi.mock("@/components/ReceiptAssetHandoff", () => ({ ReceiptAssetHandoff: () => null }));
vi.mock("@/components/ExpenditureReportBuilder", () => ({ ExpenditureReportBuilder: () => null }));
vi.mock("@/routes/_authenticated/statements", () => ({ StatementDeskPage: () => <p>Statement Desk</p> }));

import { IntelligentCanvas } from "./IntelligentCanvas";
import { NewExpense } from "@/routes/_authenticated/new";
import { receiptFingerprint } from "@/lib/receipt-audit";

const SAMPLE = {
  title: "Blue Tokai Coffee", merchant: "Blue Tokai Coffee Roasters", date: "2026-11-09", amount: 460, subtotal: 438.1, tax: 21.9, tip: null, round_off: null, charges: [],
  tax_parts: [{ label: "CGST", rate: 2.5, amount: 10.95 }, { label: "SGST", rate: 2.5, amount: 10.95 }],
  confidence: { merchant: "high", date: "high", total: "high" },
  items: [{ name: "Cappuccino", quantity: 2, amount: 380, section: null, confidence: { name: "high", amount: "high" } }, { name: "Almond croissant", quantity: 1, amount: 58.1, section: null, confidence: { name: "high", amount: "high" } }],
  text: "BLUE TOKAI COFFEE ROASTERS Indiranagar, Bengaluru TOTAL 460.00 Paid: Credit card ****1006", currency: "INR", payment_method: "credit_card",
  card_network: null, card_last_four: "1006", description: null, category: "Food and beverages", scope: "personal",
};
const blueTokai = (id: string, merchant = "Blue Tokai Coffee Roasters"): Expense => ({
  id, title: "Blue Tokai coffee", merchant, category: "Food and beverages", scope: "personal", memberId: null, splits: [], amount: 460, originalAmount: 460, currency: "INR", fxRate: 1,
  paymentMethod: "credit_card", date: "2026-11-09", description: "", receipts: [], reconciledAt: null, statementRef: null, accountId: "amex", txnType: "expense",
});

const photo = () => new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], "blue-tokai.png", { type: "image/png" });
const step = () => screen.getByRole("list", { name: "Steps" }).querySelector('[aria-current="step"]')?.textContent;
const footerContinue = () => document.querySelector(".sf-canvas-foot .sf-btn-deep") as HTMLButtonElement;
const confirmButton = () => screen.getByRole("button", { name: /Confirm and save/ }) as HTMLButtonElement;
const pickOption = async (trigger: HTMLElement, name: RegExp) => {
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name }));
};
async function openReview() {
  fireEvent.change(screen.getByLabelText("Choose files"), { target: { files: [photo()] } });
  fireEvent.click(screen.getByRole("button", { name: /Continue to review/ }));
  await screen.findByRole("group", { name: "Review scanned details" }, { timeout: 8000 });
}
async function looksRight() {
  fireEvent.click(screen.getByRole("button", { name: "Looks right" }));
  await screen.findByLabelText("Account");
}

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  // jsdom has no DataTransfer; the classic page hands a pending photo over through one.
  globalThis.DataTransfer ??= class { list: File[] = []; items = { add: (f: File) => { this.list.push(f); } }; get files() { return this.list; } } as unknown as typeof DataTransfer;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
beforeEach(() => {
  Object.assign(h, { saves: [], drafts: [], stored: null, transactions: [], reads: 0, read: { ...SAMPLE }, failNextSave: false, pending: null });
});
afterEach(cleanup);

describe("Smart Add flow with the real review (B1d item 6)", () => {
  it("reads Amex ending 1006 as a suggestion with evidence; Confirm stays blocked until the owner confirms it; one save with the source", async () => {
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    await openReview();
    // Correct an extracted value before accepting the reading.
    fireEvent.change(screen.getByLabelText("Merchant"), { target: { value: "Blue Tokai Indiranagar" } });
    await looksRight();
    expect(screen.getByLabelText("Account")).toHaveTextContent("Amex Platinum Travel");
    const check = screen.getByText("Account needs confirmation").closest("div")!;
    expect(check).toHaveTextContent("Suggested from: Card ending 1006 printed on the bill matches Amex Platinum Travel.");
    // Original and Details keep the source and the edits.
    fireEvent.click(screen.getByRole("tab", { name: "Original" }));
    expect(screen.getByText("Preview of blue-tokai.png")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Details" }));
    await waitFor(() => expect(footerContinue()).toBeEnabled());
    fireEvent.click(footerContinue());
    expect(step()).toBe("3 · Confirm");
    expect(confirmButton()).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Account needs confirmation.");
    expect(screen.getByText("Account").closest("div")).toHaveTextContent("From: Card ending 1006 printed on the bill matches Amex Platinum Travel");
    fireEvent.click(confirmButton());
    expect(h.saves).toHaveLength(0);
    // Back to review; confirm the suggested account explicitly.
    fireEvent.click(screen.getByRole("button", { name: "Choose the account" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm this account" }));
    fireEvent.click(footerContinue());
    expect(confirmButton()).toBeEnabled();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(h.saves).toHaveLength(1));
    const [{ input, opts }] = h.saves as [typeof h.saves[number]];
    expect(input).toMatchObject({ merchant: "Blue Tokai Indiranagar", accountId: "amex", amount: 460, date: "2026-11-09" });
    expect(opts.files?.map((f) => f.name)).toEqual(["blue-tokai.png"]);
    expect(input.receiptDetails?.accountCheck).toMatchObject({ decision: "evidence_confirmed", evidence: "Card ending 1006 printed on the bill matches Amex Platinum Travel", card: { network: null, lastFour: "1006" } });
    expect(input.receiptDetails?.audit?.corrected).toEqual({ merchant: "Blue Tokai Indiranagar" });
    expect(await screen.findByRole("dialog", { name: "Saved to your records." })).toBeInTheDocument();
  });

  it("changing the payment account by hand, cancelling the confirmation and hiding/reopening the sheet keeps the source and saves once", async () => {
    const view = render(<IntelligentCanvas open onOpenChange={() => {}} />);
    await openReview();
    await looksRight();
    await pickOption(screen.getByLabelText("Account"), /HDFC Savings/);
    expect(screen.queryByText("Account needs confirmation")).toBeNull();
    fireEvent.click(footerContinue());
    expect(confirmButton()).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /Change/ })); // cancel the confirmation
    expect(step()).toBe("2 · Review");
    view.rerender(<IntelligentCanvas open={false} onOpenChange={() => {}} />);
    view.rerender(<IntelligentCanvas open onOpenChange={() => {}} />);
    expect(step()).toBe("2 · Review");
    expect(screen.getByLabelText("Account")).toHaveTextContent("HDFC Savings");
    fireEvent.click(screen.getByRole("tab", { name: "Original" }));
    expect(screen.getByText("Preview of blue-tokai.png")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Details" }));
    fireEvent.click(footerContinue());
    fireEvent.click(confirmButton());
    await waitFor(() => expect(h.saves).toHaveLength(1));
    expect(h.saves[0]!.input).toMatchObject({ accountId: "sav" });
    expect(h.saves[0]!.input.receiptDetails?.accountCheck?.decision).toBe("chosen");
    expect(h.saves[0]!.opts.files?.map((f) => f.name)).toEqual(["blue-tokai.png"]);
    expect(h.reads).toBe(1);
  });

  it("a failed save retried after re-confirming reuses the same draft id, so it can't create a second entry", async () => {
    h.failNextSave = true;
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    await openReview();
    await looksRight();
    fireEvent.click(screen.getByRole("button", { name: "Confirm this account" }));
    fireEvent.click(footerContinue());
    fireEvent.click(confirmButton());
    await screen.findByText(/We couldn't confirm the save/);
    await waitFor(() => expect(footerContinue()).toBeEnabled());
    fireEvent.click(footerContinue());
    fireEvent.click(confirmButton());
    await waitFor(() => expect(h.saves).toHaveLength(2));
    const ids = h.saves.map((s) => s.opts.createId);
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBe(ids[0]);
  });

  it("a false-positive duplicate is released only with a reason, which is saved with the entry", async () => {
    h.transactions = [blueTokai("existing-1")];
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    await openReview();
    const dup = screen.getByRole("region", { name: "Possible duplicate bills" });
    fireEvent.click(within(dup).getByRole("button", { name: "It's separate" }));
    expect(within(dup).getByText(/Say why this is a separate bill/)).toBeInTheDocument();
    expect(within(dup).queryByText(/Separate bill confirmed/)).toBeNull();
    fireEvent.change(within(dup).getByLabelText("If it's a separate bill, say why"), { target: { value: "Second round for the team, new bill BT-20932" } });
    fireEvent.click(within(dup).getByRole("button", { name: "It's separate" }));
    expect(within(dup).getByText(/Separate bill confirmed/)).toBeInTheDocument();
    await looksRight();
    fireEvent.click(screen.getByRole("button", { name: "Confirm this account" }));
    await waitFor(() => expect(footerContinue()).toBeEnabled());
    fireEvent.click(footerContinue());
    fireEvent.click(confirmButton());
    await waitFor(() => expect(h.saves).toHaveLength(1));
    expect(h.saves[0]!.input.receiptDetails?.duplicateReview).toEqual([expect.objectContaining({ decision: "separate", check: "same_bill", reason: "Second round for the team, new bill BT-20932", matchedIds: ["existing-1"], decidedAt: expect.any(String) })]);
  });

  it("“It's the same bill” keeps a confirmed duplicate from being posted (Enter can't skip it either)", async () => {
    h.transactions = [blueTokai("existing-1")];
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    await openReview();
    fireEvent.click(within(screen.getByRole("region", { name: "Possible duplicate bills" })).getByRole("button", { name: "It's the same bill" }));
    expect(screen.getByText(/Same bill — it won't be posted again/)).toBeInTheDocument();
    await looksRight();
    fireEvent.click(screen.getByRole("button", { name: "Confirm this account" }));
    expect(footerContinue()).toBeDisabled();
    fireEvent.submit(screen.getByLabelText("Account").closest("form")!); // Enter can't skip the checks
    expect(step()).toBe("2 · Review");
    expect(h.saves).toHaveLength(0);
  });

  it("a strong matching entry (Statement Desk rules) also needs a reason to be kept separate, or stays unposted as the same bill", async () => {
    h.transactions = [blueTokai("existing-3", "Blue Tokai")];
    const view = render(<IntelligentCanvas open onOpenChange={() => {}} />);
    await openReview();
    await looksRight();
    fireEvent.click(screen.getByRole("button", { name: "Confirm this account" }));
    const match = screen.getByRole("region", { name: "Possible matching entries" });
    expect(footerContinue()).toBeDisabled();
    fireEvent.click(within(match).getByRole("button", { name: "It's the same bill" }));
    expect(within(match).getByText(/Same bill — it won't be posted again/)).toBeInTheDocument();
    fireEvent.submit(screen.getByLabelText("Account").closest("form")!); // Enter can't skip the checks
    expect(step()).toBe("2 · Review");
    expect(h.saves).toHaveLength(0);
    fireEvent.click(within(match).getByRole("button", { name: "Change" }));
    fireEvent.change(within(match).getByLabelText("If it's a separate bill, say why"), { target: { value: "Different visit — morning and evening" } });
    fireEvent.click(within(match).getByRole("button", { name: "It's separate" }));
    await waitFor(() => expect(footerContinue()).toBeEnabled());
    fireEvent.click(footerContinue());
    fireEvent.click(confirmButton());
    await waitFor(() => expect(h.saves).toHaveLength(1));
    expect(h.saves[0]!.input.receiptDetails?.duplicateReview).toEqual([expect.objectContaining({ check: "matching_entry", reason: "Different visit — morning and evening", matchedIds: ["existing-3"] })]);
    view.unmount();
  });

  it("the same receipt file already on another entry can't be posted (no 'use anyway')", async () => {
    const existing = blueTokai("existing-2", "Another shop");
    existing.receiptDetails = { fingerprint: await receiptFingerprint(photo()) };
    existing.date = "2026-10-01";
    h.transactions = [existing];
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    await openReview();
    const used = await screen.findByRole("region", { name: "Receipt already used" });
    expect(within(used).queryByRole("button", { name: /anyway/i })).toBeNull();
    await looksRight();
    fireEvent.click(screen.getByRole("button", { name: "Confirm this account" }));
    expect(footerContinue()).toBeDisabled();
    fireEvent.submit(screen.getByLabelText("Account").closest("form")!); // Enter can't skip the checks
    expect(step()).toBe("2 · Review");
    expect(h.saves).toHaveLength(0);
  });
});

describe("classic review applies the same account rule (D1) and the same duplicate rules", () => {
  it("after a bill is read, classic Save waits for a confirmed account; 'Not paid from my accounts' is an explicit choice", async () => {
    h.read = { ...SAMPLE, card_last_four: null, text: "BLUE TOKAI TOTAL 460.00 Paid by company card", payment_method: "company_card" };
    h.pending = [photo()];
    render(<NewExpense />); // the classic page, not Smart Add
    await screen.findByRole("group", { name: "Review scanned details" }, { timeout: 8000 });
    fireEvent.click(screen.getByRole("button", { name: "Confirm details" }));
    const check = (await screen.findByText("Account needs confirmation")).closest("div")!;
    expect(check).toHaveTextContent("no personal account is assumed");
    expect(screen.getByLabelText("Account")).toHaveTextContent("Choose account");
    const save = screen.getByRole("button", { name: /Save expense/ });
    expect(save).toBeDisabled();
    expect(save).toHaveAccessibleDescription("Choose or confirm the account that paid before saving — the bill alone doesn't settle it.");
    fireEvent.submit(save.closest("form")!);
    expect(h.saves).toHaveLength(0);
    fireEvent.click(within(check).getByRole("button", { name: "Not paid from my accounts" }));
    expect(screen.getByLabelText("Account")).toHaveTextContent("Not paid from my accounts");
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(h.saves).toHaveLength(1));
    expect(h.saves[0]!.input).toMatchObject({ accountId: null, paymentMethod: "company_card" });
    expect(h.saves[0]!.input.receiptDetails?.accountCheck?.decision).toBe("not_own_account");
  });

  it("the classic Smart Add sheet (same review, no Confirm step) also waits for the owner to confirm the suggested account", async () => {
    const onExit = vi.fn();
    render(<NewExpense embedded={{ search: { mode: "scan" }, files: [photo()], onExit }} />);
    await screen.findByRole("group", { name: "Review scanned details" }, { timeout: 8000 });
    fireEvent.click(screen.getByRole("button", { name: "Looks right" }));
    await screen.findByText("Account needs confirmation");
    const save = screen.getByRole("button", { name: /Save expense/ });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm this account" }));
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(h.saves).toHaveLength(1));
    expect(h.saves[0]!.input).toMatchObject({ accountId: "amex" });
    expect(h.saves[0]!.opts.files?.map((f) => f.name)).toEqual(["blue-tokai.png"]);
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
  });

  it("resuming a saved draft keeps its id and receipt and saves once", async () => {
    h.stored = { id: "11111111-2222-4333-8444-555555555555", status: "info_required", receipts: [{ name: "blue-tokai.png", type: "image/png", path: "owner-1/drafts/x/blue-tokai.png" }], data: {
      txnType: "expense", amount: "460", currency: "INR", date: "2026-11-09", category: "Food and beverages", merchant: "Blue Tokai Coffee Roasters", title: "Blue Tokai Coffee", accountId: "amex",
      billEvidence: { evidence: "Card ending 1006 printed on the bill matches Amex Platinum Travel", reason: null, payer: "own", suggestedId: "amex", card: { network: null, lastFour: "1006" } },
    } };
    render(<NewExpense embedded={{ search: { draft: h.stored.id }, onExit: () => {} }} />);
    const check = (await screen.findByText("Account needs confirmation", undefined, { timeout: 8000 })).closest("div")!;
    expect(check).toHaveTextContent("Suggested from: Card ending 1006 printed on the bill matches Amex Platinum Travel.");
    await screen.findByText("Draft kept — you can close and come back");
    fireEvent.click(within(check).getByRole("button", { name: "Confirm this account" }));
    const form = screen.getByLabelText("Account").closest("form")!;
    await act(async () => { fireEvent.submit(form); });
    await waitFor(() => expect(h.saves).toHaveLength(1));
    expect(h.saves[0]!.opts.files?.map((f) => f.name)).toEqual(["blue-tokai.png"]);
    expect(h.saves[0]!.opts.createId).toBe(h.stored.id);
    expect(h.reads).toBe(0);
  });
});
