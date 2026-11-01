import { describe, expect, it } from "vitest";
import type { Account } from "../ledger";
import type { Expense } from "../expenses";
import type { CategorySetting } from "../preferences";
import { balanceAddsUp, fromBalanceLines, fromForex, fromStatementLines, projectBalance, totals, type StmtLine } from "./line";
import { detectAccountNumber, detectCurrency, identifyFile } from "./identify";
import { ledgerRec, matchLines, pairOpposites, recordsNotMatched } from "./match";
import { classifyMissing, decisionInput } from "./classify";
import { buildPlan } from "./plan";

// ---------- fixtures ----------
const account = (over: Partial<Account> & { id: string; name: string }): Account => ({
  kind: "savings", openingBalance: 0, archived: false, ...over,
});

const txn = (over: Partial<Expense> & { id: string; date: string; amount: number }): Expense => ({
  title: "Record", merchant: null, category: "Uncategorised", scope: "personal", memberId: null, splits: [],
  currency: "INR", originalAmount: over.amount, fxRate: 1, paymentMethod: "other", reconciledAt: null,
  statementRef: null, description: "", receipts: [], ...over,
});

const line = (over: Partial<StmtLine> & { key: string; date: string; amount: number; direction: "debit" | "credit" }): StmtLine => ({
  file: "test.csv", balance: null, description: "TEST ENTRY", currency: "INR", ...over,
});

const categories: CategorySetting[] = [
  { name: "Groceries", archived: false },
  { name: "Financial charges", archived: false },
  { name: "Miscellaneous", archived: false },
];

describe("statement line model", () => {
  it("carries a bank's running-balance line across unchanged", () => {
    const [got] = fromBalanceLines("stmt.pdf", [{ date: "2026-10-01", amount: 100, direction: "debit", balance: 900, description: "AMAZON PAY", source: "stmt.pdf" }]);
    expect(got).toMatchObject({ key: "stmt.pdf#0", file: "stmt.pdf", date: "2026-10-01", amount: 100, direction: "debit", balance: 900, currency: "INR" });
  });

  it("reads a forex wallet line in its own currency", () => {
    const [got] = fromForex("fx.pdf", { currency: "EUR", printedBalance: 950, lines: [{ date: "2026-10-01", description: "Purchase", merchant: "CAFE PARIS", txnCurrency: "EUR", credit: 0, debit: 50, balance: 950 }] });
    expect(got).toMatchObject({ amount: 50, direction: "debit", currency: "EUR", description: "CAFE PARIS Purchase" });
  });

  it("treats an unsigned spreadsheet amount as money out", () => {
    const [got] = fromStatementLines("export.csv", [{ ref: "r", date: "2026-10-02", description: "SWIGGY", amount: 250 }]);
    expect(got).toMatchObject({ direction: "debit", balance: null, currency: "INR" });
  });

  it("adds a file's own totals and checks its printed closing figure", () => {
    const lines = fromStatementLines("f.csv", [
      { ref: "a", date: "2026-10-01", description: "BIGBASKET", amount: 100 },
      { ref: "b", date: "2026-10-02", description: "SALARY", amount: 40, direction: "credit" },
    ]);
    expect(totals(lines)).toEqual({ debits: 100, credits: 40, count: 2 });
    expect(balanceAddsUp(1000, 940, lines)).toBe(0);
    // A card's owed figure moves the other way round.
    expect(balanceAddsUp(1000, 1060, lines, true)).toBe(0);
    expect(balanceAddsUp(1000, 940, lines, true)).toBe(-120);
    expect(balanceAddsUp(null, 940, lines)).toBeNull();
  });

  it("gates postings on the statement's closing figure", () => {
    const posts = [{ direction: "debit" as const, amount: 100 }, { direction: "credit" as const, amount: 40 }];
    expect(projectBalance(1000, posts, 940)).toEqual({ net: -60, after: 940, difference: 0, ok: true });
    expect(projectBalance(1000, posts, 940, true).ok).toBe(false);
    expect(projectBalance(1000, posts, null).ok).toBe(false);
  });
});

