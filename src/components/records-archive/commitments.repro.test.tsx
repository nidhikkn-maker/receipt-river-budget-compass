// P0-013 (scheduled payments) regression (was repro): no Delete. A payment is first cancelled (existing lifecycle), then
// can be archived with a reason; the commitments row is never deleted or changed and the plan's figures do not move.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { defaultPreferences } from "@/lib/preferences";
import { monthlyCost, type Commitment } from "@/lib/planning";
import { callsOf, confirmInDialog, harness, OWNER, reset, spy } from "./harness";

vi.mock("@/lib/store", async () => ({ useStore: (await import("./harness")).useStoreMock }));
vi.mock("@tanstack/react-router", async () => (await import("./harness")).routerMock);
vi.mock("@/components/AppShell", () => ({ PageTitle: ({ title }: { title: string }) => <h1>{title}</h1>, Stat: ({ label }: { label: string }) => <p>{label}</p> }));
vi.mock("@/components/SectionTabs", () => ({ SectionTabs: () => null }));
vi.mock("@/components/PlanCalendar", () => ({ PlanCalendar: () => null }));
vi.mock("recharts", () => ({ ResponsiveContainer: () => null, AreaChart: () => null, Area: () => null, ReferenceLine: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null }));
vi.mock("@/lib/use-position", () => ({ todayISO: () => "2026-11-10", usePosition: () => ({ forecast: { shortDates: [], series: [] }, safe: { amount: 0, lowest: 0, lowestDate: "2026-11-10", steps: [] }, upcoming: [], cash: 0, minBalance: 0, reserves: 0, subscriptions: { monthly: 0, annual: 0, active: 0, detected: [], summary: { increases: [], duplicates: [] } }, income: { received: 0, expectedRemaining: 0, expectedConfirmed: 0, bySource: {}, late: [] } }) }));
import { Route } from "@/routes/_authenticated/plan";
const Plan = (Route as unknown as { component: () => React.ReactElement }).component;

const rent = { id: "c-1", name: "Flat rent", kind: "rent", direction: "out", amount: 32000, frequency: "monthly", intervalDays: null, nextDue: "2026-12-01", accountId: null, category: "Rent", confirmed: true, essential: true, status: "active" };
const lic = { ...rent, id: "c-2", name: "LIC premium", kind: "insurance", amount: 24000, frequency: "yearly", status: "cancelled" };
beforeEach(() => reset(defaultPreferences() as unknown as Record<string, unknown>, { commitments: [rent, lic], removeCommitment: spy("removeCommitment"), saveCommitment: spy("saveCommitment"), confirmCommitment: spy("confirmCommitment") }));
afterEach(cleanup);

describe("P0-013 scheduled payments: cancel, then archive", () => {
  it("offers no Delete; an active payment has no Archive (Cancel first); a cancelled one archives and restores", async () => {
    const rows = JSON.stringify(harness.store["commitments"]);
    const cost = (harness.store["commitments"] as Commitment[]).reduce((s, c) => s + monthlyCost(c), 0);
    render(<Plan />);
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    expect(screen.queryByRole("button", { name: `Archive ${rent.name}` })).toBeNull();
    expect(screen.getByRole("button", { name: `Cancel ${rent.name}` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Archive ${lic.name}` }));
    expect(await confirmInDialog("Policy surrendered in October", /^Archive scheduled payment$/)).toBe("Archive this scheduled payment?");
    expect(callsOf("removeCommitment")).toHaveLength(0);
    expect(callsOf("saveCommitment")).toHaveLength(0);
    expect(JSON.stringify(harness.store["commitments"])).toBe(rows);
    expect((harness.store["commitments"] as Commitment[]).reduce((s, c) => s + monthlyCost(c), 0)).toBe(cost);
    expect(harness.stored["recordArchive"]).toEqual([expect.objectContaining({ id: "commitments:c-2", archivedBy: OWNER, archiveReason: "Policy surrendered in October" })]);
    expect(screen.getByText(/^Archived scheduled payments \(1\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Restore ${lic.name}` }));
    await confirmInDialog("Archived by mistake", /^Restore scheduled payment$/);
    expect(screen.getByRole("button", { name: `Archive ${lic.name}` })).toBeInTheDocument();
  });
});
