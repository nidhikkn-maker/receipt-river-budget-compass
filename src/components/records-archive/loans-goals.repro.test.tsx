// P0-008 / P0-013 (goals). WealthPanels.tsx is Track A's file, so the fix ships as ready-made pieces in WealthArchive.tsx
// for Track D to wire. These tests (1) prove the pieces archive loans and goals without touching their rows or any figure
// and (2) keep a tripwire on the still-open WealthPanels Delete icons, which must flip once Track D wires the pieces.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { defaultPreferences } from "@/lib/preferences";
import { standaloneLoanBalances } from "@/lib/books/loan-balances";
import { goalProgress } from "@/lib/planning";
import type { Loan } from "@/lib/store";
import { callsOf, confirmInDialog, harness, OWNER, reset, spy } from "./harness";

vi.mock("@/lib/store", async () => ({ useStore: (await import("./harness")).useStoreMock }));
vi.mock("@tanstack/react-router", async () => (await import("./harness")).routerMock);
vi.mock("../LoanFundingPanel", () => ({ LoanFundingPanel: () => null }));
vi.mock("../books/LoanBalanceReview", () => ({ LoanBalanceReview: () => null }));
vi.mock("recharts", () => ({ ResponsiveContainer: () => null, LineChart: () => null, Line: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null }));
import { ArchivedGoals, ArchivedLoans, TableArchiveButton, useGoalsSplit, useLoansSplit } from "../WealthArchive";
import { GoalsPanel, LoansPanel } from "../WealthPanels";

const loan = { id: "loan-1", name: "Bajaj personal loan", accountId: null, principal: 180000, rate: 13, emi: 9000, nextDue: "2026-12-05", provider: "Bajaj", loanType: "personal", original: 300000, startDate: "2025-01-01", prepaymentTerms: "", foreclosurePct: 4, sourceTransactionId: null, payments: [], status: "active" };
const goal = { id: "goal-1", name: "School fees", target: 200000, saved: 50000, monthly: 10000, reserve: true };
const evidence = { id: "e-1", loanId: loan.id, amount: 180000, asOf: "2026-09-30", docId: "doc-ls", sourceQuote: "Principal outstanding 1,80,000 (p.1)", confirmedAt: "2026-10-02T00:00:00Z" };
const documents = [{ id: "doc-ls", loanId: loan.id, docType: "loan_statement" }];
beforeEach(() => reset({ ...(defaultPreferences() as unknown as Record<string, unknown>), books: { loanBalances: [evidence] } }, { loans: [loan], goals: [goal], documents, removeLoan: spy("removeLoan"), removeGoal: spy("removeGoal"), saveLoan: spy("saveLoan"), saveGoal: spy("saveGoal"), recordLoanPayment: spy("recordLoanPayment") }));
afterEach(cleanup);

/** What Track D wires into WealthPanels: active rows listed with Archive, archived rows below with Restore. */
function WiredLoansAndGoals() {
  const loans = useLoansSplit(), goals = useGoalsSplit();
  return <>
    {loans.active.map((l) => <div key={l.id}>{l.name}<TableArchiveButton table="loans" id={l.id} name={l.name} noun="loan" /></div>)}
    <ArchivedLoans rows={loans.archived} />
    {goals.active.map((g) => <div key={g.id}>{g.name}{g.id && <TableArchiveButton table="goals" id={g.id} name={g.name} noun="goal" />}</div>)}
    <ArchivedGoals rows={goals.archived} />
  </>;
}
const owed = () => standaloneLoanBalances(harness.store["loans"] as Loan[], [evidence], documents as never, "2026-11-10").amount;

describe("P0-008 / P0-013 loans and goals: archive pieces for WealthPanels", () => {
  it("archive a loan and a goal with a reason; rows, what you owe and goal progress are unchanged; restore works", async () => {
    const rows = JSON.stringify({ loans: harness.store["loans"], goals: harness.store["goals"] }), owedBefore = owed(), progress = goalProgress(goal as never, "2026-11-10");
    render(<WiredLoansAndGoals />);
    fireEvent.click(screen.getByRole("button", { name: `Archive ${loan.name}` }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Archiving does not close the loan");
    expect(await confirmInDialog("Duplicate of the HDFC loan entry", /^Archive loan$/)).toBe("Archive this loan?");
    fireEvent.click(screen.getByRole("button", { name: `Archive ${goal.name}` }));
    await confirmInDialog("Fees paid from the bonus instead", /^Archive goal$/);
    expect(callsOf("removeLoan")).toHaveLength(0);
    expect(callsOf("removeGoal")).toHaveLength(0);
    expect(JSON.stringify({ loans: harness.store["loans"], goals: harness.store["goals"] })).toBe(rows);
    expect(owed()).toBe(owedBefore);
    expect(goalProgress(goal as never, "2026-11-10")).toEqual(progress);
    expect(harness.stored["recordArchive"]).toEqual([
      expect.objectContaining({ id: "loans:loan-1", archivedBy: OWNER, archiveReason: "Duplicate of the HDFC loan entry" }),
      expect.objectContaining({ id: "goals:goal-1", archivedBy: OWNER, archiveReason: "Fees paid from the bonus instead" }),
    ]);
    expect(screen.getByText(/^Archived loans \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/still held back from safe-to-spend/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Restore ${loan.name}` }));
    await confirmInDialog("Archived by mistake", /^Restore loan$/);
    expect(screen.getByRole("button", { name: `Archive ${loan.name}` })).toBeInTheDocument();
    expect(owed()).toBe(owedBefore);
  });

  it("OPEN until Track D wires WealthArchive: WealthPanels still deletes loans/goals in one tap (tripwire)", () => {
    render(<><LoansPanel /><GoalsPanel /></>);
    fireEvent.click(screen.getByRole("button", { name: `Delete ${loan.name}` }));
    fireEvent.click(screen.getByRole("button", { name: `Delete ${goal.name}` }));
    expect(callsOf("removeLoan").map((c) => c.args[0])).toEqual([loan.id]);
    expect(callsOf("removeGoal").map((c) => c.args[0])).toEqual([goal.id]);
    const src = readFileSync("src/lib/store.tsx", "utf8");
    expect(src.slice(src.indexOf("const removeLoan:"), src.indexOf("const removeLoan:") + 400)).toMatch(/from\("loans"\)\.delete\(\)/);
  });
});