describe("account identification", () => {
  const accounts = [
    account({ id: "a1", name: "IDFC MOVAC", lastFour: "1234" }),
    account({ id: "a2", name: "IDFC KRNA", lastFour: "5678" }),
  ];

  it("only reads a clearly labelled account number", () => {
    expect(detectAccountNumber(["IDFC FIRST BANK", "Account Number : 0012345678", "01-Oct-2026 UPI 1,000.00 9,000.00"])).toBe("0012345678");
    expect(detectAccountNumber(["IDFC FIRST BANK", "01-Oct-2026 UPI 1,000.00 9,000.00"])).toBeNull();
  });

  it("ties a printed account number to the account that carries it", () => {
    expect(identifyFile(["IDFC FIRST BANK", "A/C No. 0012345678"], [], accounts).accountId).toBe("a1");
  });

  it("reports an unknown account with a suggested name instead of guessing", () => {
    const out = identifyFile(["HDFC BANK", "Statement of account"], [], [account({ id: "h1", name: "HDFC Savings" }), account({ id: "h2", name: "HDFC Current", kind: "current" })]);
    expect(out.accountId).toBeNull();
    expect(out.hint).toMatchObject({ issuer: "HDFC Bank", kind: "savings", name: "HDFC Bank" });
  });

  it("reads a card statement as a card, not a savings account", () => {
    const out = identifyFile(["HDFC Bank Credit Card Statement", "Total Dues 1,000.00"], [], [account({ id: "h1", name: "HDFC Savings" }), account({ id: "c1", name: "HDFC Emerald", kind: "credit_card" })]);
    expect(out.accountId).toBe("c1");
  });

  it("spots a foreign-currency statement", () => {
    expect(detectCurrency(["Currency: EUR", "Avl. Balance : 616.49"], [])).toBe("EUR");
    expect(detectCurrency(["IDFC FIRST BANK"], [])).toBe("INR");
  });
});

describe("matching", () => {
  const twoSameAmount = fromStatementLines("f.csv", [
    { ref: "0", date: "2026-10-01", description: "AMAZON PAY", amount: 500 },
    { ref: "1", date: "2026-10-01", description: "AMAZON PAY", amount: 500 },
  ]);

  it("uses each record once", () => {
    const recs = [ledgerRec({ id: "r1", date: "2026-10-01", amount: 500, currency: "INR", merchant: "AMAZON", title: "Amazon" })];
    const out = matchLines(twoSameAmount, recs);
    expect(out.filter((o) => o.record).length).toBe(1);
    expect(out.filter((o) => o.result === "missing").length).toBe(1);
  });

  it("flags a record saved the wrong way round", () => {
    const debit = [line({ key: "k", date: "2026-10-01", amount: 500, direction: "debit", description: "AMAZON" })];
    const recs = [ledgerRec({ id: "r1", date: "2026-10-01", amount: 500, currency: "INR", txnType: "income", merchant: "AMAZON", title: "Amazon" })];
    const [outcome] = matchLines(debit, recs);
    expect(outcome?.result).toBe("wrong_kind");
    expect(outcome?.reasons.join(" ")).toMatch(/money out/);
  });

  it("never pairs across currencies", () => {
    const recs = [ledgerRec({ id: "r1", date: "2026-10-01", amount: 500, currency: "USD", merchant: "AMAZON", title: "Amazon" })];
    expect(matchLines([line({ key: "k", date: "2026-10-01", amount: 500, direction: "debit" })], recs)[0]?.result).toBe("missing");
  });

  it("lists records no statement line explains", () => {
    const recs = [ledgerRec({ id: "r1", date: "2026-10-01", amount: 500, currency: "INR", merchant: "AMAZON", title: "Amazon" })];
    expect(recordsNotMatched(recs, []).map((r) => r.id)).toEqual(["r1"]);
  });

  it("pairs a movement only when exactly one opposite line exists", () => {
    const missing = [line({ key: "m1", date: "2026-10-01", amount: 1000, direction: "debit" })];
    const one = [line({ key: "o1", date: "2026-10-01", amount: 1000, direction: "credit" })];
    expect(pairOpposites(missing, one).get("m1")).toBe("o1");
    const two = [...one, line({ key: "o2", date: "2026-10-02", amount: 1000, direction: "credit" })];
    expect(pairOpposites(missing, two).size).toBe(0);
  });
});

