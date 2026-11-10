// P0-016 regression (was repro): allocation plans, milestones and itinerary items are archived with a reason (no browser
// confirm, no one-tap removal), kept byte-identical apart from archive fields, and restorable.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { defaultPreferences } from "@/lib/preferences";
import { plannedVsActual } from "@/lib/allocation";
import { bare, confirmInDialog, harness, OWNER, reset, useStoreMock } from "./harness";

vi.mock("@/lib/store", async () => ({ useStore: (await import("./harness")).useStoreMock }));
vi.mock("@tanstack/react-router", async () => (await import("./harness")).routerMock);
vi.mock("@/components/AppShell", () => ({ PageTitle: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/components/SectionTabs", () => ({ SectionTabs: () => null }));
vi.mock("@/components/StrategyStressCooling", () => ({ CoolingOff: () => null, StressTest: () => null }));
vi.mock("@/components/DecisionMemory", () => ({ DecisionMemory: () => null }));
vi.mock("@/lib/use-intelligence", () => ({ useIntelligence: () => ({ store: useStoreMock(), today: "2026-11-11", metrics: { emergencyAmount: 0, emergencyMonths: 0, netWorth: 0, savings: 0, cardDebt: 0, loans: [] } }) }));
import { Route as AllocationRoute } from "@/routes/_authenticated/allocation";
import { Route as StrategyRoute } from "@/routes/_authenticated/strategy";
import { TripItinerarySection } from "@/components/trip/TripSections";
const Allocation = (AllocationRoute as unknown as { component: () => React.ReactElement }).component;
const Strategy = (StrategyRoute as unknown as { component: () => React.ReactElement }).component;
function Milestones() { window.history.replaceState(null, "", "/strategy?tab=milestones"); return <Strategy />; }

const base = defaultPreferences() as unknown as Record<string, unknown>;
const plan = { id: "ap-1", title: "October salary", incomeDate: "2026-10-01", amount: 150000, lines: [{ bucket: "mandatory", label: "Rent", amount: 32000 }], carryForward: false, createdAt: "2026-10-01" };
const m1 = { id: "m-1", name: "First ₹1 lakh emergency reserve", metric: "custom", target: 100000, targetDate: null, manual: 25000, notify: false, history: [{ date: "2026-11-10", value: 25000 }], createdAt: "2026-10-01" };
const m2 = { ...m1, id: "m-2", name: "Clear card dues", history: [{ date: "2026-11-11", value: 25000 }] };
const item = { id: "it-1", date: "2026-12-20", time: "07:30", title: "Vaigai Express to Madurai", bookingId: "bk-1" };
const trip = { id: "trip-1", name: "Madurai visit", destination: "Madurai", start: "2026-12-20", end: "2026-12-23", budget: 30000, currencies: ["INR"], itinerary: [item, { id: "it-2", date: "2026-12-21", title: "Meenakshi temple" }] };
afterEach(cleanup);

describe("P0-016 planning records: archive instead of delete", () => {
  it("allocation plan: Archive plan with a reason; plan and planned-vs-actual unchanged; restore", async () => {
    reset({ ...base, allocationPlans: [plan] });
    const pva = plannedVsActual(plan as never, {} as never);
    render(<Allocation />);
    fireEvent.click(screen.getByRole("button", { name: /Compare/ }));
    expect(screen.queryByRole("button", { name: "Delete plan" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Archive plan" }));
    expect(await confirmInDialog("Salary revised; replaced by a new plan", /^Archive allocation plan$/)).toBe("Archive this allocation plan?");
    const saved = (harness.stored["allocationPlans"] as Record<string, unknown>[])[0]!;
    expect(bare(saved)).toEqual(plan);
    expect(saved).toMatchObject({ archivedBy: OWNER });
    expect(plannedVsActual(bare(saved) as never, {} as never)).toEqual(pva);
    fireEvent.click(screen.getByRole("button", { name: `Restore ${plan.title}` }));
    await confirmInDialog("Archived by mistake", /^Restore allocation plan$/);
    expect(bare((harness.stored["allocationPlans"] as unknown[])[0])).toEqual(plan);
  });

  it("milestone: no browser confirm; archived milestone keeps its history and is not updated by the daily progress record", async () => {
    reset({ ...base, milestones: [m1, m2] });
    const confirm = vi.spyOn(window, "confirm");
    render(<Milestones />);
    expect(screen.queryByRole("button", { name: "Delete milestone" })).toBeNull();
    // The daily progress save runs first (m-1 has no entry for today): wait for it, then archive m-1.
    await vi.waitFor(() => expect(harness.saves).toBe(1));
    const m1Stored = (harness.stored["milestones"] as Record<string, unknown>[])[0]!;
    fireEvent.click(screen.getByRole("button", { name: `Archive milestone ${m1.name}` }));
    await confirmInDialog("Folded into the bigger reserve goal", /^Archive milestone$/);
    expect(confirm).not.toHaveBeenCalled();
    const stored = harness.stored["milestones"] as Record<string, unknown>[];
    expect(bare(stored[0])).toEqual(m1Stored);
    expect(stored[1]).toEqual(m2);
    expect(screen.getByText(/^Archived milestones \(1\)/)).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("itinerary: Archive keeps the item (with its booking link) out of the day plan; restore puts it back", async () => {
    reset({ ...base, trips: [trip] });
    const { rerender } = render(<TripItinerarySection trip={trip as never} />);
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: `Archive ${item.title}` }));
    await confirmInDialog("Train cancelled; travelling by car", /^Archive itinerary item$/);
    const saved = () => (harness.stored["trips"] as { itinerary: Record<string, unknown>[] }[])[0]!;
    expect(saved().itinerary).toHaveLength(2);
    expect(bare(saved().itinerary[0])).toEqual(item);
    rerender(<TripItinerarySection trip={saved() as never} />);
    expect(screen.queryByRole("button", { name: `Archive ${item.title}` })).toBeNull();
    expect(screen.getByText(/booking kept/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Restore ${item.title}` }));
    await confirmInDialog("Train restored by railways", /^Restore itinerary item$/);
    rerender(<TripItinerarySection trip={saved() as never} />);
    expect(screen.getByRole("button", { name: `Archive ${item.title}` })).toBeInTheDocument();
    expect(bare(saved().itinerary[0])).toEqual(item);
  });
});
