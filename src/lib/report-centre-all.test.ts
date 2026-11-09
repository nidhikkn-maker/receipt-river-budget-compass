// Every Reports Centre type, built from one realistic ledger and cross-checked against the
// app's own calculation rules (ledger cashflow, workspace splits, travel, cards, loans, planning).
import { describe, expect, it } from "vitest";
import { REPORT_TYPES, buildReportDoc, emptyFilters, type ReportData, type ReportDoc, type ReportType } from "./report-centre";
import { renderReportPdf } from "./report-pdf";
import { cashflow, accountBalance, netWorth, type Account } from "./ledger";
import { workspaceTotals } from "./workspaces";
import { tripFinance, advanceReconciliation, bookingOutstanding, type TravelTrip } from "./travel";
import { monthlyCost, type Commitment } from "./planning";
import type { Expense } from "./expenses";
import { CORPORATE_TYPES, type CorporateType } from "./books/corporate-statements";
import { corporateFixture } from "./books/corporate-fixture";

const base = { title: "Entry", merchant: null, category: "Food", scope: "personal", memberId: null, splits: [], currency: "INR", fxRate: 1, paymentMethod: "upi", reconciledAt: null, statementRef: null, description: "", receipts: [], tags: [] } as const;
const e = (id: string, amount: number, x: Partial<Expense> = {}): Expense => ({ ...base, id, amount, originalAmount: amount, date: "2026-10-10", ...x } as Expense);
const acct = (id: string, kind: Account["kind"], openingBalance = 0, x: Partial<Account> = {}): Account => ({ id, name: id, kind, openingBalance, archived: false, ...x } as Account);
const TAG = "Trip: Goa";

const accounts = [acct("bank", "savings", 100000), acct("card", "credit_card", 0, { creditLimit: 50000 }), acct("loan", "loan", 200000), acct("mf", "investment", 0)];
const tx: Expense[] = [
  e("salary", 80000, { txnType: "income", accountId: "bank", category: "Salary", reconciledAt: "2026-10-02", statementRef: "S1" }),
  e("grocery", 3000, { accountId: "bank", category: "Groceries", reconciledAt: "2026-10-05", statementRef: "S2" }),
  e("dinner", 2000, { accountId: "card", category: "Food", merchant: "Cafe" }),
  e("refund", 500, { txnType: "refund", accountId: "card" }),
  e("billpay", 2000, { txnType: "card_payment", accountId: "bank", toAccountId: "card" }),
  e("transfer", 10000, { txnType: "transfer", accountId: "bank", toAccountId: "mf" }),
  e("emi", 8000, { txnType: "loan_repayment", accountId: "bank", toAccountId: "loan", principal: 6000, interest: 2000 }),
  e("split", 1000, { accountId: "bank", category: "Office", workspaceAllocations: [{ workspace: "personal", amount: 400 }, { workspace: "business", amount: 600 }] }),
  e("family", 1500, { scope: "family", accountId: "bank", category: "School" }),
  e("official", 4000, { scope: "official", accountId: "card", category: "Hotels", department: "Acme", tags: [TAG], reimbursementStatus: "pending", reimbursement: { payer: "Acme" } as never, date: "2026-10-12" }),
  e("usd", 8300, { scope: "business", accountId: "card", category: "Flights", currency: "USD", originalAmount: 100, fxRate: 83, tags: [TAG], date: "2026-10-11" }),
  e("advance", 10000, { txnType: "advance", accountId: "bank", tripId: "goa", date: "2026-10-09" }),
  e("old", 999, { date: "2026-09-15", accountId: "bank" }),
];
const trip: TravelTrip = { id: "goa", name: "Goa", destination: "Goa", start: "2026-10-10", end: "2026-10-14", budget: 20000, currencies: ["INR", "USD"], contingency: 1000,
  budgetLines: [{ category: "Hotels", amount: 5000 }, { category: "Flights", amount: 9000 }],
  bookings: [{ id: "b1", kind: "hotel", provider: "Taj", ref: "R1", date: "2026-10-10", amount: 6000, status: "unpaid" }] } as TravelTrip;
