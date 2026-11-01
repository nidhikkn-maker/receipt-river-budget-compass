// Part G of the Version 4.0 requirements: the 17 checks that must hold before the
// unified expense + travel build can be called complete. One test per criterion.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { accountBalance, adjustmentToMatch, cashflow, frequentMerchants, netWorth, suggestForMerchant, validateTransfer, type Account, type Txn } from "./ledger";
import { tripSummary } from "./intelligence";
import { buildShares, suggestWorkspace, validateShares, workspaceParts, workspaceTotals } from "./workspaces";
import { advanceReconciliation, bookingOutstanding, bookingPaid, closeBlockers, tripBudgetDetail, tripCandidates, tripFinance, type Booking, type TravelTrip } from "./travel";
import { travelEntries, travelReport } from "./travel-reports";

const trip = (over: Partial<TravelTrip> = {}): TravelTrip => ({ id: "t1", name: "Goa", destination: "Goa", start: "2026-12-01", end: "2026-12-05", budget: 50000, currencies: ["INR"], ...over });
const opts = { memberName: (id: string | null) => (id === "m1" ? "Asha" : "Me"), accountName: (id: string | null) => (id === "acc1" ? "Amex" : "Unassigned") };
const row = (over: Record<string, unknown> = {}) => ({ id: "e1", date: "2026-12-02", amount: 60000, originalAmount: 60000, currency: "INR", fxRate: 1, category: "Hotels", merchant: "Taj", title: "Hotel stay", tags: ["Trip: Goa"], scope: "business", accountId: "acc1", ...over });
const rows = (...r: unknown[]) => r as never;
const last = (r: ReturnType<typeof travelReport>) => r.rows[r.rows.length - 1]!;

const savings: Account = { id: "sv", name: "Savings", kind: "savings", openingBalance: 100000, archived: false };
const card: Account = { id: "cd", name: "Card", kind: "credit_card", openingBalance: 0, archived: false };
const cash: Account = { id: "cs", name: "Cash", kind: "cash", openingBalance: 0, archived: false };
const bill: Txn = { id: "x1", txnType: "expense", amount: 20000, accountId: "cd", date: "2026-12-01" };
const pay: Txn = { id: "x2", txnType: "card_payment", amount: 20000, accountId: "sv", toAccountId: "cd", date: "2026-12-05" };

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]));

