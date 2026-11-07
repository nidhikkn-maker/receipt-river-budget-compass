import { createContext, useContext, useState, type ReactNode } from "react";
import { defaultPreferences } from "../../src/lib/preferences";
import { validateExpense, type Expense, type ExpenseInput } from "../../src/lib/expenses";

const initial: Expense = {
  id: "other-expense", title: "Unrelated controlled expense", merchant: "Other shop", category: "Groceries",
  scope: "personal", memberId: null, splits: [], amount: 99, originalAmount: 99, currency: "INR", fxRate: 1,
  paymentMethod: "upi", date: "2026-04-01", description: "", receipts: [], reconciledAt: null, statementRef: null,
  accountId: "controlled-account", txnType: "expense",
};
type ReportRow = { kind: string; note: string; receiptName: string; receiptType: string; zoom: number; facts: Record<string, unknown> };
const fixture = ((window as unknown as { expenseBrowserFixture?: { transactions: Expense[]; saves: { id: string; names: string[] }[]; failNextSave: boolean; reports: ReportRow[] } }).expenseBrowserFixture ??= {
  transactions: JSON.parse(sessionStorage.getItem("expense-browser-fixture") ?? JSON.stringify([initial])) as Expense[],
  saves: [] as { id: string; names: string[] }[], failNextSave: false, reports: [] as ReportRow[],
});
Object.assign(window, { expenseBrowserFixture: fixture });
const Context = ((window as unknown as { isolatedExpenseContext?: ReturnType<typeof createContext<ReturnType<typeof makeStore> | null>> }).isolatedExpenseContext ??= createContext<ReturnType<typeof makeStore> | null>(null));
const history = async () => [];
const signedUrl = async (path: string) => `/controlled-receipt/${path.split("/").pop()}`;
function makeStore(transactions: Expense[], update: (next: Expense[]) => void) {
  return {
    userId: "controlled-owner", name: 'Alex', loading: false, syncState: 'current', pendingCount: 0, lastSyncedAt: null, refresh: async () => {}, transactions, expenses: transactions, members: [], loans: [], documents: [], commitments: [], goals: [], valuations: [], budgets: {},
    accounts: [{ id: "controlled-account", name: "Controlled bank", kind: "savings", openingBalance: 10000, archived: false }],
    preferences: defaultPreferences(), memberName: () => "Me", history, signedUrl,
    savePreferences: async () => {},
    save: async (input: ExpenseInput, options: { id?: string; createId?: string; files: File[] }) => {
      if (fixture.failNextSave) { fixture.failNextSave = false; throw new Error("Controlled save failure"); }
      validateExpense(input);
      const id = options.id ?? options.createId;
      if (!id) throw new Error("Stable expense id required");
      const old = fixture.transactions.find(e => e.id === id);
      const receipts = [...(old?.receipts ?? [])];
      for (const file of options.files) receipts.push({ name: file.name, type: file.type, path: `controlled-owner/${id}/${file.name}` });
      const entry: Expense = { ...input, id, originalAmount: input.amount, fxRate: 1, receipts, reconciledAt: null, statementRef: null };
      fixture.transactions = [...fixture.transactions.filter(e => e.id !== id), entry];
      fixture.saves.push({ id, names: options.files.map(f => f.name) });
      sessionStorage.setItem("expense-browser-fixture", JSON.stringify(fixture.transactions));
      update([...fixture.transactions]);
    },
  };
}
export function StoreFixture({ children }: { children: ReactNode }) {
  const [transactions, update] = useState(fixture.transactions);
  return <Context.Provider value={makeStore(transactions, update)}>{children}</Context.Provider>;
}
export function useStore() {
  const store = useContext(Context);
  if (!store) throw new Error("Missing isolated store");
  return store;
}
export const extractReceipt = async ({ data }: { data: { includeItems?: boolean } }) => ({ ok: true, result: { title: "Controlled receipt expense", merchant: "Controlled cafe", amount: 432.10, currency: "INR", date: "2026-04-02", category: "Food and beverages", subtotal: 360, tax: 32.10, tip: 40, confidence: { merchant: "high", date: "low", total: "medium" }, items: data.includeItems ? [{ name: "Dinner", quantity: 2, amount: 360, confidence: { name: "high", amount: "low" } }] : [], text: "Controlled receipt", scope: "business" } });
export const getFxRate = async () => ({ ok: true, rate: 1, date: "2026-04-02" });
export const parseSpokenEntry = async () => { throw new Error("Voice not part of this test"); };
export const hasDraftContent = () => false;
export const draftStatus = () => "draft";
export const getDraft = async () => null;
export const completeDraft = async () => {};
export const upsertDraft = async () => {};
export const uploadDraftReceipt = async () => "controlled-draft";
export const draftReceiptFile = async () => null;
export const localDrafts = async () => [];
export const putLocalDraft = async () => {};
export const removeLocalDraft = async () => {};
export const fileToLocal = async () => ({});
export const localToFile = () => { throw new Error("No stored draft files"); };
export const PageTitle = ({ title }: { title: string }) => <h1>{title}</h1>;
export const Stat = () => null;
export const TeamExpenses = () => null;
export const reportReceiptProblem = async ({ data }: { data: ReportRow }) => { fixture.reports.push(data); return { ok: true, id: "controlled-report", emailed: false }; };