const commitments: Commitment[] = [
  { id: "c1", name: "Netflix", kind: "subscription", direction: "out", amount: 649, frequency: "monthly", intervalDays: null, nextDue: "2026-11-05", accountId: "card", category: "Subscriptions", confirmed: true, essential: false, status: "active" },
  { id: "c2", name: "Rent", kind: "rent", direction: "out", amount: 20000, frequency: "monthly", intervalDays: null, nextDue: "2026-11-01", accountId: "bank", category: "Rent", confirmed: true, essential: true, status: "active" },
];
const data: ReportData = {
  transactions: tx, accounts, valuations: [], commitments, budgets: { Food: 5000, Groceries: 4000 }, trips: [trip],
  loans: [{ id: "l1", name: "Home loan", principal: 194000, rate: 9, emi: 8000, nextDue: "2026-11-10", provider: "SBI", status: "active", payments: [{ date: "2026-10-10", principal: 6000, interest: 2000, total: 8000 }] }],
  drafts: [{ id: "d1", status: "ready", updatedAt: "2026-10-20", data: { amount: 750, merchant: "Pending cab" } }, { id: "d2", status: "saved", updatedAt: "2026-10-20", data: { amount: 1 } }],
  memberName: () => "Me", accountName: (id) => id ?? "No account", today: "2026-10-31",
};
const f = emptyFilters("2026-10-01", "2026-10-31");
const inOct = tx.filter((x) => x.date >= f.from && x.date <= f.to);
const N = (s: string | undefined) => Number((s ?? "NaN").replace(/^INR /, "").replace(/ .*$/, "").replace(/,/g, ""));
const sum = (d: ReportDoc, label: string) => N(d.summary.find((s) => s[0] === label)?.[1]);
const section = (d: ReportDoc, title: string) => d.sections.find((s) => s.title === title)!;
const rowVal = (d: ReportDoc, sec: string, key: string, col = 1) => N(section(d, sec).rows.find((r) => r[0] === key)?.[col]);
const build = (t: ReportType, x = f) => buildReportDoc(t, x, data);
const expected = cashflow(inOct);

// Company statements need a company's complete ledger, so they are exercised below with a
// company fixture; the personal ledger here must never be accepted as a company ledger.
const PERSONAL_TYPES = REPORT_TYPES.map((r) => r[0]).filter((t) => !CORPORATE_TYPES.includes(t as CorporateType));

describe("every report type", () => {
  it("covers every Reports Centre type across the personal and company groups", () => {
    expect(PERSONAL_TYPES.length + CORPORATE_TYPES.length).toBe(REPORT_TYPES.length);
    for (const t of CORPORATE_TYPES) expect(REPORT_TYPES.map((r) => r[0])).toContain(t);
  });
  it.each(PERSONAL_TYPES)("%s builds a complete document and PDF", async (t) => {
    const d = build(t);
    expect(d.title).not.toBe("");
    expect(d.sections.length).toBeGreaterThan(0);
    expect(d.filterLines[0]).toMatch(/^Workspace:/);
    for (const s of d.sections) for (const r of s.rows) expect(r.length).toBe(s.headers.length);
    const blob = await renderReportPdf(d, "colour", new Date("2026-10-31T10:00:00Z"));
    expect(blob.size).toBeGreaterThan(1000);
  });
  it.each(CORPORATE_TYPES)("%s refuses to build without a company ledger", (t) => {
    expect(() => build(t)).toThrow("Choose a company with available book records");
    expect(() => buildReportDoc(t, { ...f, entityId: "A" }, data)).toThrow("Choose a company with available book records");
  });
  it.each(CORPORATE_TYPES)("%s builds a complete company document and PDF from the company ledger", async (t) => {
    const p = corporateFixture();
    const company: ReportData = { ...data, transactions: p.entries, accounts: p.accounts, entities: p.entities, books: p.books, documents: p.documents } as ReportData;
    const d = buildReportDoc(t, { ...emptyFilters(p.from, p.to), entityId: "A" }, company);
    expect(d.title).not.toBe("");
    expect(d.sections.length).toBeGreaterThan(0);
    expect(d.filterLines[0]).toBe("Company: Synthetic Alpha Ltd");
    for (const s of d.sections) for (const r of s.rows) expect(r.length).toBe(s.headers.length);
    expect(JSON.stringify(d)).not.toMatch(/beta-secret|Excluded Beta|7777|999999/);
    const blob = await renderReportPdf(d, "colour", new Date("2026-10-31T10:00:00Z"));
    expect(blob.size).toBeGreaterThan(1000);
  });
});

