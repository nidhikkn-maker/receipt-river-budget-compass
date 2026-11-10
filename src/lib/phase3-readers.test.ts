// KK decision 1 (10 Nov 2026), reader side: a reversed posted entry is never removed; its separate reversal
// row cancels it ON ITS OWN DATE. Every reader of the ledger applies ledger.ts ledgerView, so balances, cash
// flow, categories, budgets, workspaces, member shares and net worth count the original plus its reversal
// (net zero over any range holding both) and period figures keep the original in its own period.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { accountBalance, cashflow, isReversalHistory, ledgerView, netWorth, repaymentParts, reversalOfRow, txnFromRow, type Account, type Txn } from "./ledger";
import { budgetUsage, categoryTotals, memberShares, totalsByScope, type Expense } from "./expenses";

const bank: Account = { id: "bank", name: "Bank", kind: "savings", openingBalance: 10000, archived: false };
const card: Account = { id: "card", name: "Card", kind: "credit_card", openingBalance: 0, archived: false };
const loan: Account = { id: "loan", name: "Loan", kind: "loan", openingBalance: 100000, archived: false };
const ex = (o: Partial<Expense> & { id: string; amount: number; date: string }): Expense => ({
  title: "x", merchant: null, category: "Groceries", scope: "personal", memberId: null, splits: [], currency: "INR", originalAmount: o.amount, fxRate: 1,
  paymentMethod: "upi", reconciledAt: null, statementRef: null, description: "", receipts: [], txnType: "expense", accountId: "bank", ...o,
} as Expense);
// June purchase split across two categories and two people, reversed in July (correction date)
const original = ex({ id: "o1", amount: 3000, date: "2026-06-10", allocations: [{ category: "Groceries", amount: 2000 }, { category: "Household", amount: 1000 }],
  splits: [{ memberId: "m1", amount: 1000 }, { memberId: null, amount: 2000 }], workspaceAllocations: [{ workspace: "personal", amount: 2000 }, { workspace: "family", amount: 1000 }] });
const reversal = ex({ ...original, id: "r1", date: "2026-07-05", reversesEntryId: "o1", title: "Reversal: x" });
const other = ex({ id: "e2", amount: 500, date: "2026-07-06" });

