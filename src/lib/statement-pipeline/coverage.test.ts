import { describe, expect, it } from "vitest";
import { statementCoverage } from "./coverage";
import { cleanStatementUploads } from "../preferences";
import { buildPlan } from "./plan";

const acct = { id: "a", name: "Bank", kind: "savings", archived: false, openingBalance: 0 } as never;
const tx = (id: string, date: string, rec = false) => ({ id, date, accountId: "a", reconciledAt: rec ? "x" : null, statementRef: null, txnType: "expense", originalAmount: 10, amount: 10, currency: "INR", splits: [] }) as never;

describe("statement coverage", () => {
  it("marks months with entries but no statement as missing and reports freshness", () => {
    const [c] = statementCoverage([acct], [tx("1", "2026-04-10", true), tx("2", "2026-05-03"), tx("3", "2026-07-01")], "2026-07-11");
    expect(c!.missingMonths).toEqual(["2026-05", "2026-07"]);
    expect(c!.months.find((m) => m.month === "2026-06")!.state).toBe("quiet");
    expect(c!.latestStatementDate).toBe("2026-04-10");
    expect(c!.daysBehind).toBe(92);
  });
});

describe("cross-device upload history", () => {
  it("keeps at most ten uploads and drops malformed ones", () => {
    const u = Array.from({ length: 12 }, (_, i) => ({ id: `u${i}`, at: "2026-11-01", label: "f", posted: ["p"], reconciled: [], createdAccounts: [] }));
    expect(cleanStatementUploads([...u, { id: 5 }])).toHaveLength(10);
    expect(cleanStatementUploads("x")).toEqual([]);
  });
});

describe("scanned statements", () => {
  it("never saves scanned lines automatically because they have no printed balances", () => {
    const file = { name: "s.jpg (scanned)", accountId: "a", hint: null, currency: "INR", opening: null, closing: null, scanned: true,
      lines: [{ key: "s#0", file: "s.jpg", date: "2026-10-02", description: "SWIGGY", amount: 250, direction: "debit", balance: null, currency: "INR", ref: "OCR1" }] } as never;
    const plan = buildPlan([file], [acct], [], [{ name: "Food", archived: false }] as never);
    expect(plan.accounts[0]!.auto).toHaveLength(0);
  });
});

describe("records saved on the wrong account", () => {
  it("offers a move instead of posting a second copy", () => {
    const other = { id: "b", name: "Card", kind: "credit_card", archived: false, openingBalance: 0 } as never;
    const wrong = { ...(tx("w", "2026-10-02") as object), accountId: "b", toAccountId: null } as never;
    const file = { name: "s.csv", accountId: "a", hint: null, currency: "INR", opening: null, closing: null,
      lines: [{ key: "s#0", file: "s.csv", date: "2026-10-03", description: "X", amount: 10, direction: "debit", balance: null, currency: "INR", ref: "1" }] } as never;
    const a = buildPlan([file], [acct, other], [wrong], [{ name: "Food", archived: false }] as never).accounts[0]!;
    expect(a.elsewhere.map((e) => e.record.id)).toEqual(["w"]);
    expect([...a.auto, ...a.ask]).toHaveLength(0);
  });
});
