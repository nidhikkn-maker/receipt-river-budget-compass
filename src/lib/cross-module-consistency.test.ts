// @vitest-environment node
// Coordinator's cross-module consistency check (Track D, 10 Nov 2026).
// ONE set of raw database rows is read by every reader the owner sees: the ledger engine, Home/assistant facts
// (readAssistantFacts), the report builder (loadOwnerReportData + buildReportDoc) and the bank account detail page.
// Every expected figure below is calculated BY HAND from the rows (working shown beside it), not taken from ledger.ts,
// so a shared engine bug cannot make the readers agree on a wrong number. Fixture rows only; no hosted service.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { readAssistantFacts } from "./assistant-facts.server";
import { loadOwnerReportData } from "./report-jobs.server";
import { buildReportDoc, emptyFilters, type ReportData, type ReportType } from "./report-centre";
import { accountBalance, cashflow, ledgerView, netWorth, reconciledBalance, txnFromRow, type Account } from "./ledger";
import { bankAccountDetail } from "./bank-account-detail";
import { normalizePreferences } from "./preferences";
import type { Expense } from "./expenses";

const O = "00000000-0000-4000-8000-0000000000a1";
const TODAY = "2026-11-10";
const acc = (id: string, name: string, kind: string, opening: number, extra: Record<string, unknown> = {}) => ({
  id, owner_id: O, name, kind, opening_balance: opening, archived: false, credit_limit: null, due_day: null, statement_day: null, min_balance: 0,
  include_in_cash: true, issuer: "", last_four: null, interest_rate: null, details: {}, ...extra,
});
const ACCOUNTS = [
  acc("sb", "HDFC Savings", "savings", 100000, { last_four: "4411", issuer: "HDFC Bank" }),
  acc("cc", "Amex Platinum", "credit_card", 0, { credit_limit: 300000, last_four: "1006" }),
  acc("ln", "Home loan", "loan", 500000),
  acc("inv", "Index fund", "investment", 0),
  // Archived but never disposed of (no sale, no closing entry): KK rule — stays in net worth until a real disposal.
  acc("fd", "SBI fixed deposit", "fixed_deposit", 200000, { archived: true }),
];
const tx = (id: string, date: string, type: string, amount: number, extra: Record<string, unknown> = {}) => ({
  id, employee_id: O, title: id, merchant: "M-" + id, category: "Other", scope: "personal", member_id: null, splits: [], amount, original_amount: amount,
  currency: "INR", fx_rate: 1, payment_method: "upi", expense_date: date, description: "", receipts: [], txn_type: type, account_id: "sb", to_account_id: null,
  reconciled_at: null, statement_ref: null, adjustment_sign: 1, tags: [], reimbursement_status: "none", reimbursement: {}, allocations: [], principal: null,
  interest: null, transfer_counterpart_of: null, workspace_allocations: [], receipt_details: {}, trip_id: null, department: null, category_revision: 0,
  payment_instrument_id: null, ...extra,
});
const EXPENSES = [
  tx("salary", "2026-11-01", "income", 50000, { category: "Salary", reconciled_at: "2026-11-09T10:00:00Z" }),
  // Claim: ₹20,000 paid for the employer; ₹12,000 received back so far (a reimbursement entry, never income).
  tx("claim", "2026-11-01", "expense", 20000, { category: "Travel", reimbursement_status: "pending",
    reimbursement: { stage: "partial", reimbursable: 20000, kind: "employer", payer: "Employer", receipts: [{ id: "r1", date: "2026-11-08", amount: 12000, txnId: "claimback" }] } }),
  tx("claimback", "2026-11-08", "reimbursement", 12000, { category: "Travel" }),
  tx("food", "2026-11-02", "expense", 1500, { category: "Food" }),
  tx("invest", "2026-11-02", "investment", 10000, { to_account_id: "inv", category: "Investment" }),
  tx("cardbuy", "2026-11-03", "expense", 4000, { category: "Travel", account_id: "cc", payment_method: "card" }),
  tx("shop", "2026-11-04", "expense", 3000, { category: "Shopping" }),
  tx("cardpay", "2026-11-05", "card_payment", 4000, { to_account_id: "cc", category: "Card payment" }),
  // EMI ₹25,000 = principal ₹18,000 + interest ₹7,000.
  tx("emi", "2026-11-05", "loan_repayment", 25000, { to_account_id: "ln", principal: 18000, interest: 7000, category: "Financial charges" }),
  // Decision 1: the ₹3,000 shop entry is reversed by a SEPARATE linked row; the original row stays unchanged.
  tx("shop-rev", "2026-11-06", "expense", 3000, { category: "Shopping", reverses_entry_id: "shop", receipt_details: { reversal: { of: "shop" } } }),
];
const LOANS = [{ id: "loan1", owner_id: O, name: "Home loan", account_id: "ln", loan_type: "home", principal_outstanding: 500000, original_principal: 500000, annual_rate: 9, emi: 25000, next_due: "2026-12-05", provider: "SBI", status: "active", payments: [], source_transaction_id: null, start_date: "2024-01-05" }];
const VALUATIONS = [{ id: "v1", owner_id: O, account_id: "inv", value: 10500, valued_on: "2026-11-09", source: "statement", note: null }];
const TABLES: Record<string, Record<string, unknown>[]> = {
  expenses: EXPENSES, accounts: ACCOUNTS, loans: LOANS, asset_valuations: VALUATIONS, commitments: [], goals: [], category_budgets: [],
  family_members: [], expense_drafts: [], finance_preferences: [{ owner_id: O, data: {} }],
};

