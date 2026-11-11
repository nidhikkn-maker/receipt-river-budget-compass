// Lead review of ed20f1a1: the entry screen's Confirm details and Save paths refuse a sub-paise source amount
// (₹1234.567) instead of passing it on to be rounded by storage, while ₹1234.56 still saves. Same real NewExpense
// harness as smart-add-flow.test.tsx; only the edges (store, reader, drafts, router, toasts) are replaced.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPreferences } from "@/lib/preferences";
import type { Expense, ExpenseInput } from "@/lib/expenses";
import type { Account } from "@/lib/ledger";

const t = vi.hoisted(() => ({ errors: [] as string[] }));
vi.mock("sonner", () => {
  const toast = Object.assign(() => "", { error: (m: string) => { t.errors.push(String(m)); return ""; }, success: () => "", message: () => "", info: () => "", warning: () => "", dismiss: () => {}, loading: () => "", promise: () => "" });
  return { toast, Toaster: () => null };
});

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

import { NewExpense } from "@/routes/_authenticated/new";

const SAMPLE = {
  title: "Bill", merchant: "Corner Store", date: "2026-11-09", amount: 1234.567, subtotal: null, tax: null, tip: null, round_off: null, charges: [], tax_parts: [],
  confidence: { merchant: "high", date: "high", total: "high" }, items: [], text: "CORNER STORE TOTAL 1234.567", currency: "INR", payment_method: "cash",
  card_network: null, card_last_four: null, description: null, category: "Food and beverages", scope: "personal",
};
const photo = () => new File([new Uint8Array([137, 80, 78, 71, 9, 9, 9])], "bill.png", { type: "image/png" });
const precisionToast = () => t.errors.filter((m) => /1234\.567 has more decimals than can be recorded/.test(m));

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  globalThis.DataTransfer ??= class { list: File[] = []; items = { add: (f: File) => { this.list.push(f); } }; get files() { return this.list; } } as unknown as typeof DataTransfer;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
beforeEach(() => {
  Object.assign(h, { saves: [], drafts: [], stored: null, transactions: [], reads: 0, read: { ...SAMPLE }, failNextSave: false, pending: null });
  t.errors = [];
});
afterEach(cleanup);

const draft = (amount: string) => ({ id: "33333333-2222-4333-8444-555555555555", status: "info_required", receipts: [], data: {
  txnType: "expense", amount, currency: "INR", date: "2026-11-09", category: "Food and beverages", merchant: "Corner Store", title: "Corner Store", accountId: "cash",
} });

describe("entry screen precision boundary", () => {
  it("Confirm details refuses a read ₹1234.567 (even after the review dialog) and shows the read digits", async () => {
    h.pending = [photo()];
    render(<NewExpense />);
    await screen.findByRole("group", { name: "Review scanned details" }, { timeout: 8000 });
    expect(screen.getAllByText(/Total reads INR 1234\.567/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm details" }));
    const ok = screen.queryByRole("button", { name: /I've checked these items/ });
    if (ok) fireEvent.click(ok);
    await waitFor(() => expect(precisionToast().length).toBeGreaterThan(0));
    expect(screen.queryByRole("group", { name: "Review scanned details" })).not.toBeNull();
    expect(h.saves).toHaveLength(0);
  });
  it("Save refuses a ₹1234.567 amount and saves nothing", async () => {
    h.stored = draft("1234.567");
    render(<NewExpense embedded={{ search: { draft: h.stored.id }, onExit: () => {} }} />);
    const form = (await screen.findByLabelText("Account", undefined, { timeout: 8000 })).closest("form")!;
    await act(async () => { fireEvent.submit(form); });
    await waitFor(() => expect(precisionToast().length).toBeGreaterThan(0));
    expect(h.saves).toHaveLength(0);
  });
  it("Save accepts ₹1234.56", async () => {
    h.stored = draft("1234.56");
    render(<NewExpense embedded={{ search: { draft: h.stored.id }, onExit: () => {} }} />);
    const form = (await screen.findByLabelText("Account", undefined, { timeout: 8000 })).closest("form")!;
    await act(async () => { fireEvent.submit(form); });
    await waitFor(() => expect(h.saves).toHaveLength(1));
    expect(h.saves[0]!.input).toMatchObject({ amount: 1234.56, currency: "INR" });
    expect(precisionToast()).toEqual([]);
  });
});