describe("ledgerView: original + reversal net to zero, each on its own date", () => {
  const view = ledgerView([original, reversal, other]);
  it("negates every figure of the reversal row, marks the original, and is idempotent", () => {
    const r = view.find((x) => x.id === "r1")!;
    expect(r.amount).toBe(-3000);
    expect(r.originalAmount).toBe(-3000);
    expect(r.allocations?.map((a) => a.amount)).toEqual([-2000, -1000]);
    expect(r.splits.map((s) => s.amount)).toEqual([-1000, -2000]);
    expect(r.workspaceAllocations?.map((w) => w.amount)).toEqual([-2000, -1000]);
    expect(view.find((x) => x.id === "o1")?.reversedBy).toBe("r1");
    expect(isReversalHistory(view.find((x) => x.id === "o1")!)).toBe(true);
    expect(isReversalHistory(view.find((x) => x.id === "e2")!)).toBe(false);
    expect(ledgerView(view)).toEqual(view); // applying twice changes nothing (offline snapshot, refresh)
    expect(original.amount).toBe(3000); // inputs never mutated
  });
  it("balances, cash flow, categories, budgets, workspaces and member shares: net zero overall, original kept in June", () => {
    expect(accountBalance(bank, view)).toBe(10000 - 500);
    expect(cashflow(view)).toEqual({ income: 0, spent: 500, net: -500 });
    expect(cashflow(view, "2026-06-01", "2026-06-30")).toEqual({ income: 0, spent: 3000, net: -3000 }); // closed June unchanged
    expect(cashflow(view, "2026-07-01", "2026-07-31")).toEqual({ income: 0, spent: -2500, net: 2500 }); // correction shows in July
    expect(categoryTotals(view)).toEqual({ Groceries: 500, Household: 0 });
    expect(categoryTotals(view.filter((x) => x.date.startsWith("2026-06")))).toEqual({ Groceries: 2000, Household: 1000 });
    expect(budgetUsage(view, { Groceries: 4000 }, "2026-06").find((b) => b.category === "Groceries")?.spent).toBe(2000);
    expect(totalsByScope(view)).toMatchObject({ personal: 500, family: 0, total: 500 });
    const shares = view.flatMap((e) => memberShares(e)).filter((s) => s.memberId === "m1").reduce((s, x) => s + x.amount, 0);
    expect(shares).toBe(0);
    expect(netWorth([bank], view).net).toBe(9500);
  });
  it("moves and loan repayments reverse exactly, including the interest split", () => {
    const pay: Txn = { id: "p", txnType: "card_payment", amount: 8000, accountId: "bank", toAccountId: "card", date: "2026-06-01" };
    const emi: Txn = { id: "l", txnType: "loan_repayment", amount: 30000, accountId: "bank", toAccountId: "loan", date: "2026-06-05", principal: 22000, interest: 8000, originalAmount: 30000 };
    const v = ledgerView([pay, { ...pay, id: "pr", date: "2026-07-01", reversesEntryId: "p" }, emi, { ...emi, id: "lr", date: "2026-07-01", reversesEntryId: "l" }]);
    expect(accountBalance(bank, v)).toBe(10000);
    expect(accountBalance(card, v)).toBe(0);
    expect(accountBalance(loan, v)).toBe(100000);
    expect(repaymentParts(v.find((x) => x.id === "lr")!)).toEqual({ principal: -22000, interest: -8000 });
    expect(cashflow(v)).toEqual({ income: 0, spent: 0, net: 0 });
  });
  it("database rows: the column is authoritative; narrow selects read the immutable receipt_details copy", () => {
    expect(reversalOfRow({ reverses_entry_id: "o1" })).toBe("o1");
    expect(reversalOfRow({ reverses_entry_id: null, receipt_details: { reversal: { of: "forged" } } })).toBeNull(); // column present: JSON ignored
    expect(reversalOfRow({ reversal: { of: "o1" } })).toBe("o1"); // `reversal:receipt_details->reversal`
    expect(reversalOfRow({ receipt_details: { reversal: { of: "o1" } } })).toBe("o1"); // production schema, select("*")
    expect(reversalOfRow({ receipt_details: { tax: 1 } })).toBeNull();
    const t = txnFromRow({ id: "x", expense_date: "2026-06-01", txn_type: "loan_repayment", amount: "30000.00", original_amount: "30000", account_id: "bank", to_account_id: "loan", adjustment_sign: 1,
      transfer_counterpart_of: null, principal: "22000", interest: "8000", reversal: { of: "l" } } as never);
    expect(t).toMatchObject({ amount: 30000, principal: 22000, interest: 8000, originalAmount: 30000, reversesEntryId: "l", transferCounterpartOf: null });
  });
});

describe("reader inventory (decision 1): every ledger reader applies the same view", () => {
  // Every file that sums the working ledger (FND-01 inventory §3). A new reader must be added here.
  const READERS = [
    "src/lib/store.tsx", "src/lib/assistant-facts.server.ts", "src/lib/report-jobs.server.ts", "src/lib/push-dispatch.server.ts",
    "src/lib/statement-checkpoint.functions.ts", "src/lib/mcp/tools/list-accounts.ts", "src/lib/mcp/tools/spending-summary.ts",
  ];
  it.each(READERS)("%s passes its rows through ledgerView", (f) => {
    const src = readFileSync(f, "utf8");
    expect(src).toMatch(/ledgerView\(/);
    expect(src).toMatch(/reversalOfRow\(|txnFromRow/);
  });
  it("the transaction list tool shows reversals as negative, linked entries", () => {
    const src = readFileSync("src/lib/mcp/tools/list-transactions.ts", "utf8");
    expect(src).toMatch(/reversalOfRow\(r\)/);
    expect(src).toMatch(/reversal of/);
  });
  it("no server or MCP reader of expenses is missing from the inventory", () => {
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const files = execSync("grep -rl 'from(\"expenses\")' src/lib --include=*.ts --include=*.tsx", { encoding: "utf8" }).split("\n").filter((x) => x && !x.includes(".test."));
    // Readers that do not sum money: the Statement Desk Undo snapshot read, the import job, posting checks, and the Statement
    // Inbox check of a pending line's existing entry and reference (statement-line-claims.ts, P0-027).
    const NOT_SUMMING = ["src/lib/statement-pipeline/atomic-undo.functions.ts", "src/lib/import-jobs.server.ts", "src/lib/fx.functions.ts", "src/lib/mcp/tools/list-transactions.ts", "src/lib/statement-line-claims.ts"];
    expect(files.filter((f) => !READERS.includes(f) && !NOT_SUMMING.includes(f))).toEqual([]);
  });
});