// ---------- Hand-calculated expected figures ----------
// HDFC Savings: 1,00,000 opening + 50,000 salary − 20,000 claim + 12,000 claim back − 1,500 food − 10,000 investment
//   − 3,000 shop + 3,000 shop reversal − 4,000 card bill − 25,000 EMI = 1,01,500
const SB = 101500;
// Card: 4,000 purchase − 4,000 bill payment = 0 owed.
const CC = 0;
// Loan: 5,00,000 − 18,000 principal (interest is a cost, not a repayment of principal) = 4,82,000 owed.
const LN = 482000;
// Index fund: valued 10,500 on 9 Nov, after the 2 Nov purchase → 10,500.
const INV = 10500;
// Fixed deposit (archived, not disposed): 2,00,000.
const FD = 200000;
const ASSETS = SB + INV + FD; // 3,12,000
const LIABILITIES = CC + LN; // 4,82,000
const NET = ASSETS - LIABILITIES; // −1,70,000
// November cash basis: income 50,000 (salary only; the 12,000 claim back is not income).
const INCOME = 50000;
// Spending: 20,000 + 1,500 + 4,000 + 3,000 − 3,000 (reversal) + 7,000 loan interest − 12,000 reimbursement = 20,500.
// Not counted: card bill 4,000 (pays the card, the purchase already counted), investment 10,000, loan principal 18,000.
const SPENT = 20500;
const GROSS_EXPENSES = 25500; // 20,000 + 1,500 + 4,000 + 3,000 − 3,000; the claim stays gross (decision 4)
const OUTSTANDING_CLAIM = 8000; // 20,000 − 12,000
const RECONCILED_SB = 150000; // 1,00,000 opening + 50,000 reconciled salary