describe("V4 acceptance (Part G)", () => {
  it("1. keeps one universal expense-entry component", () => {
    const forms = [...walk("src/routes"), ...walk("src/components")].filter((f) => f.endsWith(".tsx") && readFileSync(f, "utf8").includes('htmlFor="a"'));
    expect(forms).toEqual(["src/routes/_authenticated/new.tsx"]);
    // Travel opens that same form with trip context instead of building its own;
    // the dashboard's entry point is the shell's floating + button (V4.3).
    for (const f of ["src/routes/_authenticated/trips.tsx", "src/components/AppShell.tsx", "src/components/trip/TripSections.tsx"]) expect(readFileSync(f, "utf8")).toContain('to="/new');
    expect(readFileSync("src/routes/_authenticated/new.tsx", "utf8")).toContain("search.booking");
  });

  it("2. leaves existing transactions untouched unless explicitly edited", () => {
    const ledger = [row(), { ...row(), id: "e2", tags: [], date: "2026-11-02", amount: 1500, originalAmount: 1500, category: "Groceries", merchant: "Local" }];
    const before = JSON.stringify(ledger);
    tripFinance(trip(), ledger as never);
    travelReport("category", [trip()], ledger as never, opts);
    tripBudgetDetail(trip({ budgetLines: [{ category: "Hotels", amount: 1 }] }), ledger as never);
    tripCandidates(trip(), ledger as never);
    advanceReconciliation(trip({ advances: [{ id: "a", date: "2026-12-01", amount: 5000, source: "Employer" }] }), ledger as never);
    expect(JSON.stringify(ledger)).toBe(before);
    expect(ledger).toHaveLength(2);
  });

  it("3. shows trip-entered expenses in the unified ledger immediately", () => {
    const r1 = row();
    const s = tripSummary(trip(), [r1] as never);
    expect(s.entries[0]).toBe(r1); // the same ledger record, not a travel-only copy
    expect(s.total).toBe(60000);
    expect(travelEntries([trip()], [r1] as never)).toHaveLength(1);
  });

  it("4. lets dashboard entries be associated with a trip", () => {
    const plain = row({ id: "e9", tags: [], date: "2026-12-03", amount: 2500, originalAmount: 2500, merchant: "Ola" });
    expect(tripCandidates(trip(), [plain] as never).map((c) => c.id)).toContain("e9");
    expect(plain.tags).toEqual([]); // a suggestion never rewrites the entry
    const tagged = { ...plain, tags: ["Trip: Goa"] };
    expect(tripSummary(trip(), [tagged] as never).total).toBe(2500);
    expect(tripCandidates(trip(), [tagged] as never)).toHaveLength(0);
  });

  it("5. keeps workspace suggestions editable", () => {
    const s = suggestWorkspace({ tripType: "business", merchant: "IndiGo" }, []);
    expect(s).toMatchObject({ workspace: "business", confidence: "high", reason: "Linked to a business trip" });
    expect(Object.keys(s).sort()).toEqual(["confidence", "reason", "workspace"]);
    const kept = row({ scope: "personal", workspaceAllocations: [] });
    expect(workspaceParts(kept as never)).toEqual([{ workspace: "personal", amount: 60000 }]);
  });

  it("6. never duplicates an expense across workspaces", () => {
    const shares = [{ workspace: "business" as const, amount: 36000 }, { workspace: "family" as const, amount: 24000 }];
    expect(validateShares(shares, 60000)).toBe(null);
    expect(validateShares([{ workspace: "business", amount: 36000 }, { workspace: "family", amount: 14000 }], 60000)).toContain("Shares add up to 50000");
    const split = row({ workspaceAllocations: shares });
    expect(workspaceTotals([split] as never)).toMatchObject({ total: 60000, business: 36000, family: 24000 });
    expect(travelEntries([trip()], [split] as never)).toHaveLength(1);
    expect(buildShares(100, "equal", [{ workspace: "personal", value: 0 }, { workspace: "family", value: 0 }])).toEqual([{ workspace: "personal", amount: 50 }, { workspace: "family", amount: 50 }]);
  });

  it("7. records a credit card liability once", () => {
    expect(accountBalance(card, [bill])).toBe(20000);
    expect(accountBalance(card, [bill, pay])).toBe(0);
    expect(accountBalance(savings, [bill, pay])).toBe(80000);
    expect(cashflow([bill, pay]).spent).toBe(20000); // the bill counts once; paying it is not spending again
  });

  it("8. keeps unpaid bookings off the account balances", () => {
    const t = trip({ bookings: [{ id: "b", kind: "hotel", provider: "Taj", ref: "", date: "2026-12-03", amount: 10000, status: "unpaid" }] });
    expect(accountBalance(savings, [])).toBe(100000);
    expect(cashflow([]).spent).toBe(0);
    expect(tripFinance(t, rows())).toMatchObject({ total: 0, committed: 10000, projected: 10000 });
  });

  it("9. reconciles booking payments with the linked transactions", () => {
    const b: Booking = { id: "b", kind: "hotel", provider: "Taj", ref: "", date: "2026-12-03", amount: 30000, status: "unpaid", expenseIds: ["p1", "p2"] };
    const p1 = row({ id: "p1", amount: 12000, originalAmount: 12000, title: "Deposit" });
    const p2 = row({ id: "p2", amount: 18000, originalAmount: 18000, title: "Balance" });
    expect(bookingPaid(b, rows(p1, p2))).toBe(30000);
    expect(bookingOutstanding(b, rows(p1, p2))).toBe(0);
    expect(bookingOutstanding(b, rows(p1))).toBe(18000);
    expect(tripFinance(trip({ bookings: [b] }), rows(p1, p2))).toMatchObject({ total: 30000, committed: 0 });
  });

  it("10. never counts a reimbursement as income", () => {
    const spent: Txn = { id: "r1", txnType: "expense", amount: 5000, accountId: "sv", date: "2026-12-01" };
    const reimb: Txn = { id: "r2", txnType: "reimbursement", amount: 5000, accountId: "sv", date: "2026-12-08" };
    expect(cashflow([spent, reimb])).toEqual({ income: 0, spent: 0, net: 0 });
    expect(accountBalance(savings, [spent, reimb])).toBe(100000);
  });

  it("11. distinguishes travel advances from expenses and income", () => {
    const adv: Txn = { id: "a1", txnType: "advance", amount: 20000, accountId: "cs", date: "2026-12-01" };
    const back: Txn = { id: "a2", txnType: "advance_settlement", amount: 8000, accountId: "cs", date: "2026-12-20" };
    expect(cashflow([adv, back])).toEqual({ income: 0, spent: 0, net: 0 });
    expect(accountBalance(cash, [adv, back])).toBe(12000);
    const t = trip({ advances: [{ id: "ad", date: "2026-12-01", amount: 20000, source: "Employer" }] });
    expect(tripFinance(t, rows(row()))).toMatchObject({ advanced: 20000, advanceBalance: -40000 });
  });

  it("12. separates actual expenditure from commitments in trip budgets", () => {
    const t = trip({ contingency: 5000, budgetLines: [{ category: "Hotels", amount: 40000 }], bookings: [{ id: "b", kind: "flight", provider: "IndiGo", ref: "", date: "2026-12-02", amount: 10000, status: "unpaid" }] });
    const f = tripFinance(t, rows(row()));
    expect({ total: f.total, committed: f.committed, projected: f.projected, remainingAfterCommitted: f.remainingAfterCommitted }).toEqual({ total: 60000, committed: 10000, projected: 70000, remainingAfterCommitted: -20000 });
    const d = tripBudgetDetail(t, rows(row()));
    expect({ planned: d.planned, spent: d.spent, remaining: d.remaining, unbudgeted: d.unbudgeted }).toEqual({ planned: 55000, spent: 60000, remaining: -5000, unbudgeted: 0 });
  });

  it("13. reconciles multi-currency entries", () => {
    const usd = row({ id: "e5", currency: "USD", originalAmount: 720, fxRate: 83.33, amount: 59997.6 });
    const s = tripSummary(trip(), [usd] as never);
    expect(s.currencies).toEqual([{ currency: "USD", original: 720, inr: 59997.6, rates: [83.33] }]);
    expect(s.total).toBe(59997.6);
    const split = { ...usd, workspaceAllocations: [{ workspace: "business", amount: 432 }, { workspace: "personal", amount: 288 }] };
    expect(workspaceParts(split as never).reduce((a, p) => a + p.amount, 0)).toBe(59997.6);
    expect(last(travelReport("category", [trip()], [usd] as never, opts))).toEqual(["Total", "59997.60", "100.00"]);
  });

  it("14. keeps every record reachable only by its owner", () => {
    const sql = readdirSync("drizzle/migrations", { recursive: true }).filter((f) => typeof f === "string" && f.endsWith(".sql")).map((f) => readFileSync(`drizzle/migrations/${f}`, "utf8")).join("\n");
    const expensePolicies = [...sql.matchAll(/CREATE POLICY\s+"[^"]*"\s+ON public\.expenses\b[^;]*;/g)].map((m) => m[0]);
    const prefPolicies = [...sql.matchAll(/CREATE POLICY\s+"[^"]*"\s+ON public\.finance_preferences\b[^;]*;/g)].map((m) => m[0]);
    expect(expensePolicies.length).toBeGreaterThan(0);
    expect(prefPolicies.length).toBeGreaterThan(0);
    for (const p of [...expensePolicies, ...prefPolicies]) {
      expect(p).toContain("auth.uid()");
      expect(p).not.toContain("TO anon");
    }
    for (const p of prefPolicies) expect(p).toContain("owner_id=auth.uid()");
  });

  it("15. leaves the existing modules working", () => {
    expect(netWorth([savings, card], [bill])).toEqual({ assets: 100000, liabilities: 20000, net: 80000 });
    expect(suggestForMerchant("Taj", [{ merchant: "taj", date: "2026-12-01", category: "Hotels", tags: [], paymentMethod: "card", scope: "business" }])).toMatchObject({ category: "Hotels", scope: "business" });
    expect(frequentMerchants([{ merchant: "Taj" }, { merchant: "Taj" }, { merchant: "Ola" }])).toEqual(["Taj", "Ola"]);
    expect(() => validateTransfer({ accountId: "sv", toAccountId: "sv" })).toThrow("Choose two different accounts");
    expect(adjustmentToMatch(savings, [], 99900)).toEqual({ amount: 100, sign: -1 });
  });

  it("16. reconciles travel reports with the unified ledger", () => {
    const two = [trip(), trip({ id: "t2", name: "Goa", destination: "North Goa" })];
    expect(travelEntries(two, rows(row()))).toHaveLength(1); // one entry tagged to two trips counts once
    expect(last(travelReport("trip", two, rows(row()), opts))).toEqual(["Total (each entry once)", "", "", "", "60000.00", "0.00", "", "60000.00", ""]);
    expect(last(travelReport("category", two, rows(row()), opts))).toEqual(["Total", "60000.00", "100.00"]);
    expect(cashflow([row() as never]).spent).toBe(60000); // same figure the ledger reports
  });

  it("17. closes a trip without creating duplicate expenditure", () => {
    const open = trip({ bookings: [{ id: "b", kind: "hotel", provider: "Taj", ref: "", date: "2026-12-03", amount: 10000, status: "paid", expenseId: "e1" }], advances: [{ id: "ad", date: "2026-12-01", amount: 20000, source: "Employer", settledAt: null }] });
    const ledger = [row({ reimbursementStatus: "pending" })];
    expect(closeBlockers(open, ledger as never)).toEqual(["1 advance isn't settled yet", "₹60,000 of reimbursements are still pending"]);
    const closed: TravelTrip = { ...open, closedAt: "2026-12-06" };
    const before = JSON.stringify(ledger);
    expect(tripFinance(closed, ledger as never).total).toBe(60000);
    expect(travelEntries([closed], ledger as never)).toHaveLength(1);
    expect(JSON.stringify(ledger)).toBe(before); // closing records nothing new
    const settled: TravelTrip = { ...closed, advances: [{ id: "ad", date: "2026-12-01", amount: 60000, source: "Employer", settledAt: "2026-12-06" }] };
    expect(closeBlockers(settled, [row({ reimbursementStatus: "received" })] as never)).toEqual([]);
  });
});
