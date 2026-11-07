import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { defaultPreferences } from "@/lib/preferences";
import type { TravelTrip } from "@/lib/travel";
const mock = vi.hoisted(() => ({ store: {} as Record<string, unknown>, save: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/store", () => ({ useStore: () => mock.store }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: mock.error } }));
import { BudgetBreakdown, EditBudgetDialog } from "./TripBudget";
afterEach(cleanup);

it("opens with saved amounts and refuses a budget edit that breaks an explicit complete dimension", async () => {
  const trip: TravelTrip = { id: "t", name: "Test", destination: "Test", start: "2026-11-01", end: "2026-11-02", budget: 100, currencies: ["INR"], workspaceBudgets: [{ workspace: "personal", amount: 100 }], completeBudgetDimensions: ["workspace"], contingency: 5, budgetNotes: "Original" };
  const preferences = { ...defaultPreferences(), trips: [trip] };
  mock.save.mockReset().mockResolvedValue(undefined); mock.error.mockReset();
  mock.store = { preferences, savePreferences: mock.save };
  render(<EditBudgetDialog trip={trip} open onOpenChange={() => {}} />);
  expect(screen.getByLabelText("Total budget")).toHaveValue(100);
  fireEvent.change(screen.getByLabelText("Total budget"), { target: { value: "90" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  expect(mock.save).not.toHaveBeenCalled();
  expect(mock.error).toHaveBeenCalledWith(expect.stringContaining("must match"));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save Changes" })).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText("Total budget"), { target: { value: "100" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() => expect(mock.save).toHaveBeenCalledTimes(1));
  expect(mock.save.mock.calls[0]?.[0].trips[0]).toMatchObject({ budget: 100, contingency: 5, budgetNotes: "Original", completeBudgetDimensions: ["workspace"] });
});

it("marks dimensions independently, rejects partial promises and allows deliberate return to partial", async () => {
  const trip: TravelTrip = { id: "t", name: "Test", destination: "Test", start: "2026-11-01", end: "2026-11-02", budget: 100, currencies: ["INR"], workspaceBudgets: [{ workspace: "personal", amount: 100 }], travellerBudgets: [{ traveller: "Me", amount: 40 }] };
  mock.save.mockReset().mockImplementation(async next => { mock.store["preferences"] = next; }); mock.error.mockReset();
  mock.store = { preferences: { ...defaultPreferences(), trips: [trip] }, savePreferences: mock.save, transactions: [], members: [] };
  const { unmount } = render(<BudgetBreakdown trip={trip} />);
  fireEvent.click(screen.getByLabelText("Complete allocation"));
  await waitFor(() => expect(mock.save).toHaveBeenCalledTimes(1));
  expect(mock.save.mock.calls[0]?.[0].trips[0]).toMatchObject({ budget: 100, completeBudgetDimensions: ["workspace"] });
  fireEvent.click(screen.getByRole("tab", { name: "Traveller" }));
  fireEvent.click(screen.getByLabelText("Complete allocation"));
  await waitFor(() => expect(mock.error).toHaveBeenCalledWith(expect.stringContaining("must match")));
  expect(mock.save).toHaveBeenCalledTimes(1);
  const saved = mock.save.mock.calls[0]?.[0].trips[0] as TravelTrip;
  unmount(); render(<BudgetBreakdown trip={saved} />);
  expect(screen.getByLabelText("Complete allocation")).toBeChecked();
  fireEvent.click(screen.getByLabelText("Complete allocation"));
  await waitFor(() => expect(mock.save).toHaveBeenCalledTimes(2));
  expect(mock.save.mock.calls[1]?.[0].trips[0].completeBudgetDimensions).toEqual([]);
});