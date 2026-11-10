// P0-014 regression (was repro): valuations are archived (row untouched, still used for the value) and corrected by a newer
// dated valuation; lender balances are archived with a reason, and a same-date confirmation supersedes instead of deleting.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { accountValue, netWorth, type Account } from "@/lib/ledger";
import { standaloneLoanBalances, type LoanBalanceEvidence } from "@/lib/books/loan-balances";
import { bare, callsOf, confirmInDialog, harness, OWNER, reset, spy } from "./harness";

vi.mock("@/lib/store", async () => ({ useStore: (await import("./harness")).useStoreMock }));
vi.mock("@tanstack/react-router", async () => (await import("./harness")).routerMock);
vi.mock("@/components/MutualFundTools", () => ({ MutualFundTools: () => null }));
vi.mock("@/components/BankBalanceEditor", () => ({ BankBalanceEditor: () => null }));
vi.mock("@/components/BelongsTo", () => ({ BelongsTo: () => null }));
import { AccountTools } from "@/components/AccountTools";
import { LoanBalanceReview } from "@/components/books/LoanBalanceReview";

const gold: Account = { id: "acc-gold", name: "Gold locker", kind: "other_asset", openingBalance: 0, archived: false };
const val = { id: "v-1", accountId: gold.id, value: 640000, valuedOn: "2026-10-01", source: "manual", note: "" };
const loan = { id: "loan-p", name: "Bajaj personal loan", accountId: null, status: "active" };
const evidence = { id: "e-1", loanId: loan.id, amount: 180000, asOf: "2026-09-30", docId: "doc-ls", sourceQuote: "Principal outstanding 1,80,000 (p.1)", confirmedAt: "2026-10-02T00:00:00Z" };
const documents = [{ id: "doc-ls", loanId: loan.id, docType: "loan_statement", title: "Bajaj statement Sep 2026", docDate: "2026-09-30", fields: [] }];
beforeEach(() => reset({ books: { loanBalances: [evidence] } }, { accounts: [gold], valuations: [val], removeValuation: spy("removeValuation"), addValuation: spy("addValuation"), documents }));
afterEach(cleanup);
const stored = () => (harness.stored["books"] as Record<string, LoanBalanceEvidence[]>)["loanBalances"]!;
const owed = (list: LoanBalanceEvidence[]) => standaloneLoanBalances([loan], list, documents as never, "2026-11-10").amount;

describe("P0-014 valuations: archive, never delete", () => {
  it("Archive needs a reason; the valuation row stays and the account value and net worth do not change", async () => {
    const value = accountValue(gold, [], [val]).value, worth = netWorth([gold], [], [val]);
    render(<AccountTools a={gold} />);
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Archive Gold locker 2026-10-01/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("save a newer valuation");
    await confirmInDialog("Typed the wrong weight; newer valuation saved", /^Archive valuation$/);
    expect(callsOf("removeValuation")).toHaveLength(0);
    expect(harness.store["valuations"]).toEqual([val]);
    expect(accountValue(gold, [], harness.store["valuations"] as never).value).toBe(value);
    expect(netWorth([gold], [], harness.store["valuations"] as never)).toEqual(worth);
    expect(harness.stored["recordArchive"]).toEqual([expect.objectContaining({ id: "asset_valuations:v-1", archivedBy: OWNER })]);
    expect(screen.getByText(/Archived valuations \(1\) · still used for the value/)).toBeInTheDocument();
  });
});

describe("P0-014 lender balances: archive, and supersede instead of delete", () => {
  it("Archive (no window.confirm) keeps the observation byte-identical and what you owe unchanged; restore works", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const before = owed(stored());
    render(<LoanBalanceReview loan={loan} />);
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Archive lender balance 2026-09-30" }));
    expect(await confirmInDialog("Superseded by the October statement", /^Archive lender balance$/)).toBe("Archive this lender balance?");
    expect(confirm).not.toHaveBeenCalled();
    expect(bare(stored()[0])).toEqual(evidence);
    expect(owed(stored())).toBe(before);
    fireEvent.click(screen.getByRole("button", { name: /^Restore Bajaj personal loan/ }));
    await confirmInDialog("Archived by mistake", /^Restore lender balance$/);
    expect(bare(stored()[0])).toEqual(evidence);
    expect(owed(stored())).toBe(before);
    confirm.mockRestore();
  });
});
