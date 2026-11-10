// P0-007 regression (was repro, see docs/evidence/screens/2026-11-10-module-connections/repro/): receivables are archived,
// never removed: confirmation + reason, who/when/why, append-only history, restore, totals unchanged.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { receivableStatus, gstMonths, type Receivable } from "@/lib/receivables";
import { bare, confirmInDialog, harness, OWNER, reset } from "./harness";

vi.mock("@/lib/store", async () => ({ useStore: (await import("./harness")).useStoreMock }));
vi.mock("@tanstack/react-router", async () => (await import("./harness")).routerMock);
vi.mock("@/components/AppShell", () => ({ PageTitle: ({ title, sub }: { title: string; sub?: string }) => <header><h1>{title}</h1><p data-testid="subtitle">{sub}</p></header> }));
import { Route } from "@/routes/_authenticated/receivables";
const Receivables = (Route as unknown as { component: () => React.ReactElement }).component;

const inv1 = { id: "r1", customer: "Sundaram Traders", invoiceNo: "TH-101", date: "2026-10-01", dueDate: "2026-10-31", amount: 59000, gst: 9000 };
const inv2 = { id: "r2", customer: "Kaveri Foods", date: "2026-10-15", amount: 12000 };
beforeEach(() => reset({ receivables: [inv1, inv2] }));
afterEach(cleanup);
const stored = () => harness.stored["receivables"] as (Receivable & Record<string, unknown>)[];
const figures = () => { const rows = receivableStatus(stored(), [], "2026-11-10"); return { unpaid: rows.filter((x) => !x.paidBy).reduce((s, x) => s + x.r.amount, 0), gst: gstMonths(stored(), [], ["2026-10"]) }; };

describe("P0-007 receivables: archive instead of remove", () => {
  it("offers no Remove; Archive needs a reason, and cancelling changes nothing", async () => {
    render(<Receivables />);
    expect(screen.queryByRole("button", { name: /remove|delete/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Archive invoice Kaveri Foods" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Archive this invoice?");
    expect(dialog.textContent).toContain("issue a credit note");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(harness.saves).toBe(0);
    expect(stored()).toEqual([inv1, inv2]);
  });

  it("archives with who/when/why, keeps the record byte-identical and every total, lists it, then restores", async () => {
    render(<Receivables />);
    const before = figures(), subBefore = screen.getByTestId("subtitle").textContent;
    fireEvent.click(screen.getByRole("button", { name: "Archive invoice Kaveri Foods" }));
    expect(await confirmInDialog("Raised in error; replaced by TH-105", /^Archive invoice$/)).toBe("Archive this invoice?");
    const kaveri = stored().find((x) => x.id === "r2")!;
    expect(stored()).toHaveLength(2);
    expect(bare(kaveri)).toEqual(inv2);
    expect(kaveri).toMatchObject({ archivedBy: OWNER, archiveReason: "Raised in error; replaced by TH-105" });
    expect(kaveri.archiveHistory).toHaveLength(1);
    expect(stored()[0]).toEqual(inv1); // untouched neighbour stays byte-identical
    expect(figures()).toEqual(before);
    expect(screen.getByTestId("subtitle").textContent).toBe(`${subBefore} · includes 1 archived`);
    expect(screen.queryByRole("button", { name: "Archive invoice Kaveri Foods" })).toBeNull();
    expect(screen.getByText(/^Archived invoices \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Archived by you on .* · Reason: Raised in error/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restore Kaveri Foods" }));
    expect(await confirmInDialog("Archived by mistake", /^Restore invoice$/)).toBe("Restore this invoice?");
    const back = stored().find((x) => x.id === "r2")!;
    expect(bare(back)).toEqual(inv2);
    expect(back.archivedAt).toBeUndefined();
    expect(back.archiveHistory?.map((e) => e.action)).toEqual(["archived", "restored"]);
    expect(figures()).toEqual(before);
    expect(screen.getByRole("button", { name: "Archive invoice Kaveri Foods" })).toBeInTheDocument();
    expect(harness.saves).toBe(2);
  });
});