describe("classifying lines with no record", () => {
  const accounts = [account({ id: "a1", name: "IDFC MOVAC" }), account({ id: "a2", name: "IDFC KRNA" })];
  const ctx = { transactions: [] as Expense[], accounts, categories, accountId: "a1", currency: "INR" };

  it("saves a confident purchase on its own", () => {
    const [d] = classifyMissing(fromStatementLines("f.csv", [{ ref: "g", date: "2026-10-01", description: "BIGBASKET ORDER", amount: 800 }]), [], ctx);
    expect(d?.group).toBe("auto");
    expect(d?.draft.category).toBe("Groceries");
  });

  it("asks where a transfer went", () => {
    const [d] = classifyMissing(fromStatementLines("f.csv", [{ ref: "t", date: "2026-10-01", description: "NEFT TRANSFER TO SELF A/C", amount: 5000 }]), [], ctx);
    expect(d?.group).toBe("ask");
    expect(d?.needsDestination).toBe(true);
  });

  it("asks before calling an unclear credit income", () => {
    const [d] = classifyMissing(fromStatementLines("f.csv", [{ ref: "c", date: "2026-10-01", description: "SOME RANDOM CREDIT", amount: 5000, direction: "credit" }]), [], ctx);
    expect(d?.group).toBe("ask");
  });

  it("pairs the two sides of an own-account movement and asks once", () => {
    const debit = fromStatementLines("a.csv", [{ ref: "d", date: "2026-10-01", description: "PAYMENT TO FRIEND", amount: 1000 }]);
    const credit = fromStatementLines("b.csv", [{ ref: "c", date: "2026-10-01", description: "PAYMENT FROM SELF", amount: 1000, direction: "credit" }]);
    const [d] = classifyMissing(debit, credit, ctx);
    expect(d?.group).toBe("ask");
    expect(d?.transferWith?.file).toBe("b.csv");
  });

  it("orients a movement between two accounts", () => {
    const [d] = classifyMissing(fromStatementLines("f.csv", [{ ref: "t", date: "2026-10-01", description: "NEFT TRANSFER TO SELF A/C", amount: 5000 }]), [], ctx);
    if (!d) throw new Error("expected a decision");
    expect(decisionInput(d, { statementAccountId: "a1", destination: "a2" })).toMatchObject({ accountId: "a1", toAccountId: "a2" });
  });
});

describe("change plan for a whole upload", () => {
  const acct = account({ id: "a1", name: "IDFC MOVAC", openingBalance: 1000 });
  const file = (closing: number | null, description = "BIGBASKET ORDER") => ({
    name: "idfc-oct.pdf", accountId: "a1", hint: null, currency: "INR", opening: 1000, closing,
    lines: fromStatementLines("idfc-oct.pdf", [{ ref: "0", date: "2026-10-01", description, amount: 600 }]),
  });

  it("posts on its own when the balance check passes", () => {
    const plan = buildPlan([file(400)], [acct], [], categories);
    const a = plan.accounts[0];
    expect(a?.gate?.ok).toBe(true);
    expect(a?.auto.length).toBe(1);
    expect(a?.ask.length).toBe(0);
    expect(a?.later.length).toBe(0);
  });

  it("holds every posting while the balance check fails", () => {
    const plan = buildPlan([file(500)], [acct], [], categories);
    const a = plan.accounts[0];
    expect(a?.gate?.ok).toBe(false);
    expect(a?.auto.length).toBe(0);
    expect(a?.ask.length).toBe(0);
    expect(a?.later.length).toBe(1);
    expect(a?.later[0]?.reason).toMatch(/Balance check failed/);
  });

  it("asks rather than saves itself when the file prints no closing figure", () => {
    const plan = buildPlan([file(null)], [acct], [], categories);
    const a = plan.accounts[0];
    expect(a?.gate).toBeNull();
    expect(a?.auto.length).toBe(0);
    expect(a?.ask.length).toBe(1);
    expect(a?.ask[0]?.reason).toMatch(/no printed closing balance/);
  });

  it("marks an already-recorded line as matched and leaves nothing to post", () => {
    const saved = txn({ id: "r1", date: "2026-10-01", amount: 600, merchant: "BIGBASKET", accountId: "a1" });
    const plan = buildPlan([file(1000)], [acct], [saved], categories);
    const a = plan.accounts[0];
    expect(a?.matched.length).toBe(1);
    expect(a?.auto.length).toBe(0);
    expect(a?.unexplained.length).toBe(0);
  });
});