describe("report totals match the app's calculations", () => {
  it("monthly summary matches ledger cashflow (moves excluded, refunds net)", () => {
    const d = build("monthly");
    expect(sum(d, "Total income")).toBe(expected.income);
    expect(sum(d, "Total expenses")).toBe(expected.spent);
    expect(sum(d, "Net cash flow")).toBe(expected.net);
    expect(expected.spent).toBe(3000 + 2000 - 500 + 1000 + 1500 + 4000 + 8300 + 2000); // repayment interest, never principal
  });
  it("detailed transactions total equals every in-period entry", () => {
    const s = section(build("monthly"), "Detailed transactions");
    expect(s.rows.length).toBe(inOct.length);
    expect(N(s.total![8])).toBe(inOct.reduce((a, x) => a + x.amount, 0));
  });
  it("workspace allocation equals workspaceTotals and the consolidated total counts each entry once", () => {
    const spend = inOct.filter((x) => (x.txnType ?? "expense") === "expense");
    const w = workspaceTotals(spend), d = build("consolidated");
    for (const [k, label] of [["personal", "Personal"], ["family", "Family"], ["business", "Business"], ["official", "Official"]] as const) expect(rowVal(d, "Workspace allocation", label)).toBe(w[k]);
    expect(N(section(d, "Workspace allocation").total![1])).toBe(w.total);
  });
  it.each([["ws-personal", 3000 + 2000 - 500 + 400 + 2000], ["ws-family", 1500], ["ws-business", 600 + 8300], ["ws-official", 4000]] as const)("%s totals only its share", (t, v) => {
    expect(sum(build(t), "Total expenses")).toBe(v);
  });
  it("workspace reports add back up to the consolidated total", () => {
    const parts = (["ws-personal", "ws-family", "ws-business", "ws-official"] as const).reduce((a, t) => a + sum(build(t), "Total expenses"), 0);
    expect(parts).toBe(sum(build("consolidated"), "Total expenses"));
  });
  it("income report", () => { const d = build("income"); expect(sum(d, "Total income")).toBe(80000); expect(sum(d, "Entries")).toBe(1); });
  it("expense report gross and net", () => {
    const d = build("expense");
    expect(sum(d, "Total expenses (gross)")).toBe(19800);
    expect(sum(d, "Net of refunds and reimbursements")).toBe(expected.spent);
  });
  it("category report sums to gross spending and splits by category", () => {
    const d = build("category"), s = section(d, "Category-wise expenditure");
    expect(N(s.total![1])).toBe(19800);
    expect(rowVal(d, "Category-wise expenditure", "Flights")).toBe(8300);
  });
  it("account report balances equal ledger balances", () => {
    const d = build("account");
    for (const a of accounts) expect(rowVal(d, "Account balances", a.name, 2)).toBe(accountBalance(a, tx));
  });
  it("credit card purchases are not duplicated by bill payments", () => {
    const d = build("card"), row = section(d, "Card summary").rows[0]!;
    expect(N(row[1])).toBe(2000 + 4000 + 8300);
    expect(N(row[2])).toBe(500);
    expect(N(row[3])).toBe(2000);
    expect(N(row[4])).toBe(accountBalance(accounts[1]!, tx));
    expect(sum(build("monthly"), "Total expenses")).toBe(expected.spent); // bill payment adds nothing
  });
  it("budget report compares against saved budgets", () => {
    const d = build("budget"), t = section(d, "Budget versus actual (1 month)");
    expect(N(t.rows.find((r) => r[0] === "Food")![2])).toBe(2000);
    expect(N(t.rows.find((r) => r[0] === "Groceries")![3])).toBe(1000);
  });
  it("subscription monthly cost uses planning rules", () => expect(sum(build("subscription"), "Monthly cost")).toBe(monthlyCost(commitments[0]!)));
  it("loan report uses saved loans and in-period repayments", () => {
    const d = build("loan");
    expect(sum(d, "Outstanding principal")).toBe(194000);
    expect(section(d, "Repayments in period").rows[0]!.slice(2).map(N)).toEqual([6000, 2000, 8000]);
  });
  it("forecast projects cash from scheduled items and labels it an estimate", () => {
    const d = build("forecast");
    expect(sum(d, "Projected cash in 90 days (estimate)")).toBe(sum(d, "Cash available today") + sum(d, "Scheduled inflows (90 days)") - sum(d, "Scheduled outflows (90 days)"));
    expect(d.notes[0]).toMatch(/estimate/);
  });
  it("wealth matches netWorth", () => {
    const d = build("wealth"), nw = netWorth(accounts, tx, []);
    expect(sum(d, "Assets")).toBe(nw.assets); expect(sum(d, "Liabilities")).toBe(nw.liabilities); expect(sum(d, "Net worth")).toBe(nw.net);
  });
  it("organisation report groups by department", () => expect(rowVal(build("organisation"), "Spending by organisation", "Acme", 2)).toBe(4000));
  it("trip summary matches tripFinance and keeps unpaid bookings as commitments", () => {
    const d = build("trip-summary"), tf = tripFinance(trip, tx), rec = advanceReconciliation(trip, tx);
    expect(rowVal(d, "Goa", "Spent (confirmed)")).toBe(tf.total);
    expect(tf.total).toBe(12300);
    expect(rowVal(d, "Goa", "Unpaid bookings (commitments)")).toBe(6000);
    expect(rowVal(d, "Goa", "Advance outstanding")).toBe(rec.outstanding);
  });
  it("trip expenses list every trip entry", () => expect(N(section(build("trip-expenses"), "Goa").total![8])).toBe(12300));
  it("trip budget versus actual", () => {
    const s = section(build("trip-budget"), "Goa");
    expect(N(s.rows.find((r) => r[0] === "Hotels")![2])).toBe(4000);
    expect(N(s.total![1])).toBe(21000); expect(N(s.total![2])).toBe(12300);
  });
  it("traveller-wise shares add up to trip spending", () => expect(section(build("trip-travellers"), "Goa").rows.reduce((a, r) => a + N(r[1]), 0)).toBe(12300));
  it("booking commitments use bookingOutstanding", () => expect(N(section(build("trip-bookings"), "Goa").rows[0]![6])).toBe(bookingOutstanding(trip.bookings![0]!, tx)));
  it("travel advances reconcile", () => expect(N(section(build("trip-advances"), "Goa").total![3])).toBe(advanceReconciliation(trip, tx).outstanding));
  it("travel reimbursements show pending claims", () => expect(N(section(build("trip-reimbursements"), "Goa").rows[0]![4])).toBe(4000));
  it("settlement and closure report open items", () => {
    expect(section(build("trip-settlement"), "Goa").rows.at(-1)![1]).toMatch(/^Open:/);
    expect(build("trip-closure").sections.some((s) => s.title.includes("all trip entries"))).toBe(true);
  });
  it("pending reimbursements", () => expect(sum(build("pending-reimbursements"), "Amount pending")).toBe(4000));
  it("unreconciled excludes statement-matched entries", () => expect(sum(build("unreconciled"), "Unmatched entries")).toBe(inOct.filter((x) => !x.reconciledAt).length));
  it("pending commitments include scheduled bills and unpaid bookings", () => {
    const rows = section(build("commitments"), "Pending commitments").rows;
    expect(rows.some((r) => r[2] === "Unpaid booking" && N(r[3]) === 6000)).toBe(true);
    expect(rows.some((r) => r[1] === "Rent")).toBe(true);
  });
  it("draft summary lists unsaved drafts only and never touches totals", () => {
    const d = build("drafts");
    expect(sum(d, "Drafts waiting")).toBe(1);
    expect(sum(build("monthly"), "Total expenses")).toBe(expected.spent);
  });
  it("statement import summary counts matched entries", () => {
    const d = build("imports");
    expect(sum(d, "Statement-matched entries")).toBe(2);
    expect(sum(d, "Entries without a statement match")).toBe(inOct.length - 2);
  });
  it("filters narrow totals (account, currency, status)", () => {
    expect(sum(build("expense", { ...f, accountIds: ["card"] }), "Total expenses (gross)")).toBe(14300);
    expect(sum(build("expense", { ...f, currency: "USD" }), "Total expenses (gross)")).toBe(8300);
    expect(sum(build("expense", { ...f, status: "reconciled" }), "Total expenses (gross)")).toBe(3000);
  });
  it("discloses unverified and foreign-currency entries", () => {
    const notes = build("monthly").notes.join(" ");
    expect(notes).toMatch(/not yet matched/);
    expect(notes).toMatch(/foreign-currency/);
  });
});