function fakeDb() {
  const from = (table: string) => {
    let rows = [...(TABLES[table] ?? [])];
    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => { rows = rows.filter((r) => r[col] === v); return q; },
      order: () => q,
      range: (a: number, b: number) => { rows = rows.slice(a, b + 1); return q; },
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (ok: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok),
    };
    return q;
  };
  return { from } as unknown as SupabaseClient<Database>;
}
const money = (s: string | undefined) => Number((s ?? "").replace(/^INR\s*/, "").replace(/,/g, ""));
const summary = (type: ReportType) => {
  const doc = buildReportDoc(type, emptyFilters("2026-11-01", "2026-11-30"), report as unknown as ReportData); // same hand-off as completeReportJob
  return { doc, get: (label: string) => doc.summary.find(([k]) => k === label)?.[1] };
};
let report: Awaited<ReturnType<typeof loadOwnerReportData>>;
let facts: Awaited<ReturnType<typeof readAssistantFacts>>;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T06:00:00Z`));
  report = await loadOwnerReportData(fakeDb() as never, O, TODAY);
  facts = await readAssistantFacts(fakeDb(), O, normalizePreferences({}));
});
afterAll(() => { vi.useRealTimers(); });

describe("cross-module consistency against hand-calculated figures", () => {
  const accounts: Account[] = ACCOUNTS.map((a) => ({ id: a.id, name: a.name, kind: a.kind as Account["kind"], openingBalance: a.opening_balance, archived: a.archived }));
  const ledger = () => ledgerView(EXPENSES.map((r) => txnFromRow({ ...r, reversal: (r.receipt_details as { reversal?: unknown }).reversal } as never)));

  it("ledger engine: balances, cash flow and net worth match the hand figures", () => {
    const t = ledger();
    const bal = Object.fromEntries(accounts.map((a) => [a.id, accountBalance(a, t)]));
    expect(bal).toMatchObject({ sb: SB, cc: CC, ln: LN, fd: FD });
    expect(cashflow(t, "2026-11-01", "2026-11-30")).toEqual({ income: INCOME, spent: SPENT, net: INCOME - SPENT });
    expect(netWorth(accounts, t, VALUATIONS.map((v) => ({ accountId: v.account_id, value: v.value, valuedOn: v.valued_on, source: v.source })))).toEqual({ assets: ASSETS, liabilities: LIABILITIES, net: NET });
  });

  it("reversal: the original row is kept unchanged, history is visible, and the net effect is zero in every reader", () => {
    expect(EXPENSES.find((e) => e.id === "shop")).toMatchObject({ amount: 3000, txn_type: "expense", expense_date: "2026-11-04" });
    const shop = report.transactions.find((e) => e.id === "shop")!;
    const rev = report.transactions.find((e) => e.id === "shop-rev")!;
    expect(shop.amount).toBe(3000);
    expect((shop as { reversedBy?: string | null }).reversedBy).toBe("shop-rev");
    expect(rev.amount).toBe(-3000);
    expect(facts.actual.thisMonth.byCategory["Shopping"] ?? 0).toBe(0);
    const exp = summary("expense");
    expect(exp.doc.sections[0]!.rows.find((r) => r[0] === "Shopping")?.[1] ?? "0.00").toMatch(/^0(\.00)?$/);
  });

  it("loans: principal reduces the loan, interest is the only cost, in ledger, Home/assistant and the loan report", () => {
    expect(facts.estimated.loans.find((l) => l.name === "Home loan")?.outstanding).toBe(LN);
    expect(facts.actual.loanPrincipalOutstanding).toBe(LN);
    expect(money(summary("loan").get("Outstanding principal"))).toBe(LN);
  });

  it("card payment: the bill payment creates no expense anywhere; only the purchase counts", () => {
    expect(facts.actual.thisMonth.spent).toBe(SPENT);
    expect(facts.actual.thisMonth.byCategory["Card payment"]).toBeUndefined();
    const card = summary("card");
    expect(money(card.get("Outstanding today"))).toBe(CC);
    expect(card.doc.sections[0]!.rows[0]).toEqual(["Amex Platinum", "4,000.00", "0.00", "4,000.00", "0.00", "3,00,000.00"]);
    expect(money(summary("expense").get("Total expenses (gross)"))).toBe(GROSS_EXPENSES);
  });

  it("part-paid reimbursement: ₹20,000 claimed, ₹12,000 received, ₹8,000 outstanding; never income", () => {
    expect(facts.actual.pendingReimbursements).toEqual({ pendingCount: 1, pendingAmount: OUTSTANDING_CLAIM });
    const pr = summary("pending-reimbursements");
    expect(money(pr.get("Amount pending"))).toBe(OUTSTANDING_CLAIM);
    expect(pr.doc.sections[0]!.rows[0]!.slice(3, 6)).toEqual(["20,000.00", "12,000.00", "8,000.00"]);
    expect(facts.actual.thisMonth.income).toBe(INCOME);
    expect(money(summary("income").get("Total income"))).toBe(INCOME);
  });

  it("archived asset: stays in net worth until a real disposal, identically on Home/assistant and in the Wealth report", () => {
    expect(facts.actual.netWorth).toEqual({ assets: ASSETS, liabilities: LIABILITIES, net: NET });
    const w = summary("wealth");
    expect([money(w.get("Assets")), money(w.get("Liabilities")), money(w.get("Net worth"))]).toEqual([ASSETS, LIABILITIES, NET]);
  });

  it("bank account detail and reconciliation agree with the ledger figure", () => {
    const sb = report.accounts.find((a) => a.id === "sb")! as Account;
    const d = bankAccountDetail(sb, { transactions: report.transactions as unknown as Expense[], preferences: normalizePreferences({}), documents: [], entities: [], entityAccounts: {}, today: TODAY });
    expect(d.balance).toBe(SB);
    expect(d.reconciledBalance).toBe(RECONCILED_SB);
    expect(reconciledBalance(sb, report.transactions as never)).toBe(RECONCILED_SB);
    expect(facts.actual.accounts.find((a) => a.id === "sb")?.balance).toBe(SB);
    expect(money(summary("monthly").get("Net cash flow"))).toBe(INCOME - SPENT);
  });

  it("cash and accrual figures are labelled with their basis and period, never mixed", () => {
    for (const t of ["monthly", "income", "expense", "wealth", "pending-reimbursements", "loan", "card"] as const) {
      const lines = summary(t).doc.filterLines.join(" | ");
      expect(lines, t).toMatch(/Basis: Cash/);
      expect(lines, t).not.toMatch(/Accrual/);
      expect(summary(t).doc.period).toBe("2026-11-01 to 2026-11-30");
    }
  });
});
